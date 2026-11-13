import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { automacoesEmpresaEstaoBloqueadas } from "@/lib/assinaturas/bloqueio-operacional";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppMediaMessage } from "@/lib/whatsapp/send-media-message";
import { publicarMensagemEnviadaRegistrada } from "@/lib/rotinas-automacao/mensagem-enviada-dispatch";

const supabase = getSupabaseAdmin();

type TipoMensagem = "imagem" | "audio" | "video" | "documento";

type Parametros = {
  empresaId: string;
  agenteId: string;
  conversaId: string;
  execucaoId: string;
  midiaId: string;
  numeroDestino: string;
  reenviar: boolean;
};

export async function enviarMaterialDoAgente(params: Parametros) {
  const empresaId = params.empresaId;
  const conversaId = params.conversaId;
  const [midiaConsulta, conversaConsulta] = await Promise.all([
    supabase.from("midias")
      .select("id,nome,tipo,url,mime_type")
      .eq("empresa_id", empresaId)
      .eq("id", params.midiaId)
      .maybeSingle(),
    supabase.from("conversas")
      .select("id,integracao_whatsapp_id")
      .eq("empresa_id", empresaId)
      .eq("id", conversaId)
      .maybeSingle(),
  ]);
  if (midiaConsulta.error) throw new Error(midiaConsulta.error.message);
  if (conversaConsulta.error) throw new Error(conversaConsulta.error.message);
  const midia = midiaConsulta.data;
  const conversa = conversaConsulta.data;
  if (!midia?.url || !["imagem", "video", "audio", "arquivo"].includes(midia.tipo)) {
    return { ok: false, error: "Material indisponível na biblioteca desta empresa." };
  }
  if (!conversa?.integracao_whatsapp_id) {
    return { ok: false, error: "Conversa sem integração WhatsApp válida." };
  }

  // Evita reenviar o mesmo arquivo por reformulação ou nova rodada da IA.
  // A repetição só é autorizada quando o cliente pede explicitamente reenvio.
  if (!params.reenviar) {
    // Permite uma redefinição pontual do intervalo para testes autorizados,
    // sem alterar ou apagar o histórico do WhatsApp. A configuração é por
    // empresa E agente; após 30 minutos o valor deixa de ter efeito.
    const { data: ferramenta, error: erroFerramenta } = await supabase
      .from("agente_ia_ferramentas")
      .select("config_json")
      .eq("empresa_id", empresaId)
      .eq("agente_id", params.agenteId)
      .eq("tipo", "enviar_material")
      .maybeSingle();
    if (erroFerramenta) throw new Error(erroFerramenta.message);
    const agoraMs = Date.now();
    const janelaOriginal = agoraMs - 30 * 60 * 1000;
    const resetMs = Date.parse(
      String(ferramenta?.config_json?.material_dedup_reset_at || "")
    );
    const inicioJanela = Number.isFinite(resetMs) && resetMs <= agoraMs
      ? Math.max(janelaOriginal, resetMs)
      : janelaOriginal;
    const desde = new Date(inicioJanela).toISOString();
    const { data: anterior, error: erroAnterior } = await supabase
      .from("mensagens")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .gte("created_at", desde)
      .in("status_envio", ["enviada", "entregue", "lida"])
      .contains("metadata_json", {
        origem: "agente_ia_material",
        material_id: params.midiaId,
      })
      .limit(1)
      .maybeSingle();
    if (erroAnterior) throw new Error(erroAnterior.message);
    if (anterior) {
      return { ok: true, ja_enviado: true, nome: midia.nome, tipo: midia.tipo };
    }
  }

  const { data: integracao, error: erroIntegracao } = await supabase
    .from("integracoes_whatsapp")
    .select("id,phone_number_id,token_ref,config_json")
    .eq("empresa_id", empresaId)
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();
  if (erroIntegracao) throw new Error(erroIntegracao.message);
  if (!integracao?.phone_number_id) {
    return { ok: false, error: "Integração WhatsApp indisponível." };
  }
  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) {
    return { ok: false, error: "Token do WhatsApp indisponível." };
  }
  if (await automacoesEmpresaEstaoBloqueadas(empresaId)) {
    return { ok: false, error: "Envio bloqueado pela assinatura da empresa." };
  }

  const tipoMensagem = (midia.tipo === "arquivo" ? "documento" : midia.tipo) as TipoMensagem;
  const envio = await sendWhatsAppMediaMessage({
    phoneNumberId: integracao.phone_number_id,
    accessToken,
    to: params.numeroDestino,
    tipoMensagem,
    mediaUrl: midia.url,
    fileName: tipoMensagem === "documento" ? midia.nome : null,
  });
  const { data: protocolo } = await supabase
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const agora = new Date().toISOString();
  const { data: mensagem, error: erroMensagem } = await supabase
    .from("mensagens")
    .insert({
      empresa_id: empresaId,
      conversa_id: conversaId,
      conversa_protocolo_id: protocolo?.id || null,
      remetente_tipo: "bot",
      remetente_id: null,
      conteudo: midia.nome || "Material enviado pelo agente",
      tipo_mensagem: tipoMensagem,
      origem: "automatica",
      status_envio: envio.ok ? "enviada" : "falha",
      mensagem_externa_id: envio.messageId,
      metadata_json: {
        origem: "agente_ia_material",
        agente_id: params.agenteId,
        agente_execucao_id: params.execucaoId,
        material_id: midia.id,
        media_id: midia.id,
        media_nome: midia.nome,
        media_url: midia.url,
        mime_type: midia.mime_type,
        meta_status: envio.status,
        meta_error: envio.error,
      },
      created_at: agora,
      updated_at: agora,
    })
    .select("id")
    .maybeSingle();
  if (erroMensagem) {
    console.error("[AGENTE_IA_MATERIAL] Falha ao registrar mensagem:", erroMensagem);
  }
  if (!envio.ok) {
    return { ok: false, error: envio.error || "Falha ao enviar o material.", status: envio.status };
  }
  if (mensagem?.id) {
    await publicarMensagemEnviadaRegistrada({
      empresaId, conversaId, mensagemId: mensagem.id,
    });
  }
  await supabase.from("conversas")
    .update({ last_message_at: agora, updated_at: agora })
    .eq("empresa_id", empresaId)
    .eq("id", conversaId);
  return {
    ok: true,
    enviado: true,
    material_id: midia.id,
    nome: midia.nome,
    tipo: midia.tipo,
    registro_historico: Boolean(mensagem?.id),
  };
}
