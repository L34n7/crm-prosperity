import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";

export function usuarioTemPermissao(
  usuario: Pick<UsuarioContexto, "permissoes">,
  permissao: string,
) {
  return usuario.permissoes.includes(permissao);
}

export function respostaSemPermissao(
  permissao: string,
  mensagem = "Você não tem permissão para realizar esta ação.",
) {
  return NextResponse.json(
    { ok: false, error: mensagem, permissao_necessaria: permissao },
    { status: 403 },
  );
}

export function bloquearSemPermissao(
  usuario: Pick<UsuarioContexto, "permissoes">,
  permissao: string,
  mensagem?: string,
) {
  return usuarioTemPermissao(usuario, permissao)
    ? null
    : respostaSemPermissao(permissao, mensagem);
}

export async function garantirPermissaoPagina(permissao: string) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (!usuarioTemPermissao(resultado.usuario, permissao)) {
    redirect("/perfil");
  }

  return resultado.usuario;
}
