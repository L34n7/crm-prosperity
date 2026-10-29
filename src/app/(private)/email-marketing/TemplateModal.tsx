"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { TEMPLATES_PADRAO_EMAIL } from "@/lib/email-marketing/templates-padrao";
import VariavelCombobox from "@/components/variaveis/VariavelCombobox";
import GerenciarVariaveisModal, {
  type VariavelPersonalizadaCompartilhada,
} from "@/components/variaveis/GerenciarVariaveisModal";
import {
  VARIAVEIS_FIXAS_SISTEMA,
  type VariavelCatalogo,
} from "@/lib/variaveis/catalogo";
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
  templates?: EmailTemplateItem[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export default function TemplateModal({
  template,
  templates = [],
  onClose,
  onSaved,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const assuntoRef = useRef<HTMLInputElement | null>(null);
  const [nome, setNome] = useState(template?.nome || "");
  const [assunto, setAssunto] = useState(template?.assunto || "");
  const [html, setHtml] = useState(template?.html || TEMPLATE_INICIAL);
  const [modeloPreview, setModeloPreview] = useState("personalizado");
  const [htmlAnterior, setHtmlAnterior] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [variavelSelecionada, setVariavelSelecionada] =
    useState("nome_contato");
  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizadaCompartilhada[]
  >([]);
  const [carregandoVariaveis, setCarregandoVariaveis] = useState(false);
  const [modalVariaveis, setModalVariaveis] = useState(false);

  const modeloSelecionado = useMemo(() => {
    if (modeloPreview === "personalizado") return null;
    if (modeloPreview.startsWith("padrao:")) {
      return TEMPLATES_PADRAO_EMAIL.find(
        (item) => item.id === modeloPreview.slice("padrao:".length)
      ) || null;
    }
    if (modeloPreview.startsWith("salvo:")) {
      return templates.find(
        (item) => item.id === modeloPreview.slice("salvo:".length)
      ) || null;
    }
    return null;
  }, [modeloPreview, templates]);

  const htmlNaPrevia = modeloSelecionado?.html ?? html;
  const assuntoNaPrevia = modeloSelecionado?.assunto ?? assunto;

  function aplicarModelo() {
    if (!modeloSelecionado) return;
    if (
      html !== modeloSelecionado.html &&
      html.trim() &&
      !window.confirm(
        "Usar o HTML deste modelo no editor? O seu HTML atual poderá ser restaurado antes de salvar."
      )
    ) return;
    setHtmlAnterior(html);
    setHtml(modeloSelecionado.html);
    // Mantém assuntos existentes; sugere o assunto do modelo apenas em novos templates vazios.
    if (!assunto.trim()) setAssunto(modeloSelecionado.assunto);
    setModeloPreview("personalizado");
  }

  function restaurarHtml() {
    if (htmlAnterior === null) return;
    setHtml(htmlAnterior);
    setHtmlAnterior(null);
    setModeloPreview("personalizado");
  }

  const opcoesVariaveis = useMemo<VariavelCatalogo[]>(() => {
    const personalizadas = variaveisPersonalizadas.map((item) => ({
      chave: item.chave,
      exemplo: "{{" + item.chave + "}}",
      descricao: item.descricao || "Variável personalizada da empresa.",
      categoria: "Personalizada" as const,
    }));

    return [...VARIAVEIS_FIXAS_SISTEMA, ...personalizadas].sort((a, b) => {
      if (a.categoria !== b.categoria) {
        return a.categoria === "Fixa" ? -1 : 1;
      }
      return a.chave.localeCompare(b.chave, "pt-BR");
    });
  }, [variaveisPersonalizadas]);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setCarregandoVariaveis(true);

      try {
        const response = await fetch("/api/variaveis", { cache: "no-store" });
        const data = await response.json();

        if (!ativo) return;

        if (response.ok && data?.ok) {
          setVariaveisPersonalizadas(
            Array.isArray(data.variaveis) ? data.variaveis : []
          );
        }
      } finally {
        if (ativo) setCarregandoVariaveis(false);
      }
    }

    void carregar();

    return () => {
      ativo = false;
    };
  }, []);

  function inserirNoConteudo(chave = variavelSelecionada) {
    setModeloPreview("personalizado");
    setHtmlAnterior(null);
    const marcador = "{{" + chave + "}}";
    const textarea = textareaRef.current;

    if (!textarea) {
      setHtml((atual) => atual + marcador);
      return;
    }

    const inicio = textarea.selectionStart ?? html.length;
    const fim = textarea.selectionEnd ?? html.length;
    const novo = html.slice(0, inicio) + marcador + html.slice(fim);
    setHtml(novo);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        inicio + marcador.length,
        inicio + marcador.length
      );
    });
  }

  function inserirNoAssunto(chave = variavelSelecionada) {
    setModeloPreview("personalizado");
    const marcador = "{{" + chave + "}}";
    const input = assuntoRef.current;
    const inicio = input?.selectionStart ?? assunto.length;
    const fim = input?.selectionEnd ?? assunto.length;
    setAssunto(
      assunto.slice(0, inicio) + marcador + assunto.slice(fim)
    );

    requestAnimationFrame(() => {
      assuntoRef.current?.focus();
      assuntoRef.current?.setSelectionRange(
        inicio + marcador.length,
        inicio + marcador.length
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
    <>
      <div className={styles.modalOverlay} onMouseDown={salvando ? undefined : onClose}>
        <div
          className={[styles.modalCard, styles.templateModal, styles.templatePremiumModal].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label={template ? "Editar template de e-mail" : "Criar template de e-mail"}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className={[styles.modalHeader, styles.templatePremiumHeader].join(" ")}>
            <div className={styles.templatePremiumHeading}>
              <span>TEMPLATE DE E-MAIL</span>
              <h2>{template ? "Editar template" : "Criar template"}</h2>
            </div>
            <button type="button" className={styles.iconButton} onClick={onClose}
              aria-label="Fechar" disabled={salvando}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={salvar} className={styles.templatePremiumForm}>
            <div className={styles.templateEditorLayout}>
              <section className={styles.templateEditorColumn} aria-label="Dados e HTML do template">
                <div className={styles.templateEditorFields}>
                  <label className={styles.field}>
                    <span>Nome do template</span>
                    <input
                      value={nome}
                      onChange={(event) => setNome(event.target.value)}
                      placeholder="Ex.: Convite para evento"
                      maxLength={160}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Assunto padrão</span>
                    <input
                      ref={assuntoRef}
                      value={assunto}
                      onChange={(event) => {
                        setAssunto(event.target.value);
                        setModeloPreview("personalizado");
                      }}
                      placeholder="Ex.: {{nome_contato}}, tenho um convite"
                      maxLength={250}
                      required
                    />
                  </label>
                </div>

                <div className={styles.templatePremiumVariableToolbar}>
                  <div className={styles.templatePremiumVariableHead}>
                    <strong>Variáveis do CRM</strong>
                    <button type="button" className={styles.templatePremiumTextButton}
                      onClick={() => setModalVariaveis(true)}>
                      <Settings2 size={15} /> Gerenciar variáveis
                    </button>
                  </div>
                  <VariavelCombobox
                    label="Inserir variável"
                    value={variavelSelecionada}
                    onChange={setVariavelSelecionada}
                    opcoes={opcoesVariaveis}
                    carregando={carregandoVariaveis}
                  />
                  <div className={styles.templatePremiumVariableButtons}>
                    <button type="button" className={styles.secondaryButton} onClick={() => inserirNoAssunto()}>
                      Inserir no assunto
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => inserirNoConteudo()}>
                      Inserir no conteúdo
                    </button>
                  </div>
                </div>

                <div className={styles.templatePremiumHtmlSection}>
                  <div className={styles.templatePremiumHtmlHead}>
                    <strong>Conteúdo HTML personalizado</strong>
                    {htmlAnterior !== null ? (
                      <button type="button" className={styles.templatePremiumTextButton}
                        onClick={restaurarHtml} title="Recuperar HTML anterior à aplicação do modelo">
                        <RotateCcw size={15} /> Desfazer aplicação
                      </button>
                    ) : null}
                  </div>
                  <textarea
                    ref={textareaRef}
                    className={styles.htmlEditor}
                    value={html}
                    onChange={(event) => {
                      setHtml(event.target.value);
                      setHtmlAnterior(null);
                      setModeloPreview("personalizado");
                    }}
                    spellCheck={false}
                    aria-label="Conteúdo HTML personalizado"
                    required
                  />
                  <small>
                    O HTML digitado não muda ao visualizar outros modelos. Scripts e atributos inseguros são removidos ao salvar.
                  </small>
                </div>
              </section>

              <section className={styles.templateLivePreview} aria-label="Prévia do template">
                <div className={styles.templateLivePreviewTop}>
                  <div>
                    <span>PRÉVIA DO TEMPLATE</span>
                    <strong>Visualize antes de aplicar</strong>
                  </div>
                  <span className={styles.templatePreviewLiveBadge}>
                    <Eye size={15} /> Prévia
                  </span>
                </div>

                <div className={styles.templatePresetControl}>
                  <label htmlFor="modelo-template-email">Modelo para visualizar</label>
                  <select
                    id="modelo-template-email"
                    value={modeloPreview}
                    onChange={(event) => setModeloPreview(event.target.value)}
                    disabled={salvando}
                  >
                    <option value="personalizado">Personalizado atual</option>
                    <optgroup label="5 modelos padrão">
                      {TEMPLATES_PADRAO_EMAIL.map((modelo) => (
                        <option key={modelo.id} value={"padrao:" + modelo.id}>{modelo.nome}</option>
                      ))}
                    </optgroup>
                    {templates.length > 0 ? (
                      <optgroup label="Templates já criados">
                        {templates.map((item) => (
                          <option key={item.id} value={"salvo:" + item.id}>{item.nome}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  {modeloSelecionado ? (
                    <div className={styles.templatePresetBanner}>
                      <span>
                        <strong>{modeloSelecionado.nome}</strong>
                        <small>{"descricao" in modeloSelecionado ? modeloSelecionado.descricao : "Template salvo na sua empresa"}</small>
                      </span>
                      <button type="button" className={styles.primaryButton}
                        onClick={aplicarModelo} disabled={salvando}>
                        <Check size={15} /> Usar este HTML
                      </button>
                    </div>
                  ) : (
                    <p className={styles.templatePresetHint}>
                      Prévia sincronizada com seu HTML. Escolher outro modelo não altera o texto que você está editando.
                    </p>
                  )}
                </div>

                <div className={styles.templateLivePreviewSubject} title={assuntoNaPrevia}>
                  <span>Assunto:</span>
                  <strong>{assuntoNaPrevia || "Defina o assunto do e-mail"}</strong>
                </div>
                <div className={styles.templateLivePreviewFrame}>
                  <iframe title="Prévia do HTML selecionado" sandbox="" srcDoc={htmlNaPrevia} />
                </div>
                <div className={styles.templateLivePreviewCaption}>
                  A prévia possui rolagem própria para e-mails longos.
                </div>
              </section>
            </div>

            {erro ? <div className={styles.templatePremiumError} role="alert">{erro}</div> : null}

            <div className={styles.templatePremiumFooter}>
              {template ? (
                <button type="button" className={styles.dangerButton} onClick={arquivar} disabled={salvando}>
                  <Trash2 size={16} /> Arquivar
                </button>
              ) : <span />}

              <div className={styles.modalFooterActions}>
                <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={salvando}>
                  Cancelar
                </button>
                <button type="submit" className={styles.primaryButton} disabled={salvando}>
                  <Check size={16} /> {salvando ? "Salvando..." : "Salvar template"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <GerenciarVariaveisModal
        aberto={modalVariaveis}
        onClose={() => setModalVariaveis(false)}
        onUsar={(chave) => {
          setVariavelSelecionada(chave);
          inserirNoConteudo(chave);
          setModalVariaveis(false);
        }}
        onAtualizadas={setVariaveisPersonalizadas}
      />
    </>
  );
}
