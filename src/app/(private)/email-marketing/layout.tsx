import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { emailMarketingHabilitado } from "@/lib/email-marketing/admin";

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

  const podeAcessarEmailMarketing =
    Boolean(resultado.usuario.empresa_id) &&
    resultado.usuario.permissoes.includes("email_marketing.visualizar") &&
    await emailMarketingHabilitado(resultado.usuario.empresa_id!);

  if (!podeAcessarEmailMarketing) {
    redirect("/painel");
  }

  return children;
}
