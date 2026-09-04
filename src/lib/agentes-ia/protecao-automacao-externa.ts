import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const JANELA_DETECCAO_MINUTOS = 12;
const LIMITE_MENSAGENS_DETECCAO = 10;
const LIMIAR_DETECCAO = 70;

export type ResultadoDeteccaoAutomacaoExterna = {
  detectado: boolean;
  pontuacao: number;
  motivo: string | null;
  sinais: string[];
};

export type ResultadoDebounceAdaptativo = {
  debounceMs: number;
  adaptado: boolean;
  motivo: string | null;
  mensagensRecentes: number;
};

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ngramas(texto: string, tamanho = 3) {
  const normalizado = normalizarTexto(texto);
  const resultado = new Set<string>();
  if (normalizado.length < tamanho) return resultado;
  for (let indice = 0; indice <= normalizado.length - tamanho; indice += 1) {
    resultado.add(normalizado.slice(indice, indice + tamanho));
  }
  return resultado;
}

function similaridadeDice(textoA: string, textoB: string) {
  const a = ngramas(textoA);
  const b = ngramas(textoB);
  if (!a.size || !b.size) return 0;
  let intersecao = 0;
  for (const item of a) {
    if (b.has(item)) intersecao += 1;
  }
  return (2 * intersecao) / (a.size + b.size);
}

function temAssinaturaForteDeIa(texto: string) {
  const normalizado = normalizarTexto(texto);
  if (!normalizado) return false;
  return [
    /\bto continue the conversation\b/,
    /\bdo not return any other messages?\b/,
    /\bjust the next step of the conversation\b/,
    /\breturn only the next (?:step|message|response)\b/,
    /\b(?:system|developer|assistant) (?:prompt|message|instruction)\b/,
    /\bignore (?:all )?(?:previous|prior) instructions\b/,
    /\b(?:memory|memoria) delta\b/,
    /\btipo negocio\b/,
  ].some((padrao) => padrao.test(normalizado));
}

function pareceMensagemDeAutomacao(texto: string) {
  const normalizado = normalizarTexto(texto);
  if (normalizado.length < 45) return false;
  return [
    /\bmeu foco (?:e|esta|principal)\b/,
    /\bminha funcao (?:e|principal)\b/,
    /\bmeu objetivo (?:e|principal)\b/,
    /\bpara que eu possa (?:te |lhe )?(?:ajudar|auxiliar|orientar|apresentar)\b/,
    /\bpreciso que voce (?:me )?(?:informe|diga|responda)\b/,
    /\bcomo .{0,80}\b(?:especialista|consultor|assistente|atendente)\b/,
    /\bestou (?:a|à) disposicao para (?:te |lhe )?(?:ajudar|auxiliar|orientar)\b/,
  ].some((padrao) => padrao.test(normalizado));
}

function quantidadeParesSemelhantes(textos: string[], limiar: number) {
  let quantidade = 0;
  for (let i = 0; i < textos.length; i += 1) {
    for (let j = i + 1; j < textos.length; j += 1) {
      if (textos[i].length < 70 || textos[j].length < 70) continue;
      if (similaridadeDice(textos[i], textos[j]) >= limiar) quantidade += 1;
    }
  }
  return quantidade;
}

export async function detectarAutomacaoExterna(params: {
  empresaId: string;
  conversaId: string;
  conteudoAgregado?: string | null;
}): Promise<ResultadoDeteccaoAutomacaoExterna> {
  const desde = new Date(
    Date.now() - JANELA_DETECCAO_MINUTOS * 60 * 1000
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("conteudo, tipo_mensagem, created_at")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("remetente_tipo", "contato")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(LIMITE_MENSAGENS_DETECCAO);

  if (error) {
    console.error("[AGENTE_IA] Falha ao avaliar automação externa:", error);
    return { detectado: false, pontuacao: 0, motivo: null, sinais: [] };
  }

  const textosBanco = (data || [])
    .map((item) => String(item.conteudo || "").trim())
    .filter((texto) => texto.length >= 8);
  const conteudoAgregado = String(params.conteudoAgregado || "").trim();
  const textos = Array.from(
    new Set([conteudoAgregado, ...textosBanco].filter(Boolean))
  ).slice(0, LIMITE_MENSAGENS_DETECCAO + 1);

  let pontuacao = 0;
  const sinais: string[] = [];

  if (textos.some(temAssinaturaForteDeIa)) {
    pontuacao = Math.max(pontuacao, 100);
    sinais.push("instrucao_interna_ou_assinatura_de_ia");
  }

  const paresMuitoSemelhantes = quantidadeParesSemelhantes(textos, 0.78);
  if (paresMuitoSemelhantes >= 1) {
    pontuacao += 70;
    sinais.push("mensagem_longa_repetida");
  } else {
    const paresSemelhantes = quantidadeParesSemelhantes(textos, 0.56);
    if (paresSemelhantes >= 2) {
      pontuacao += 45;
      sinais.push("padrao_de_mensagens_semelhantes");
    }
  }

  const mensagensComPadraoAutomacao = textos.filter(pareceMensagemDeAutomacao).length;
  if (mensagensComPadraoAutomacao >= 3) {
    pontuacao += 35;
    sinais.push("persona_automatizada_repetida");
  } else if (mensagensComPadraoAutomacao >= 2) {
    pontuacao += 15;
  }

  const datas = (data || [])
    .map((item) => new Date(item.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  if (datas.length >= 4) {
    const referencia = datas[0];
    const emDozeSegundos = datas.filter(
      (timestamp) => referencia - timestamp <= 12000
    ).length;
    if (emDozeSegundos >= 4) {
      pontuacao += 20;
      sinais.push("rajada_de_mensagens");
    }
  }

  const detectado = pontuacao >= LIMIAR_DETECCAO;
  return {
    detectado,
    pontuacao,
    motivo: detectado ? sinais.join(",") || "padrao_automatizado" : null,
    sinais,
  };
}

function limitarDebounce(valor: number) {
  return Math.min(10000, Math.max(250, Math.round(valor)));
}

export async function calcularDebounceAdaptativo(params: {
  empresaId: string;
  conversaId: string;
  debounceBaseMs: number;
  mensagemTipo?: string | null;
}): Promise<ResultadoDebounceAdaptativo> {
  const base = limitarDebounce(params.debounceBaseMs);
  const desde = new Date(Date.now() - 15000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("tipo_mensagem, created_at")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("remetente_tipo", "contato")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[AGENTE_IA] Falha ao calcular debounce adaptativo:", error);
    return {
      debounceMs: base,
      adaptado: false,
      motivo: null,
      mensagensRecentes: 0,
    };
  }

  const mensagens = data || [];
  if (!mensagens.length) {
    return {
      debounceMs: base,
      adaptado: false,
      motivo: null,
      mensagensRecentes: 0,
    };
  }

  const referencia = Math.max(
    ...mensagens
      .map((item) => new Date(item.created_at).getTime())
      .filter(Number.isFinite),
    Date.now() - 15000
  );
  const contarJanela = (janelaMs: number) =>
    mensagens.filter((item) => {
      const timestamp = new Date(item.created_at).getTime();
      return Number.isFinite(timestamp) && referencia - timestamp <= janelaMs;
    }).length;

  let debounceMs = base;
  const motivos: string[] = [];
  const emQuatroSegundos = contarJanela(4000);
  const emOitoSegundos = contarJanela(8000);
  const emDozeSegundos = contarJanela(12000);
  const temAudioRecente = mensagens.some(
    (item) => String(item.tipo_mensagem || "") === "audio"
  );

  if (emQuatroSegundos >= 2) {
    debounceMs = Math.max(debounceMs, 5500);
    motivos.push("mensagens_proximas");
  }
  if (emOitoSegundos >= 3) {
    debounceMs = Math.max(debounceMs, 7000);
    motivos.push("rajada_curta");
  }
  if (emDozeSegundos >= 5) {
    debounceMs = Math.max(debounceMs, 8500);
    motivos.push("rajada_intensa");
  }
  if (String(params.mensagemTipo || "") === "audio" || temAudioRecente) {
    debounceMs = Math.max(debounceMs, 6500);
    motivos.push("audio_em_rajada");
  }

  debounceMs = limitarDebounce(debounceMs);
  return {
    debounceMs,
    adaptado: debounceMs > base,
    motivo: motivos.length ? Array.from(new Set(motivos)).join(",") : null,
    mensagensRecentes: mensagens.length,
  };
}
