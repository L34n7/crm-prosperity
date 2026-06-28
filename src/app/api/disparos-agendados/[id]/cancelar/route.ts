import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { podeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
    return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
    );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
    return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
    );
    }

    if (!podeRealizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para cancelar disparos.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const auditMeta = getRequestAuditMetadata(request);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do disparo não informado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: agendamento, error: buscarError } = await supabase
      .from("automacao_agendamentos")
      .select("id, status, tipo_agendamento, payload_json")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_agendamento", "disparo_template")
      .maybeSingle();

    if (buscarError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao buscar disparo." },
        { status: 500 }
      );
    }

    if (!agendamento) {
      return NextResponse.json(
        { ok: false, error: "Disparo agendado não encontrado." },
        { status: 404 }
      );
    }

    if (agendamento.status !== "pendente") {
      return NextResponse.json(
        { ok: false, error: "Apenas disparos pendentes podem ser cancelados." },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();

    const { data, error } = await supabase
      .from("automacao_agendamentos")
      .update({
        status: "cancelado",
        payload_json: {
          ...(agendamento.payload_json || {}),
          cancelado_em: agora,
          cancelado_por: usuario.id || null,
          origem_cancelamento: "pagina_disparos_agendados",
        },
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "pendente")
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Erro ao cancelar disparo." },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: id,
      acao: "disparo_agendado_cancelado",
      descricao: "Disparo agendado cancelado",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: agendamento,
      depois: data,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      disparo: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao cancelar disparo.",
      },
      { status: 500 }
    );
  }
}
