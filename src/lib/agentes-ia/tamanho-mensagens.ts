/**
 * Tetos por balão gerado pela IA, sem tamanho mínimo. Textos fixos e
 * conteúdo de ferramentas não devem passar pelo ajuste de tamanho.
 */
export const OPCOES_TAMANHO_MENSAGENS = [
  { valor: "curta", rotulo: "Mensagens curtas", maximo: 150 },
  { valor: "media_curta", rotulo: "Mensagens médias curtas", maximo: 250 },
  { valor: "media", rotulo: "Mensagens médias", maximo: 400 },
  { valor: "media_longa", rotulo: "Mensagens médias longas", maximo: 600 },
  { valor: "longa", rotulo: "Mensagens longas", maximo: 900 },
] as const;

export type TamanhoMensagens = (typeof OPCOES_TAMANHO_MENSAGENS)[number]["valor"];
export const TAMANHO_MENSAGENS_PADRAO: TamanhoMensagens = "media";

export function normalizarTamanhoMensagens(valor: unknown): TamanhoMensagens {
  const encontrado = OPCOES_TAMANHO_MENSAGENS.find((item) => item.valor === valor);
  return encontrado?.valor || TAMANHO_MENSAGENS_PADRAO;
}

export function faixaTamanhoMensagens(valor: unknown) {
  return OPCOES_TAMANHO_MENSAGENS.find(
    (item) => item.valor === normalizarTamanhoMensagens(valor)
  ) || OPCOES_TAMANHO_MENSAGENS[2];
}

export function instrucaoTamanhoMensagens(valor: unknown, followup = false): string {
  const faixa = faixaTamanhoMensagens(valor);
  return [
    "CONFIGURAÇÃO DO EDITOR DO AGENTE — TAMANHO DAS MENSAGENS (PRIORIDADE SOBRE REGRAS DE TAMANHO DO PROMPT PERSONALIZADO):",
    "Opção: " + faixa.rotulo + "; TETO de até " + faixa.maximo + " caracteres POR BALÃO, sem mínimo.",
    "O teto é o MÁXIMO, não o tamanho esperado. Perguntas simples devem receber respostas simples e naturalmente curtas, mesmo com o teto configurado em 900 caracteres. Evite prolixidade e repetição.",
    followup
      ? "FOLLOW-UP GERADO PELA IA: escreva UM ÚNICO balão natural e contextual, preferencialmente dentro do máximo escolhido. Foque em uma ideia relevante e um próximo passo."
      : "CONVERSA: responda com 1 a 3 balões independentes no array mensagens conforme a necessidade, respeitando de preferência o máximo por balão. Uma dúvida simples pode caber em um único balão.",
    "Não quebre frases ao meio. Em uma explicação complexa, preserve todos os fatos necessários; não alongue respostas para preencher o teto.",
    "EXCEÇÕES: mantenha sem redução os textos fixos configurados e o conteúdo integral de ferramentas (cotação veicular completa, valores, listas técnicas, consultas e demais documentos gerados), sem jamais truncar URLs ou informações essenciais.",
  ].join("\n");
}

/**
 * Ajusta somente texto livre gerado pela IA. Nunca descarta conteúdo para
 * caber no máximo de balões: se não for possível dividir sem perda, retorna
 * a resposta original. URLs e palavras nunca são cortadas no meio.
 */
export function ajustarBaloesGerados(
  mensagens: string[],
  tamanho: unknown,
  limiteBaloes = 3,
): string[] {
  const originais = mensagens.map((item) => String(item || "").trim()).filter(Boolean);
  const maximo = faixaTamanhoMensagens(tamanho).maximo;
  const ajustados: string[] = [];
  for (const original of originais) {
    let restante = original;
    while (restante.length > maximo) {
      const trecho = restante.slice(0, maximo + 1);
      let corte = -1;
      for (const resultado of trecho.matchAll(/[.!?;]\s/g)) {
        const fimFrase = (resultado.index || 0) + 1;
        if (fimFrase >= Math.floor(maximo * 0.55) && fimFrase <= maximo) corte = fimFrase;
      }
      if (corte < 0) corte = trecho.lastIndexOf(" ", maximo);
      if (corte < Math.floor(maximo * 0.35)) return originais;
      ajustados.push(restante.slice(0, corte).trim());
      restante = restante.slice(corte).trim();
      if (ajustados.length + 1 > limiteBaloes) return originais;
    }
    if (restante) ajustados.push(restante);
    if (ajustados.length > limiteBaloes) return originais;
  }
  return ajustados;
}

/** Proteção de tamanho só para follow-ups gerados por IA, nunca textos fixos. */
export function ajustarFollowupGerado(
  textoOriginal: string,
  tamanho: unknown,
  alternativa: string,
): string {
  const texto = String(textoOriginal || "").trim();
  const maximo = faixaTamanhoMensagens(tamanho).maximo;
  if (texto.length <= maximo) return texto;

  const alternativaCurta = String(alternativa || "").trim();
  const retomada = alternativaCurta && alternativaCurta.length <= maximo
    ? alternativaCurta : "Podemos continuar de onde paramos?";
  const links = texto.match(/https?:\/\/[^\s<>]+/gi) || [];
  if (!links.length) return retomada;
  // Preserva links completos. Se não couberem, não trunca a URL.
  const blocoLinks = Array.from(new Set(links)).join("\n");
  if (blocoLinks.length > maximo) return texto;
  const espaco = maximo - blocoLinks.length - 1;
  const introducao = retomada.length <= espaco
    ? retomada : espaco >= 12 ? "Veja o link:" : "";
  return introducao ? introducao + "\n" + blocoLinks : blocoLinks;
}
