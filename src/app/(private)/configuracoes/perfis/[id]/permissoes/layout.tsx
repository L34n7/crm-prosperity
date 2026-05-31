import { redirect } from "next/navigation";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";

export default async function PermissoesPerfilLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    redirect("/login");
  }

  if (!can(resultado.usuario.permissoes, "perfis.alterar_permissoes")) {
    redirect("/configuracoes/perfis");
  }

  return children;
}
