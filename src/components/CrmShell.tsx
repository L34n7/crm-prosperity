import Sidebar from "@/components/Sidebar";
import AssinaturaStatusGuard from "@/components/AssinaturaStatusGuard";
import WhatsAppMetaBlockNotice from "@/components/WhatsAppMetaBlockNotice";
import WhatsAppDisparoProgressCard from "@/components/WhatsAppDisparoProgressCard";
import { HeaderUserProvider } from "@/components/header-user-context";
import { HeaderSummaryProvider } from "@/components/header-summary-context";
import SessionActivityTracker from "@/components/SessionActivityTracker";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import styles from "./CrmShell.module.css";
import type { NichoCodigo } from "@/lib/nichos/config";

type CrmShellProps = {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  profileName?: string;
  avatarUrl?: string;
  permissoes?: string[];
  assinatura?: AssinaturaEmpresa | null;
  isAdmin?: boolean;
  nichoCodigo?: NichoCodigo;
};

export default function CrmShell({
  children,
  initialCollapsed = false,
  profileName = "Usuario",
  avatarUrl = "",
  permissoes = [],
  assinatura = null,
  isAdmin = false,
  nichoCodigo = "comercio",
}: CrmShellProps) {
  return (
    <HeaderUserProvider
      value={{ profileName, avatarUrl, permissoes, assinatura, isAdmin }}
    >
      <HeaderSummaryProvider>
        <div className={styles.shell}>
          <SessionActivityTracker />

          <Sidebar
            initialCollapsed={initialCollapsed}
            permissoes={permissoes}
            assinatura={assinatura}
            isAdmin={isAdmin}
            nichoCodigo={nichoCodigo}
          />

          <div className={styles.contentArea}>
            <WhatsAppMetaBlockNotice />
            {children}
          </div>

          <AssinaturaStatusGuard assinatura={assinatura} isAdmin={isAdmin} />
          <WhatsAppDisparoProgressCard />
        </div>
      </HeaderSummaryProvider>
    </HeaderUserProvider>
  );
}
