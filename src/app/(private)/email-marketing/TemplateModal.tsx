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
import EmailHtmlPreviewEditor, { type EmailHtmlPreviewHandle } from "./EmailHtmlPreviewEditor";
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
  const htmlPreviewRef = useRef<EmailHtmlPreviewHandle>(null);
  const [nome, setNome] = useState(template?.nome || "");
  const [assunto, setAssunto] = useState(template?.assunto || "");
  const [html, setHtml] = useState(() =>
    formatarHtmlParaEdicao(template?.html || TEMPLATE_INICIAL)
  );
  const [modoEditor, setModoEditor] = useState<"visual" | "html-preview" | "html">(
    template && !normalizarDocumentoEmail(template.design_json) ? "html-preview" : "visual"
  );
  const [documento, setDocumento] = useState<DocumentoEmail>(() =>
    normalizarDocumentoEmail(template?.design_json) || novoDocumentoEmail()
  );
  const modelosVisuais = useMemo(() => modelosVisuaisEmail(), []);
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

  function trocarModo(destino: "visual" | "html-preview" | "html") {
    if (destino === modoEditor) return;
    if (destino === "visual" && modoEditor !== "visual" &&
      !window.confirm("O layout HTML não pode ser convertido em blocos automaticamente. Abrir o último projeto em blocos? Alterações feitas no HTML não serão transferidas.")) return;
    if (modoEditor === "visual" && destino !== "visual") {
      if (!window.confirm("Ao editar o HTML, a versão passará a ser gerenciada como HTML. O layout em blocos continuará separado. Continuar?")) return;
      setHtml(formatarHtmlParaEdicao(gerarHtmlEmailVisual(documento)));
    } else if (modoEditor === "html-preview") {
      setHtml(htmlPreviewRef.current?.obterHtml() || html);
    }
    setModoEditor(destino);
    setGaleriaAberta(false);
  }

  function aplicarModelo(tipo: "visual" | "padrao" | "salvo", id: string) {
    if (template && !window.confirm("Substituir o conteúdo atual pelo modelo selecionado?")) return;
    setHtmlAnterior(modoEditor === "html-preview" ? (htmlPreviewRef.current?.obterHtml() || html) : html);
    if (tipo === "visual") {
      const modelo = modelosVisuais.find(item => item.id === id);
      if (!modelo) return;
      const copia = structuredClone(modelo.documento);
      copia.blocos = copia.blocos.map(bloco => ({ ...bloco, id: crypto.randomUUID() }));
      setDocumento(copia);
      setAssunto(modelo.assunto);
      setModoEditor("visual");
    } else {
      const modelo = tipo === "padrao"
        ? TEMPLATES_PADRAO_EMAIL.find(item => item.id === id)
        : templates.find(item => item.id === id);
      if (!modelo) return;
      const visual = "design_json" in modelo ? normalizarDocumentoEmail(modelo.design_json) : null;
      if (visual) {
        setDocumento({ ...visual, blocos: visual.blocos.map(bloco => ({ ...bloco, id: crypto.randomUUID() })) });
        setModoEditor("visual");
      } else {
        setHtml(formatarHtmlParaEdicao(modelo.html));
        setModoEditor("html-preview");
      }
      setAssunto(modelo.assunto);
    }
    setGaleriaAberta(false);
    setErro("");
  }

  function organizarHtml() {
    setHtml((atual) => formatarHtmlParaEdicao(atual));
  }

  function restaurarHtml() {
    if (htmlAnterior === null) return;
    setHtml(htmlAnterior);
    setHtmlAnterior(null);
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

    const conteudoHtml = modoEditor === "visual" ? gerarHtmlEmailVisual(documento) :
      modoEditor === "html-preview" ? (htmlPreviewRef.current?.obterHtml() || html) : html;
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
              <div className={styles.templateStudioSwitch} role="group" aria-label="Modo de criação do e-mail">
                <button type="button" className={modoEditor === "visual" ? styles.templateStudioActive : ""} onClick={() => trocarModo("visual")}>Blocos visuais</button>
                <button type="button" className={modoEditor === "html-preview" ? styles.templateStudioActive : ""} onClick={() => trocarModo("html-preview")}>Editar na prévia</button>
                <button type="button" className={modoEditor === "html" ? styles.templateStudioActive : ""} onClick={() => trocarModo("html")}>Código HTML</button>
              </div>
              <button type="button" className={styles.templateStudioGalleryButton} onClick={() => setGaleriaAberta(atual => !atual)}><LayoutTemplate size={16}/> {galeriaAberta ? "Fechar galeria" : "Escolher modelo na galeria"}</button>
              <span className={styles.templateStudioHint}>Personalize seu e-mail no próprio conteúdo</span>
            </div>
            {galeriaAberta ? <div className={styles.templateStudioGallery} aria-label="Galeria de modelos de e-mail">
              {modelosVisuais.map(item => <button type="button" key={item.id} onClick={() => aplicarModelo("visual", item.id)} className={styles.templateStudioGalleryCard}>
                <span className={styles.templateStudioGalleryMock}><iframe tabIndex={-1} title={"Prévia " + item.nome} sandbox="" srcDoc={gerarHtmlEmailVisual(item.documento)} /></span>
                <strong>{item.nome}</strong><small>{item.categoria} · {item.descricao}</small><em>Blocos editáveis</em>
              </button>)}
              {TEMPLATES_PADRAO_EMAIL.map(item => <button type="button" key={item.id} onClick={() => aplicarModelo("padrao", item.id)} className={styles.templateStudioGalleryCard}>
                <span className={styles.templateStudioGalleryMock}><iframe tabIndex={-1} title={"Prévia " + item.nome} sandbox="" srcDoc={item.html} /></span>
                <strong>{item.nome}</strong><small>{item.descricao}</small><em>Editar textos na prévia</em>
              </button>)}
              {templates.filter(item => item.status !== "arquivado").map(item => <button type="button" key={item.id} onClick={() => aplicarModelo("salvo", item.id)} className={styles.templateStudioGalleryCard}>
                <span className={styles.templateStudioGalleryMock}><iframe tabIndex={-1} title={"Prévia " + item.nome} sandbox="" srcDoc={item.html} /></span>
                <strong>{item.nome}</strong><small>Modelo salvo · {item.escopo === "sistema" ? "Sistema" : "Minha empresa"}</small><em>{normalizarDocumentoEmail(item.design_json) ? "Blocos editáveis" : "Editar textos na prévia"}</em>
              </button>)}
            </div> : null}
            {modoEditor === "visual" ? (
              <div className={styles.templateVisualLayout}>
                <div className={styles.templateVisualMeta}>
                  <label className={styles.field}><span>Nome do template</span><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Campanha de lançamento" maxLength={160} required /></label>
                  <label className={styles.field}><span>Assunto padrão</span><input ref={assuntoRef} value={assunto} onChange={e => setAssunto(e.target.value)} placeholder="Ex.: Uma novidade para {{nome_contato}}" maxLength={250} required /></label>
                  <button type="button" className={styles.templatePremiumTextButton} onClick={() => setModalVariaveis(true)}><Settings2 size={15}/> Variáveis do CRM</button>
                </div>
                <EmailVisualDesigner key={template?.id || "novo"} documento={documento} onChange={setDocumento} variaveis={opcoesVariaveis} variavelSelecionada={variavelSelecionada} onVariavelSelecionada={setVariavelSelecionada} onGerenciarVariaveis={() => setModalVariaveis(true)}/>

              </div>
            ) : modoEditor === "html-preview" ? (
              <div className={styles.templateVisualLayout}>
                <div className={styles.templateVisualMeta}>
                  <label className={styles.field}><span>Nome do template</span><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Lançamento especial" maxLength={160} required /></label>
                  <label className={styles.field}><span>Assunto padrão</span><input ref={assuntoRef} value={assunto} onChange={e => setAssunto(e.target.value)} maxLength={250} required /></label>
                  <button type="button" className={styles.templatePremiumTextButton} onClick={() => setModalVariaveis(true)}><Settings2 size={15}/> Variáveis do CRM</button>
                </div>
                <EmailHtmlPreviewEditor key={template?.id || "novo"} ref={htmlPreviewRef} html={html} />
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
                  <iframe title="Prévia do HTML selecionado" sandbox="" srcDoc={html} />
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
