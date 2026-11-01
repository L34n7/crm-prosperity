"use client";
import { useEffect, useState } from "react";
import styles from "./contatos.module.css";
type Lista = { id: string; nome: string; total_contatos: number };
type Contato = { id: string; nome: string | null; telefone: string | null; email: string | null };
type Props = { lista: Lista; modo: "editar" | "excluir"; onClose: () => void; onAtualizada: (nome: string) => Promise<void> | void; onExcluida: (mensagem: string) => Promise<void> | void };
export default function GerenciarListaConversaModal({ lista, modo, onClose, onAtualizada, onExcluida }: Props) {
  const [nome, setNome] = useState(lista.nome);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [mais, setMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (modo !== "excluir") return;
    let ativo = true;
    setCarregando(true);
    fetch(`/api/contatos/listas-compartilhadas/${lista.id}?page=1`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.ok !== true) throw new Error(data.error || "Não foi possível analisar a lista.");
        if (!ativo) return;
        setContatos(data.contatos || []); setTotal(data.total || 0);
        setPagina(1); setMais(data.mais === true);
      })
      .catch((e: unknown) => { if (ativo) setErro(e instanceof Error ? e.message : "Erro ao consultar contatos."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [lista.id, modo]);
  async function carregarMais() {
    setCarregando(true);
    try {
      const res = await fetch(`/api/contatos/listas-compartilhadas/${lista.id}?page=${pagina + 1}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Erro ao carregar contatos.");
      setContatos((anteriores) => [...anteriores, ...data.contatos]);
      setMais(data.mais === true); setPagina(pagina + 1);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao consultar contatos."); }
    finally { setCarregando(false); }
  }
  async function confirmar() {
    if (salvando || (modo === "excluir" && (!confirmacao || !pagina))) return;
    if (modo === "editar" && !nome.trim()) { setErro("Informe o nome da lista."); return; }
    setSalvando(true); setErro("");
    try {
      const res = await fetch(`/api/contatos/listas-compartilhadas/${lista.id}`, {
        method: modo === "editar" ? "PATCH" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo === "editar" ? { nome: nome.trim() } : { confirmar_exclusao: true }),
      });
      const data = await res.json();
      if (!res.ok || data.ok !== true) throw new Error(data.error || "Falha ao atualizar lista.");
      if (modo === "editar") await onAtualizada(data.lista?.nome || nome.trim());
      else await onExcluida(data.message || `Lista "${lista.nome}" excluída, contatos preservados.`);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao atualizar lista."); }
    finally { setSalvando(false); }
  }
  return (
    <div className={styles.modalOverlay} onClick={() => { if (!salvando) onClose(); }}>
      <div className={`${styles.modalCard} ${styles.listManagerModal}`} role="dialog" aria-modal="true"
        aria-labelledby="gerenciar-conversa-titulo" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.eyebrow}>Lista Conversa</p>
            <h2 className={styles.modalTitle} id="gerenciar-conversa-titulo">{modo === "editar" ? "Editar lista" : "Excluir lista"}</h2>
            <p className={styles.cardDescription}>As mesmas listas são usadas em Contatos e Conversas.</p>
          </div>
          <button type="button" className={styles.modalCloseButton} onClick={onClose} disabled={salvando} aria-label="Fechar modal">×</button>
        </div>
        {erro && <div className={styles.alertError} role="alert">{erro}</div>}
        <div className={styles.listManagerSection}>
          {modo === "editar" ? (
            <>
              <label className={styles.label} htmlFor="nome-conversa-lista">Nome da lista</label>
              <div className={styles.listManagerNameRow}>
                <input className={styles.input} id="nome-conversa-lista" value={nome} autoFocus maxLength={160}
                  disabled={salvando} onChange={(e) => setNome(e.target.value)} />
                <button type="button" className={styles.primaryButton} onClick={confirmar}
                  disabled={salvando || !nome.trim() || nome.trim() === lista.nome}>Salvar nome</button>
              </div>
            </>
          ) : (
            <div className={styles.listDeletePanel}>
              <h3>Excluir “{lista.nome}”?</h3>
              <p className={styles.sharedListImpact}>
                {carregando && !pagina ? "Consultando contatos..." : `${total} contato(s) vinculado(s).`}
                {" "}Todos serão removidos desta lista de conversa.
              </p>
              <p className={styles.sharedListSafety}>Os contatos continuam cadastrados no CRM.</p>
              {pagina > 0 && (
                <div className={styles.sharedListPreview}>
                  {!contatos.length ? <p>Lista vazia.</p> : contatos.map((c) => (
                    <div className={styles.sharedListPreviewRow} key={c.id}>
                      <strong>{c.nome || "Contato sem nome"}</strong>
                      <span>{c.email || c.telefone || "Sem telefone ou e-mail"}</span>
                    </div>
                  ))}
                  {mais && <button type="button" className={styles.secondaryButton} onClick={carregarMais}
                    disabled={carregando}>{carregando ? "Carregando..." : "Mostrar mais contatos"}</button>}
                </div>
              )}
              {pagina > 0 && (
                <label className={styles.modalCheckbox}>
                  <input type="checkbox" checked={confirmacao} onChange={(e) => setConfirmacao(e.target.checked)} />
                  <span>Confirmo excluir a lista e remover seus {total} vínculos, sem excluir contatos.</span>
                </label>
              )}
              <div className={styles.listDeleteActions}>
                <button type="button" className={styles.dangerButton} onClick={confirmar}
                  disabled={!confirmacao || !pagina || salvando}>{salvando ? "Excluindo..." : "Confirmar exclusão"}</button>
                <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={salvando}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
