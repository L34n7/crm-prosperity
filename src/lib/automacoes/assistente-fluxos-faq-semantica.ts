import type { AssistenteAutomacaoNo } from "./assistente-fluxos-base";
import {
  conteudoNo,
  intencaoFaq,
  normalizar,
  type IntencaoFaq,
  type OpcaoNo,
} from "./assistente-fluxos-reparador-semantica";

const TERMOS_NAVEGACAO = /\b(antes e depois|valores?|agendar|agendamento|voltar|menu|encerrar|especialista|atendente|localizacao|mapa)\b/;

const TERMOS_POR_INTENCAO: Record<IntencaoFaq, RegExp[]> = {
  dor: [
    /\b(dor|doi|dolor|sensibilidade|desconforto|anestesia|conforto)\b/,
  ],
  duracao: [
    /\b(duracao|quanto tempo dura|tempo de efeito|efeito dura|meses?|semanas?|dias?)\b/,
  ],
  resultado: [
    /\b(resultado|resultados|quando vejo|em quanto tempo|efeito aparece|evolucao|primeiros sinais)\b/,
  ],
  recorrencia: [
    /\b(volta|retorna|reaparece|recorrencia|manutencao|controle continuo|pode voltar)\b/,
  ],
  naturalidade: [
    /\b(natural|naturalidade|sem exageros|preservar|tracos|harmonia|discreto|sutil|artificial)\b/,
  ],
  sessoes: [
    /\b(sessao|sessoes|quantas|numero de sessoes|plano de tratamento)\b/,
  ],
};

export function ehOpcaoNavegacaoFaq(opcao: OpcaoNo) {
  const texto = normalizar(`${opcao.id} ${opcao.titulo}`);
  return TERMOS_NAVEGACAO.test(texto) && !intencaoFaq(texto);
}

export function intencaoFaqDoNo(no: AssistenteAutomacaoNo): IntencaoFaq | null {
  const config = no.configuracao_json || {};
  const explicita = String(config.faq_intencao || "").trim() as IntencaoFaq;
  if (explicita && TERMOS_POR_INTENCAO[explicita]) return explicita;

  const base = normalizar(
    [no.id, no.titulo, config.mensagem, config.descricao, conteudoNo(no)]
      .filter(Boolean)
      .join(" ")
  );

  const inferida = intencaoFaq(base);
  if (inferida) return inferida;

  for (const [intencao, expressoes] of Object.entries(TERMOS_POR_INTENCAO) as Array<
    [IntencaoFaq, RegExp[]]
  >) {
    if (expressoes.some((expressao) => expressao.test(base))) return intencao;
  }

  return null;
}

export function respostaFaqCompativel(
  opcao: OpcaoNo,
  destino: AssistenteAutomacaoNo
) {
  const esperada = intencaoFaq(`${opcao.id} ${opcao.titulo}`);
  if (!esperada || destino.tipo_no !== "enviar_texto") return false;

  const encontrada = intencaoFaqDoNo(destino);
  if (encontrada === esperada) return true;

  const textoDestino = normalizar(
    `${destino.id} ${destino.titulo} ${destino.configuracao_json?.mensagem || ""}`
  );
  return TERMOS_POR_INTENCAO[esperada].some((expressao) =>
    expressao.test(textoDestino)
  );
}

export function marcarIntencaoFaqNoDestino(
  opcao: OpcaoNo,
  destino: AssistenteAutomacaoNo
) {
  const esperada = intencaoFaq(`${opcao.id} ${opcao.titulo}`);
  if (!esperada || destino.tipo_no !== "enviar_texto") return destino;

  destino.configuracao_json = {
    ...destino.configuracao_json,
    faq_intencao: esperada,
  };
  return destino;
}
