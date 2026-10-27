"use client";

import { FormEvent, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import styles from "./email-marketing.module.css";

export type EmailTemplateItem = {
  id: string;
  empresa_id: string | null;
  escopo: string;
  nome: string;
  assunto: string;
  html: string;
  texto: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const VARIAVEIS = [
  "{{nome_contato}}",
  "{{email}}",
  "{{telefone}}",
  "{{empresa}}",
  "{{origem}}",
  "{{campanha}}",
  "{{interesse}}",
];

const TEMPLATE_INICIAL =
  '<div style="font-family:Arial,sans-serif;color:#172033">' +
  '<h1 style="font-size:24px;margin:0 0 16px">Olá, {{nome_contato}}!</h1>' +
  '<p style="font-size:15px;line-height:1.65;margin:0 0 16px">' +
  "Escreva aqui a mensagem da sua campanha." +
  "</p>" +
  '<p style="font-size:15px;line-height:1.65;margin:0">' +
  "Atenciosamente,<br />Sua equipe" +
  "</p></div>";

type Props = {
  template?: EmailTemplateItem | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export default function TemplateModal({
  template,
  onClose,
  onSaved,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [nome, setNome] = useState(template?.nome || "");
  const [assunto, setAssunto] = useState(template?.assunto || "");
  const [html, setHtml] = useState(template?.html || TEMPLATE_INICIAL);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function inserirVariavel(variavel: string) {
    const textarea = textareaRef.current;

    if (!textarea) {
      setHtml((atual) => atual + variavel);
      return;
    }

    const inicio = textarea.selectionStart ?? html.length;
    const fim = textarea.selectionEnd ?? html.length;
    const novo = html.slice(0, inicio) + variavel + html.slice(fim);
    setHtml(novo);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        inicio + variavel.length,
        inicio + variavel.length
      );
    });
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();
    setErro("");

    if (!nome.trim() || !assunto.trim() || !html.trim()) {
      setErro("Preencha nome, assunto e conteúdo.");
      return;
    }

    setSalvando(true);

    try {
      const response = await fetch(
        template
          ? "/api/email-marketing/templates/" + template.id
          : "/api/email-marketing/templates",
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: nome.trim(),
            assunto: assunto.trim(),
            html,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível salvar o template.");
      }

      await onSaved();
      onClose();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o template."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function arquivar() {
    if (!template || !window.confirm("Arquivar este template?")) return;

    setSalvando(true);
    setErro("");

    try {
      const response = await fetch(
        "/api/email-marketing/templates/" + template.id,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível arquivar o template.");
      }

      await onSaved();
      onClose();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível arquivar o template."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div
        className={[styles.modalCard, styles.templateModal].join(" ")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p className={styles.sectionLabel}>TEMPLATE DE E-MAIL</p>
            <h2>{template ? "Editar template" : "Novo template"}</h2>
            <p>
              Monte o conteúdo reutilizável da campanha. O link de descadastro
              será incluído automaticamente no envio.
            </p>
          </div>

          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={salvar} className={styles.modalBody}>
          <div className={styles.formGridTwo}>
            <label className={styles.field}>
              <span>Nome do template</span>
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Convite para evento"
                maxLength={160}
              />
            </label>

            <label className={styles.field}>
              <span>Assunto padrão</span>
              <input
                value={assunto}
                onChange={(event) => setAssunto(event.target.value)}
                placeholder="Ex.: {{nome_contato}}, tenho um convite"
                maxLength={250}
              />
            </label>
          </div>

          <div className={styles.variablesBox}>
            <div>
              <strong>Variáveis do CRM</strong>
              <small>Clique para inserir no ponto atual do editor.</small>
            </div>
            <div className={styles.variableChips}>
              {VARIAVEIS.map((variavel) => (
                <button
                  key={variavel}
                  type="button"
                  onClick={() => inserirVariavel(variavel)}
                >
                  {variavel}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.editorGrid}>
            <label className={styles.field}>
              <span>Conteúdo HTML</span>
              <textarea
                ref={textareaRef}
                className={styles.htmlEditor}
                value={html}
                onChange={(event) => setHtml(event.target.value)}
                spellCheck={false}
              />
              <small>
                Scripts, formulários e atributos inseguros são removidos ao
                salvar.
              </small>
            </label>

            <div className={styles.previewPanel}>
              <span>Prévia</span>
              <iframe title="Prévia do template" sandbox="" srcDoc={html} />
            </div>
          </div>

          {erro ? <div className={styles.feedbackError}>{erro}</div> : null}

          <div className={styles.modalFooter}>
            {template ? (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={arquivar}
                disabled={salvando}
              >
                <Trash2 size={16} />
                Arquivar
              </button>
            ) : (
              <span />
            )}

            <div className={styles.modalFooterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={onClose}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={salvando}
              >
                <Check size={16} />
                {salvando ? "Salvando..." : "Salvar template"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
