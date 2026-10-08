import {
  adicionarEtiquetaRotina,
} from "./runtime-acoes-etiqueta";
import {
  enviarMensagemRotina,
} from "./runtime-acoes-mensagem";
import {
  interromperFluxosAtivos,
  transferirConversaRotina,
} from "./runtime-acoes-transferencia";
import {
  enviarDisparoWhatsappRotina,
} from "./runtime-acoes-whatsapp";
import { enfileirarWebhookAutomacao } from "./webhook-outbox";

export type AcaoRotina = {
  id: string;
  automacao_id: string;
  ordem: number;
  tipo_acao: string;
  configuracao_json: Record<string, unknown> | null;
  ativo: boolean;
};

export function tituloAcaoRotina(tipo: string) {
  if (tipo === "fluxo.interromper") return "Interromper fluxo atual";
  if (tipo === "conversa.transferir_setor") return "Transferir conversa";
  if (tipo === "contato.adicionar_etiqueta") return "Adicionar etiqueta";
  if (tipo === "whatsapp.enviar_mensagem") return "Enviar mensagem";
  if (tipo === "whatsapp.enviar_template") return "Enviar disparo WhatsApp";
  if (tipo === "integracao.enviar_webhook") return "Enviar webhook HTTP";
  return tipo;
}

export async function executarAcaoRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  mensagemId?: string | null;
  evento?: string | null;
  acao: AcaoRotina;
}): Promise<Record<string, unknown>> {
  if (params.acao.tipo_acao === "fluxo.interromper") {
    return {
      interromper_fluxo_atual: true,
      ...(await interromperFluxosAtivos(params.empresaId, params.conversaId)),
    };
  }

  if (params.acao.tipo_acao === "conversa.transferir_setor") {
    return transferirConversaRotina({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      config: params.acao.configuracao_json || {},
    });
  }

  if (params.acao.tipo_acao === "contato.adicionar_etiqueta") {
    return adicionarEtiquetaRotina({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      config: params.acao.configuracao_json || {},
    });
  }

  if (params.acao.tipo_acao === "whatsapp.enviar_mensagem") {
    return enviarMensagemRotina({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      acaoId: params.acao.id,
      config: params.acao.configuracao_json || {},
    });
  }

  if (params.acao.tipo_acao === "whatsapp.enviar_template") {
    return enviarDisparoWhatsappRotina({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      acaoId: params.acao.id,
      config: params.acao.configuracao_json || {},
    });
  }

  if (params.acao.tipo_acao === "integracao.enviar_webhook") {
    return enfileirarWebhookAutomacao({
      empresaId: params.empresaId,
      conversaId: params.conversaId,
      automacaoId: params.automacaoId,
      execucaoId: params.execucaoId,
      acaoId: params.acao.id,
      mensagemId: params.mensagemId || null,
      evento: params.evento || "mensagem.recebida",
      config: params.acao.configuracao_json || {},
    });
  }

  throw new Error(
    `A ação ${params.acao.tipo_acao} ainda não possui executor para mensagem recebida.`,
  );
}
