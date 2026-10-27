const TAGS_BLOQUEADAS =
  /<\/?(?:script|iframe|object|embed|form|input|button|textarea|select|option|meta|base)[^>]*>/gi;
const ATRIBUTOS_EVENTO =
  /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL =
  /\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi;

export type VariaveisEmailMarketing = Record<
  string,
  string | number | boolean | null | undefined
>;

export function escaparHtml(valor: unknown) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sanitizarHtmlEmail(valor: unknown) {
  const html = String(valor ?? "").trim();

  if (!html) return "";

  return html
    .replace(TAGS_BLOQUEADAS, "")
    .replace(ATRIBUTOS_EVENTO, "")
    .replace(JAVASCRIPT_URL, ' $1="#"');
}

export function textoParaHtml(valor: unknown) {
  const texto = String(valor ?? "").trim();

  if (!texto) return "";

  return texto
    .split(/\n{2,}/)
    .map((paragrafo) => {
      const linhas = escaparHtml(paragrafo).replaceAll("\n", "<br />");
      return '<p style="margin:0 0 16px;line-height:1.65">' + linhas + "</p>";
    })
    .join("");
}

function normalizarChave(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .replace(/^variaveis\./, "");
}

export function renderizarVariaveis(
  valor: string,
  variaveis: VariaveisEmailMarketing,
  escapar = false
) {
  const mapa = new Map<string, string>();

  for (const [chave, bruto] of Object.entries(variaveis || {})) {
    mapa.set(normalizarChave(chave), String(bruto ?? ""));
  }

  return String(valor || "").replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_marcador, chaveBruta: string) => {
      const chave = normalizarChave(chaveBruta);
      const bruto = mapa.get(chave) ?? "";
      return escapar ? escaparHtml(bruto) : bruto;
    }
  );
}

export function aplicarFallbacksVariaveis(
  variaveis: VariaveisEmailMarketing,
  fallbacks: Record<string, unknown> | null | undefined
) {
  const resultado: VariaveisEmailMarketing = { ...variaveis };

  for (const [chaveBruta, fallback] of Object.entries(fallbacks || {})) {
    const chave = normalizarChave(chaveBruta);
    const atual = String(resultado[chave] ?? "").trim();

    if (!atual) {
      resultado[chave] = String(fallback ?? "");
    }
  }

  return resultado;
}

export function adicionarRodapeDescadastro(
  html: string,
  unsubscribeUrl: string
) {
  const rodape =
    '<div style="margin-top:32px;padding-top:18px;border-top:1px solid #e8ebf0;color:#7a8494;font-family:Arial,sans-serif;font-size:11px;line-height:1.5;text-align:center">' +
    'Você está recebendo este e-mail porque seu contato consta na base do remetente. ' +
    '<a href="' +
    escaparHtml(unsubscribeUrl) +
    '" style="color:#596779;text-decoration:underline">Descadastrar deste tipo de comunicação</a>.' +
    "</div>";

  const conteudo = String(html || "");

  if (/<\/body>/i.test(conteudo)) {
    return conteudo.replace(/<\/body>/i, rodape + "</body>");
  }

  return conteudo + rodape;
}

export function htmlTemplateBase(conteudo: string) {
  const corpo = sanitizarHtmlEmail(conteudo) || textoParaHtml(conteudo);

  return (
    '<div style="margin:0;padding:28px 16px;background:#f5f7fa;font-family:Arial,sans-serif;color:#1c2533">' +
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e9ef;border-radius:14px;padding:30px">' +
    corpo +
    "</div></div>"
  );
}
