import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";

type UsuarioAuth = Pick<
  UsuarioContexto,
  "id" | "perfis_dinamicos" | "perfil_dinamico_principal"
> &
  Partial<Pick<UsuarioContexto, "permissoes">>;

async function temPermissao(usuario: UsuarioAuth, permissaoCodigo: string) {
  if (Array.isArray(usuario.permissoes)) {
    return usuario.permissoes.includes(permissaoCodigo);
  }

  return await can(usuario.id, permissaoCodigo);
}

export function isAdministrador(
  usuario: Pick<UsuarioContexto, "perfis_dinamicos" | "perfil_dinamico_principal">
) {
  const nomePerfilPrincipal = usuario.perfil_dinamico_principal?.nome ?? null;

  const temPerfilAdministrador =
    nomePerfilPrincipal === "Administrador" ||
    usuario.perfis_dinamicos.some((perfil) => perfil.nome === "Administrador");

  return temPerfilAdministrador;
}

export async function podeVisualizarUsuarios(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "usuarios.visualizar");
}

export async function podeCriarUsuarios(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "usuarios.criar");
}

export async function podeEditarUsuarios(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "usuarios.editar");
}

export async function podeRemoverUsuarios(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "usuarios.remover");
}

export async function podeVisualizarConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.visualizar");
}

export async function podeAssumirConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.assumir");
}

export async function podeTransferirConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.transferir");
}

export async function podeAtribuirConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.atribuir");
}

export async function podeEncerrarConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.encerrar");
}

export async function podeVisualizarMensagens(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "mensagens.visualizar");
}

export async function podeEnviarMensagens(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "mensagens.enviar");
}

export async function podeOperarComoSupervisor(usuario: UsuarioAuth) {
  if (isAdministrador(usuario)) return true;
  return await podeAtribuirConversas(usuario);
}

export async function podeOperarComoAtendente(usuario: UsuarioAuth) {
  if (isAdministrador(usuario)) return true;

  const podeVisualizar = await podeVisualizarConversas(usuario);
  const podeEnviar = await podeEnviarMensagens(usuario);

  return podeVisualizar || podeEnviar;
}
