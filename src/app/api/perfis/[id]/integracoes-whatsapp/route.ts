import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarIntegracoesWhatsappDaEmpresa } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

type PerfilRow = {
  id: string;
  empresa_id: string;
};

type VinculoIntegracaoRow = {
  integracao_whatsapp_id: string;
};

async function buscarPerfilDaEmpresa(perfilId: string, empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id, empresa_id")
    .eq("id", perfilId)
    .eq("empresa_id", empresaId)
    .maybeSingle<PerfilRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function normalizarIdsIntegracoes(valor: unknown) {
  if (!Array.isArray(valor)) return [];

  return Array.from(
    new Set(valor.map((id) => String(id || "").trim()).filter(Boolean))
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!can(usuario.permissoes, "perfis.visualizar")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para visualizar perfis" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada" },
        { status: 400 }
      );
    }

    const perfil = await buscarPerfilDaEmpresa(id, usuario.empresa_id);

    if (!perfil) {
      return NextResponse.json(
        { ok: false, error: "Perfil nao encontrado" },
        { status: 404 }
      );
    }

    const [integracoes, vinculosResult] = await Promise.all([
      listarIntegracoesWhatsappDaEmpresa(usuario.empresa_id),
      supabaseAdmin
        .from("perfil_integracoes_whatsapp")
        .select("integracao_whatsapp_id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("perfil_empresa_id", id),
    ]);

    if (vinculosResult.error) {
      return NextResponse.json(
        { ok: false, error: vinculosResult.error.message },
        { status: 500 }
      );
    }

    const idsRestritos = new Set(
      ((vinculosResult.data || []) as VinculoIntegracaoRow[]).map(
        (item) => item.integracao_whatsapp_id
      )
    );
    const acessoLivre = idsRestritos.size === 0;

    return NextResponse.json({
      ok: true,
      acesso_livre: acessoLivre,
      integracoes_whatsapp_ids: Array.from(idsRestritos),
      integracoes: integracoes.map((integracao) => ({
        ...integracao,
        permitido: acessoLivre || idsRestritos.has(integracao.id),
      })),
    });
  } catch (error) {
    console.error("Erro ao listar integracoes WhatsApp do perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar integracoes do perfil" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!can(usuario.permissoes, "perfis.alterar_permissoes")) {
      return NextResponse.json(
        { ok: false, error: "Sem permissao para alterar permissoes do perfil" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada" },
        { status: 400 }
      );
    }

    const perfil = await buscarPerfilDaEmpresa(id, usuario.empresa_id);

    if (!perfil) {
      return NextResponse.json(
        { ok: false, error: "Perfil nao encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const idsSelecionados = normalizarIdsIntegracoes(
      body?.integracoes_whatsapp_ids
    );
    const integracoes = await listarIntegracoesWhatsappDaEmpresa(
      usuario.empresa_id
    );
    const idsDaEmpresa = new Set(integracoes.map((item) => item.id));
    const idsInvalidos = idsSelecionados.filter((item) => !idsDaEmpresa.has(item));

    if (idsInvalidos.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Uma ou mais integracoes nao pertencem a empresa" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("perfil_integracoes_whatsapp")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .eq("perfil_empresa_id", id);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    if (idsSelecionados.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("perfil_integracoes_whatsapp")
        .insert(
          idsSelecionados.map((integracaoId) => ({
            empresa_id: usuario.empresa_id,
            perfil_empresa_id: id,
            integracao_whatsapp_id: integracaoId,
          }))
        );

      if (insertError) {
        return NextResponse.json(
          { ok: false, error: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      acesso_livre: idsSelecionados.length === 0,
      integracoes_whatsapp_ids: idsSelecionados,
      message: "Restricao de integracoes do perfil atualizada com sucesso",
    });
  } catch (error) {
    console.error("Erro ao salvar integracoes WhatsApp do perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao salvar integracoes do perfil" },
      { status: 500 }
    );
  }
}
