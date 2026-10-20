
import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

export default async function WhiteLabelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) redirect("/login");

  const permitido = await can(
    contexto.usuario.id,
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!permitido) redirect("/painel");

  return children;
}
