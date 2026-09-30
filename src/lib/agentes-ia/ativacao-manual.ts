import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AutomationEngineInput } from "@/lib/automacoes/types";
import {
  cancelarFluxosConversacionaisAtivos,
  despacharMensagemParaAgente,
} from "./dispatch";
import { marcarConversaComoAtendimentoAgente } from "./estado-atendimento-conversa";

const supabaseAdmin = getSupabaseAdmin();

type ConversaAtivacaoManual = {
  id: string;
  empresa_id: string;
  contato_id: string;
  integracao_whatsapp_id?: string | null;
  status?: string | null;
  bot_ativo?: boolean | null;
  agente_ia_id?: string | null;
};

type AgenteManual = {
  id: string;
  nome: string;
  debounce_ms?: number | null;
  integracoes_whatsapp_ids?: string[] | null;
  created_at?: string | null;
};

function mensagemTipoAutomacao(tipo: string | null | undefined): AutomationEngineInput["mensagemTipo"] {
  const normalizado = String(tipo || "").toLowerCase();
  if (["imagem", "documento", "audio", "video"].includes(normalizado)) {
    return normalizado as AutomationEngineInput["mensagemTipo"];
  }
  return "texto";
}

function metadataObjeto(valor: unknown) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

async function selecionarAgente(params: {
  empresaId: string;
  integracaoId?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("agentes_ia")
    .select("id, nome, debounce_ms, integracoes_whatsapp_ids, created_at")
    .eq("empresa_id", params.empresaId)
    .eq("status", "ativo")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const agentes = (data || []) as AgenteManual[];
  const integracaoId = String(params.integracaoId || "").trim();

  const exatos = agentes.filter((agente) =>
    Array.isArray(agente.integracoes_whatsapp_ids) &&
    integracaoId &&
    agente.integracoes_whatsapp_ids.includes(integracaoId)
  );
  if (exatos.length) return exatos[0];

  return (
    agentes.find(
      (agente) =>
        !Array.isArray(agente.integracoes_whatsapp_ids) ||
        agente.integracoes_whatsapp_ids.length === 0
    ) || null
  );
}

async function protocoloAtivo(empresaId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id || null;
}

export async function ativarAgenteIaManualmente(params: {
  conversa: ConversaAtivacaoManual;
  usuarioId: string;
}) {
  const agente = await selecionarAgente({
    empresaId: params.conversa.empresa_id,
    integracaoId: params.conversa.integracao_whatsapp_id || null,
  });

  if (!agente) {
    return {
      ok: false as const,
      motivo: "agente_nao_configurado",
      error: "Nenhum agente de IA ativo está configurado para esta integração.",
    };
  }

  const [{ data: contato, error: contatoError }, { data: ultimaMensagem, error: mensagemError }] =
    await Promise.all([
      supabaseAdmin
        .from("contatos")
        .select("id, telefone")
        .eq("empresa_id", params.conversa.empresa_id)
        .eq("id", params.conversa.contato_id)
        .maybeSingle(),
      supabaseAdmin
        .from("mensagens")
        .select("id, remetente_tipo, conteudo, tipo_mensagem, metadata_json, created_at")
        .eq("empresa_id", params.conversa.empresa_id)
        .eq("conversa_id", params.conversa.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (contatoError) throw new Error(contatoError.message);
  if (mensagemError) throw new Error(mensagemError.message);
  if (!contato?.telefone) {
    throw new Error("Contato da conversa não encontrado.");
  }

  const agora = new Date().toISOString();

  if (ultimaMensagem?.id) {
    const metadataAtual = metadataObjeto(ultimaMensagem.metadata_json);
    const { error: marcadorError } = await supabaseAdmin
      .from("mensagens")
      .update({
        metadata_json: {
          ...metadataAtual,
          agente_ia_ativacao_manual: {
            agente_id: agente.id,
            ativado_em: agora,
            ativado_por_usuario_id: params.usuarioId,
            contexto_completo: true,
            sem_apresentacao: true,
          },
        },
      })
      .eq("empresa_id", params.conversa.empresa_id)
      .eq("id", ultimaMensagem.id);

    if (marcadorError) throw new Error(marcadorError.message);
  }

  const ultimaEhDoContato = ultimaMensagem?.remetente_tipo === "contato";

  if (ultimaEhDoContato && ultimaMensagem?.id) {
    const texto =
      String(ultimaMensagem.conteudo || "").trim() || "mensagem recebida";

    const despacho = await despacharMensagemParaAgente({
      input: {
        empresaId: params.conversa.empresa_id,
        conversaId: params.conversa.id,
        contatoId: params.conversa.contato_id,
        numeroDestino: contato.telefone,
        integracaoWhatsappId: params.conversa.integracao_whatsapp_id || null,
        mensagemId: ultimaMensagem.id,
        mensagemTexto: texto,
        mensagemTipo: mensagemTipoAutomacao(ultimaMensagem.tipo_mensagem),
      },
      agente,
      contatoId: params.conversa.contato_id,
      ignorarHorario: true,
    });

    return {
      ok: true as const,
      agente,
      respondeuAgora: Boolean(despacho),
      despacho,
    };
  }

  await cancelarFluxosConversacionaisAtivos(
    params.conversa.empresa_id,
    params.conversa.id
  );

  await marcarConversaComoAtendimentoAgente({
    empresaId: params.conversa.empresa_id,
    conversaId: params.conversa.id,
    agenteId: agente.id,
    protocoloId: await protocoloAtivo(
      params.conversa.empresa_id,
      params.conversa.id
    ),
  });

  return {
    ok: true as const,
    agente,
    respondeuAgora: false,
    despacho: null,
  };
}
