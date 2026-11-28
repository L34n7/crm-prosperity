import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarIntegracaoInstagram, enviarMensagemInstagram, podeAcessarInstagram } from "@/lib/instagram/config";
import { verificarJanelaInstagram } from "@/lib/instagram/janela-mensagens";

export async function enviarAtendimentoInstagram(params: {
  empresaId: string;
  conversaId: string;
  contatoId: string;
  integracaoId: string;
  remetenteId: string;
  conteudo: string;
}) {
  if (!podeAcessarInstagram(params.empresaId)) {
    return { ok: false as const, status: 403, error: "Instagram não disponível para esta empresa." };
  }
  const db = getSupabaseAdmin();
  const integracao = await buscarIntegracaoInstagram(params.integracaoId, params.empresaId);
  if (!integracao || integracao.status !== "ativa") {
    return { ok: false as const, status: 400, error: "Instagram não está conectado." };
  }
  const { data: destino, error: destinoError } = await db.from("instagram_contatos")
    .select("instagram_sender_id")
    .eq("empresa_id", params.empresaId)
    .eq("contato_id", params.contatoId)
    .eq("integracao_instagram_id", params.integracaoId)
    .maybeSingle();
  if (destinoError || !destino?.instagram_sender_id) {
    return { ok: false as const, status: 400, error: "Destinatário do Instagram não encontrado." };
  }
  const janela = await verificarJanelaInstagram(params.conversaId);
  if (!janela.podeEnviarMensagemLivre) {
    return { ok: false as const, status: 400, error: janela.motivoBloqueio || "Janela Instagram expirada." };
  }
  const { data: protocolo, error: protocoloError } = await db.from("conversa_protocolos")
    .select("id")
    .eq("conversa_id", params.conversaId).eq("empresa_id", params.empresaId)
    .eq("ativo", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (protocoloError || !protocolo) {
    return { ok: false as const, status: 400, error: "Não foi encontrado protocolo ativo na conversa." };
  }

  let mid: string;
  try {
    mid = await enviarMensagemInstagram({
      integracao,
      destinatario: destino.instagram_sender_id,
      texto: params.conteudo,
    });
  } catch (error) {
    return { ok: false as const, status: 502,
      error: error instanceof Error ? error.message : "Não foi possível enviar o Direct." };
  }
  const { data: mensagem, error: salvarError } = await db.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    conversa_protocolo_id: protocolo.id,
    remetente_tipo: "usuario",
    remetente_id: params.remetenteId,
    conteudo: params.conteudo,
    tipo_mensagem: "texto",
    origem: "enviada",
    status_envio: "enviada",
    mensagem_externa_id: mid,
    metadata_json: { instagram: { integracao_id: params.integracaoId, destinatario: destino.instagram_sender_id } }
  }).select("*").single();
  if (salvarError) {
    console.error("[INSTAGRAM] Envio confirmado pela Meta sem persistência:", { conversaId: params.conversaId, mid, error: salvarError.message });
    return { ok: false as const, status: 500, error: "Direct enviado, mas não foi possível registrar no CRM. Atualize a conversa antes de tentar novamente." };
  }
  await db.from("conversas").update({ last_message_at: new Date().toISOString() })
    .eq("id", params.conversaId).eq("empresa_id", params.empresaId);
  return { ok: true as const, mensagem };
}
