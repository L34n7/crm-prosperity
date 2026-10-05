import styles from "./loading.module.css";

export default function PainelLoading() {
  return (
    <main className={styles.page} role="status" aria-live="polite">
      <div className={styles.card}>
        <span className={styles.spinner} aria-hidden="true" />
        <strong>Carregando seu painel</strong>
        <span>Preparando informações, indicadores e perfil...</span>
      </div>
    </main>
  );
}
