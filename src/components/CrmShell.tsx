import Sidebar from "@/components/Sidebar";
import AssinaturaStatusGuard from "@/components/AssinaturaStatusGuard";
import { HeaderUserProvider } from "@/components/header-user-context";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import styles from "./CrmShell.module.css";

type CrmShellProps = {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  profileName?: string;
  avatarUrl?: string;
  permissoes?: string[];
  assinatura?: AssinaturaEmpresa | null;
  isAdmin?: boolean;
};

export default function CrmShell({
  children,
  initialCollapsed = false,
  profileName = "Usuario",
  avatarUrl = "",
  permissoes = [],
  assinatura = null,
  isAdmin = false,
}: CrmShellProps) {
  return (
    <HeaderUserProvider
      value={{ profileName, avatarUrl, permissoes, assinatura, isAdmin }}
    >
      <div className={styles.shell}>
        <Sidebar
          initialCollapsed={initialCollapsed}
          permissoes={permissoes}
          assinatura={assinatura}
          isAdmin={isAdmin}
        />

        <div className={styles.contentArea}>{children}</div>

        <AssinaturaStatusGuard assinatura={assinatura} isAdmin={isAdmin} />
      </div>
    </HeaderUserProvider>
  );
}
