export const LEONARDO_PROSPERITY_ID = "512da872-07df-49b6-87fe-dfec84c271c6";

export type MensagemRecebidaParaTeste = {
  id: string;
  mensagem_externa_id?: string | null;
  conteudo?: string | null;
  created_at?: string | null;
};

const RESPOSTA_SEM_TRIAL =
  "Posso te mostrar o CRM em funcionamento e esclarecer suas dúvidas antes de contratar. Qual recurso você quer conhecer melhor?";

function normalizar(texto: unknown): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Não confundir solicitação de acesso ao CRM com teste de disparo, template ou integração. */
export function clientePediuTesteDoCrm(texto: unknown): boolean {
  const valor = normalizar(texto);
  if (!valor || valor.length > 900) return false;
  if (/\b(?:nao|nunca|nem)\s+(?:quero|preciso|vou|pretendo|gostaria|desejo|posso)\b.{0,32}\b(?:teste|testar|experimentar)\b/.test(valor)) return false;
  if (/\b(?:teste|testar|testando|testei)\s+(?:de|do|da|dos|das|um|uma|o|a)?\s*(?:disparos?|campanhas?|mensagens?|templates?|webhooks?|integracoes?|api|numeros?|envios?|audios?|imagens?|notificacoes?|conexoes?)\b/.test(valor) &&
      !/\b(?:crm|sistema|plataforma|plano|gratuito|gratis|4 dias)\b/.test(valor)) return false;

  return [
    /\b(?:quero|queria|gostaria|preciso|desejo|pretendo|vou)\b.{0,65}\b(?:testar|experimentar|fazer (?:um |o )?teste|um teste|teste gratis|teste gratuito|periodo de teste|periodo de avaliacao)\b/,
    /\b(?:posso|consigo|poderia|pode|consegue|tem como|da pra|como (?:eu )?(?:faco|posso|consigo))\b.{0,70}\b(?:testar|experimentar|fazer (?:um |o )?teste|(?:um |o )?teste|ter (?:um |o )?teste|acessar (?:o |um )?teste)\b/,
    /\b(?:manda|mandar|envia|enviar|envie|passa|libera|liberar|receber|obter|pegar|solicito)\b.{0,65}\b(?:link (?:do |de )?teste|acesso (?:ao |de |do )?teste|teste (?:gratis|gratuito|de 4 dias)|trial|periodo de teste)\b/,
    /\b(?:tem|existe|oferecem|disponibilizam)\b.{0,45}\b(?:teste gratis|teste gratuito|trial|periodo de teste|teste de 4 dias)\b/,
    /\b(?:teste|trial)\b.{0,18}\b(?:pode (?:me )?enviar|me manda|me libera)\b/,
  ].some((padrao) => padrao.test(valor));
}

/** Não esconder a disponibilidade normal de vídeos de demonstração ou teste técnico de envio. */
export function pareceOfertaDoTrial(texto: unknown): boolean {
  const original = String(texto || "");
  const valor = normalizar(original);
  return (
    /(?:oferta=trial4d|\btrial4d\b)/i.test(original) ||
    /\b(?:teste|trial|avaliacao)\b.{0,48}\b(?:4 dias|quatro dias|gratis|gratuito|disponivel|liberado|ativado)\b/.test(valor) ||
    /\b(?:4 dias|quatro dias)\b.{0,48}\b(?:teste|trial|avaliacao|experimentar|testar)\b/.test(valor) ||
    /\b(?:pode|consegue|vai|podera)\s+testar\s+(?:o |a |nosso |nossa )?(?:crm|plano|sistema|plataforma)\b/.test(valor) ||
    /\b(?:experimente|teste)\s+(?:o |a )?(?:crm|sistema|plataforma)\s+(?:gratis|gratuitamente|antes de pagar)\b/.test(valor)
  );
}

/** Um único ID Meta representa uma mensagem, mesmo se o webhook for entregue novamente. */
export function contarPedidosDistintosTeste(mensagens: readonly MensagemRecebidaParaTeste[]): number {
  const porId = new Map<string, MensagemRecebidaParaTeste>();
  for (const item of mensagens) {
    const id = String(item.mensagem_externa_id || "").trim() || String(item.id || "").trim();
    if (!id) continue;
    const anterior = porId.get(id);
    if (!anterior || String(item.conteudo || "").trim().length > String(anterior.conteudo || "").trim().length) {
      porId.set(id, item);
    }
  }
  return Array.from(porId.values()).filter((m) => clientePediuTesteDoCrm(m.conteudo)).length;
}

export function protegerOfertaTesteLeonardo(params: {
  agenteId: string;
  mensagens: readonly string[];
  mensagensRecebidas: readonly MensagemRecebidaParaTeste[];
  ultimaMensagemDoContato: string;
}): string[] {
  const mensagens = [...params.mensagens];
  if (params.agenteId !== LEONARDO_PROSPERITY_ID || !mensagens.some(pareceOfertaDoTrial)) return mensagens;
  const pedidos = contarPedidosDistintosTeste(params.mensagensRecebidas);
  const terceiroPedidoAtual = clientePediuTesteDoCrm(params.ultimaMensagemDoContato);
  if (pedidos >= 3 && terceiroPedidoAtual) return mensagens;
  const outras = mensagens.filter((mensagem) => !pareceOfertaDoTrial(mensagem));
  return outras.length ? outras : [RESPOSTA_SEM_TRIAL];
}
