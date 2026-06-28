export const PERMISSAO_VISUALIZAR_DISPAROS =
  "whatsapp.disparos.visualizar";
export const PERMISSAO_REALIZAR_DISPAROS = "whatsapp.disparos.enviar";

type UsuarioComPermissoes = {
  permissoes?: string[] | null;
};

function possuiPermissao(
  usuario: UsuarioComPermissoes,
  permissao: string
) {
  return Array.isArray(usuario.permissoes)
    ? usuario.permissoes.includes(permissao)
    : false;
}

export function podeVisualizarDisparos(usuario: UsuarioComPermissoes) {
  return possuiPermissao(usuario, PERMISSAO_VISUALIZAR_DISPAROS);
}

export function podeRealizarDisparos(usuario: UsuarioComPermissoes) {
  return (
    podeVisualizarDisparos(usuario) &&
    possuiPermissao(usuario, PERMISSAO_REALIZAR_DISPAROS)
  );
}
