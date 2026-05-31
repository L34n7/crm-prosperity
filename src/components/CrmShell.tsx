import Sidebar from "@/components/Sidebar";
import styles from "./CrmShell.module.css";
import {
  HeaderUserProvider,
} from "@/components/header-user-context";

type CrmShellProps = {
  children: React.ReactNode;
  initialCollapsed?: boolean;
  profileName?: string;
  avatarUrl?: string;
  permissoes?: string[];
};

export default function CrmShell({
  children,
  initialCollapsed = false,
  profileName = "Usuário",
  avatarUrl = "",
  permissoes = [],
}: CrmShellProps) {
  return (
    <HeaderUserProvider value={{ profileName, avatarUrl, permissoes }}>
      <div className={styles.shell}>
        <Sidebar
          initialCollapsed={initialCollapsed}
          permissoes={permissoes}
        />

        <div className={styles.contentArea}>
          {children}
        </div>
      </div>
    </HeaderUserProvider>
  );
}
