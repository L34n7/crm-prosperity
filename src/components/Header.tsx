import LogoutButton from "@/components/LogoutButton";
import styles from "./Header.module.css";

type HeaderProps = {
  title: string;
  subtitle?: string;
};

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.label}>Painel administrativo</p>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>

      <div className={styles.actions}>
        <div className={styles.badge}>CRM web multiempresa</div>
        <LogoutButton />
      </div>
    </header>
  );
}