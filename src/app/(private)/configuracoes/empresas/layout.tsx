import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import PermitirAcessoCliente from "./PermitirAcessoCliente";

export default async function EmpresasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (!can(resultado.usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS)) {
    redirect("/painel");
  }

  const podePermitirAcesso = can(
    resultado.usuario.permissoes,
    "empresas.criar"
  );

  return (
    <>
      {children}
      {podePermitirAcesso && <PermitirAcessoCliente />}
    </>
  );
}
