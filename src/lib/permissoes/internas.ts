export const PERMISSAO_INTERNA_EMPRESAS = "empresas.acesso_interno";

export const PERMISSOES_INTERNAS_OCULTAS = [
  PERMISSAO_INTERNA_EMPRESAS,
] as const;

const permissoesInternasOcultas = new Set<string>(PERMISSOES_INTERNAS_OCULTAS);

export function isPermissaoInternaOculta(codigo: string) {
  return permissoesInternasOcultas.has(codigo);
}
