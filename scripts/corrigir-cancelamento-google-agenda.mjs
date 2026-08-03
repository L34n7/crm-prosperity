import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "CRM_GOOGLE_CANCEL_DELETE_PRIORITY_V1";

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceRequired(content, search, replacement, description) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) {
    throw new Error(`Não foi possível aplicar ${description}.`);
  }
  return content.replace(search, replacement);
}

function replaceSection(content, startToken, endToken, replacement, description) {
  const start = content.indexOf(startToken);
  const end = content.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0) {
    throw new Error(`Não foi possível localizar ${description}.`);
  }
  return content.slice(0, start) + replacement + content.slice(end);
}

let google = read("src/lib/agendas/google-calendar.ts");

if (!google.includes(marker)) {
  google = replaceRequired(
    google,
    "const TOLERANCIA_CONFLITO_MS = 2000;",
    `const TOLERANCIA_CONFLITO_MS = 2000; // ${marker}`,
    "marcador da correção do cancelamento Google"
  );

  const helper = `async function marcarEventoGoogleComoExcluido(params: {
  agendamento: Agendamento;
  vinculo: GoogleVinculo;
  origem: "crm" | "google";
  googleUpdatedAt?: string | null;
}) {
  const agora = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("agenda_google_eventos")
    .update({
      google_html_link: null,
      google_etag: null,
      google_updated_at: params.googleUpdatedAt || agora,
      crm_updated_at_snapshot: params.agendamento.updated_at || agora,
      google_updated_at_snapshot: params.googleUpdatedAt || agora,
      ultima_origem: params.origem,
      conflito_status: "sem_conflito",
      conflito_detalhes: null,
      last_synced_hash: hashAgendamento(params.agendamento),
      sync_status: "excluido",
      updated_at: agora,
    })
    .eq("id", params.vinculo.id);

  if (error) {
    throw new Error(\`Erro ao registrar exclusão do evento Google: \${error.message}\`);
  }
}

`;

  google = replaceRequired(
    google,
    "async function criarEventoGoogle(",
    helper + "async function criarEventoGoogle(",
    "registro seguro da exclusão no Google"
  );

  const syncStart = `  if (
    agendamento &&
    vinculo?.google_event_id &&
    !params.forcar &&
    vinculo.last_synced_hash === hashAgendamento(agendamento) &&`;
  const syncEnd = "  let evento: any;";
  const syncReplacement = `  if (!agendamento) {
    if (vinculo?.google_event_id) {
      await excluirEventoGoogle(integracao, vinculo.google_event_id);
      await supabase.from("agenda_google_eventos").delete().eq("id", vinculo.id);
    }
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", params.agendamentoId);
    return;
  }

  // Cancelamentos precisam ser processados antes da otimização por hash.
  // Assim, um vínculo sincronizado nunca impede a exclusão do evento remoto.
  if (agendamento.status === "cancelado") {
    if (vinculo?.google_event_id) {
      await excluirEventoGoogle(integracao, vinculo.google_event_id);
      await marcarEventoGoogleComoExcluido({
        agendamento,
        vinculo,
        origem: "crm",
      });
    }
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", agendamento.id);
    return;
  }

  if (
    vinculo?.google_event_id &&
    !params.forcar &&
    vinculo.last_synced_hash === hashAgendamento(agendamento) &&
    timestamp(vinculo.crm_updated_at_snapshot) + TOLERANCIA_CONFLITO_MS >=
      timestamp(agendamento.updated_at)
  ) {
    await supabase
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", agendamento.id);
    return;
  }

`;

  google = replaceSection(
    google,
    syncStart,
    syncEnd,
    syncReplacement,
    "prioridade do cancelamento antes do hash"
  );

  const inboundSearch = `  if (!agendamento) {
    await getSupabaseAdmin()
      .from("agenda_google_eventos")
      .delete()
      .eq("id", vinculo.id);
    return { cancelado: null, conflito: null };
  }

  const crmMudou =`;
  const inboundReplacement = `  if (!agendamento) {
    await getSupabaseAdmin()
      .from("agenda_google_eventos")
      .delete()
      .eq("id", vinculo.id);
    return { cancelado: null, conflito: null };
  }

  // Se o CRM já cancelou, o Google não pode restaurar ou manter o evento ativo.
  // A exclusão é repetida de forma idempotente quando uma sincronização de entrada
  // chega antes do processamento da fila de saída.
  if (agendamento.status === "cancelado") {
    if (evento.status !== "cancelled" && vinculo.google_event_id) {
      await excluirEventoGoogle(integracao, vinculo.google_event_id);
    }
    await marcarEventoGoogleComoExcluido({
      agendamento,
      vinculo,
      origem: "crm",
      googleUpdatedAt: evento.updated || null,
    });
    await getSupabaseAdmin()
      .from("agenda_google_sync_fila")
      .delete()
      .eq("agendamento_id", agendamento.id);
    return { cancelado: null, conflito: null };
  }

  const crmMudou =`;

  google = replaceRequired(
    google,
    inboundSearch,
    inboundReplacement,
    "proteção contra restauração pelo Google"
  );

  google = replaceRequired(
    google,
    `        agendamentoId: item.agendamento_id,
      });`,
    `        agendamentoId: item.agendamento_id,
        forcar: item.operacao === "delete",
      });`,
    "processamento explícito da operação de exclusão"
  );
}

write("src/lib/agendas/google-calendar.ts", google);

console.log(
  "Cancelamentos da agenda agora excluem o evento Google com prioridade e sem reimportação."
);
