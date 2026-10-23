import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

export default async function EmailMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    if (resultado.status === 401) {
      redirect("/login");
    }

    redirect("/painel");
  }

  const podeAcessarEmailMarketing = resultado.usuario.permissoes.includes(
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!podeAcessarEmailMarketing) {
    redirect("/painel");
  }

  return children;
}
