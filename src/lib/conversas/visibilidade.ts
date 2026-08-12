import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeVisualizarConversasDoSetor,
  podeVisualizarConversasEncerradasDoSetor,
} from "@/lib/auth/authorization";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";

const STATUS_ENCERRADOS = new Set([
  "encerrado_manual",
  "encerrado_24h",
  "encerrado_aut",
]);

export type ConversaParaVerificarVisibilidade = {
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status?: string | null;
  escopo_fila?: string | null;
  integracao_whatsapp_id?: string | null;
};

/** Ações de atribuição não ampliam implicitamente a leitura do setor. */
export async function podeVisualizarConversasAtribuidasDoSetor(
  usuario: UsuarioContexto
) {
  if (isAdministrador(usuario)) return true;

  return await podeVisualizarConversasDoSetor(usuario);
}

export async function podeVisualizarConversasEncerradasDoSetorEfetivo(
  usuario: UsuarioContexto
) {
  if (isAdministrador(usuario)) return true;

  return await podeVisualizarConversasEncerradasDoSetor(usuario);
}

export async function usuarioPodeVisualizarConversa(
  usuario: UsuarioContexto,
  conversa: ConversaParaVerificarVisibilidade
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (
    !(await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario,
      empresaId: conversa.empresa_id,
      integracaoId: conversa.integracao_whatsapp_id ?? null,
    }))
  ) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  if (conversa.responsavel_id === usuario.id) return true;

  if (
    conversa.escopo_fila === "geral" &&
    conversa.status === "fila" &&
    !conversa.responsavel_id
  ) {
    return true;
  }

  if (!conversa.setor_id || !usuario.setores_ids.includes(conversa.setor_id)) {
    return false;
  }

  if (conversa.status && STATUS_ENCERRADOS.has(conversa.status)) {
    return await podeVisualizarConversasEncerradasDoSetorEfetivo(usuario);
  }

  if (!conversa.responsavel_id && conversa.status === "fila") {
    return true;
  }

  return await podeVisualizarConversasAtribuidasDoSetor(usuario);
}
