import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { createClient } from "@/lib/supabase/server";

const GRAPH_VERSION = "v23.0";

type IntegracaoWhatsapp = {
  id: string;
  empresa_id: string;
  nome_conexao: string;
  numero: string;
  status: string;
  phone_number_id: string | null;
  token_ref: string | null;
  config_json: any;
};

function extrairToken(integracao: IntegracaoWhatsapp) {
  const tokenDoConfig =
    integracao.config_json?.access_token ||
    integracao.config_json?.accessToken ||
    integracao.config_json?.token ||
    integracao.config_json?.meta_access_token ||
    integracao.config_json?.long_lived_token ||
    null;

  if (tokenDoConfig) return tokenDoConfig;

  if (integracao.token_ref) {
    return process.env[integracao.token_ref] || null;
  }

  return null;
}

function jsonErro(error: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error, extra }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return jsonErro(contexto.error, contexto.status);
    }

    const empresaId = contexto.usuario.empresa_id;

    if (!empresaId) {
      return jsonErro("Usuário sem empresa vinculada.", 403);
    }

    const body = await req.json();

    const integracaoId = String(body.integracao_id || "");
    const novoNome = String(body.novo_nome || "").trim();

    if (!integracaoId) {
      return jsonErro("Selecione uma integração.", 400);
    }

    if (novoNome.length < 3 || novoNome.length > 150) {
      return jsonErro("O nome precisa ter entre 3 e 150 caracteres.", 400);
    }

    const supabase = await createClient();

    const { data: integracao, error } = await supabase
      .from("integracoes_whatsapp")
      .select(
        "id, empresa_id, nome_conexao, numero, status, phone_number_id, token_ref, config_json"
      )
      .eq("id", integracaoId)
      .eq("empresa_id", empresaId)
      .maybeSingle<IntegracaoWhatsapp>();

    if (error) {
      return jsonErro("Erro ao buscar integração.", 500, error);
    }

    if (!integracao) {
      return jsonErro("Integração não encontrada.", 404);
    }

    if (!integracao.phone_number_id) {
      return jsonErro("Essa integração não possui phone_number_id.", 400);
    }

    const token = extrairToken(integracao);

    if (!token) {
      return jsonErro(
        "Token da Meta não encontrado. Verifique token_ref e Environment Variables.",
        400
      );
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracao.phone_number_id}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          new_display_name: novoNome,
        }),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      return jsonErro(
        metaJson?.error?.message ||
          "Erro ao solicitar alteração do nome de exibição.",
        metaRes.status,
        metaJson
      );
    }

    await supabase
      .from("integracoes_whatsapp")
      .update({
        updated_at: new Date().toISOString(),
        ultimo_sync_at: new Date().toISOString(),
      })
      .eq("id", integracao.id)
      .eq("empresa_id", empresaId);

    return NextResponse.json({
      ok: true,
      message:
        "Solicitação enviada ao Meta. O novo nome pode passar por revisão.",
      meta: metaJson,
    });
  } catch (error: any) {
    console.error("[WHATSAPP ALTERAR NOME ERROR]", error);

    return jsonErro(
      error?.message || "Erro interno ao solicitar alteração do nome.",
      500
    );
  }
}