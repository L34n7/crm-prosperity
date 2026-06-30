import { cookies } from "next/headers";
import CrmShell from "@/components/CrmShell";
import AmbienteObrigatorioGuard from "@/components/AmbienteObrigatorioGuard";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import type { NichoCodigo } from "@/lib/nichos/config";

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
  let nichoCodigo: NichoCodigo = "comercio";

  const resultado = await getUsuarioContexto();

  if (resultado.ok) {
    profileName = resultado.usuario.nome || "Usuario";
    avatarUrl = resultado.usuario.avatar_url || "";
    permissoes = resultado.usuario.permissoes;
    assinatura = resultado.usuario.assinatura;
    isAdmin = resultado.usuario.is_admin;

    if (resultado.usuario.empresa_id) {
      try {
        const nicho = await buscarNichoEmpresa(resultado.usuario.empresa_id);
        nichoCodigo = nicho.codigo;
      } catch (error) {
        console.error("Erro ao carregar nicho da empresa:", error);
      }
    }
  }

  return (
    <CrmShell
      initialCollapsed={initialCollapsed}
      profileName={profileName}
      avatarUrl={avatarUrl}
      permissoes={permissoes}
      assinatura={assinatura}
      isAdmin={isAdmin}
      nichoCodigo={nichoCodigo}
    >
      {children}
      <AmbienteObrigatorioGuard />
    </CrmShell>
  );
}
