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
        { ok: false, error: "Voce nao tem permissao para cancelar disparos." },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do disparo não informado." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const auditMeta = getRequestAuditMetadata(request);

    const { data: disparoFluxo, error: fluxoError } = await supabase
      .from("automacao_agendamentos")
      .select("id, status, tipo_agendamento, payload_json")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_agendamento", "disparo_template")
      .maybeSingle();

    if (fluxoError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao buscar disparo." },
        { status: 500 }
      );
    }

    if (disparoFluxo) {
      if (disparoFluxo.status !== "pendente") {
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
            ...(disparoFluxo.payload_json || {}),
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
        antes: disparoFluxo,
        depois: data,
        ip: auditMeta.ip,
        user_agent: auditMeta.user_agent,
      });

      return NextResponse.json({ ok: true, disparo: data, origem: "fluxo" });
    }

    const { data: execucaoAgenda, error: agendaError } = await supabase
      .from("agenda_automacao_execucoes")
      .select(
        "id, status, tipo, canal, agenda_id, agendamento_id, executar_em, payload_json, resultado_json, cancelado_manualmente"
      )
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (agendaError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao buscar automação da agenda." },
        { status: 500 }
      );
    }
    if (!execucaoAgenda) {
      return NextResponse.json(
        { ok: false, error: "Disparo agendado não encontrado." },
        { status: 404 }
      );
    }
    if (execucaoAgenda.status !== "pendente") {
      return NextResponse.json(
        { ok: false, error: "Apenas execuções pendentes podem ser canceladas." },
        { status: 400 }
      );
    }

    const agora = new Date().toISOString();
    const { data: cancelada, error: cancelError } = await supabase
      .from("agenda_automacao_execucoes")
      .update({
        status: "cancelado",
        cancelado_manualmente: true,
        cancelado_por: usuario.id || null,
        cancelado_em: agora,
        proxima_tentativa_em: null,
        bloqueado_em: null,
        erro: "Execução cancelada manualmente na página de disparos agendados.",
        resultado_json: {
          ...(execucaoAgenda.resultado_json || {}),
          cancelado_em: agora,
          cancelado_por: usuario.id || null,
          origem_cancelamento: "pagina_disparos_agendados",
        },
        updated_at: agora,
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("status", "pendente")
      .select("*")
      .single();

    if (cancelError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao cancelar automação da agenda." },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "disparos",
      entidade: "disparo",
      entidade_id: id,
      acao: "agenda_automacao_cancelada",
      descricao: "Execução automática da agenda cancelada",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: execucaoAgenda,
      depois: cancelada,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({ ok: true, disparo: cancelada, origem: "agenda" });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao cancelar disparo." },
      { status: 500 }
    );
  }
}
