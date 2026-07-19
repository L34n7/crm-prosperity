import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_RELATORIOS_INTERNOS } from "@/lib/permissoes/internas";
import RelatoriosInternosTabs from "./RelatoriosInternosTabs";

export default async function RelatoriosInternosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (!can(resultado.usuario.permissoes, PERMISSAO_RELATORIOS_INTERNOS)) {
    redirect("/painel");
  }

  return (
    <>
      <RelatoriosInternosTabs />
      {children}
    </>
  );
}
