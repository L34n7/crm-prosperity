import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { automacoesContatoEstaoDesabilitadas } from "@/lib/contatos/automacoes";
import { buscarBloqueioLimiteServiceConversa } from "@/lib/whatsapp/service-quota";
import { assumirConversaParaPendenciaAgenteIa } from "./estado-atendimento-conversa";
import { processarPoliticaHorarioAtendimento } from "./politica-horario-atendimento";
import { processarPoliticaAgendaPendencia } from "./politica-agenda";
import { processarPendenciaAgenteIa as processarPendenciaAgenteIaCore } from "./processar-pendencia-configurada-core";

export async function processarPendenciaAgenteIa(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: pendencia } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select("empresa_id, conversa_id, contato_id")
    .eq("id", pendenciaId)
    .maybeSingle();

  if (pendencia?.empresa_id && pendencia?.conversa_id) {
    const automacoesDesabilitadas = await automacoesContatoEstaoDesabilitadas({
      empresaId: pendencia.empresa_id,
      contatoId: pendencia.contato_id || null,
      conversaId: pendencia.conversa_id,
    });

    if (automacoesDesabilitadas) {
      await supabaseAdmin
        .from("agente_ia_pendencias")
        .update({
          status: "cancelado",
          erro: "AutomaÃ§Ãµes desabilitadas para o contato.",
          lock_token: null,
          locked_at: null,
          updated_at: new Date().toIS¶»§q«^