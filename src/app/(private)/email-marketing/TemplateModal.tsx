"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Code2, LayoutTemplate, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";
import { TEMPLATES_PADRAO_EMAIL } from "@/lib/email-marketing/templates-padrao";
import { formatarHtmlParaEdicao } from "@/lib/email-marketing/formatar-html";
import VariavelCombobox from "@/components/variaveis/VariavelCombobox";
import GerenciarVariaveisModal, {
  type VariavelPersonalizadaCompartilhada,
} from "@/components/variaveis/GerenciarVariaveisModal";
import {
  VARIAVEIS_FIXAS_SISTEMA,
  type VariavelCatalogo,
} from "@/lib/variaveis/catalogo";
import styles from "./email-marketing.module.css";
import EmailVisualDesigner from "./EmailVisualDesigner";
import {
  gerarHtmlEmailVisual, modelosVisuaisEmail, normalizarDocumentoEmail,
  novoDocumentoEmail, type DocumentoEmail,
} from "@/lib/email-marketing/editor-visual";

export type EmailTemplateItem = {
  id: string;
  empresa_id: string | null;
  escopo: string;
  nome: string;
  assunto: string;
  html: string;
  texto: string | null;
  design_json?: DocumentoEmail | null;
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
  const [html, setHtml] = useState(() =>
    formatarHtmlParaEdicao(template?.html || TEMPLATE_INICIAL)
  );
  const [modoEditor, setModoEditor] = useState<"visual" | "html">(
    template && !normalizarDocumentoEmail(template.design_json) ? "html" : "visual"
  );
  const [documento, setDocumento] = useState<DocumentoEmail>(() =>
    normalizarDocumentoEmail(template?.design_json) || novoDocumentoEmail()
  );
  const modelosVisuais = useMemo(() => modelosVisuaisEmail(), []);
  const [modeloPreview, setModeloPreview] = useState("personalizado");
  const [galeriaAberta, setGaleriaAberta] = useState(false);
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

  const modeloVisualSelecionado = modelosVisuais.find(
    (item) => modeloPreview === "visual:" + item.id
  );
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

  const htmlNaPrevia = modeloSelecionado?.html ??
    (modeloVisualSelecionado ? gerarHtmlEmailVisual(modeloVisualSelecionado.documento) :
    modoEditor === "visual" ? gerarHtmlEmailVisual(documento) : html);

  function aplicarModelo() {
    if (modeloVisualSelecionado) {
      const copia = JSON.parse(JSON.stringify(modeloVisualSelecionado.documento)) as DocumentoEmail;
      copia.blocos = copia.blocos.map((bloco) => ({ ...bloco, id: crypto.randomUUID() }));
      setDocumento(copia);
      setModoEditor("visual");
      setAssunto(modeloVisualSelecionado.assunto);
      setModeloPreview("personalizado");
      return;
    }
    if (!modeloSelecionado) return;
    const salvo = "design_json" in modeloSelecionado ? modeloSelecionado as EmailTemplateItem : null;
    const visual = normalizarDocumentoEmail(salvo?.design_json);
    if (visual) {
      setDocumento({ ...visual, blocos: visual.blocos.map(b => ({ ...b })) });
      setModoEditor("visual");
    } else {
      setHtmlAnterior(html);
      setHtml(formatarHtmlParaEdicao(modeloSelecionado.html));
      setModoEditor("html");
    }
    setAssunto(modeloSelecionado.assunto);
    setModeloPreview("personalizado");
  }

  function organizarHtml() {
    setHtml((atual) => formatarHtmlParaEdicao(atual));
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

    const conteudoHtml = modoEditor === "visual" ? gerarHtmlEmailVisual(documento) : html;
    if (!nome.trim() || !assunto.trim() || !conteudoHtml.trim()) {
      setErro("Preencha nome, assunto e conteúdo.");
      return;
    }
    if (modoEditor === "visual" && documento.blocos.some(b =>
      (b.tipo === "imagem" && (!b.imagem || !/^https?:\/\//i.test(b.imagem))) ||
      (b.tipo === "botao" && (!b.url || !/^(https?:\/\/|mailto:)/i.test(b.url)))
    )) {
      setErro("Confira os links dos botões e as URLs das imagens antes de salvar.");
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
            html: conteudoHtml,
            design_json: modoEditor === "visual" ? documento : null,
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
            <div className={styles.templateStudioBar}>
              <div className={styles.templateStudioSwitch} role="group" aria-label="Tipo de editor">
                <button type="button" className={modoEditor === "visual" ? styles.templateStudioActive : ""} onClick={() => { if (modoEditor === "html" && !window.confirm("O HTML existente não pode ser convertido automaticamente em blocos. Iniciar um modelo visual separado?")) return; setModoEditor("visual"); setModeloPreview("personalizado"); }}>Editor visual</button>
                <button type="button" className={modoEditor === "html" ? styles.templateStudioActive : ""} onClick={() => { if (modoEditor === "html") return; setModoEditor("html"); setModeloPreview("personalizado"); setHtml(formatarHtmlParaEdicao(gerarHtmlEmailVisual(documento))); }}>Código HTML</button>
              </div>
              <label className={styles.templateStudioSelector} htmlFor="modelo-template-email">Biblioteca de modelos
                <select id="modelo-template-email" value={modeloPreview} onChange={(event) => setModeloPreview(event.target.value)}>
                  <option value="personalizado">Seu template atual</option>
                  <optgroup label="Modelos visuais editáveis">{modelosVisuais.map(modelo => <option key={modelo.id} value={"visual:" + modelo.id}>{modelo.nome} · {modelo.categoria}</option>)}</optgroup>
                  <optgroup label="Modelos HTML prontos">{TEMPLATES_PADRAO_EMAIL.map(modelo => <option key={modelo.id} value={"padrao:" + modelo.id}>{modelo.nome}</option>)}</optgroup>
                  {templates.length ? <optgroup label="Templates salvos">{templates.map(item => <option key={item.id} value={"salvo:" + item.id}>{item.nome}</option>)}</optgroup> : null}
                </select>
              </label>
              <button type="button" className={styles.templateStudioGalleryButton} onClick={() => setGaleriaAberta(atual => !atual)}><LayoutTemplate size={16}/> {galeriaAberta ? "Fechar galeria" : "Galeria"}</button>
              {(modeloSelecionado || modeloVisualSelecionado) ? <button type="button" className={styles.templateStudioApply} onClick={aplicarModelo}><Check size={15} /> Aplicar modelo</button> : <span className={styles.templateStudioHint}>Prévia e edição em tempo real</span>}
            </div>
            {galeriaAberta ? <div className={styles.templateStudioGallery} aria-label="Modelos prontos de e-mail">
              {modelosVisuais.map(item => <button type="button" key={item.id} onClick={() => { setModeloPreview("visual:" + item.id); setGaleriaAberta(false); }} className={styles.templateStudioGalleryCard}>
                <span className={styles.templateStudioGalleryMock}><i/><i/><i/><i/></span>
                <strong>{item.nome}</strong><small>{item.categoria} · {item.descricao}</small><em>Visual editável</em>
              </button>)}
              {TEMPLATES_PADRAO_EMAIL.map(item => <button type="button" key={item.id} onClick={() => { setModeloPreview("padrao:" + item.id); setGaleriaAberta(false); }} className={styles.templateStudioGalleryCard}>
                <span className={styles.templateStudioGalleryMock}><i/><i/><i/><i/></span>
                <strong>{item.nome}</strong><small>{item.descricao}</small><em>HTML personalizado</em>
              </button>)}
            </div> : null}
            {modoEditor === "visual" ? (
              <div className={styles.templateVisualLayout}>
                <div className={styles.templateVisualMeta}>
                  <label className={styles.field}><span>Nome do template</span><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Campanha de lançamento" maxLength={160} required /></label>
                  <label className={styles.field}><span>Assunto padrão</span><input ref={assuntoRef} value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Ex.: Uma novidade para {{nome_contato}}" maxLength={250} required /></label>
                  <button type="button" className={styles.templatePremiumTextButton} onClick={() => setModalVariaveis(true)}><Settings2 size={15}/> Variáveis do CRM</button>
                </div>
                {modeloPreview !== "personalizado" ? (
                  <div className={styles.templateModeloPrevia}>
                    <span>Visualização do modelo selecionado</span>
                    <iframe title="Visualização do modelo antes de aplicar" sandbox="" srcDoc={htmlNaPrevia}/>
                  </div>
                ) : <EmailVisualDesigner key={template?.id || "novo"} documento={documento} onChange={setDocumento} variaveis={opcoesVariaveis} variavelSelecionada={variavelSelecionada} onVariavelSelecionada={setVariavelSelecionada} onGerenciarVariaveis={() => setModalVariaveis(true)}/>}
              </div>
            ) : <div className={styles.templateEditorLayout}>
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
                  <div className={styles.templateVariableCompactRow}>
                    <div className={styles.templateVariableSelect}>
                      <VariavelCombobox
                        value={variavelSelecionada}
                        onChange={setVariavelSelecionada}
                        opcoes={opcoesVariaveis}
                        carregando={carregandoVariaveis}
                      />
                    </div>
                    <div className={styles.templatePremiumVariableButtons}>
                      <button type="button" className={styles.secondaryButton}
                        title="Inserir variável no assunto" onClick={() => inserirNoAssunto()}>
                        <Plus size={14} /> Assunto
                      </button>
                      <button type="button" className={styles.secondaryButton}
                        title="Inserir variável no HTML" onClick={() => inserirNoConteudo()}>
                        <Plus size={14} /> HTML
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.templatePremiumHtmlSection}>
                  <div className={styles.templatePremiumHtmlHead}>
                    <strong>Conteúdo HTML personalizado</strong>
                    <div className={styles.templateHtmlActions}>
                      <button type="button" className={styles.templatePremiumTextButton}
                        onClick={organizarHtml} title="Organizar linhas e indentação do HTML">
                        <Code2 size={15} /> Organizar HTML
                      </button>
                      {htmlAnterior !== null ? (
                        <button type="button" className={styles.templatePremiumTextButton}
                          onClick={restaurarHtml} title="Recuperar HTML anterior à aplicação do modelo">
                          <RotateCcw size={15} /> Desfazer aplicação
                        </button>
                      ) : null}
                    </div>
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
                    HTML organizado em linhas e blocos. Visualizar outro modelo não altera seu código; scripts e atributos inseguros são removidos ao salvar.
                  </small>
                </div>
              </section>

              <section className={styles.templateLivePreview} aria-label="Prévia do template">
                <div className={styles.templateLivePreviewFrame}>
                  <iframe title="Prévia do HTML selecionado" sandbox="" srcDoc={htmlNaPrevia} />
                </div>
              </section>
            </div>}

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
          if (modoEditor === "html") inserirNoConteudo(chave);
          setModalVariaveis(false);
        }}
        onAtualizadas={setVariaveisPersonalizadas}
      />
    </>
  );
}
