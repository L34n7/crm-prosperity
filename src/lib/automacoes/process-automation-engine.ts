import { interpretarDataHorarioAgenda } from "@/lib/agendas/agenda-service";
import { processarMensagemRecebidaRotinas } from "@/lib/rotinas-automacao/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { interceptarMensagemAgenteIa } from "@/lib/agentes-ia/runtime";
import { conversaEstaComHumano } from "@/lib/agentes-ia/estado-atendimento-conversa";
import { automacoesContatoEstaoDesabilitadas } from "@/lib/contatos/automacoes";
import { buscarBloqueioLimiteServiceConversa } from "@/lib/whatsapp/service-quota";
import {
  executarNo as executarNoCore,
  processAutomationEngine as processAutomationEngineAgenda,
  processarFilaProcessamentoAutoPorId as processarFilaProcessamentoAutoPorIdBase,
  processarTimeoutSemRespostaAgendado as processarTimeoutSemRespostaAgendadoBase,
} from "./process-automation-engine-agenda";
import { continuarConsultasEstoqueAutomacao } from "./process-automation-engine-estoque-runtime";
import {
  continuarCheckoutPagamentoAutomacao,
  interceptarMensagemCheckoutPendente,
} from "./process-automation-engine-checkout-runtime";
import { aplicarTipoAgendamentoFluxo } from "./aplicar-tipo-agendamento-fluxo";
import { processarIntencoesMensagem } from "./intencoes-runtime";
import {
  acordarArbitragensHibridasPendentes,
  deferirMensagemSeFluxoRodando,
  processarJobArbitragemHibrida,
} from "./arbitragem-hibrida-fila";
import {
  finalizarAgendamentoHorarioFluxo,
  interceptarMensagemForaHorarioFluxo,
  listarAgendamentosHorarioFl¶»§q«^