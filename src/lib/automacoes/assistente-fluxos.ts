import { validarFluxoAssistente as validarFluxoAssistenteEstrito } from "./assistente-fluxos-base.ts";

export {
  compilarPlanoAssistente,
  normalizarPlanoAssistente,
} from "./assistente-fluxos-compilador-seguro.ts";
export { completarRotasDeOpcoesPlano } from "./assistente-fluxos-base.ts";
export type * from "./assistente-fluxos-base.ts";

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
