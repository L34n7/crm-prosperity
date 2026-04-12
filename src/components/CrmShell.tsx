import Sidebar from "@/components/Sidebar";
import styles from "./CrmShell.module.css";

type CrmShellProps = {
  children: React.ReactNode;
};

export default function CrmShell({ children }: CrmShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar />

      <div className={styles.contentArea}>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}