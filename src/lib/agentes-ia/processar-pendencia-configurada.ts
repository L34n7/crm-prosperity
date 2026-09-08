import { processarPoliticaAgendaPendencia } from "./politica-agenda";
import { processarPendenciaAgenteIa as processarPendenciaAgenteIaCore } from "./processar-pendencia-configurada-core";

export async function processarPendenciaAgenteIa(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
) {
  const politicaAgenda = await processarPoliticaAgendaPendencia(pendenciaId, options);
  if (politicaAgenda.tratado) {
    return politicaAgenda.resultado || {
      ok: true,
      processado: true,
      runtime: "politica_agenda",
    };
  }

  return processarPendenciaAgenteIaCore(pendenciaId, options);
}
