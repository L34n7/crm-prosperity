import { NextResponse } from "next/server";
import { enviarPrimeiroAcessoAlternativo } from "@/lib/auth/enviar-primeiro-acesso-alternativo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (
    !can(usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS) ||
    !can(usuario.permissoes, "empresas.editar")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para reenviar o primeiro acesso." },
      { status: 403 }
    );
  }

  const { data: empresa, error } = await supabaseAdmin
    .from("empresas")
    .select("id,nome_fantasia,email,telefone,nome_responsavel")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada." },
      { status: 404 }
    );
  }

  try {
    const envio = await enviarPrimeiroAcessoAlternativo({
      email: empresa.email,
      nome: empresa.nome_responsavel || empresa.nome_fantasia,
      empresaId: empresa.id,
      telefone: empresa.telefone,
    });

    const auditMetadata = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: empresa.id,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: empresa.id,
      acao: "primeiro_acesso_alternativo_enviado",
      descricao: `Primeiro acesso alternativo enviado para ${envio.email}.`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      detalhes: {
        email: envio.email,
        mecanismo: "supabase_auth_legacy",
        link_padrao_invalidado: false,
      },
      ...auditMetadata,
    });

    return NextResponse.json({
      ok: true,
      message: `Acesso alternativo enviado para ${envio.email} com sucesso.`,
    });
  } catch (error) {
    console.error("[PRIMEIRO ACESSO ALTERNATIVO]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar o acesso alternativo.",
      },
      { status: 500 }
    );
  }
}
