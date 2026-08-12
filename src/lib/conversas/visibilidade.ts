import type { UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
} from "@/lib/auth/authorization";
import { getPoliticaAtendimentoDoUsuario } from "@/lib/configuracoes/politicas-atendimento";

/**
 * A permissão de atribuir libera a ação, mas não deve, sozinha, ampliar a
 * listagem para conversas já atribuídas a outras pessoas do setor. Essa visão
 * ampliada é necessária apenas para quem também pode reatribuir atendimentos.
 */
export async function podeVisualizarConversasAtribuidasDoSetor(
  usuario: UsuarioContexto
) {
  if (isAdministrador(usuario)) return true;

  const [podeAtribuir, politica] = await Promise.all([
    podeAtribuirConversas(usuario),
    getPoliticaAtendimentoDoUsuario(usuario),
  ]);

  return podeAtribuir && politica.pode_reatribuir;
}
