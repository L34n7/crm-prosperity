"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, CheckCircle2, X, Columns2, Copy, Eye, GripVertical, Heading1, Image as ImageIcon, Layers, Link2, Minus, Monitor, MoveVertical, Pencil, Plus, Redo2, Settings2, Smartphone, Trash2, Type, Undo2,
} from "lucide-react";
import { urlEmailSegura, type TipoBlocoEmail } from "@/lib/email-marketing/editor-visual";
import type { VariavelCatalogo } from "@/lib/variaveis/catalogo";
import styles from "./EmailHtmlPreviewEditor.module.css";

export type EmailHtmlPreviewHandle = { obterHtml: () => string; inserirBloco: (tipo: TipoBlocoEmail) => void };

type EstiloCampo = "color" | "backgroundColor" | "fontSize" | "fontFamily" | "padding" | "textAlign" | "borderRadius";
const FONTES_EMAIL = ["Arial", "Georgia", "Verdana", "Tahoma", "Trebuchet MS"] as const;
type FonteEmail = typeof FONTES_EMAIL[number];
function detectarFonte(valor: string): FonteEmail {
  return FONTES_EMAIL.find(fonte => valor.toLowerCase().includes(fonte.toLowerCase())) || "Arial";
}
type PropriedadesPagina = { largura: number; fundo: string; superficie: string; fonte: FonteEmail };
type Selecionado = {
  tag: string;
  tipo: "imagem" | "link" | "elemento";
  cor: string;
  fundo: string;
  tamanho: string;
  fonte: FonteEmail;
  espaco: string;
  raio: string;
  alinhamento: string;
  url: string;
  alt: string;
};

type Props = { html: string; variaveis?: VariavelCatalogo[]; onGerenciarVariaveis?: () => void };

function EmailHtmlPreviewEditor({ html, variaveis = [], onGerenciarVariaveis }: Props, ref: Ref<EmailHtmlPreviewHandle>) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const elementoRef = useRef<HTMLElement | null>(null);
  const editandoRef = useRef(true);
  const arrasteElementoRef = useRef<HTMLElement | null>(null);
  const alcaRef = useRef<HTMLButtonElement | null>(null);
  const [dispositivo, setDispositivo] = useState<"desktop" | "mobile">("desktop");
  const [editando, setEditando] = useState(true);
  const [selecionado, setSelecionado] = useState<Selecionado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [variavel, setVariavel] = useState("nome_contato");
  const [historico, setHistorico] = useState<string[]>([]);
  const [futuro, setFuturo] = useState<string[]>([]);
  const [abaPropriedades, setAbaPropriedades] = useState<"elemento" | "pagina">("elemento");
  const [pagina, setPagina] = useState<PropriedadesPagina>({ largura: 600, fundo: "#edf1f8", superficie: "#ffffff", fonte: "Arial" });
  const [larguraDigitada, setLarguraDigitada] = useState("600");

  useEffect(() => {
    if (!mensagem) return;
    const timeout = window.setTimeout(() => setMensagem(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [mensagem]);


  const obterHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.documentElement) return html;
    const copia = doc.documentElement.cloneNode(true) as HTMLElement;
    copia.querySelectorAll("[data-prosperity-drag-handle]").forEach(elemento => elemento.remove());
    copia.querySelectorAll("[data-prosperity-drop-target]").forEach(elemento => elemento.removeAttribute("data-prosperity-drop-target"));
    copia.querySelector("body")?.removeAttribute("data-prosperity-mode");
    copia.querySelectorAll("[data-prosperity-edit-text]").forEach(elemento => {
      elemento.replaceWith(copia.ownerDocument.createTextNode(elemento.textContent || ""));
    });
    copia.querySelectorAll("a[data-prosperity-href]").forEach(elemento => {
      const destino = elemento.getAttribute("data-prosperity-href");
      if (destino) elemento.setAttribute("href", destino);
      const alvo = elemento.getAttribute("data-prosperity-target");
      if (alvo) elemento.setAttribute("target", alvo);
      elemento.removeAttribute("data-prosperity-href");
      elemento.removeAttribute("data-prosperity-target");
    });
    copia.querySelectorAll("[data-prosperity-selected]").forEach(elemento => elemento.removeAttribute("data-prosperity-selected"));
    copia.querySelectorAll("style[data-prosperity-editor-style]").forEach(elemento => elemento.remove());
    return "<!DOCTYPE html>" + copia.outerHTML;
  }, [html]);

  function registrarHistorico() {
    setHistorico(atual => [...atual.slice(-29), obterHtml()]);
    setFuturo([]);
  }

  function navegarHistorico(direcao: "desfazer" | "refazer") {
    const origem = direcao === "desfazer" ? historico : futuro;
    if (!origem.length) return;
    const alvo = origem[origem.length - 1];
    if (direcao === "desfazer") {
      setHistorico(atual => atual.slice(0, -1));
      setFuturo(atual => [...atual, obterHtml()]);
    } else {
      setFuturo(atual => atual.slice(0, -1));
      setHistorico(atual => [...atual, obterHtml()]);
    }
    const iframe = iframeRef.current;
    if (iframe) iframe.srcdoc = alvo;
  }

  const opcoes = [
    { tipo: "titulo", nome: "Título", Icone: Heading1 },
    { tipo: "texto", nome: "Texto", Icone: Type },
    { tipo: "imagem", nome: "Imagem", Icone: ImageIcon },
    { tipo: "botao", nome: "Botão", Icone: Link2 },
    { tipo: "colunas", nome: "2 colunas", Icone: Columns2 },
    { tipo: "divisor", nome: "Divisor", Icone: Minus },
    { tipo: "espaco", nome: "Espaço", Icone: MoveVertical },
  ] as const;

  function inserirBloco(tipo: TipoBlocoEmail, referencia?: Element | null) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const conteudos: Record<TipoBlocoEmail, string> = {
      titulo: '<h2 style="margin:0;color:#17243d;font:800 30px/1.25 Arial,sans-serif">Seu título</h2>',
      texto: '<p style="margin:0;color:#17243d;font:16px/1.65 Arial,sans-serif">Escreva sua mensagem aqui.</p>',
      imagem: '<img alt="Clique para configurar a imagem" style="display:block;width:100%;max-width:560px;min-height:56px;border-radius:12px" />',
      botao: '<a data-prosperity-href="https://crmprosperity.com" style="display:inline-block;background:#6246ea;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:10px;font:700 15px Arial,sans-serif">Saiba mais</a>',
      colunas: '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" style="padding:14px;color:#17243d;background:#f3f4fa;font:15px/1.5 Arial,sans-serif">Primeira coluna</td><td width="50%" style="padding:14px;color:#17243d;background:#f3f4fa;font:15px/1.5 Arial,sans-serif">Segunda coluna</td></tr></table>',
      divisor: '<div style="border-top:1px solid #dce2ec;height:1px"></div>',
      espaco: '<div style="height:32px;font-size:0;line-height:32px">&nbsp;</div>',
    };
    registrarHistorico();
    const referenciaAtual = referencia || elementoRef.current;
    const linha = referenciaAtual?.closest("tr");
    const tabelaPrincipal = doc.querySelector<HTMLTableElement>('table[width="600"],table[style*="max-width:600px"]');
    let novo: HTMLElement;
    if (linha?.parentElement && ["TBODY","THEAD","TFOOT","TABLE"].includes(linha.parentElement.tagName)) {
      novo = doc.createElement("tr");
      novo.innerHTML = '<td style="padding:12px 24px">' + conteudos[tipo] + "</td>";
      linha.after(novo);
    } else if (tabelaPrincipal) {
      novo = doc.createElement("tr");
      novo.innerHTML = '<td style="padding:12px 24px">' + conteudos[tipo] + "</td>";
      (tabelaPrincipal.tBodies[0] || tabelaPrincipal).appendChild(novo);
    } else {
      novo = doc.createElement("div");
      novo.style.padding = "12px 0";
      novo.innerHTML = conteudos[tipo];
      doc.body.appendChild(novo);
    }
    // Os novos elementos passam pelo mesmo preparo seguro dos modelos originais.
    prepararElemento(novo);
    selecionar((novo.querySelector("a,img,h2,p,td,div") || novo) as HTMLElement);

    setMensagem("Bloco inserido. Selecione seu conteúdo para personalizar.");
  }

  useImperativeHandle(ref, () => ({ obterHtml, inserirBloco }), [obterHtml]);


  function tabelaPrincipal(doc: Document): HTMLTableElement | null {
    return doc.querySelector<HTMLTableElement>('table[width="600"], table[style*="max-width"], table[width]:not([width="100%"])');
  }

  function carregarPagina(doc: Document) {
    const tabela = tabelaPrincipal(doc);
    const estiloTabela = tabela ? doc.defaultView?.getComputedStyle(tabela) : undefined;
    const estiloBody = doc.defaultView?.getComputedStyle(doc.body);
    const largura = Number.parseInt(tabela?.style.maxWidth || tabela?.getAttribute("width") || "600", 10);
    setLarguraDigitada(String(Number.isFinite(largura) ? Math.max(420, Math.min(700, largura)) : 600));
    setPagina({
      largura: Number.isFinite(largura) ? Math.max(420, Math.min(700, largura)) : 600,
      fundo: paraHex(doc.body.style.backgroundColor || estiloBody?.backgroundColor || "", "#edf1f8"),
      superficie: paraHex(tabela?.style.backgroundColor || estiloTabela?.backgroundColor || "", "#ffffff"),
      fonte: detectarFonte(estiloBody?.fontFamily || "Arial"),
    });
  }

  function alterarPagina(chave: keyof PropriedadesPagina, valor: string | number) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const tabela = tabelaPrincipal(doc);
    registrarHistorico();
    if (chave === "largura") {
      const largura = Math.max(420, Math.min(700, Number(valor) || 600));
      if (tabela) {
        tabela.setAttribute("width", String(largura));
        tabela.style.maxWidth = largura + "px";
        tabela.style.width = "100%";
      }
      setPagina(atual => ({ ...atual, largura }));
      setLarguraDigitada(String(largura));
    } else if (chave === "fundo") {
      doc.body.style.backgroundColor = String(valor);
      const exterior = doc.body.querySelector("table");
      if (exterior && exterior !== tabela && exterior.contains(tabela)) {
        (exterior as HTMLElement).style.backgroundColor = String(valor);
      }
      setPagina(atual => ({ ...atual, fundo: String(valor) }));
    } else if (chave === "superficie") {
      if (tabela) tabela.style.backgroundColor = String(valor);
      setPagina(atual => ({ ...atual, superficie: String(valor) }));
    } else if (chave === "fonte") {
      const fonteCss = String(valor) + ",Arial,sans-serif";
      doc.body.style.fontFamily = fonteCss;
      // Substitui também fontes inline e herdadas dos modelos prontos.
      // A edição individual de um texto depois continua disponível.
      doc.body.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6,div,span,a,td,th,li,strong,em,small,blockquote").forEach(el => {
        if (el.hasAttribute("data-prosperity-edit-text") || !el.textContent?.trim()) return;
        el.style.setProperty("font-family", fonteCss, "important");
      });
      setSelecionado(atual => elementoRef.current && atual ? lerElemento(elementoRef.current) : atual);
      setPagina(atual => ({ ...atual, fonte: valor as FonteEmail }));
    }
    setMensagem("Configuração da página atualizada.");
  }

  function lerElemento(elemento: HTMLElement): Selecionado {
    const janela = elemento.ownerDocument.defaultView;
    const computado = janela?.getComputedStyle(elemento);
    const tag = elemento.tagName.toLowerCase();
    return {
      tag,
      tipo: tag === "img" ? "imagem" : tag === "a" ? "link" : "elemento",
      cor: paraHex(computado?.color || elemento.style.color, "#17243d"),
      fundo: paraHex(computado?.backgroundColor || elemento.style.backgroundColor, "#ffffff"),
      tamanho: String(parseInt(computado?.fontSize || elemento.style.fontSize || "16", 10) || 16),
      fonte: detectarFonte(computado?.fontFamily || elemento.style.fontFamily || "Arial"),
      espaco: String(parseInt(elemento.style.padding || "0", 10) || 0),
      raio: String(parseInt(elemento.style.borderRadius || "0", 10) || 0),
      alinhamento: computado?.textAlign || "left",
      url: tag === "a" ? (elemento.getAttribute("data-prosperity-href") || "") :
        tag === "img" ? (elemento.getAttribute("src") || "") : "",
      alt: tag === "img" ? (elemento.getAttribute("alt") || "") : "",
    };
  }

  function paraHex(valor: string | undefined, fallback: string) {
    if (!valor) return fallback;
    if (/^#[\da-f]{6}$/i.test(valor)) return valor;
    const nums = valor.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    return nums ? "#" + [nums[1], nums[2], nums[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("") : fallback;
  }


  function atualizarPosicaoAlca() {
    const elemento = elementoRef.current;
    const alca = alcaRef.current;
    if (!elemento || !alca || !editandoRef.current) return;
    const rect = elemento.getBoundingClientRect();
    const largura = elemento.ownerDocument.documentElement.clientWidth;
    alca.style.display = rect.bottom < 0 || rect.top > elemento.ownerDocument.documentElement.clientHeight ? "none" : "grid";
    alca.style.left = Math.max(5, Math.min(largura - 33, rect.left - 30)) + "px";
    alca.style.top = Math.max(3, rect.top) + "px";
  }

  function atualizarAlca(elemento: HTMLElement) {
    alcaRef.current?.remove();
    alcaRef.current = null;
    if (!editandoRef.current) return;
    const doc = elemento.ownerDocument;
    const alca = doc.createElement("button");
    alca.type = "button";
    alca.textContent = "⠿";
    alca.setAttribute("data-prosperity-drag-handle", "true");
    alca.setAttribute("aria-label", "Arrastar elemento para outra posição");
    alca.title = "Clique e arraste para reposicionar este elemento";
    alca.draggable = true;
    alca.addEventListener("click", event => event.stopPropagation());
    alca.addEventListener("dragstart", event => {
      if (!event.dataTransfer) return;
      arrasteElementoRef.current = blocoMovimentavel(elemento);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-prosperity-email-move", "1");
      event.dataTransfer.setData("text/plain", "prosperity-move");
      setArrastando(true);
    });
    alca.addEventListener("dragend", () => {
      arrasteElementoRef.current = null;
      doc.querySelectorAll("[data-prosperity-drop-target]").forEach(el => el.removeAttribute("data-prosperity-drop-target"));
      setArrastando(false);
    });
    doc.body.appendChild(alca);
    alcaRef.current = alca;
    atualizarPosicaoAlca();
  }

  function aplicarModoEdicao(ativo: boolean) {
    editandoRef.current = ativo;
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.setAttribute("data-prosperity-mode", ativo ? "editar" : "previa");
    doc.querySelectorAll<HTMLElement>("[data-prosperity-edit-text]").forEach(el => {
      el.setAttribute("contenteditable", ativo ? "plaintext-only" : "false");
      el.setAttribute("tabindex", ativo ? "0" : "-1");
    });
    if (!ativo) {
      setConfirmarRemocao(false);
      (doc.activeElement as HTMLElement | null)?.blur?.();
      doc.querySelectorAll("[data-prosperity-selected]").forEach(el => el.removeAttribute("data-prosperity-selected"));
      alcaRef.current?.remove();
      alcaRef.current = null;
      elementoRef.current = null;
      setSelecionado(null);
    }
  }

  function alternarModo(ativo: boolean) {
    if (editandoRef.current === ativo) return;
    aplicarModoEdicao(ativo);
    setEditando(ativo);
  }

  function localizarDestinoArraste(target: EventTarget | null): HTMLElement | null {
    const origem = arrasteElementoRef.current;
    if (!origem || !target || (target as Node).nodeType !== 1) return null;
    const doc = origem.ownerDocument;
    const el = target as HTMLElement;
    const candidato = el.closest("tr,td,th,h1,h2,h3,h4,h5,h6,p,div,section,li,blockquote,table") as HTMLElement | null;
    if (!candidato || candidato === doc.body) return null;
    const destino = blocoMovimentavel(candidato);
    return destino !== origem && destino.parentElement === origem.parentElement ? destino : null;
  }

  function selecionar(elemento: HTMLElement) {
    const doc = iframeRef.current?.contentDocument;
    doc?.querySelectorAll("[data-prosperity-selected]").forEach(el => el.removeAttribute("data-prosperity-selected"));
    elemento.setAttribute("data-prosperity-selected", "true");
    elementoRef.current = elemento;
    atualizarAlca(elemento);
    setSelecionado(lerElemento(elemento));
    setConfirmarRemocao(false);
    setAbaPropriedades("elemento");
    setMensagem("");
  }

  function prepararElemento(container: HTMLElement) {
    const doc = container.ownerDocument;
    container.querySelectorAll("a").forEach(link => {
      const destino = link.getAttribute("href");
      if (destino !== null) link.setAttribute("data-prosperity-href", destino);
      const alvo = link.getAttribute("target");
      if (alvo !== null) link.setAttribute("data-prosperity-target", alvo);
      link.removeAttribute("href");
      link.removeAttribute("target");
    });
    const textos: Text[] = [];
    const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const atual = walker.currentNode as Text;
      if (!atual.nodeValue?.trim() || atual.parentElement?.closest("script,style,noscript,svg,textarea,option,[data-prosperity-edit-text]")) continue;
      textos.push(atual);
    }
    for (const atual of textos) {
      const marca = doc.createElement("span");
      marca.setAttribute("data-prosperity-edit-text", "true");
      marca.setAttribute("contenteditable", "plaintext-only");
      marca.setAttribute("spellcheck", "true");
      marca.setAttribute("title", "Clique para editar o texto");
      atual.parentNode?.insertBefore(marca, atual);
      marca.appendChild(atual);
      marca.addEventListener("focus", () => registrarHistorico());
      marca.addEventListener("keydown", event => { if (event.key === "Enter") event.preventDefault(); });
      marca.addEventListener("paste", event => {
        event.preventDefault();
        const texto = event.clipboardData?.getData("text/plain")?.replace(/[\r\n]+/g, " ") || "";
        const selection = doc.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!marca.contains(range.commonAncestorContainer)) return;
        range.deleteContents();
        const novo = doc.createTextNode(texto);
        range.insertNode(novo);
        range.setStartAfter(novo);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      });
    }
  }

  function iniciarEdicao() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    elementoRef.current = null;
    alcaRef.current = null;
    setSelecionado(null);
    setMensagem("");
    doc.querySelectorAll("form").forEach(form => form.removeAttribute("action"));
    doc.querySelectorAll('meta[http-equiv="refresh"]').forEach(meta => meta.remove());
    doc.querySelectorAll("base").forEach(base => base.remove());
    prepararElemento(doc.body);
    carregarPagina(doc);
    const estilo = doc.createElement("style");
    estilo.setAttribute("data-prosperity-editor-style", "true");
    estilo.textContent = [
      "[data-prosperity-edit-text]{outline:1px dashed transparent;outline-offset:3px;cursor:text;min-width:2px;}",
      "[data-prosperity-edit-text]:hover{outline-color:#9b8fe2;}",
      "[data-prosperity-edit-text]:focus{outline:2px solid #6c4fe1;background:rgba(123,94,236,.09);}",
      "[data-prosperity-selected]{outline:2px solid #7c66e6!important;outline-offset:3px;}",
      "a[data-prosperity-href]{cursor:pointer!important;}",
      "[data-prosperity-drag-handle]{position:fixed;z-index:2147483647;width:28px;height:30px;display:grid;place-items:center;border:1px solid #9c8be7;border-radius:8px;background:#fff;color:#6246ea;box-shadow:0 2px 10px #17243d30;font:bold 23px Arial,sans-serif;cursor:grab;user-select:none;}",
      "[data-prosperity-drag-handle]:active{cursor:grabbing;}",
      "[data-prosperity-drop-target]{outline:3px dashed #7054ef!important;outline-offset:3px;}",
      "[data-prosperity-mode=previa] [data-prosperity-edit-text]{outline:none!important;background:transparent!important;cursor:default!important;}",
      "[data-prosperity-mode=previa] [data-prosperity-selected]{outline:none!important;}",
      "[data-prosperity-mode=previa] [data-prosperity-drag-handle]{display:none!important;}",
    ].join("");
    doc.head.appendChild(estilo);
    aplicarModoEdicao(editandoRef.current);
    doc.addEventListener("scroll", () => atualizarPosicaoAlca(), true);
    doc.addEventListener("click", evento => {
      const alvo = evento.target as Element | null;
      const elemento = alvo?.nodeType === 1 ? alvo : null;
      const link = elemento?.closest("a");
      if (link) evento.preventDefault();
      if (!editandoRef.current || !elemento) return;
      const imagem = elemento.closest("img");
      const destino = imagem || link ||
        elemento.closest("span:not([data-prosperity-edit-text]),strong,em,h1,h2,h3,h4,h5,h6,p,button,td,th,li,blockquote,div,section,header,footer,table,tr");
      if (destino && destino !== doc.body) selecionar(destino as HTMLElement);
    }, true);
    doc.addEventListener("submit", event => event.preventDefault(), true);
    doc.addEventListener("dragover", event => {
      if (event.dataTransfer?.types.includes("application/x-prosperity-email-move")) {
        const destino = localizarDestinoArraste(event.target);
        doc.querySelectorAll("[data-prosperity-drop-target]").forEach(el => el.removeAttribute("data-prosperity-drop-target"));
        if (!destino || !editandoRef.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        destino.setAttribute("data-prosperity-drop-target", "true");
        return;
      }
      if (!event.dataTransfer?.types.includes("application/x-prosperity-email-block") || !editandoRef.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    doc.addEventListener("drop", event => {
      if (!editandoRef.current) return;
      if (event.dataTransfer?.types.includes("application/x-prosperity-email-move")) {
        const origem = arrasteElementoRef.current;
        const destino = localizarDestinoArraste(event.target);
        event.preventDefault();
        doc.querySelectorAll("[data-prosperity-drop-target]").forEach(el => el.removeAttribute("data-prosperity-drop-target"));
        if (origem && destino) {
          registrarHistorico();
          const rect = destino.getBoundingClientRect();
          if (event.clientY < rect.top + rect.height / 2) destino.before(origem);
          else destino.after(origem);
          setMensagem("Elemento reposicionado.");
          if (elementoRef.current) atualizarPosicaoAlca();
        } else {
          setMensagem("Arraste para outro elemento do mesmo grupo ou seção.");
        }
        arrasteElementoRef.current = null;
        setArrastando(false);
        return;
      }
      const tipo = event.dataTransfer?.getData("application/x-prosperity-email-block") as TipoBlocoEmail;
      if (!opcoes.some(item => item.tipo === tipo)) return;
      event.preventDefault();
      const alvo = event.target as Element | null;
      inserirBloco(tipo, alvo?.nodeType === 1 ? alvo : null);
      setArrastando(false);
    });
  }

  function aplicarEstilo(campo: EstiloCampo, valor: string) {
    const el = elementoRef.current;
    if (!el) return;
    registrarHistorico();
    const propriedade = campo === "fontSize" || campo === "padding" || campo === "borderRadius";
    const minimo = campo === "fontSize" ? 8 : 0;
    const maximo = campo === "fontSize" ? 70 : 120;
    const ajustado = propriedade ? String(Math.max(minimo, Math.min(maximo, Number(valor) || minimo))) + "px" : valor;
    el.style[campo] = ajustado;
    setSelecionado(lerElemento(el));
    setMensagem("Alteração aplicada.");
  }

  async function enviarImagem(arquivo?: File) {
    const elemento = elementoRef.current;
    if (!arquivo || !elemento || elemento.tagName !== "IMG") return;
    setEnviandoImagem(true);
    setMensagem("");
    try {
      const dados = new FormData();
      dados.set("imagem", arquivo);
      const resposta = await fetch("/api/email-marketing/imagens", { method: "POST", body: dados });
      const retorno = await resposta.json();
      if (!resposta.ok || !retorno?.ok || !retorno.url) throw new Error(retorno?.error || "Falha ao enviar imagem.");
      registrarHistorico();
      elemento.setAttribute("src", retorno.url);
      setSelecionado(lerElemento(elemento));
      setMensagem("Imagem adicionada ao template.");
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Erro ao enviar imagem.");
    } finally {
      setEnviandoImagem(false);
    }
  }

  function aplicarUrl(valor: string, alt?: string) {
    const el = elementoRef.current;
    if (!el || !selecionado) return;
    if (!urlEmailSegura(valor, selecionado.tipo === "imagem")) {
      setMensagem("Insira um endereço HTTP/HTTPS válido" + (selecionado.tipo === "link" ? " ou mailto:." : "."));
      return;
    }
    registrarHistorico();
    if (selecionado.tipo === "link") el.setAttribute("data-prosperity-href", valor);
    if (selecionado.tipo === "imagem") {
      el.setAttribute("src", valor);
      el.setAttribute("alt", alt || "");
    }
    setSelecionado(lerElemento(el));
    setMensagem("Endereço atualizado.");
  }

  // Para tabelas de e-mail, movimentamos a linha (<tr>) inteira; fora de
  // tabelas, movemos o bloco selecionado, nunca o documento completo.
  function blocoMovimentavel(elemento: HTMLElement): HTMLElement {
    const linha = elemento.closest("tr");
    if (linha && linha.parentElement?.children.length && linha.parentElement.children.length > 1) return linha as HTMLElement;
    const celular = elemento.closest("td,th");
    if (celular && celular.parentElement?.children.length && celular.parentElement.children.length > 1) return celular as HTMLElement;
    return elemento;
  }

  function selecionarConteiner() {
    const atual = elementoRef.current;
    if (!atual) return;
    const pai = atual.parentElement?.closest("td,th,tr,p,div,section,table");
    if (!pai || pai === atual.ownerDocument.body) {
      setMensagem("Não há outro contêiner disponível para seleção.");
      return;
    }
    selecionar(pai as HTMLElement);
  }

  function mover(direcao: "cima" | "baixo") {
    const elemento = elementoRef.current;
    if (!elemento) return;
    const bloco = blocoMovimentavel(elemento);
    const vizinho = direcao === "cima" ? bloco.previousElementSibling : bloco.nextElementSibling;
    if (!vizinho) { setMensagem("Este elemento não pode ser movido nessa direção."); return; }
    registrarHistorico();
    if (direcao === "cima") bloco.parentElement?.insertBefore(bloco, vizinho);
    else bloco.parentElement?.insertBefore(vizinho, bloco);
    setMensagem("Posição atualizada.");
  }

  function duplicar() {
    const atual = elementoRef.current;
    if (!atual) return;
    const bloco = blocoMovimentavel(atual);
    registrarHistorico();
    const copia = bloco.cloneNode(true) as HTMLElement;
    copia.querySelectorAll("[data-prosperity-edit-text]").forEach(marca => marca.replaceWith(copia.ownerDocument.createTextNode(marca.textContent || "")));
    copia.querySelectorAll("[data-prosperity-selected]").forEach(el => el.removeAttribute("data-prosperity-selected"));
    copia.removeAttribute("data-prosperity-selected");
    bloco.after(copia);
    prepararElemento(copia);
    setMensagem("Elemento duplicado abaixo do original.");
  }

  function remover() {
    const atual = elementoRef.current;
    if (!atual) return;
    registrarHistorico();
    blocoMovimentavel(atual).remove();
    elementoRef.current = null;
    setSelecionado(null);
    setConfirmarRemocao(false);
    setMensagem("Elemento removido.");
  }

  return (
    <div className={styles.estudio}>
      <aside className={styles.biblioteca} aria-label="Componentes disponíveis para o HTML">
        <div className={styles.bibliotecaTitulo}><Layers size={18}/><strong>Componentes</strong></div>
        <p>Arraste para inserir componentes. Para mover um elemento existente, selecione-o e arraste pela alça <GripVertical size={14} aria-hidden="true"/>.</p>
        <div className={styles.listaBlocos}>{opcoes.map(({tipo,nome,Icone}) => (
          <button type="button" key={tipo} draggable={editando} disabled={!editando}
            onDragStart={evento => {
              evento.dataTransfer.setData("application/x-prosperity-email-block", tipo);
              evento.dataTransfer.setData("text/plain", tipo);
              evento.dataTransfer.effectAllowed = "copy";
              setArrastando(true);
            }}
            onDragEnd={() => setArrastando(false)}
            onClick={() => { if (editando) inserirBloco(tipo); }}>
            <Icone size={18}/><span>{nome}</span><Plus size={15}/>
          </button>
        ))}</div>
      </aside>
      <div className={styles.workspace}>
        <div className={styles.barra}>
        <div className={styles.titulo}><Pencil size={16}/><div><strong>Editor visual de e-mail</strong><small>Personalize textos, seções e componentes diretamente no template.</small></div></div>
        <div className={styles.controles}>
          <button type="button" onClick={() => navegarHistorico("desfazer")} disabled={!historico.length} title="Desfazer" aria-label="Desfazer"><Undo2 size={16}/></button>
          <button type="button" onClick={() => navegarHistorico("refazer")} disabled={!futuro.length} title="Refazer" aria-label="Refazer"><Redo2 size={16}/></button>
          <span className={styles.separador}/>
          <button type="button" onClick={() => alternarModo(true)} className={editando ? styles.ativo : ""}><Pencil size={15}/> Editar</button>
          <button type="button" onClick={() => alternarModo(false)} className={!editando ? styles.ativo : ""}><Eye size={15}/> Prévia</button>
          <span className={styles.separador}/>
          <button type="button" onClick={() => setDispositivo("desktop")} className={dispositivo === "desktop" ? styles.ativo : ""} aria-label="Desktop" title="Desktop"><Monitor size={16}/></button>
          <button type="button" onClick={() => setDispositivo("mobile")} className={dispositivo === "mobile" ? styles.ativo : ""} aria-label="Mobile" title="Mobile"><Smartphone size={16}/></button>
        </div>
      </div>
        {arrastando ? <p className={styles.dropDica}>Solte no ponto desejado do modelo</p> : null}
      <div className={styles.area}>
        {!editando ? <div className={styles.avisoPrevia}><Eye size={15}/> Prévia do e-mail — edição desativada</div> : null}
        <iframe ref={iframeRef} title="Edição direta do modelo HTML" sandbox="allow-same-origin"
          srcDoc={html} onLoad={iniciarEdicao}
          className={dispositivo === "mobile" ? styles.mobile : styles.desktop}
          style={{ pointerEvents: "auto" }} />
      </div>
      </div>
      <aside className={styles.inspectorLateral} aria-label="Propriedades do elemento">
      <div className={styles.inspectorCabecalho}><Layers size={17}/><strong>Propriedades</strong></div>
      <div className={styles.abasPropriedades} role="group" aria-label="Configurações do editor">
        <button type="button" className={abaPropriedades === "elemento" ? styles.abaAtiva : ""} onClick={() => setAbaPropriedades("elemento")}>Elemento</button>
        <button type="button" className={abaPropriedades === "pagina" ? styles.abaAtiva : ""} onClick={() => setAbaPropriedades("pagina")}>Página</button>
      </div>
      {abaPropriedades === "pagina" ? (
        <div className={styles.painelPagina}>
          <strong>Layout do e-mail</strong>
          <p>Personalize toda a mensagem sem alterar o conteúdo de cada bloco.</p>
          <label><span>Largura do e-mail (px)</span><input type="number" min={420} max={700} value={larguraDigitada} onChange={e => setLarguraDigitada(e.target.value)} onBlur={() => alterarPagina("largura", larguraDigitada)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /></label>
          <label><span>Fundo externo</span><input type="color" value={pagina.fundo} onChange={e => alterarPagina("fundo", e.target.value)} /></label>
          <label><span>Fundo do conteúdo</span><input type="color" value={pagina.superficie} onChange={e => alterarPagina("superficie", e.target.value)} /></label>
          <label><span>Fonte geral</span><select value={pagina.fonte} onChange={e => alterarPagina("fonte", e.target.value)}>{FONTES_EMAIL.map(fonte => <option key={fonte} value={fonte}>{fonte}</option>)}</select></label>
          <small>Atenção: ao selecionar uma fonte geral, ela será aplicada a todos os textos do e-mail, inclusive aos que já têm uma fonte personalizada.</small>
        </div>
      ) : editando && selecionado ? (
        <div className={styles.inspector}>
          <div className={styles.inspectorTitulo}><Type size={16}/><strong>{selecionado.tipo === "imagem" ? "Imagem" : selecionado.tipo === "link" ? "Botão / link" : "Elemento " + selecionado.tag.toUpperCase()}</strong></div>
          <div className={styles.campos}>
            {selecionado.tipo !== "imagem" ? <>
              <label><span>Cor do texto</span><input type="color" value={selecionado.cor} onChange={e => aplicarEstilo("color", e.target.value)} /></label>
              <label><span>Fundo</span><input type="color" value={selecionado.fundo} onChange={e => aplicarEstilo("backgroundColor", e.target.value)} /></label>
              <label><span>Tamanho</span><input type="number" min={8} max={70} value={selecionado.tamanho} onChange={e => aplicarEstilo("fontSize", e.target.value)}/></label>
              <label><span>Fonte</span><select value={selecionado.fonte} onChange={e => aplicarEstilo("fontFamily", e.target.value)}>{FONTES_EMAIL.map(fonte => <option key={fonte} value={fonte}>{fonte}</option>)}</select></label>
              <div className={styles.campoAlinhamento}><span>Alinhamento</span><div className={styles.grupoAlinhamento} role="group" aria-label="Alinhamento do texto">
                {([["left", AlignLeft, "Esquerda"], ["center", AlignCenter, "Centralizado"], ["right", AlignRight, "Direita"]] as const).map(([valor, Icone, titulo]) => (
                  <button type="button" key={valor} title={titulo} aria-label={titulo} aria-pressed={selecionado.alinhamento === valor} className={selecionado.alinhamento === valor ? styles.alinhamentoAtivo : ""} onClick={() => aplicarEstilo("textAlign", valor)}><Icone size={17}/></button>
                ))}
              </div></div>
            </> : null}
            <label><span>Margem interna (px)</span><input type="number" min={0} max={120} value={selecionado.espaco} onChange={e => aplicarEstilo("padding", e.target.value)}/></label>
            <label><span>Cantos (px)</span><input type="number" min={0} max={120} value={selecionado.raio} onChange={e => aplicarEstilo("borderRadius", e.target.value)}/></label>
            {selecionado.tipo === "link" || selecionado.tipo === "imagem" ? <>
              <label className={styles.campoUrl}><span>{selecionado.tipo === "link" ? "Link de destino" : "URL da imagem"}</span><input type="url" value={selecionado.url} onChange={e => setSelecionado({...selecionado,url:e.target.value})}/></label>
              {selecionado.tipo === "imagem" ? <>
                <label className={styles.campoUrl}><span>Enviar imagem (até 3 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={enviandoImagem} onChange={e => { void enviarImagem(e.target.files?.[0]); e.target.value = ""; }}/></label>
                <label className={styles.campoUrl}><span>Texto alternativo</span><input value={selecionado.alt} onChange={e => setSelecionado({...selecionado,alt:e.target.value})}/></label>
              </> : null}
              <button type="button" className={styles.aplicar} onClick={() => aplicarUrl(selecionado.url,selecionado.alt)}>Aplicar link / imagem</button>
            </> : null}
          </div>
          <div className={styles.acoes}>
            <button type="button" onClick={selecionarConteiner}><Layers size={15}/> Contêiner</button>
            <button type="button" onClick={() => mover("cima")}><ArrowUp size={15}/> Subir</button>
            <button type="button" onClick={() => mover("baixo")}><ArrowDown size={15}/> Descer</button>
            <button type="button" onClick={duplicar}><Copy size={15}/> Duplicar</button>
            <button type="button" className={styles.excluir} onClick={() => { if (confirmarRemocao) remover(); else setConfirmarRemocao(true); }} aria-label={confirmarRemocao ? "Confirmar remoção do elemento" : "Remover elemento"}>{confirmarRemocao ? <CheckCircle2 size={15}/> : <Trash2 size={15}/>} {confirmarRemocao ? "Confirmar" : "Remover"}</button>
          </div>
        </div>
      ) : null}
      {abaPropriedades === "elemento" && (!selecionado || !editando) ? <p className={styles.instrucao}>Selecione um elemento no e-mail para editar cores, alinhamento, fonte, fundo e posição.</p> : null}
      <div className={styles.extras}>
        {variaveis.length ? (
          <div className={styles.variaveis}>
            <strong>Personalização do CRM</strong>
            <p>Escolha uma variável para inserir no texto selecionado.</p>
            <label htmlFor="email-variavel-html">Variável do contato</label>
            <select id="email-variavel-html" value={variavel} onChange={e => setVariavel(e.target.value)}>{variaveis.map(v => <option key={v.chave} value={v.chave}>{v.descricao || v.chave}</option>)}</select>
            <button type="button" onClick={() => {
              const el = elementoRef.current;
              if (!el) return;
              const texto = el.matches("[data-prosperity-edit-text]") ? el : el.querySelector("[data-prosperity-edit-text]");
              if (!texto) { setMensagem("Selecione um título, texto ou botão para inserir a variável."); return; }
              registrarHistorico();
              texto.appendChild(el.ownerDocument.createTextNode("{{" + variavel + "}}"));
              setMensagem("Variável inserida.");
            }}><Plus size={15}/> Inserir variável</button>
            <button type="button" className={styles.botaoGerenciar} onClick={onGerenciarVariaveis}><Settings2 size={15}/> Gerenciar variáveis</button>
          </div>
        ) : null}
      </div>
      </aside>
      {mensagem ? <div className={styles.toast} role="status" aria-live="polite"><CheckCircle2 size={18} aria-hidden="true"/><span>{mensagem}</span><button type="button" onClick={() => setMensagem("")} aria-label="Fechar notificação"><X size={15}/></button></div> : null}
    </div>
  );
}

export default forwardRef(EmailHtmlPreviewEditor);
