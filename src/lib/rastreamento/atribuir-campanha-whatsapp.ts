import { getSupabaseAdmin } from "@/lib/supabase/admin";

type AtribuirCampanhaParams = {
  empresaId: string;
  contatoId: string;
  conversaId: string;
  conteudo?: string | null;
};

type Atribuicao = {
  origemId: string | null;
  origemNome: string | null;
  campanhaId: string;
  campanhaNome: string;
  linkId: string | null;
  cliqueId: string | null;
};

function obterNomeRelacao(
  relacao: { nome?: string | null } | Array<{ nome?: string | null }> | null
) {
  if (Array.isArray(relacao)) {
    return relacao[0]?.nome || null;
  }

  return relacao?.nome || null;
}

function extrairTrackingToken(conteudo: string) {
  return conteudo.match(/\[trk:([0-9a-f-]{36})\]/i)?.[1] || null;
}

function extrairCodigoCampanha(conteudo: string) {
  return conteudo.match(/(?:codigo|c[oó]digo)\s*:\s*([a-z0-9_-]{2,40})/i)?.[1] || null;
}

async function buscarAtribuicaoPorClique(
  empresaId: string,
  trackingToken: string
): Promise<Atribuicao | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rastreamento_cliques")
    .select(`
      id,
      origem_id,
      campanha_id,
      link_id,
      rastreamento_origens ( nome ),
      rastreamento_campanhas ( nome )
    `)
    .eq("empresa_id", empresaId)
    .eq("tracking_token", trackingToken)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar clique rastreavel: ${error.message}`);
  }

  if (!data?.campanha_id) {
    return null;
  }

  return {
    origemId: data.origem_id || null,
    origemNome: obterNomeRelacao(data.rastreamento_origens),
    campanhaId: data.campanha_id,
    campanhaNome: obterNomeRelacao(data.rastreamento_campanhas) || "Campanha rastreada",
    linkId: data.link_id || null,
    cliqueId: data.id,
  };
}

async function buscarAtribuicaoPorCodigo(
  empresaId: string,
  codigo: string
): Promise<Atribuicao | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rastreamento_campanhas")
    .select(`
      id,
      nome,
      origem_id,
      rastreamento_origens ( nome )
    `)
    .eq("empresa_id", empresaId)
    .ilike("codigo", codigo)
    .eq("status", "ativo")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar campanha rastreavel: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    origemId: data.origem_id || null,
    origemNome: obterNomeRelacao(data.rastreamento_origens),
    campanhaId: data.id,
    campanhaNome: data.nome,
    linkId: null,
    cliqueId: null,
  };
}

export async function atribuirCampanhaPorMensagemWhatsApp({
  empresaId,
  contatoId,
  conversaId,
  conteudo,
}: AtribuirCampanhaParams) {
  const texto = String(conteudo || "").trim();

  if (!texto) {
    return null;
  }

  const trackingToken = extrairTrackingToken(texto);
  const codigoCampanha = extrairCodigoCampanha(texto);

  if (!trackingToken && !codigoCampanha) {
    return null;
  }

  const atribuicao =
    (trackingToken
      ? await buscarAtribuicaoPorClique(empresaId, trackingToken)
      : null) ||
    (codigoCampanha
      ? await buscarAtribuicaoPorCodigo(empresaId, codigoCampanha)
      : null);

  if (!atribuicao) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const agora = new Date().toISOString();
  const payload = {
    rastreamento_origem_id: atribuicao.origemId,
    rastreamento_campanha_id: atribuicao.campanhaId,
    rastreamento_link_id: atribuicao.linkId,
    rastreamento_clique_id: atribuicao.cliqueId,
    rastreamento_atribuido_em: agora,
  };

  const { error: contatoError } = await supabase
    .from("contatos")
    .update({
      ...payload,
      origem: atribuicao.origemNome || "Campanha rastreada",
      campanha: atribuicao.campanhaNome,
    })
    .eq("empresa_id", empresaId)
    .eq("id", contatoId);

  if (contatoError) {
    throw new Error(`Erro ao atribuir campanha ao contato: ${contatoError.message}`);
  }

  const { error: conversaError } = await supabase
    .from("conversas")
    .update(payload)
    .eq("empresa_id", empresaId)
    .eq("id", conversaId);

  if (conversaError) {
    throw new Error(`Erro ao atribuir campanha a conversa: ${conversaError.message}`);
  }

  if (atribuicao.cliqueId) {
    const { error: cliqueError } = await supabase
      .from("rastreamento_cliques")
      .update({
        contato_id: contatoId,
        conversa_id: conversaId,
        convertido_em: agora,
      })
      .eq("empresa_id", empresaId)
      .eq("id", atribuicao.cliqueId);

    if (cliqueError) {
      throw new Error(`Erro ao converter clique rastreavel: ${cliqueError.message}`);
    }
  }

  await supabase
    .from("rastreamento_eventos")
    .update({
      origem_id: atribuicao.origemId,
      campanha_id: atribuicao.campanhaId,
      link_id: atribuicao.linkId,
      clique_id: atribuicao.cliqueId,
    })
    .eq("empresa_id", empresaId)
    .eq("contato_id", contatoId)
    .is("campanha_id", null);

  if (atribuicao.cliqueId) {
    await supabase
      .from("rastreamento_eventos")
      .update({
        contato_id: contatoId,
        conversa_id: conversaId,
      })
      .eq("empresa_id", empresaId)
      .eq("clique_id", atribuicao.cliqueId);
  }

  return atribuicao;
}
