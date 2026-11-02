"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  ArrowDown, ArrowUp, Copy, Eye, Monitor, Pencil, Smartphone, Trash2, Type,
} from "lucide-react";
import { urlEmailSegura } from "@/lib/email-marketing/editor-visual";
import styles from "./EmailHtmlPreviewEditor.module.css";

export type EmailHtmlPreviewHandle = { obterHtml: () => string };

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

type Props = { html: string };

function EmailHtmlPreviewEditor({ html }: Props, ref: Ref<EmailHtmlPreviewHandle>) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const elementoRef = useRef<HTMLElement | null>(null);
  const [dispositivo, setDispositivo] = useState<"desktop" | "mobile">("desktop");
  const [editando, setEditando] = useState(true);
  const [selecionado, setSelecionado] = useState<Selecionado | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

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

  useImperativeHandle(ref, () => ({ obterHtml }), [obterHtml]);

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

  function iniciarEdicao() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    elementoRef.current = null;
    setSelecionado(null);
    setMensagem("");

    // Em todo modo, links são transformados em elementos NÃO navegáveis.
    // O destino original é restaurado somente ao exportar o HTML para envio.
    doc.querySelectorAll("a").forEach(elemento => {
      const destino = elemento.getAttribute("href");
      if (destino !== null) elemento.setAttribute("data-prosperity-href", destino);
      elemento.removeAttribute("href");
      elemento.removeAttribute("target");
    });
    doc.querySelectorAll("form").forEach(form => form.removeAttribute("action"));
    doc.querySelectorAll('meta[http-equiv="refresh"]').forEach(meta => meta.remove());
    doc.querySelectorAll("base").forEach(base => base.remove());

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

    const textos: Text[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const atual = walker.currentNode as Text;
      if (!atual.nodeValue?.trim() || atual.parentElement?.closest("script,style,noscript,svg,textarea,option")) continue;
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
      marca.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
      marca.addEventListener("paste", e => {
        e.preventDefault();
        const texto = e.clipboardData?.getData("text/plain")?.replace(/[\r\n]+/g, " ") || "";
        const range = doc.getSelection()?.rangeCount ? doc.getSelection()?.getRangeAt(0) : null;
        if (!range || !marca.contains(range.commonAncestorContainer)) return;
        range.deleteContents();
        const novo = doc.createTextNode(texto);
        range.insertNode(novo);
        range.setStartAfter(novo);
        range.collapse(true);
      });
    }

    doc.addEventListener("click", evento => {
      // Bloqueia sempre a navegação, incluindo clique em imagem dentro de <a>.
      const alvo = evento.target as Element | null;
      const elemento = alvo?.nodeType === 1 ? alvo : null;
      const link = elemento?.closest("a");
      if (link) {
        evento.preventDefault();
      }
      if (!editando || !elemento) return;
      const imagem = elemento.closest("img");
      const destino = imagem || link ||
        elemento.closest("h1,h2,h3,h4,h5,h6,p,button,td,th,li,blockquote,div,section,header,footer,table,tr");
      if (destino && destino !== doc.body) selecionar(destino as HTMLElement);
    }, true);
    doc.addEventListener("submit", evento => evento.preventDefault(), true);
  }

  function aplicarEstilo(campo: EstiloCampo, valor: string) {
    const el = elementoRef.current;
    if (!el) return;
    const propriedade = campo === "fontSize" || campo === "padding" || campo === "borderRadius";
    const minimo = campo === "fontSize" ? 8 : 0;
    const maximo = campo === "fontSize" ? 70 : 120;
    const ajustado = propriedade ? String(Math.max(minimo, Math.min(maximo, Number(valor) || minimo))) + "px" : valor;
    el.style[campo] = ajustado;
    setSelecionado(lerElemento(el));
    setMensagem("Alteração aplicada.");
  }

  function aplicarUrl(valor: string, alt?: string) {
    const el = elementoRef.current;
    if (!el || !selecionado) return;
    if (!urlEmailSegura(valor, selecionado.tipo === "imagem")) {
      setMensagem("Insira um endereço HTTP/HTTPS válido" + (selecionado.tipo === "link" ? " ou mailto:." : "."));
      return;
    }
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
    if (linha && linha.parentElement?.children.length && linha.parentElement.children.length > 1) return linha;
    const celular = elemento.closest("td,th");
    if (celular && celular.parentElement?.children.length && celular.parentElement.children.length > 1) return celular;
    return elemento;
  }

  function mover(direcao: "cima" | "baixo") {
    const elemento = elementoRef.current;
    if (!elemento) return;
    const bloco = blocoMovimentavel(elemento);
    const vizinho = direcao === "cima" ? bloco.previousElementSibling : bloco.nextElementSibling;
    if (!vizinho) { setMensagem("Este elemento não pode ser movido nessa direção."); return; }
    if (direcao === "cima") bloco.parentElement?.insertBefore(bloco, vizinho);
    else bloco.parentElement?.insertBefore(vizinho, bloco);
    setMensagem("Posição atualizada.");
  }

  function duplicar() {
    const atual = elementoRef.current;
    if (!atual) return;
    const bloco = blocoMovimentavel(atual);
    const copia = bloco.cloneNode(true) as HTMLElement;
    copia.querySelectorAll("[data-prosperity-selected]").forEach(el => el.removeAttribute("data-prosperity-selected"));
    copia.removeAttribute("data-prosperity-selected");
    bloco.after(copia);
    setMensagem("Elemento duplicado abaixo do original.");
  }

  function remover() {
    const atual = elementoRef.current;
    if (!atual) return;
    blocoMovimentavel(atual).remove();
    elementoRef.current = null;
    setSelecionado(null);
    setConfirmarRemocao(false);
    setMensagem("Elemento removido.");
  }

  return (
    <div className={styles.estudio}>
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
      <div className={styles.area}>
        <iframe ref={iframeRef} title="Edição direta do modelo HTML" sandbox="allow-same-origin"
          srcDoc={html} onLoad={iniciarEdicao}
          className={dispositivo === "mobile" ? styles.mobile : styles.desktop}
          style={{ pointerEvents: editando ? "auto" : "none" }} />
      </div>
      {editando && selecionado ? (
        <div className={styles.inspector}>
          <div className={styles.inspectorTitulo}><Type size={16}/><strong>{selecionado.tipo === "imagem" ? "Imagem" : selecionado.tipo === "link" ? "Botão / link" : "Elemento " + selecionado.tag.toUpperCase()}</strong><span>Propriedades</span></div>
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
              {selecionado.tipo === "imagem" ? <label className={styles.campoUrl}><span>Texto alternativo</span><input value={selecionado.alt} onChange={e => setSelecionado({...selecionado,alt:e.target.value})}/></label> : null}
              <button type="button" className={styles.aplicar} onClick={() => aplicarUrl(selecionado.url,selecionado.alt)}>Aplicar link / imagem</button>
            </> : null}
          </div>
          <div className={styles.acoes}>
            <button type="button" onClick={() => mover("cima")}><ArrowUp size={15}/> Subir</button>
            <button type="button" onClick={() => mover("baixo")}><ArrowDown size={15}/> Descer</button>
            <button type="button" onClick={duplicar}><Copy size={15}/> Duplicar</button>
            <button type="button" className={styles.excluir} onClick={() => setConfirmarRemocao(true)}><Trash2 size={15}/> Remover</button>
          </div>
          {mensagem ? <small role="status">{mensagem}</small> : null}
        </div>
      ) : null}
      <p className={styles.rodape}>Edite textos tocando diretamente neles. Selecione elementos para configurar cores, tamanhos e posições. Os links estão desativados nesta área para evitar abrir sites.</p>
      {confirmarRemocao ? <div className={styles.confirmarFundo} role="presentation"><div className={styles.confirmarCard} role="alertdialog" aria-modal="true" aria-label="Remover elemento"><strong>Remover elemento?</strong><p>O elemento selecionado será retirado deste template.</p><div><button type="button" onClick={() => setConfirmarRemocao(false)}>Cancelar</button><button type="button" className={styles.excluir} onClick={remover}>Remover</button></div></div></div> : null}
    </div>
  );
}

export default forwardRef(EmailHtmlPreviewEditor);
