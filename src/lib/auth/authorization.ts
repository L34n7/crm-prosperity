import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";

type UsuarioAuth = Pick<
  UsuarioContexto,
  "id" | "perfis_dinamicos" | "perfil_dinamico_principal"
>;

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
  return await can(usuario.id, "usuarios.visualizar");
}

export async function podeCriarUsuarios(usuario: UsuarioAuth) {
  return await can(usuario.id, "usuarios.criar");
}

export async function podeEditarUsuarios(usuario: UsuarioAuth) {
  return await can(usuario.id, "usuarios.editar");
}

export async function podeVisualizarConversas(usuario: UsuarioAuth) {
  return await can(usuario.id, "conversas.visualizar");
}

export async function podeAssumirConversas(usuario: UsuarioAuth) {
  return await can(usuario.id, "conversas.assumir");
}

export async function podeTransferirConversas(usuario: UsuarioAuth) {
  return await can(usuario.id, "conversas.transferir");
}

export async function podeAtribuirConversas(usuario: UsuarioAuth) {
  return await can(usuario.id, "conversas.atribuir");
}

export async function podeEncerrarConversas(usuario: UsuarioAuth) {
  return await can(usuario.id, "conversas.encerrar");
}

export async function podeVisualizarMensagens(usuario: UsuarioAuth) {
  return await can(usuario.id, "mensagens.visualizar");
}

export async function podeEnviarMensagens(usuario: UsuarioAuth) {
  return await can(usuario.id, "mensagens.enviar");
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