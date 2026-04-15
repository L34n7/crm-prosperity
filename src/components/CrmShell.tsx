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
};

export default function CrmShell({
  children,
  initialCollapsed = false,
  profileName = "Usuário",
  avatarUrl = "",
}: CrmShellProps) {
  return (
    <HeaderUserProvider value={{ profileName, avatarUrl }}>
      <div className={styles.shell}>
        <Sidebar initialCollapsed={initialCollapsed} />

        <div className={styles.contentArea}>
          {children}
        </div>
      </div>
    </HeaderUserProvider>
  );
}