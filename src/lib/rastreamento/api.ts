import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";

type PermissaoRastreamento =
  | "rastreamento.visualizar"
  | "rastreamento.gerenciar";

export type AcessoRastreamento =
  | {
      ok: true;
      usuario: UsuarioContexto & { empresa_id: string };
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function obterAcessoRastreamento(
  permissao: PermissaoRastreamento
): Promise<AcessoRastreamento> {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return resultado;
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return {
      ok: false,
      error: "Usuario sem empresa vinculada.",
      status: 400,
    };
  }

  if (
    !isAdministrador(usuario) &&
    !usuario.permissoes.includes(permissao)
  ) {
    return {
      ok: false,
      error: "Sem permissao para acessar o rastreamento de leads.",
      status: 403,
    };
  }

  return {
    ok: true,
    usuario: usuario as UsuarioContexto & { empresa_id: string },
  };
}
