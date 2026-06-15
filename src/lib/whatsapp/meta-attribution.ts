import { createHash } from "crypto";
import {
  normalizarCodigoCampanha,
  somenteDigitos,
} from "@/lib/rastreamento/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsAppReferral } from "@/lib/whatsapp/meta";

type SalvarAtribuicaoMetaParams = {
  empresaId: string;
  contatoId?: string | null;
  conversaId?: string | null;
  mensagemId?: string | null;
  integracaoWhatsappId?: string | null;
  mensagemExternaId?: string | null;
  referral?: WhatsAppReferral | null;
  conversationOriginType?: string | null;
  pricingType?: string | null;
  pricingCategory?: string | null;
  pricingModel?: string | null;
  pricingBillable?: boolean | null;
  numeroWhatsapp?: string | null;
  atribuirRastreamento?: boolean;
  payloadTipo: "message" | "status";
  payloadJson?: Record<string, unknown> | null;
};

type RastreamentoMeta = {
  origemId: string;
  origemNome: string;
  campanhaId: string;
  campanhaNome: string;
};

const ORIGEM_META_NOME = "Meta Ads / Click-to-WhatsApp";

function semUndefined<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, valor]) => valor !== undefined)
  ) as Partial<T>;
}

function objetoJson(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return {};
  }

  return valor as Record<string, unknown>;
}

function textoLimpo(valor: string | null | undefined, limite = 180) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function hashCurto(valor: string) {
  return createHash("sha1").update(valor).digest("hex").slice(0, 8).toUpperCase();
}

function gerarCodigoCampanhaMeta(referral: WhatsAppReferral) {
  const chave =
    textoLimpo(referral.source_id, 120) ||
    textoLimpo(referral.headline, 120) ||
    textoLimpo(referral.source_url, 180) ||
    textoLimpo(referral.ctwa_clid, 120) ||
    "click-to-whatsapp";
  const base =
    normalizarCodigoCampanha(
      `META-${textoLimpo(referral.source_id || referral.headline || "CTWA", 28)}`
    ) || "META-CTWA";

  return normalizarCodigoCampanha(`${base.slice(0, 27)}-${hashCurto(chave)}`);
}

function gerarNomeCampanhaMeta(referral: WhatsAppReferral) {
  const headline = textoLimpo(referral.headline, 90);
  const sourceId = textoLimpo(referral.source_id, 50);

  if (headline) {
    return `Meta Ads - ${headline}`;
  }

  if (sourceId) {
    return `Meta Ads - ${sourceId}`;
  }

  return "Meta Ads - Click-to-WhatsApp";
}

function montarMetadataMeta(
  referral: WhatsAppReferral | null,
  params: SalvarAtribuicaoMetaParams
) {
  return semUndefined({
    origem_anuncio: "meta_click_to_whatsapp",
    meta_ctwa_clid: textoLimpo(referral?.ctwa_clid, 160) || undefined,
    meta_source_id: textoLimpo(referral?.source_id, 160) || undefined,
    meta_source_url: textoLimpo(referral?.source_url, 500) || undefined,
    meta_source_type: textoLimpo(referral?.source_type, 80) || undefined,
    meta_headline: textoLimpo(referral?.headline, 240) || undefined,
    meta_body: textoLimpo(referral?.body, 500) || undefined,
    meta_media_type: textoLimpo(referral?.media_type, 80) || undefined,
    conversation_origin_type: params.conversationOriginType ?? undefined,
    pricing_type: params.pricingType ?? undefined,
    pricing_category: params.pricingCategory ?? undefined,
    pricing_model: params.pricingModel ?? undefined,
    pricing_billable:
      typeof params.pricingBillable === "boolean"
        ? params.pricingBillable
        : undefined,
  });
}

async function buscarOuCriarOrigemMeta(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  empresaId: string
) {
  async function buscar() {
    const { data, error } = await supabase
      .from("rastreamento_origens")
      .select("id, nome")
      .eq("empresa_id", empresaId)
      .ilike("nome", ORIGEM_META_NOME)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar origem Meta Ads: ${error.message}`);
    }

    return data || null;
  }

  const existente = await buscar();

  if (existente) {
    return existente;
  }

  const { data, error } = await supabase
    .from("rastreamento_origens")
    .insert({
      empresa_id: empresaId,
      nome: ORIGEM_META_NOME,
      descricao: "Origem criada automaticamente para anuncios Click-to-WhatsApp da Meta.",
    })
    .select("id, nome")
    .single();

  if (error) {
    if (error.code === "23505") {
      const origem = await buscar();
      if (origem) return origem;
    }

    throw new Error(`Erro ao criar origem Meta Ads: ${error.message}`);
  }

  return data;
}

async function buscarOuCriarCampanhaMeta(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  referral: WhatsAppReferral;
  numeroWhatsapp?: string | null;
  integracaoWhatsappId?: string | null;
}): Promise<RastreamentoMeta> {
  const { supabase, empresaId, referral } = params;
  const origem = await buscarOuCriarOrigemMeta(supabase, empresaId);
  const codigo = gerarCodigoCampanhaMeta(referral);
  const nome = gerarNomeCampanhaMeta(referral);

  async function buscar() {
    const { data, error } = await supabase
      .from("rastreamento_campanhas")
      .select("id, nome, origem_id, rastreamento_origens ( id, nome )")
      .eq("empresa_id", empresaId)
      .ilike("codigo", codigo)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar campanha Meta Ads: ${error.message}`);
    }

    return data || null;
  }

  const existente = await buscar();

  if (existente?.id) {
    return {
      origemId: existente.origem_id || origem.id,
      origemNome: ORIGEM_META_NOME,
      campanhaId: existente.id,
      campanhaNome: existente.nome || nome,
    };
  }

  const { data, error } = await supabase
    .from("rastreamento_campanhas")
    .insert({
      empresa_id: empresaId,
      origem_id: origem.id,
      integracao_whatsapp_id: params.integracaoWhatsappId || null,
      nome,
      codigo,
      descricao:
        "Campanha criada automaticamente a partir de anuncio Click-to-WhatsApp da Meta.",
      numero_whatsapp: somenteDigitos(params.numeroWhatsapp || "") || "0",
      mensagem_inicial: "Mensagem iniciada por anuncio Click-to-WhatsApp da Meta.",
      status: "ativo",
    })
    .select("id, nome, origem_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const campanha = await buscar();
      if (campanha?.id) {
        return {
          origemId: campanha.origem_id || origem.id,
          origemNome: ORIGEM_META_NOME,
          campanhaId: campanha.id,
          campanhaNome: campanha.nome || nome,
        };
      }
    }

    throw new Error(`Erro ao criar campanha Meta Ads: ${error.message}`);
  }

  return {
    origemId: data.origem_id || origem.id,
    origemNome: ORIGEM_META_NOME,
    campanhaId: data.id,
    campanhaNome: data.nome || nome,
  };
}

async function atualizarEventosComAtribuicaoMeta(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  contatoId?: string | null;
  conversaId?: string | null;
  rastreamento: RastreamentoMeta;
  metadataMeta: Record<string, unknown>;
}) {
  const { supabase, empresaId, contatoId, conversaId, rastreamento, metadataMeta } =
    params;

  if (!contatoId && !conversaId) return;

  let query = supabase
    .from("rastreamento_eventos")
    .select("id, metadata_json")
    .eq("empresa_id", empresaId)
    .is("campanha_id", null)
    .in("tipo", ["lead_criado", "conversa_iniciada", "primeira_mensagem_recebida"]);

  if (contatoId && conversaId) {
    query = query.or(`contato_id.eq.${contatoId},conversa_id.eq.${conversaId}`);
  } else if (contatoId) {
    query = query.eq("contato_id", contatoId);
  } else if (conversaId) {
    query = query.eq("conversa_id", conversaId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao buscar eventos para atribuicao Meta: ${error.message}`);
  }

  for (const evento of data || []) {
    const metadataAtual = objetoJson(evento.metadata_json);
    const { error: updateError } = await supabase
      .from("rastreamento_eventos")
      .update({
        origem_id: rastreamento.origemId,
        campanha_id: rastreamento.campanhaId,
        metadata_json: {
          ...metadataAtual,
          ...metadataMeta,
        },
      })
      .eq("id", evento.id);

    if (updateError) {
      throw new Error(
        `Erro ao atualizar evento com atribuicao Meta: ${updateError.message}`
      );
    }
  }
}

async function aplicarRastreamentoMeta(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  empresaId: string;
  contatoId?: string | null;
  conversaId?: string | null;
  rastreamento: RastreamentoMeta;
  metadataMeta: Record<string, unknown>;
}) {
  const { supabase, empresaId, contatoId, conversaId, rastreamento } = params;
  const agora = new Date().toISOString();

  if (contatoId) {
    const { error } = await supabase
      .from("contatos")
      .update({
        origem: rastreamento.origemNome,
        campanha: rastreamento.campanhaNome,
        rastreamento_origem_id: rastreamento.origemId,
        rastreamento_campanha_id: rastreamento.campanhaId,
        rastreamento_atribuido_em: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("id", contatoId);

    if (error) {
      throw new Error(`Erro ao atribuir campanha Meta ao contato: ${error.message}`);
    }
  }

  if (conversaId) {
    const { error } = await supabase
      .from("conversas")
      .update({
        rastreamento_origem_id: rastreamento.origemId,
        rastreamento_campanha_id: rastreamento.campanhaId,
        rastreamento_atribuido_em: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("id", conversaId);

    if (error) {
      throw new Error(`Erro ao atribuir campanha Meta a conversa: ${error.message}`);
    }
  }

  await atualizarEventosComAtribuicaoMeta(params);
}

export async function salvarAtribuicaoMetaAnuncio(
  params: SalvarAtribuicaoMetaParams
) {
  const referral = params.referral ?? null;
  const ctwaClid = referral?.ctwa_clid?.trim() || null;
  const mensagemExternaId = params.mensagemExternaId?.trim() || null;

  if (!params.empresaId) return null;
  if (!ctwaClid && !mensagemExternaId) return null;
  if (
    !referral &&
    !params.conversationOriginType &&
    !params.pricingType &&
    !params.pricingCategory &&
    !params.pricingModel &&
    typeof params.pricingBillable !== "boolean"
  ) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  let existente: any = null;
  let rastreamento: RastreamentoMeta | null = null;
  const metadataMeta = montarMetadataMeta(referral, params);

  if (referral && params.atribuirRastreamento !== false) {
    rastreamento = await buscarOuCriarCampanhaMeta({
      supabase,
      empresaId: params.empresaId,
      referral,
      numeroWhatsapp: params.numeroWhatsapp,
      integracaoWhatsappId: params.integracaoWhatsappId,
    });

    await aplicarRastreamentoMeta({
      supabase,
      empresaId: params.empresaId,
      contatoId: params.contatoId,
      conversaId: params.conversaId,
      rastreamento,
      metadataMeta,
    });
  }

  if (ctwaClid) {
    const { data, error } = await supabase
      .from("contato_atribuicoes_meta")
      .select("id, payload_json")
      .eq("empresa_id", params.empresaId)
      .eq("ctwa_clid", ctwaClid)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar atribuicao Meta por ctwa_clid: ${error.message}`);
    }

    existente = data || null;
  }

  if (!existente && mensagemExternaId) {
    const { data, error } = await supabase
      .from("contato_atribuicoes_meta")
      .select("id, payload_json")
      .eq("empresa_id", params.empresaId)
      .eq("mensagem_externa_id", mensagemExternaId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Erro ao buscar atribuicao Meta por mensagem_externa_id: ${error.message}`
      );
    }

    existente = data || null;
  }

  const payloadAtual = objetoJson(existente?.payload_json);
  const payloadJson = {
    ...payloadAtual,
    [params.payloadTipo]: params.payloadJson || null,
  };

  const dados = semUndefined({
    empresa_id: params.empresaId,
    contato_id: params.contatoId,
    conversa_id: params.conversaId,
    mensagem_id: params.mensagemId,
    integracao_whatsapp_id: params.integracaoWhatsappId,
    mensagem_externa_id: mensagemExternaId,
    rastreamento_origem_id: rastreamento?.origemId,
    rastreamento_campanha_id: rastreamento?.campanhaId,
    ctwa_clid: ctwaClid,
    source_id: referral?.source_id ?? undefined,
    source_url: referral?.source_url ?? undefined,
    source_type: referral?.source_type ?? undefined,
    headline: referral?.headline ?? undefined,
    body: referral?.body ?? undefined,
    media_type: referral?.media_type ?? undefined,
    image_url: referral?.image_url ?? undefined,
    video_url: referral?.video_url ?? undefined,
    thumbnail_url: referral?.thumbnail_url ?? undefined,
    conversation_origin_type: params.conversationOriginType,
    pricing_type: params.pricingType,
    pricing_category: params.pricingCategory,
    pricing_model: params.pricingModel,
    pricing_billable: params.pricingBillable,
    payload_json: payloadJson,
    updated_at: new Date().toISOString(),
  });

  if (existente?.id) {
    const { data, error } = await supabase
      .from("contato_atribuicoes_meta")
      .update(dados)
      .eq("id", existente.id)
      .select("id")
      .single();

    if (error) {
      throw new Error(`Erro ao atualizar atribuicao Meta: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("contato_atribuicoes_meta")
    .insert(dados)
    .select("id")
    .single();

  if (error) {
    throw new Error(`Erro ao criar atribuicao Meta: ${error.message}`);
  }

  return data;
}
