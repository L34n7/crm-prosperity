"use client";

import { useEffect, useState } from "react";
import { BookOpen, Loader2, Save, X } from "lucide-react";
import styles from "./AgenteModals.module.css";

export type ConhecimentoEditavel = {
  id: string;
  titulo: string;
  categoria?: string | null;
  conteudo: string;
  palavras_chave?: string[];
  prioridade?: number;
};

type Props = {
  agenteId: string;
  conhecimento: ConhecimentoEditavel;
  onClose: () => void;
  onSaved: (conhecimento: ConhecimentoEditavel) => void;
};

export default function ConhecimentoEditorModal({
  agenteId,
  conhecimento,
  onClose,
  onSaved,
}: Props) {
  const [titulo, setTitulo] = useState(conhecimento.titulo || "");
  const [categoria, setCategoria] = useState(conhecimento.categoria || "");
  const [conteudo, setConteudo] = useState(conhecimento.conteudo || "");
  const [palavrasChave, setPalavrasChave] = useState(
    (conhecimento.palavras_chave || []).join(", ")
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !salvando) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, salvando]);

  async function salvar() {
    if (!titulo.trim() || !conteudo.trim() || salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const response = await fetch(
        `/api/agentes-ia/conhecimentos/${encodeURIComponent(conhecimento.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agente_id: agenteId,
            titulo,
            categoria,
            conteudo,
            palavras_chave: palavrasChave,
            prioridade: conhecimento.prioridade ?? 0,
          }),
        }
      );
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Erro ao atualizar conhecimento.");
      }
      onSaved(json.conhecimento as ConhecimentoEditavel);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao atualizar conhecimento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !salvando) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="editar-conhecimento-title">
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerIcon}><BookOpen size={19} /></span>
            <div>
              <h2 id="editar-conhecimento-title">Editar conhecimento</h2>
              <p>Atualize o conteúdo que o agente pode consultar durante o atendimento.</p>
            </div>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} disabled={salvando} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Título</span>
              <input value={titulo} onChange={(event) => setTitulo(event.target.value)} placeholder="Ex.: Planos e preços" />
            </label>
            <label className={styles.field}>
              <span>Categoria</span>
              <input value={categoria} onChange={(event) => setCategoria(event.target.value)} placeholder="Ex.: Comercial" />
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Conteúdo · máximo 850 caracteres</span>
              <textarea
                rows={8}
                maxLength={850}
                value={conteudo}
                onChange={(event) => setConteudo(event.target.value)}
                placeholder="Conteúdo confiável que o agente pode usar"
              />
              <small className={styles.counter}>{conteudo.length}/850</small>
            </label>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Palavras-chave</span>
              <input
                value={palavrasChave}
                onChange={(event) => setPalavrasChave(event.target.value)}
                placeholder="Ex.: plano, preço, usuários"
              />
              <small className={styles.hint}>Separe por vírgulas. Elas ajudam a recuperar o conhecimento sem virar contexto fixo.</small>
            </label>
          </div>
        </div>

        {erro && <div className={styles.error}>{erro}</div>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={salvando}>Cancelar</button>
          <button
            type="button"
            className={styles.primary}
            onClick={salvar}
            disabled={salvando || !titulo.trim() || !conteudo.trim()}
          >
            {salvando ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}
