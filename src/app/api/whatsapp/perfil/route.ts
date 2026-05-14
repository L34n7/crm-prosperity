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
  verified_name: string | null;
  phone_number_display_name: string | null;
  config_json: any;
  token_ref: string | null;

};

function extrairToken(integracao: IntegracaoWhatsapp) {
  const tokenDoConfig =
    integracao.config_json?.access_token ||
    integracao.config_json?.accessToken ||
    integracao.config_json?.token ||
    integracao.config_json?.meta_access_token ||
    integracao.config_json?.long_lived_token ||
    null;

  if (tokenDoConfig) {
    return tokenDoConfig;
  }

  if (integracao.token_ref) {
    return process.env[integracao.token_ref] || null;
  }

  return null;
}

function jsonErro(error: string, status = 400, extra?: any) {
  return NextResponse.json({ ok: false, error, extra }, { status });
}

async function buscarIntegracao(
  empresaId: string,
  integracaoId?: string | null
) {
  const supabase = await createClient();

  let query = supabase
    .from("integracoes_whatsapp")
    .select(
      "id, empresa_id, nome_conexao, numero, status, phone_number_id, verified_name, phone_number_display_name, config_json, token_ref"
    )
    .eq("empresa_id", empresaId)
    .eq("provider", "meta_official")
    .order("created_at", { ascending: false });

  if (integracaoId) {
    query = query.eq("id", integracaoId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Erro ao buscar integrações do WhatsApp.");
  }

  return (data || []) as IntegracaoWhatsapp[];
}

export async function GET(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();
    console.log("[PERFIL] CONTEXTO:", contexto);
    console.log("[PERFIL] EMPRESA:", contexto.ok ? contexto.usuario.empresa_id : null);

    if (!contexto.ok) {
      return jsonErro(contexto.error, contexto.status);
    }

    const empresaId = contexto.usuario.empresa_id;

    if (!empresaId) {
      return jsonErro("Usuário sem empresa vinculada.", 403);
    }

    const { searchParams } = new URL(req.url);
    const integracaoId = searchParams.get("integracao_id");

    const integracoes = await buscarIntegracao(empresaId, null);

    const integracaoSelecionada =
      integracoes.find((item) => item.id === integracaoId) ||
      integracoes.find((item) => item.status === "ativa") ||
      integracoes[0] ||
      null;

    if (!integracaoSelecionada) {
      return NextResponse.json({
        ok: true,
        integracoes: [],
        integracao: null,
        perfil: null,
      });
    }

    if (!integracaoSelecionada.phone_number_id) {
      return jsonErro("Essa integração não possui phone_number_id.", 400);
    }

    const token = extrairToken(integracaoSelecionada)

    if (!token) {
      return jsonErro(
        "Token da Meta não encontrado no config_json da integração.",
        400
      );
    }

    const fields =
      "about,address,description,email,profile_picture_url,websites,vertical";

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracaoSelecionada.phone_number_id}/whatsapp_business_profile?fields=${encodeURIComponent(
        fields
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      return jsonErro(
        metaJson?.error?.message || "Erro ao buscar perfil no Meta.",
        metaRes.status,
        metaJson
      );
    }

    const perfil = Array.isArray(metaJson?.data) ? metaJson.data[0] : metaJson;

    return NextResponse.json({
      ok: true,
      integracoes: integracoes.map((item) => ({
        id: item.id,
        nome_conexao: item.nome_conexao,
        numero: item.numero,
        status: item.status,
        phone_number_id: item.phone_number_id,
        verified_name: item.verified_name,
        phone_number_display_name: item.phone_number_display_name,
      })),
      integracao: {
        id: integracaoSelecionada.id,
        nome_conexao: integracaoSelecionada.nome_conexao,
        numero: integracaoSelecionada.numero,
        status: integracaoSelecionada.status,
        phone_number_id: integracaoSelecionada.phone_number_id,
        verified_name: integracaoSelecionada.verified_name,
        phone_number_display_name:
          integracaoSelecionada.phone_number_display_name,
      },
      perfil,
    });
  } catch (error: any) {
    console.error("[WHATSAPP PERFIL GET ERROR]", error);
    return jsonErro(error?.message || "Erro interno ao buscar perfil.", 500);
  }
}

async function uploadFotoPerfil(params: {
  appId: string;
  token: string;
  file: File;
}) {
  const { appId, token, file } = params;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const sessionRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(
      file.type
    )}&file_name=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const sessionJson = await sessionRes.json();

  if (!sessionRes.ok || !sessionJson?.id) {
    throw new Error(
      sessionJson?.error?.message || "Erro ao criar sessão de upload da foto."
    );
  }

  const uploadRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${sessionJson.id}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    }
  );

  const uploadJson = await uploadRes.json();

  if (!uploadRes.ok || !uploadJson?.h) {
    throw new Error(
      uploadJson?.error?.message || "Erro ao enviar foto para o Meta."
    );
  }

  return uploadJson.h as string;
}

export async function PATCH(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return jsonErro(contexto.error, contexto.status);
    }

    const empresaId = contexto.usuario.empresa_id;

    if (!empresaId) {
      return jsonErro("Usuário sem empresa vinculada.", 403);
    }

    const formData = await req.formData();

    const integracaoId = String(formData.get("integracao_id") || "");
    const about = String(formData.get("about") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const website1 = String(formData.get("website1") || "").trim();
    const website2 = String(formData.get("website2") || "").trim();
    const vertical = String(formData.get("vertical") || "").trim();
    const foto = formData.get("profile_picture");

    if (!integracaoId) {
      return jsonErro("Selecione uma integração.", 400);
    }

    const [integracao] = await buscarIntegracao(empresaId, integracaoId);

    if (!integracao) {
      return jsonErro("Integração não encontrada.", 404);
    }

    if (!integracao.phone_number_id) {
      return jsonErro("Essa integração não possui phone_number_id.", 400);
    }

    const token = extrairToken(integracao)

    if (!token) {
      return jsonErro(
        "Token da Meta não encontrado no config_json da integração.",
        400
      );
    }

    const websites = [website1, website2].filter(Boolean);

    const payload: Record<string, any> = {
      messaging_product: "whatsapp",
      about,
      address,
      description,
      email,
      websites,
      vertical,
    };

    if (foto instanceof File && foto.size > 0) {
      const appId =
        process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || "";

      if (!appId) {
        return jsonErro(
          "META_APP_ID não configurado no .env. Ele é necessário para atualizar a foto.",
          400
        );
      }

      const handle = await uploadFotoPerfil({
        appId,
        token,
        file: foto,
      });

      payload.profile_picture_handle = handle;
    }

    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${integracao.phone_number_id}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      return jsonErro(
        metaJson?.error?.message || "Erro ao atualizar perfil no Meta.",
        metaRes.status,
        metaJson
      );
    }

    const supabase = await createClient();

    await supabase
      .from("integracoes_whatsapp")
      .update({
        ultimo_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integracao.id)
      .eq("empresa_id", empresaId);

    return NextResponse.json({
      ok: true,
      message: "Perfil atualizado com sucesso.",
      meta: metaJson,
    });
  } catch (error: any) {
    console.error("[WHATSAPP PERFIL PATCH ERROR]", error);
    return jsonErro(error?.message || "Erro interno ao atualizar perfil.", 500);
  }
}