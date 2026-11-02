import { escaparHtml } from "./conteudo.ts";

export type TipoBlocoEmail = "titulo" | "texto" | "imagem" | "botao" | "divisor" | "espaco" | "colunas";
export type AlinhamentoEmail = "left" | "center" | "right";
export type BlocoEmail = {
  id: string;
  tipo: TipoBlocoEmail;
  texto: string;
  textoDireita: string;
  imagem: string;
  alt: string;
  url: string;
  cor: string;
  fundo: string;
  tamanho: number;
  alinhamento: AlinhamentoEmail;
  espacamento: number;
  altura: number;
  borda: number;
};
export type DocumentoEmail = {
  versao: 1;
  fundo: string;
  superficie: string;
  largura: number;
  fonte: "Arial" | "Georgia" | "Verdana" | "Tahoma";
  padding: number;
  blocos: BlocoEmail[];
};
const TIPOS: TipoBlocoEmail[] = ["titulo", "texto", "imagem", "botao", "divisor", "espaco", "colunas"];
const FONTES: DocumentoEmail["fonte"][] = ["Arial", "Georgia", "Verdana", "Tahoma"];
const COR = /^#[0-9a-fA-F]{6}$/;
const LIMITE_BLOCOS = 60;

function textoLimitado(valor: unknown, limite: number) {
  return String(valor ?? "").slice(0, limite);
}
function corValida(valor: unknown, fallback: string) {
  const cor = String(valor || "");
  return COR.test(cor) ? cor : fallback;
}
function numeroEntre(valor: unknown, minimo: number, maximo: number, fallback: number) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(minimo, Math.min(maximo, Math.round(numero))) : fallback;
}
export function urlEmailSegura(valor: unknown, imagem = false) {
  const url = String(valor || "").trim();
  if (!url || url.length > 2048) return "";
  try {
    const objeto = new URL(url);
    return ["https:", "http:", ...(imagem ? [] : ["mailto:"])].includes(objeto.protocol) ? url : "";
  } catch {
    return "";
  }
}
export function novoBlocoEmail(tipo: TipoBlocoEmail): BlocoEmail {
  return {
    id: crypto.randomUUID(),
    tipo,
    texto: tipo === "titulo" ? "Uma novidade especial para você" :
      tipo === "texto" ? "Olá, {{nome_contato}}!\n\nCompartilhe aqui sua mensagem com seus clientes." :
      tipo === "botao" ? "Saiba mais" :
      tipo === "colunas" ? "Benefício principal\nDescreva o primeiro benefício." : "",
    textoDireita: tipo === "colunas" ? "Mais vantagens\nDescreva outro diferencial." : "",
    imagem: "",
    alt: "",
    url: tipo === "botao" ? "https://crmprosperity.com" : "",
    cor: tipo === "botao" ? "#ffffff" : "#17243d",
    fundo: tipo === "botao" ? "#6246ea" : "#ffffff",
    tamanho: tipo === "titulo" ? 32 : tipo === "texto" ? 16 : tipo === "botao" ? 15 : 15,
    alinhamento: tipo === "titulo" || tipo === "botao" || tipo === "imagem" ? "center" : "left",
    espacamento: 20,
    altura: 32,
    borda: 12,
  };
}
export function novoDocumentoEmail(): DocumentoEmail {
  return {
    versao: 1,
    fundo: "#edf1f8",
    superficie: "#ffffff",
    largura: 600,
    fonte: "Arial",
    padding: 30,
    blocos: [
      { ...novoBlocoEmail("titulo"), texto: "Olá, {{nome_contato}}!", cor: "#171b38" },
      { ...novoBlocoEmail("texto"), texto: "Preparamos uma mensagem especial para você.\n\nPersonalize este conteúdo com a identidade da sua empresa." },
      novoBlocoEmail("botao"),
    ],
  };
}
export function normalizarDocumentoEmail(valor: unknown): DocumentoEmail | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const objeto = valor as Record<string, unknown>;
  if (objeto.versao !== 1 || !Array.isArray(objeto.blocos) || !objeto.blocos.length || objeto.blocos.length > LIMITE_BLOCOS) return null;
  const blocos: BlocoEmail[] = [];
  for (const bruto of objeto.blocos) {
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
    const b = bruto as Record<string, unknown>;
    if (!TIPOS.includes(b.tipo as TipoBlocoEmail)) return null;
    const padrao = novoBlocoEmail(b.tipo as TipoBlocoEmail);
    const tipo = b.tipo as TipoBlocoEmail;
    blocos.push({
      id: /^[a-zA-Z0-9_-]{1,80}$/.test(String(b.id || "")) ? String(b.id) : crypto.randomUUID(),
      tipo,
      texto: textoLimitado(b.texto, 6000),
      textoDireita: textoLimitado(b.textoDireita, 6000),
      imagem: textoLimitado(b.imagem, 2048),
      alt: textoLimitado(b.alt, 250),
      url: textoLimitado(b.url, 2048),
      cor: corValida(b.cor, padrao.cor),
      fundo: corValida(b.fundo, padrao.fundo),
      tamanho: numeroEntre(b.tamanho, 10, 54, padrao.tamanho),
      alinhamento: ["left", "center", "right"].includes(String(b.alinhamento)) ? b.alinhamento as AlinhamentoEmail : padrao.alinhamento,
      espacamento: numeroEntre(b.espacamento, 0, 72, 20),
      altura: numeroEntre(b.altura, 8, 140, 32),
      borda: numeroEntre(b.borda, 0, 40, 12),
    });
    if ((tipo === "imagem" && b.imagem && !urlEmailSegura(b.imagem, true)) ||
        (tipo === "botao" && b.url && !urlEmailSegura(b.url))) return null;
  }
  if (new Set(blocos.map(b => b.id)).size !== blocos.length) return null;
  return {
    versao: 1,
    fundo: corValida(objeto.fundo, "#edf1f8"),
    superficie: corValida(objeto.superficie, "#ffffff"),
    largura: numeroEntre(objeto.largura, 420, 700, 600),
    fonte: FONTES.includes(objeto.fonte as DocumentoEmail["fonte"]) ? objeto.fonte as DocumentoEmail["fonte"] : "Arial",
    padding: numeroEntre(objeto.padding, 12, 56, 30),
    blocos,
  };
}
function htmlTexto(valor: string) {
  return escaparHtml(valor).replace(/\r?\n/g, "<br />");
}
function td(corpo: string, espaco: number, alinhamento: AlinhamentoEmail, adicional = "") {
  return '<tr><td align="' + alinhamento + '" style="padding:' + espaco + 'px 0;text-align:' + alinhamento + ";" + adicional + '">' + corpo + "</td></tr>";
}
export function gerarHtmlEmailVisual(documento: DocumentoEmail) {
  const d = normalizarDocumentoEmail(documento);
  if (!d) throw new Error("Estrutura visual do e-mail inválida.");
  const linhas = d.blocos.map(b => {
    const cor = b.cor;
    const tamanho = b.tamanho;
    const base = 'font-family:' + d.fonte + ',Arial,sans-serif;font-size:' + tamanho + 'px;line-height:1.6;color:' + cor + ';';
    switch (b.tipo) {
      case "titulo": return td('<div style="' + base + 'font-weight:800;line-height:1.2;">' + htmlTexto(b.texto) + "</div>", b.espacamento, b.alinhamento);
      case "texto": return td('<div style="' + base + 'white-space:normal;">' + htmlTexto(b.texto) + "</div>", b.espacamento, b.alinhamento);
      case "imagem": {
        const src = urlEmailSegura(b.imagem, true);
        return src ? td('<img src="' + escaparHtml(src) + '" alt="' + escaparHtml(b.alt) + '" width="' + d.largura + '" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:' + b.borda + 'px" />', b.espacamento, b.alinhamento) : "";
      }
      case "botao": {
        const url = urlEmailSegura(b.url) || "#";
        return td('<a href="' + escaparHtml(url) + '" style="display:inline-block;text-decoration:none;background:' + b.fundo + ';color:' + cor + ';padding:13px 24px;border-radius:' + b.borda + 'px;font-family:' + d.fonte + ',Arial,sans-serif;font-weight:700;font-size:' + tamanho + 'px;">' + htmlTexto(b.texto) + "</a>", b.espacamento, b.alinhamento);
      }
      case "divisor": return td('<div style="height:1px;background:' + cor + ';font-size:0;line-height:1px;">&nbsp;</div>', b.espacamento, "left");
      case "espaco": return '<tr><td height="' + b.altura + '" style="font-size:0;line-height:' + b.altura + 'px;">&nbsp;</td></tr>';
      case "colunas":
        return td('<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="email-stack" width="50%" valign="top" style="width:50%;padding:12px;background:' + b.fundo + ';font-family:' + d.fonte + ',Arial,sans-serif;font-size:' + tamanho + 'px;line-height:1.6;color:' + cor + ';">' + htmlTexto(b.texto) + '</td><td class="email-stack" width="50%" valign="top" style="width:50%;padding:12px;background:' + b.fundo + ';font-family:' + d.fonte + ',Arial,sans-serif;font-size:' + tamanho + 'px;line-height:1.6;color:' + cor + ';">' + htmlTexto(b.textoDireita) + "</td></tr></table>", b.espacamento, "left");
    }
  }).join("");
  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />' +
    '<style>@media screen and (max-width:620px){.email-shell{width:100%!important}.email-stack{display:block!important;width:100%!important;box-sizing:border-box}.email-padding{padding:22px 18px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:' + d.fundo + ';">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:' + d.fundo + ';border-collapse:collapse;"><tr><td align="center" style="padding:26px 10px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="' + d.largura + '" class="email-shell" style="width:100%;max-width:' + d.largura + 'px;background:' + d.superficie + ';border-collapse:separate;border-radius:16px;"><tr><td class="email-padding" style="padding:' + d.padding + 'px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">' + linhas +
    '</table></td></tr></table></td></tr></table></body></html>';
}
export function modelosVisuaisEmail(): Array<{ id: string; nome: string; categoria: string; descricao: string; assunto: string; documento: DocumentoEmail }> {
  const base = novoDocumentoEmail();
  const boasVindas = { ...base, blocos: base.blocos.map(b => ({ ...b })) };
  const oferta: DocumentoEmail = { ...novoDocumentoEmail(), fundo: "#f0ecff", blocos: [
    { ...novoBlocoEmail("titulo"), texto: "Uma oferta para você", cor: "#34206b" },
    { ...novoBlocoEmail("texto"), texto: "Olá, {{nome_contato}}!\n\nSelecionamos uma condição especial. Aproveite para conhecer todos os benefícios." },
    { ...novoBlocoEmail("botao"), texto: "Conferir oferta", fundo: "#6d42d8" },
    { ...novoBlocoEmail("divisor"), cor: "#e8e1fa" },
    { ...novoBlocoEmail("texto"), texto: "Atenciosamente,\nSua equipe", tamanho: 13, cor: "#667085" },
  ] };
  const evento: DocumentoEmail = { ...novoDocumentoEmail(), fundo: "#eef4fa", blocos: [
    { ...novoBlocoEmail("titulo"), texto: "Você é nosso convidado", cor: "#153957" },
    { ...novoBlocoEmail("texto"), texto: "Olá, {{nome_contato}}!\n\nParticipe do nosso próximo encontro. Uma oportunidade para compartilhar ideias e conexões." },
    { ...novoBlocoEmail("colunas"), texto: "DATA\nA confirmar", textoDireita: "LOCAL\nA confirmar", fundo: "#f0f6fb", cor: "#153957" },
    { ...novoBlocoEmail("botao"), texto: "Confirmar presença", fundo: "#155c91" },
  ] };
  const newsletter: DocumentoEmail = { ...novoDocumentoEmail(), fundo: "#f2f3f6", blocos: [
    { ...novoBlocoEmail("titulo"), texto: "Novidades da semana", cor: "#191f2d" },
    { ...novoBlocoEmail("texto"), texto: "Olá, {{nome_contato}}!\n\nConfira os principais destaques que preparamos para você." },
    { ...novoBlocoEmail("divisor"), cor: "#dce2ec" },
    { ...novoBlocoEmail("colunas"), texto: "Destaque 01\nConte a primeira novidade.", textoDireita: "Destaque 02\nCompartilhe outra atualização.", fundo: "#f6f8fc" },
    { ...novoBlocoEmail("botao"), texto: "Ver novidades", fundo: "#283353" },
  ] };
  return [
    { id: "boas-vindas-visual", nome: "Boas-vindas", categoria: "Relacionamento", descricao: "Primeiro contato personalizado", assunto: "Boas-vindas, {{nome_contato}}!", documento: boasVindas },
    { id: "oferta-visual", nome: "Campanha comercial", categoria: "Vendas", descricao: "Oferta com CTA de destaque", assunto: "Uma oferta especial para {{nome_contato}}", documento: oferta },
    { id: "evento-visual", nome: "Convite para evento", categoria: "Eventos", descricao: "Convite com detalhes e confirmação", assunto: "{{nome_contato}}, você é nosso convidado", documento: evento },
    { id: "newsletter-visual", nome: "Newsletter", categoria: "Conteúdo", descricao: "Destaques e novidades", assunto: "Novidades para você, {{nome_contato}}", documento: newsletter },
  ];
}
