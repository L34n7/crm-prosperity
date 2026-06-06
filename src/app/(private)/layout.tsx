import { cookies } from "next/headers";
import CrmShell from "@/components/CrmShell";
import AmbienteObrigatorioGuard from "@/components/AmbienteObrigatorioGuard";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("crm-sidebar-collapsed")?.value;
  const initialCollapsed = sidebarCookie === "true";

  let profileName = "Usuario";
  let avatarUrl = "";
  let permissoes: string[] = [];
  let assinatura: AssinaturaEmpresa | null = null;
  let isAdmin = false;

  const resultado = await getUsuarioContexto();

  if (resultado.ok) {
    profileName = resultado.usuario.nome || "Usuario";
    avatarUrl = resultado.usuario.avatar_url || "";
    permissoes = resultado.usuario.permissoes;
    assinatura = resultado.usuario.assinatura;
    isAdmin = resultado.usuario.is_admin;
  }

  return (
    <CrmShell
      initialCollapsed={initialCollapsed}
      profileName={profileName}
      avatarUrl={avatarUrl}
      permissoes={permissoes}
      assinatura={assinatura}
      isAdmin={isAdmin}
    >
      {children}
      <AmbienteObrigatorioGuard />
    </CrmShell>
  );
}
