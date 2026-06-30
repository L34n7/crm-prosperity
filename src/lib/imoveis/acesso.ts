import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import type { NichoConfig } from "@/lib/nichos/config";
import { can } from "@/lib/permissoes/frontend";

export type AcessoImoveis =
  | {
      ok: true;
      usuario: UsuarioContexto & { empresa_id: string };
      nicho: NichoConfig;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function obterAcessoImoveis(
  permissao: string
): Promise<AcessoImoveis> {
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

  if (!can(usuario.permissoes, permissao)) {
    return {
      ok: false,
      error: "Sem permissao para acessar imoveis.",
      status: 403,
    };
  }

  const nicho = await buscarNichoEmpresa(usuario.empresa_id);

  if (!nicho.modulos.includes("imobiliario.imoveis")) {
    return {
      ok: false,
      error: "Imoveis nao esta disponivel para este nicho.",
      status: 403,
    };
  }

  return {
    ok: true,
    usuario: usuario as UsuarioContexto & { empresa_id: string },
    nicho,
  };
}
