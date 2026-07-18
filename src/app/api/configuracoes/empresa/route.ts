import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

function respostaSemAcesso(
  resultado: Awaited<ReturnType<typeof getUsuarioContexto>>
) {
  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  if (!isAdministrador(resultado.usuario)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Apenas administradores podem alterar os dados da empresa.",
      },
      { status: 403 }
    );
  }

  if (!resultado.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  return null;
}

export async function PUT(request: Request) {
  const resultado = await getUsuarioContexto();
  const semAcesso = respostaSemAcesso(resultado);

  if (semAcesso) return semAcesso;
  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const empresaId = resultado.usuario.empresa_id;

  try {
    const body = (await request.json()) as { nome_fantasia?: unknown };
    const nomeFantasia = String(body.nome_fantasia ?? "")
      .trim()
      .replace(/\s+/g, " ");

    if (nomeFantasia.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Informe um nome de empresa válido." },
        { status: 400 }
      );
    }

    if (nomeFantasia.length > 120) {
      return NextResponse.json(
        {
          ok: false,
          error: "O nome da empresa deve ter no máximo 120 caracteres.",
        },
        { status: 400 }
      );
    }

    const { data: empresaAtual, error: empresaAtualError } = await supabase
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("id", empresaId)
      .maybeSingle();

    if (empresaAtualError) throw new Error(empresaAtualError.message);
    if (!empresaAtual) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    if (empresaAtual.nome_fantasia === nomeFantasia) {
      return NextResponse.json({
        ok: true,
        message: "Os dados da empresa já estão atualizados.",
        empresa: empresaAtual,
      });
    }

    const { data: empresaAtualizada, error: updateError } = await supabase
      .from("empresas")
      .update({ nome_fantasia: nomeFantasia })
      .eq("id", empresaId)
      .select("id, nome_fantasia")
      .single();

    if (updateError) throw new Error(updateError.message);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: empresaId,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: empresaId,
      acao: "dados_empresa_alterados",
      descricao: "Nome da empresa alterado nas configurações.",
      usuario_id: resultado.usuario.id,
      usuario_nome: resultado.usuario.nome,
      usuario_email: resultado.usuario.email,
      antes: { nome_fantasia: empresaAtual.nome_fantasia },
      depois: { nome_fantasia: nomeFantasia },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Dados da empresa atualizados com sucesso.",
      empresa: empresaAtualizada,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar os dados da empresa.",
      },
      { status: 500 }
    );
  }
}
