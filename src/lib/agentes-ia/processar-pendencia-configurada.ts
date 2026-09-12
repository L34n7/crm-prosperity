import { assumirConversaParaPendenciaAgenteIa } from "./estado-atendimento-conversa";
import { processarPoliticaHorarioAtendimento } from "./politica-horario-atendimento";
import { processarPoliticaAgendaPendencia } from "./politica-agenda";
import { processarPendenciaAgenteIa as processarPendenciaAgenteIaCore } from "./processar-pendencia-configurada-core";

export async function processarPendenciaAgenteIa(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
) {
  const politicaHorario = await processarPoliticaHorarioAtendimento(pendenciaId);
  if (politicaHorario.tratado) {
    return politicaHorario.resultado || {
      ok: true,
      processado: false,
      runtime: "politica_horario_atendimento",
    };
  }

  const politicaAgenda = await processarPoliticaAgendaPendencia(pendenciaId, options);
  if (politicaAgenda.tratado) {
    return politicaAgenda.resultado || {
      ok: true,
      processado: true,
      runtime: "politica_agenda",
    };
  }

  // Quando uma pendência agendada vence, uma conversa em `fila` só pode ser
  // assumida pela IA se não estiver realmente aguardando atendimento humano.
  // O update é protegido por estado para não atropelar transferência para setor
  // nem um atendente que tenha assumido a conversa no intervalo.
  await assumirConversaParaPendenciaAgenteIa(pendenciaId);

  return processarPendenciaAgenteIaCore(pendenciaId, options);
}
