import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  LEONARDO_PROSPERITY_ID,
  pareceOfertaDoTrial,
  protegerOfertaTesteLeonardo,
  type MensagemRecebidaParaTeste,
} from "./protecao-teste-prosperity";

/** Barreira adicional de saída do Leonardo; não depende da memória ou do julgamento do LLM. */
export async function aplicarProtecaoTesteLeonardo(params: {
  agenteId: string;
  empresaId: string;
  conversaId: string;
  mensagens: readonly string[];
  ultimaMensagemDoContato?: string | null;
}): Promise<string[]> {
  const mensagens = [...params.mensagens];
  if (params.agenteId !== LEONARDO_PROSPERITY_ID || !mensagens.some(pareceOfertaDoTrial)) return mensagens;

  const { data, error } = await getSupabaseAdmin()
    .from("mensagens")
    .select("id, mensagem_externa_id, conteudo, created_at")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("remetente_tipo", "contato")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("[AGENTE_IA] Falha ao conferir pedidos de teste do cliente:", error);
    return protegerOfertaTesteLeonardo({
      agenteId: params.agenteId,
      mensagens,
      mensagensRecebidas: [],
      ultimaMensagemDoContato: "",
    });
  }

  const recebidas = (data || []) as MensagemRecebidaParaTeste[];
  return protegerOfertaTesteLeonardo({
    agenteId: params.agenteId,
    mensagens,
    mensagensRecebidas: recebidas,
    // Em follow-ups não existe pedido atual do cliente: jamais liberar o trial automaticamente.
    ultimaMensagemDoContato: params.ultimaMensagemDoContato || "",
  });
}
