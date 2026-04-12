export function can(
  permissoes: string[] | undefined,
  permissao: string
) {
  if (!permissoes) return false;
  return permissoes.includes(permissao);
}