"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  ArrowDown, ArrowUp, Columns2, Copy, Eye, Heading1, Image as ImageIcon, Info, Layers, Link2, Minus, Monitor, MoveVertical, Pencil, Plus, Redo2, Settings2, Smartphone, Trash2, Type, Undo2,
} from "lucide-react";
import { urlEmailSegura, type TipoBlocoEmail } from "@/lib/email-marketing/editor-visual";
import type { VariavelCatalogo } from "@/lib/variaveis/catalogo";
import styles from "./EmailHtmlPreviewEditor.module.css";

export type EmailHtmlPreviewHandle = { obterHtml: () => string; inserirBloco: (tipo: TipoBlocoEmail) => void };

type EstiloCampo = "color" | "backgroundColor" | "fontSize" | "padding" | "textAlign" | "borderRadius";
type Selecionado = {
  tag: string;
  tipo: "imagem" | "link" | "elemento";
  cor: string;
  fundo: string;
  tamanho: string;
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


  const obterHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.documentElement) return html;
    const copia = doc.documentElement.cloneNode(true) as HTMLElement;
    copia.querySelectorAll("[data-prosperity-edit-text]").forEach(elemento => {
      elemento.replaceWith(copia.ownerDocument.createTextNode(elemento.textContent || ""));
    });
    copia.querySelectorAll("a[data-prosperity-href]").forEach(elemento => {
      const destino = elemento.getAttribute("data-prosperity-href");
      if (destino) elemento.setAttribute("href", destino);
      elemento.removeAttribute("data-prosperity-href");
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

  function selecionar(elemento: HTMLElement) {
    const doc = iframeRef.current?.contentDocument;
    doc?.querySelectorAll("[data-prosperity-selected]").forEach(el => el.removeAttribute("data-prosperity-selected"));
    elemento.setAttribute("data-prosperity-selected", "true");
    elementoRef.current = elemento;
    setSelecionado(lerElemento(elemento));
    setMensagem("");
  }

  function prepararElemento(container: HTMLElement) {
    const doc = container.ownerDocument;
    container.querySelectorAll("a").forEach(link => {
      const destino = link.getAttribute("href");
      if (destino !== null) link.setAttribute("data-prosperity-href", destino);
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
    setSelecionado(null);
    setMensagem("");
    doc.querySelectorAll("form").forEach(form => form.removeAttribute("action"));
    doc.querySelectorAll('meta[http-equiv="refresh"]').forEach(meta => meta.remove());
    doc.querySelectorAll("base").forEach(base => base.remove());
    prepararElemento(doc.body);
    const estilo = doc.createElement("style");
    estilo.setAttribute("data-prosperity-editor-style", "true");
    estilo.textContent = [
      "[data-prosperity-edit-text]{outline:1px dashed transparent;outline-offset:3px;cursor:text;min-width:2px;}",
      "[data-prosperity-edit-text]:hover{outline-color:#9b8fe2;}",
      "[data-prosperity-edit-text]:focus{outline:2px solid #6c4fe1;background:rgba(123,94,236,.09);}",
      "[data-prosperity-selected]{outline:2px solid #7c66e6!important;outline-offset:3px;}",
      "a[data-prosperity-href]{cursor:pointer!important;}",
    ].join("");
    doc.head.appendChild(estilo);
    doc.addEventListener("click", evento => {
      const alvo = evento.target as Element | null;
      const elemento = alvo?.nodeType === 1 ? alvo : null;
      const link = elemento?.closest("a");
      if (link) evento.preventDefault();
      if (!editando || !elemento) return;
      const imagem = elemento.closest("img");
      const destino = imagem || link ||
        elemento.closest("span:not([data-prosperity-edit-text]),strong,em,h1,h2,h3,h4,h5,h6,p,button,td,th,li,blockquote,div,section,header,footer,table,tr");
      if (destino && destino !== doc.body) selecionar(destino as HTMLElement);
    }, true);
    doc.addEventListener("submit", event => event.preventDefault(), true);
    doc.addEventListener("dragover", event => {
      if (!event.dataTransfer?.types.includes("application/x-prosperity-email-block")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    doc.addEventListener("drop", event => {
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
        <p>Arraste para o e-mail ou clique para adicionar ao layout.</p>
        <div className={styles.listaBlocos}>{opcoes.map(({tipo,nome,Icone}) => (
          <button type="button" key={tipo} draggable
            onDragStart={evento => {
              evento.dataTransfer.setData("application/x-prosperity-email-block", tipo);
              evento.dataTransfer.setData("text/plain", tipo);
              evento.dataTransfer.effectAllowed = "copy";
              setArrastando(true);
            }}
            onDragEnd={() => setArrastando(false)}
            onClick={() => inserirBloco(tipo)}>
            <Icone size={18}/><span>{nome}</span><Plus size={15}/>
          </button>
        ))}</div>
        <button type="button" className={styles.gerenciar} onClick={onGerenciarVariaveis}><Settings2 size={16}/> Gerenciar variáveis</button>
      </aside>
      <div className={styles.workspace}>
        <div className={styles.barra}>
        <div className={styles.titulo}><Pencil size={16}/><div><strong>Editor de elementos HTML</strong><small>Selecione textos, imagens, botões ou áreas do modelo para ajustar.</small></div></div>
        <div className={styles.controles}>
          <button type="button" onClick={() => setEditando(true)} className={editando ? styles.ativo : ""}><Pencil size={15}/> Editar</button>
          <button type="button" onClick={() => setEditando(false)} className={!editando ? styles.ativo : ""}><Eye size={15}/> Prévia</button>
          <span className={styles.separador}/>
          <button type="button" onClick={() => setDispositivo("desktop")} className={dispositivo === "desktop" ? styles.ativo : ""} aria-label="Desktop" title="Desktop"><Monitor size={16}/></button>
          <button type="button" onClick={() => setDispositivo("mobile")} className={dispositivo === "mobile" ? styles.ativo : ""} aria-label="Mobile" title="Mobile"><Smartphone size={16}/></button>
        </div>
      </div>
        {arrastando ? <p className={styles.dropDica}>Solte no ponto desejado do modelo</p> : null}
      <div className={styles.area}>
        <iframe ref={iframeRef} title="Edição direta do modelo HTML" sandbox="allow-same-origin"
          srcDoc={html} onLoad={iniciarEdicao}
          className={dispositivo === "mobile" ? styles.mobile : styles.desktop}
          style={{ pointerEvents: editando ? "auto" : "none" }} />
      </div>
      </div>
      <aside className={styles.inspectorLateral} aria-label="Propriedades do elemento">
      <div className={styles.inspectorCabecalho}><Layers size={17}/><strong>Propriedades</strong></div>
      {editando && selecionado ? (
        <div className={styles.inspector}>
          <div className={styles.inspectorTitulo}><Type size={16}/><strong>{selecionado.tipo === "imagem" ? "Imagem" : selecionado.tipo === "link" ? "Botão / link" : "Elemento " + selecionado.tag.toUpperCase()}</strong></div>
          {mensagem ? <p className={styles.feedback} role="status"><Info size={16} aria-hidden="true"/><span>{mensagem}</span></p> : null}
          <div className={styles.campos}>
            {selecionado.tipo !== "imagem" ? <>
              <label><span>Cor do texto</span><input type="color" value={selecionado.cor} onChange={e => aplicarEstilo("color", e.target.value)} /></label>
              <label><span>Fundo</span><input type="color" value={selecionado.fundo} onChange={e => aplicarEstilo("backgroundColor", e.target.value)} /></label>
              <label><span>Fonte (px)</span><input type="number" min={8} max={70} value={selecionado.tamanho} onChange={e => aplicarEstilo("fontSize", e.target.value)}/></label>
              <label><span>Alinhamento</span><select value={selecionado.alinhamento} onChange={e => aplicarEstilo("textAlign", e.target.value)}>
                <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
              </select></label>
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
            <button type="button" className={styles.excluir} onClick={() => setConfirmarRemocao(true)}><Trash2 size={15}/> Remover</button>
          </div>
        </div>
      ) : null}
      {(!selecionado || !editando) ? <p className={styles.instrucao}>Selecione um elemento no e-mail para editar suas propriedades, cores e posições.</p> : null}
      <div className={styles.extras}>
        <button type="button" onClick={() => navegarHistorico("desfazer")} disabled={!historico.length}><Undo2 size={15}/> Desfazer</button>
        <button type="button" onClick={() => navegarHistorico("refazer")} disabled={!futuro.length}><Redo2 size={15}/> Refazer</button>
        {selecionado && variaveis.length ? (
          <div className={styles.variaveis}>
            <label htmlFor="email-variavel-html">Inserir variável do CRM</label>
            <select id="email-variavel-html" value={variavel} onChange={e => setVariavel(e.target.value)}>{variaveis.map(v => <option key={v.chave} value={v.chave}>{v.descricao || v.chave}</option>)}</select>
            <button type="button" onClick={() => {
              const el = elementoRef.current;
              if (!el) return;
              const texto = el.querySelector("[data-prosperity-edit-text]");
              if (!texto) { setMensagem("Selecione um título, texto ou botão para inserir a variável."); return; }
              registrarHistorico();
              texto.appendChild(el.ownerDocument.createTextNode("{{" + variavel + "}}"));
              setMensagem("Variável inserida.");
            }}><Plus size={15}/> Inserir variável</button>
          </div>
        ) : null}
      </div>
      </aside>
      {confirmarRemocao ? <div className={styles.confirmarFundo} role="presentation"><div className={styles.confirmarCard} role="alertdialog" aria-modal="true" aria-label="Remover elemento"><strong>Remover elemento?</strong><p>O elemento selecionado será retirado deste template.</p><div><button type="button" onClick={() => setConfirmarRemocao(false)}>Cancelar</button><button type="button" className={styles.excluir} onClick={remover}>Remover</button></div></div></div> : null}
    </div>
  );
}

export default forwardRef(EmailHtmlPreviewEditor);
