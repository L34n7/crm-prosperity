import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const variablesMarker = "CRM_AGENDA_RESPONSE_VARIABLES_PERSIST_V1";
const chatMarker = "CRM_AGENDA_TEMPLATE_CHAT_MESSAGE_V1";

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

const responseRuntimePath = "src/lib/agendas/agenda-response-runtime.ts";
let responseRuntime = read(responseRuntimePath);

if (!responseRuntime.includes(variablesMarker)) {
  const executionStart = `  await executarNo({\n    empresaId: job.empresa_id,`;
  const persistVariables = `  // ${variablesMarker}\n  const variableRows = Object.entries(variables).map(([chave, valor]) => ({\n    empresa_id: job.empresa_id,\n    execucao_id: execution.id,\n    contato_id: appointment.contato_id,\n    chave,\n    valor: String(valor ?? ""),\n    metadata_json: {\n      origem: "agenda_resposta_whatsapp",\n      agenda_automacao_resposta_id: job.id,\n      agenda_agendamento_id: appointment.id,\n    },\n    updated_at: new Date().toISOString(),\n  }));\n\n  const { error: variablesError } = await supabase\n    .from("automacao_variaveis")\n    .upsert(variableRows, {\n      onConflict: "empresa_id,execucao_id,chave",\n    });\n  if (variablesError) {\n    throw new Error(\n      \`Erro ao persistir variáveis do fluxo do calendário: \${variablesError.message}\`\n    );\n  }\n\n${executionStart}`;

  responseRuntime = replaceRequired(
    responseRuntime,
    executionStart,
    persistVariables,
    "persistência das variáveis do fluxo iniciado pelo calendário"
  );
}

write(responseRuntimePath, responseRuntime);

const whatsappRuntimePath = "src/lib/agendas/automation-runtime-whatsapp.ts";
let whatsappRuntime = read(whatsappRuntimePath);

if (!whatsappRuntime.includes(chatMarker)) {
  const supabaseDeclaration = `const supabase = getSupabaseAdmin();`;
  const renderer = `const supabase = getSupabaseAdmin();\n\n// ${chatMarker}\nfunction renderTemplateMessage(\n  context: Context,\n  variablesSnapshot: Record<string, string>\n) {\n  const components = Array.isArray(context.template?.payload?.components)\n    ? context.template.payload.components\n    : [];\n\n  const replaceVariables = (value: unknown) =>\n    String(value || "").replace(/{{\\s*(\\d+)\\s*}}/g, (_, position) =>\n      Object.prototype.hasOwnProperty.call(variablesSnapshot, String(position))\n        ? variablesSnapshot[String(position)]\n        : \`{{\${position}}}\`\n    );\n\n  const parts = components.flatMap((component: Record<string, any>) => {\n    const type = String(component?.type || "").toUpperCase();\n    if (!["HEADER", "BODY", "FOOTER"].includes(type)) return [];\n    const text = replaceVariables(component?.text).trim();\n    return text ? [text] : [];\n  });\n\n  return parts.join("\\n\\n") || humanText(context);\n}`;

  whatsappRuntime = replaceRequired(
    whatsappRuntime,
    supabaseDeclaration,
    renderer,
    "renderização do template no histórico da conversa"
  );

  whatsappRuntime = replaceRequired(
    whatsappRuntime,
    `    remetente_tipo: "sistema",\n    remetente_id: null,\n    conteudo: humanText(context),\n    tipo_mensagem: "template",`,
    `    remetente_tipo: "bot",\n    remetente_id: null,\n    conteudo: renderTemplateMessage(context, variablesSnapshot),\n    tipo_mensagem: "template",`,
    "exibição do disparo como mensagem automática do bot"
  );
}

write(whatsappRuntimePath, whatsappRuntime);

console.log(
  "Variáveis dos fluxos e mensagens dos templates do calendário corrigidas."
);
