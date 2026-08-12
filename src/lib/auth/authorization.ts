import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";

type UsuarioAuth = Pick<
  UsuarioContexto,
  "id" | "perfis_dinamicos" | "perfil_dinamico_principal"
> &
  Partial<Pick<UsuarioContexto, "permissoes">>;

type UsuarioPermissao = Pick<UsuarioContexto, "id"> &
  Partial<Pick<UsuarioContexto, "permissoes">>;

async function temPermissao(
  usuario: UsuarioPermissao,
  permissaoCodigo: string
) {
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

export async function podeVisualizarConversasDoSetor(usuario: UsuarioAuth) {
  return await temPermissao(
    usuario,
    "conversas.visualizar_conversas_setor"
  );
}

export async function podeVisualizarConversasEncerradasDoSetor(
  usuario: UsuarioAuth
) {
  return await temPermissao(
    usuario,
    "conversas.visualizar_encerradas_setor"
  );
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

export async function podeReabrirConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.reabrir");
}

export async function podeExportarConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.exportar");
}

export async function podeEditarContatoPelaConversa(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.editar_contato");
}

export async function podeGerenciarEtiquetasConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.gerenciar_etiquetas");
}

export async function podeGerenciarNotasConversas(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "conversas.gerenciar_notas");
}

export async function podeVisualizarMensagens(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "mensagens.visualizar");
}

export async function podeEnviarMensagens(usuario: UsuarioAuth) {
  return await temPermissao(usuario, "mensagens.enviar");
}

export async function podeEnviarMidia(usuario: UsuarioPermissao) {
  return await temPermissao(usuario, "mensagens.enviar_midia");
}

export async function podeTranscreverAudio(usuario: UsuarioPermissao) {
  return await temPermissao(usuario, "mensagens.transcrever_audio");
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
