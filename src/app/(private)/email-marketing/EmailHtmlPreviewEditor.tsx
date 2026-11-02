"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { Eye, Image as ImageIcon, Link2, Monitor, Pencil, Smartphone } from "lucide-react";
import { urlEmailSegura } from "@/lib/email-marketing/editor-visual";
import styles from "./EmailHtmlPreviewEditor.module.css";

export type EmailHtmlPreviewHandle = {
  obterHtml: () => string;
};

type ElementoSelecionado = {
  tipo: "imagem" | "link";
  indice: string;
  valor: string;
  alternativo?: string;
};

type Props = {
  html: string;
};

function EmailHtmlPreviewEditor({ html }: Props, ref: React.ForwardedRef<EmailHtmlPreviewHandle>) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [dispositivo, setDispositivo] = useState<"desktop" | "mobile">("desktop");
  const [editando, setEditando] = useState(true);
  const [selecionado, setSelecionado] = useState<ElementoSelecionado | null>(null);
  const [mensagem, setMensagem] = useState("");

  const obterHtml = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.documentElement) return html;

    // Os elementos auxiliares existem apenas na interface do editor.
    const copia = doc.documentElement.cloneNode(true) as HTMLElement;
    copia.querySelectorAll("[data-prosperity-edit-text]").forEach(elemento => {
      elemento.replaceWith(doc.createTextNode(elemento.textContent || ""));
    });
    copia.querySelectorAll("[data-prosperity-edit-link], [data-prosperity-edit-image]").forEach(elemento => {
      elemento.removeAttribute("data-prosperity-edit-link");
      elemento.removeAttribute("data-prosperity-edit-image");
    });
    copia.querySelectorAll("style[data-prosperity-editor-style]").forEach(elemento => elemento.remove());
    return "<!DOCTYPE html>" + copia.outerHTML;
  }, [html]);

  useImperativeHandle(ref, () => ({ obterHtml }), [obterHtml]);

  function iniciarEdicao() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    setSelecionado(null);
    setMensagem("");

    const estilo = doc.createElement("style");
    estilo.setAttribute("data-prosperity-editor-style", "true");
    estilo.textContent = [
      "[data-prosperity-edit-text]{outline:1px dashed transparent;outline-offset:3px;cursor:text;min-width:2px;}",
      "[data-prosperity-edit-text]:hover{outline-color:#9b8fe2;}",
      "[data-prosperity-edit-text]:focus{outline:2px solid #6c4fe1;background:rgba(123,94,236,.09);}",
      "[data-prosperity-edit-link]:hover,[data-prosperity-edit-image]:hover{outline:2px solid #6c4fe1;outline-offset:2px;cursor:pointer;}",
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
      marca.setAttribute("title", "Clique para editar este texto");
      atual.parentNode?.insertBefore(marca, atual);
      marca.appendChild(atual);
      marca.addEventListener("keydown", (e) => {
        // Mantém a estrutura HTML do template: edição de texto, não de tabelas.
        if (e.key === "Enter") e.preventDefault();
      });
      marca.addEventListener("paste", (e) => {
        e.preventDefault();
        const texto = e.clipboardData?.getData("text/plain")?.replace(/[\r\n]+/g, " ") || "";
        const selecao = doc.getSelection();
        if (!selecao?.rangeCount) return;
        const intervalo = selecao.getRangeAt(0);
        if (!marca.contains(intervalo.commonAncestorContainer)) return;
        intervalo.deleteContents();
        const novo = doc.createTextNode(texto);
        intervalo.insertNode(novo);
        intervalo.setStartAfter(novo);
        intervalo.collapse(true);
        selecao.removeAllRanges();
        selecao.addRange(intervalo);
      });
    }
    doc.querySelectorAll("a[href]").forEach((elemento, indice) => {
      elemento.setAttribute("data-prosperity-edit-link", String(indice));
    });
    doc.querySelectorAll("img").forEach((elemento, indice) => {
      elemento.setAttribute("data-prosperity-edit-image", String(indice));
    });
    // Não permitir abrir links na prévia editável.
    doc.addEventListener("click", (evento) => {
      const alvo = evento.target && (evento.target as Node).nodeType === 1 ? evento.target as Element : null;
      const link = alvo?.closest<HTMLAnchorElement>("a[data-prosperity-edit-link]");
      const imagem = alvo?.closest<HTMLImageElement>("img[data-prosperity-edit-image]");
      if (link) {
        evento.preventDefault();
        setSelecionado({
          tipo: "link", indice: link.getAttribute("data-prosperity-edit-link")!,
          valor: link.getAttribute("href") || "",
        });
      } else if (imagem) {
        evento.preventDefault();
        setSelecionado({
          tipo: "imagem", indice: imagem.getAttribute("data-prosperity-edit-image")!,
          valor: imagem.getAttribute("src") || "", alternativo: imagem.getAttribute("alt") || "",
        });
      }
    }, true);
  }

  function atualizarElemento() {
    if (!selecionado) return;
    if (!urlEmailSegura(selecionado.valor, selecionado.tipo === "imagem")) {
      setMensagem("Insira um endereço HTTP/HTTPS válido" + (selecionado.tipo === "link" ? " ou mailto:." : "."));
      return;
    }
    const doc = iframeRef.current?.contentDocument;
    const atributo = selecionado.tipo === "link" ? "data-prosperity-edit-link" : "data-prosperity-edit-image";
    const elemento = doc?.querySelector('[' + atributo + '="' + selecionado.indice + '"]');
    if (!elemento) return;
    elemento.setAttribute(selecionado.tipo === "link" ? "href" : "src", selecionado.valor);
    if (selecionado.tipo === "imagem") elemento.setAttribute("alt", selecionado.alternativo || "");
    setMensagem("Alteração aplicada à prévia.");
  }

  return (
    <div className={styles.estudio}>
      <div className={styles.barra}>
        <div className={styles.titulo}><Pencil size={16}/><div><strong>Editar no próprio e-mail</strong><small>Toque em qualquer texto para alterar. Clique em links ou imagens para configurar.</small></div></div>
        <div className={styles.controles}>
          <button type="button" onClick={() => setEditando(true)} className={editando ? styles.ativo : ""}><Pencil size={15}/> Editar</button>
          <button type="button" onClick={() => setEditando(false)} className={!editando ? styles.ativo : ""}><Eye size={15}/> Prévia</button>
          <span className={styles.separador}/>
          <button type="button" onClick={() => setDispositivo("desktop")} className={dispositivo === "desktop" ? styles.ativo : ""} aria-label="Desktop" title="Desktop"><Monitor size={16}/></button>
          <button type="button" onClick={() => setDispositivo("mobile")} className={dispositivo === "mobile" ? styles.ativo : ""} aria-label="Mobile" title="Mobile"><Smartphone size={16}/></button>
        </div>
      </div>
      <div className={styles.area}>
        <iframe
          ref={iframeRef}
          title="Edição direta do modelo HTML"
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={iniciarEdicao}
          className={dispositivo === "mobile" ? styles.mobile : styles.desktop}
          style={{ pointerEvents: editando ? "auto" : "none" }}
        />
      </div>
      {editando && selecionado ? (
        <div className={styles.inspector}>
          {selecionado.tipo === "link" ? <Link2 size={17}/> : <ImageIcon size={17}/>}
          <label>
            <span>{selecionado.tipo === "link" ? "Destino do link" : "URL da imagem"}</span>
            <input value={selecionado.valor} onChange={e => {setSelecionado({ ...selecionado, valor: e.target.value });setMensagem("");}} placeholder="https://..." />
          </label>
          {selecionado.tipo === "imagem" ? (
            <label><span>Texto alternativo</span><input value={selecionado.alternativo || ""} onChange={e => setSelecionado({ ...selecionado, alternativo: e.target.value })}/></label>
          ) : null}
          <button type="button" onClick={atualizarElemento}>Aplicar</button>
          <button type="button" onClick={() => {setSelecionado(null);setMensagem("");}} aria-label="Fechar configuração">Fechar</button>
          {mensagem ? <small role="status">{mensagem}</small> : null}
        </div>
      ) : null}
      <p className={styles.rodape}>O conteúdo HTML e sua formatação original são preservados. Para alterar elementos estruturais, utilize a aba Código HTML.</p>
    </div>
  );
}

export default forwardRef(EmailHtmlPreviewEditor);
