/**
 * Organiza HTML para edição sem passar por DOMParser ou reescrever atributos.
 * Mantém blocos de CSS/JS, comentários e texto em sua forma original.
 * Adiciona indentação somente entre elementos estruturais.
 */
const ELEMENTOS_ESTRUTURAIS = new Set([
  "html", "head", "body", "main", "header", "footer", "section",
  "article", "aside", "nav", "div", "table", "thead", "tbody", "tfoot",
  "tr", "td", "th", "caption", "ul", "ol", "li", "p", "h1", "h2",
  "h3", "h4", "h5", "h6", "blockquote", "form", "figure", "figcaption",
]);

const ELEMENTOS_VAZIOS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

type PedacoHtml = { valor: string; tag: boolean };

function quebrarHtml(html: string): PedacoHtml[] {
  const resultado: PedacoHtml[] = [];
  // Conserva conteúdo de style/script/pre/textarea, inclusive '<' e '>'.
  const marcador = /<(style|script|pre|textarea)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let ultimo = 0;
  for (const item of html.matchAll(marcador)) {
    const posicao = item.index ?? 0;
    if (posicao > ultimo) resultado.push({ valor: html.slice(ultimo, posicao), tag: false });
    resultado.push({ valor: item[0], tag: true });
    ultimo = posicao + item[0].length;
  }
  if (ultimo < html.length) resultado.push({ valor: html.slice(ultimo), tag: false });
  return resultado;
}

function dadosTag(valor: string) {
  const match = valor.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b/i);
  if (!match) return { estrutural: /^<!(?:doctype|--)/i.test(valor), fecha: false, abre: false };
  const nome = match[2].toLowerCase();
  const estrutural = ELEMENTOS_ESTRUTURAIS.has(nome) || /^(?:style|script|pre|textarea)$/.test(nome);
  const fecha = Boolean(match[1]);
  const abre = estrutural && !fecha && !ELEMENTOS_VAZIOS.has(nome) && !/\/\s*>$/.test(valor);
  // Blocos opacos já contêm início/fim no mesmo token.
  return { estrutural, fecha, abre: abre && !/<\/(?:style|script|pre|textarea)\s*>$/i.test(valor) };
}

export function formatarHtmlParaEdicao(html: string): string {
  if (!html.trim()) return html;
  const partes = quebrarHtml(html);
  const saida: string[] = [];
  let nivel = 0;
  let anterior: PedacoHtml | null = null;
  let linhaNova = true;

  function novaLinha() {
    if (saida.length === 0) return;
    // Não cria linhas vazias em execuções subsequentes.
    if (!saida[saida.length - 1].endsWith("\n")) saida.push("\n");
    linhaNova = true;
  }
  function adicionar(valor: string) {
    if (linhaNova) {
      saida.push("  ".repeat(Math.min(nivel, 40)));
      linhaNova = false;
    }
    saida.push(valor);
  }

  for (let index = 0; index < partes.length; index++) {
    const atual = partes[index];
    const seguinte = partes[index + 1] || null;
    if (!atual.tag) {
      if (/^\s+$/.test(atual.valor) && anterior?.tag && seguinte?.tag) {
        const blocoAnterior = dadosTag(anterior.valor).estrutural;
        const blocoSeguinte = dadosTag(seguinte.valor).estrutural;
        if (blocoAnterior || blocoSeguinte) continue;
      }
      adicionar(atual.valor);
      anterior = atual;
      continue;
    }

    const info = dadosTag(atual.valor);
    if (info.fecha && info.estrutural) nivel = Math.max(0, nivel - 1);

    const anteriorTemTexto = anterior && !anterior.tag && Boolean(anterior.valor.trim());
    if (info.estrutural && !anteriorTemTexto) novaLinha();
    adicionar(atual.valor);
    if (info.abre) nivel++;
    anterior = atual;
  }

  return saida.join("").trim();
}
