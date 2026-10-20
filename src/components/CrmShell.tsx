import Sidebar from "@/components/Sidebar";
import AssinaturaStatusGuard from "@/components/AssinaturaStatusGuard";
import WhatsAppMetaBlockNotice from "@/components/WhatsAppMetaBlockNotice";
import WhatsAppConnectionTestNotice from "@/components/WhatsAppConnectionTestNotice";
import WhatsAppDisparoProgressCard from "@/components/WhatsAppDisparoProgressCard";
import { HeaderUserProvider } from "@/components/header-user-context";
import { HeaderSummaryProvider } from "@/components/header-summary-context";
import SessionActivityTracker from "@/components/SessionActivityTracker";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import styles from "./CrmShell.module.css";
import type { NichoCodigo } from "@/lib/nichos/config";
import type { WhiteLabelBranding } from "@/lib/white-label/types";
import WhiteLabelThemeRuntime from "@/components/WhiteLabelThemeRuntime";
import WhiteLabelAssinaturaModal from "@/components/WhiteLabelAssinaturaModal";

type CrmShellProps = {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  profileName?: string;
  avatarUrl?: string;
  permissoes?: string[];
  assinatura?: AssinaturaEmpresa | null;
  isAdmin?: boolean;
  nichoCodigo?: NichoCodigo;
  podeAcessarWhatsappWebLocal?: boolean;
  branding?: WhiteLabelBranding;
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
  podeAcessarWhatsappWebLocal = false,
  branding,
}: CrmShellProps) {
  return (
    <HeaderUserProvider
      value={{ profileName, avatarUrl, permissoes, assinatura, isAdmin, nichoCodigo }}
    >
      <HeaderSummaryProvider>
        {branding?.is_white_label ? (
          <WhiteLabelThemeRuntime branding={branding} />
        ) : null}
        <div className={styles.shell}>
          <SessionActivityTracker />

          <Sidebar
            initialCollapsed={initialCollapsed}
            permissoes={permissoes}
            assinatura={assinatura}
            isAdmin={isAdmin}
            nichoCodigo={nichoCodigo}
            podeAcessarWhatsappWebLocal={podeAcessarWhatsappWebLocal}
            branding={branding}
          />

          <div className={styles.contentArea}>
            <WhatsAppMetaBlockNotice />
            <WhatsAppConnectionTestNotice />
            {children}
          </div>

          <WhiteLabelAssinaturaModal
            enabled={assinatura?.white_label_gestora === true}
          />
          <AssinaturaStatusGuard assinatura={assinatura} isAdmin={isAdmin} />
          <WhatsAppDisparoProgressCard />
        </div>
      </HeaderSummaryProvider>
    </HeaderUserProvider>
  );
}
