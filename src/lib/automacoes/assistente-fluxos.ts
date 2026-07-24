import { validarFluxoAssistente as validarFluxoAssistenteEstrito } from "./assistente-fluxos-base.ts";
import {
  compilarPlanoAssistente as compilarPlanoAssistenteOriginal,
  normalizarPlanoAssistente,
} from "./assistente-fluxos-conexoes-ia.ts";

export { normalizarPlanoAssistente };
export { completarRotasDeOpcoesPlano } from "./assistente-fluxos-base.ts";
export type * from "./assistente-fluxos-base.ts";
export type { EstrategiaDistribuicaoAtendimento } from "./assistente-fluxos-conexoes-ia.ts";

function ehDivergenciaSemanticaFaq(item: { codigo?: string; mensagem?: string }) {
  const codigo = String(item.codigo || "").toLowerCase();
  const mensagem = String(item.mensagem || "").toLowerCase();

  return (
    codigo.includes("faq") ||
    mensagem.includes("resposta de faq compatível") ||
    mensagem.includes("resposta de faq compativel") ||
    (mensagem.includes("faq") && mensagem.includes("não aponta")) ||
    (mensagem.includes("faq") && mensagem.includes("nao aponta"))
  );
}

/**
 * Divergencias semanticas de FAQ devem continuar visiveis no rascunho, mas nao
 * podem consumir varias chamadas da IA e impedir que o usuario inspecione o
 * resultado. Problemas tecnicos de grafo, refs, terminais e recursos continuam
 * bloqueantes normalmente.
 */
export function compilarPlanoAssistente(
  params: Parameters<typeof compilarPlanoAssistenteOriginal>[0]
) {
  const resultado = compilarPlanoAssistenteOriginal(params);
  const divergenciasFaq = resultado.validacao.erros.filter(
    ehDivergenciaSemanticaFaq
  );

  if (divergenciasFaq.length === 0) return resultado;

  const erros = resultado.validacao.erros.filter(
    (item) => !ehDivergenciaSemanticaFaq(item)
  );

  return {
    ...resultado,
    validacao: {
      ...resultado.validacao,
      valido: erros.length === 0,
      erros,
      avisos: [...resultado.validacao.avisos, ...divergenciasFaq],
    },
  };
}

/**
 * A importacao por codigo cria propositalmente um rascunho incompleto:
 * referencias de midia sao removidas e setores podem precisar ser escolhidos
 * novamente na empresa de destino. Esses problemas devem bloquear somente a
 * ativacao do fluxo, nunca a criacao da copia compartilhada.
 *
 * Os demais usos continuam com a validacao estrita do assistente/compilador.
 */
export function validarFluxoAssistente(
  params: Parameters<typeof validarFluxoAssistenteEstrito>[0]
) {
  const validacao = validarFluxoAssistenteEstrito(params);
  const importandoFluxoCompartilhado =
    Array.isArray(params.setores) &&
    params.variaveis === undefined &&
    params.midias === undefined;

  if (!importandoFluxoCompartilhado) {
    return validacao;
  }

  return {
    ...validacao,
    valido: true,
    erros: [],
    avisos: [...validacao.avisos, ...validacao.erros],
  };
}
