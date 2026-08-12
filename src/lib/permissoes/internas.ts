export const PERMISSAO_INTERNA_EMPRESAS = "empresas.acesso_interno";
export const PERMISSAO_RELATORIOS_INTERNOS = "relatorios_internos.visualizar";
export const PERMISSAO_RELATORIOS = "relatorios.visualizar";

export const PERMISSOES_INTERNAS_OCULTAS = [
  PERMISSAO_INTERNA_EMPRESAS,
  PERMISSAO_RELATORIOS_INTERNOS,
] as const;

export const PERMISSOES_OCULTAS_NA_TELA = [
  ...PERMISSOES_INTERNAS_OCULTAS,
  PERMISSAO_RELATORIOS,
] as const;

const permissoesInternasOcultas = new Set<string>(PERMISSOES_INTERNAS_OCULTAS);
const permissoesOcultasNaTela = new Set<string>(PERMISSOES_OCULTAS_NA_TELA);

export function isPermissaoInternaOculta(codigo: string) {
  return permissoesInternasOcultas.has(codigo);
}

export function isPermissaoOcultaNaTela(codigo: string) {
  return permissoesOcultasNaTela.has(codigo);
}
