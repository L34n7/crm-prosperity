import { normalizarMateriais } from "./materiais-config";

export type ConfigCotacaoPorLink = {
  ativo: true;
  mensagem: string;
  conhecimento_id: string | null;
};

function normalizarTexto(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Fluxo opt-in por agente: não afeta as demais ferramentas nem cotações. */
export function configuracaoCotacaoPorLink(valor: unknown): ConfigCotacaoPorLink | null {
  if (!valor || typeof valor !== "object") return null;
  const config = valor as Record<string, unknown>;
  const mensagem = typeof config.mensagem === "string" ? config.mensagem.trim() : "";
  if (config.ativo !== true || mensagem.length < 20 || mensagem.length > 900) return null;
  if (!/https:\/\/\S+/.test(mensagem)) return null;
  const id=typeof config.conhecimento_id==="string"?config.conhecimento_id.trim():"";
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return { ativo: true, mensagem, conhecimento_id:uuid.test(id)?id:null };
}

/** Detecta pedido comercial; não antecipa links em dúvidas de assistência. */
export function solicitouCotacaoPorLink(mensagem: string): boolean {
  const texto = normalizarTexto(mensagem).slice(0, 1800);
  if (!texto || /\b(nao quero|nao preciso|cancela|cancelar|desistir)\b.{0,32}\b(cotacao|cotar|orcamento|simulacao)\b/.test(texto))
    return false;
  if (/\b(cotacao|cotar|cote|orcamento|orcar|simulacao|simular)\b/.test(texto))
    return true;
  if (/\b(quero|preciso|gostaria|pode|manda|envia|me passe|tem)\b.{0,65}\b(link|endereco|site)\b.{0,45}\b(cotar|cotacao|orcamento|protecao|seguro)\b/.test(texto))
    return true;
  if (/\b(link|endereco|site)\b.{0,45}\b(cotar|cotacao|orcamento|protecao|seguro)\b/.test(texto))
    return true;
  if (/\b(preco|valor|quanto custa|quanto fica|mensalidade)\b.{0,75}\b(protecao|seguro|veiculo|carro|moto|caminhao)\b/.test(texto))
    return true;
  if (/\b(protecao|seguro)\b.{0,50}\b(carro|moto|veiculo|caminhao)\b/.test(texto) &&
      /\b(quero|preciso|gostaria|contratar|fazer|solicitar)\b/.test(texto))
    return true;
  return false;
}

/** Somente materiais vinculados ao envio depois do link entram no
 * fluxo. A origem é o conhecimento configurado por agente; para agentes
 * antigos sem conhecimento_id, a ferramenta permanece como fallback.
 */
export function materiaisAposLink(valor: unknown): string[] {
  return normalizarMateriais(valor)
    .filter(item => {
      const regra = normalizarTexto(item.quando_enviar);
      return /\b(apos|depois|em seguida)\b/.test(regra)
        && /\blink\b/.test(regra)
        && /\b(cotacao|cotar|orcamento)\b/.test(regra);
    })
    .slice(0, 3)
    .map(item => item.midia_id);
}
