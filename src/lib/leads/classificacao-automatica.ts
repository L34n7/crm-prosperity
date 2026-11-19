import type { ClassificacaoLead } from "@/lib/leads/classificacao";

export type DecisaoClassificacao = {
  classificacao: ClassificacaoLead | null;
  motivo: string;
  valorConversao: number | null;
  origem: "regra" | "ia";
};

function normalizar(texto: string) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function extrairValorConversao(texto: string): number | null {
  const encontrado = texto.match(/(?:r\$\s*|brl\s*)(\d+(?:\.\d{3})*(?:,\d{1,2})?)/i);
  if (!encontrado) return null;
  const numero = Number(encontrado[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 && numero <= 999999999 ? numero : null;
}

/** Somente evidências comerciais explícitas. Na dúvida, retorna null para a análise contextual. */
export function classificarMensagemPorRegras(textoOriginal: string): DecisaoClassificacao | null {
  const texto = normalizar(textoOriginal);
  if (!texto || texto.length > 3000) return null;

  // Negação e perguntas não são confirmação de compra.
  const compraNegada = /\b(nao|nunca|nem)\s+(?:comprei|contratei|paguei|assinei|cadastrei)\b/.test(texto);
  const perguntaSobreCompra = /(?:como|onde|quando|posso|consigo|quero|preciso|vou)\s+(?:comprar|contratar|pagar|assinar|me cadastrar)\b/.test(texto);
  const convertido =
    /\b(?:ja|acabei de)\s+(?:comprei|contratei|paguei|assinei|me cadastrei|finalizei o cadastro)\b/.test(texto) ||
    /^(?:pronto[,!. ]*|feito[,!. ]*|ok[,!. ]+)?(?:fiz|realizei|efetuei|conclui)\s+(?:o|a|meu|minha)?\s*(?:pagamento|compra|contratacao|assinatura|cadastro)\b/.test(texto) ||
    /^paguei(?:\s|[!.]|$)/.test(texto) ||
    /^contratei(?:\s|[!.]|$)/.test(texto);
  if (convertido && !compraNegada && !perguntaSobreCompra) {
    return {
      classificacao: "convertido",
      motivo: "Cliente informou que concluiu compra, contratação ou cadastro",
      valorConversao: extrairValorConversao(textoOriginal),
      origem: "regra",
    };
  }

  const perdido = /\b(?:nao tenho interesse|sem interesse|nao me interessa|desisti da compra|vou desistir da compra|nao vou comprar|nao vou contratar|nao quero comprar|nao quero contratar|nao quero mais receber mensagens|nao preciso desse servico|pode encerrar o atendimento|pode parar de enviar mensagens|nao tenho mais interesse)\b/.test(texto) ||
    /^(?:nao quero|nao preciso|nao, obrigado|nao obrigada|deixa pra la)[.! ]*$/.test(texto);
  if (perdido && !/\b(?:nao quero cancelar|nao quero desistir|nao quero perder)\b/.test(texto)) {
    return { classificacao: "perdido", motivo: "Cliente recusou explicitamente a oferta", valorConversao: null, origem: "regra" };
  }

  const qualificado =
    /\b(?:tenho interesse|estou interessado|estou interessada|me interessei|gostei da proposta|gostei do sistema|quero contratar|quero comprar|quero saber mais|me envie o link|me manda o link|pode enviar o link|qual o valor|qual e o valor|quanto custa|qual o preco|me passa o preco|me envie uma proposta|quero um orcamento|quero fazer um teste|como faco para contratar)\b/.test(texto);
  if (qualificado) {
    return { classificacao: "qualificado", motivo: "Cliente demonstrou interesse comercial", valorConversao: null, origem: "regra" };
  }

  // Saudações não precisam consumir tokens apenas para preservar o estágio atual.
  if (/^(?:oi+|ola+|bom dia|boa tarde|boa noite|alo|obrigad[oa]|valeu|tchau|ate logo)[.! ]*$/.test(texto)) {
    return { classificacao: null, motivo: "Mensagem neutra", valorConversao: null, origem: "regra" };
  }

  return null;
}

export function classificacaoBloqueiaFollowup(classificacao: string | null | undefined) {
  return classificacao === "convertido" || classificacao === "perdido";
}
