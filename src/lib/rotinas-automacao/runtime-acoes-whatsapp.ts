import {
  montarMapaVariaveisFixasContato,
  normalizarChaveVariavelFluxo,
} from "@/lib/automacoes/variaveis-fixas-contato";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  enviarTemplateDisparo,
  type IntegracaoDisparo,
  type TemplateDisparo,
  type TemplatePayloadDisparo,
} from "@/lib/whatsapp/send-template-disparo";

const supabase = getSupabaseAdmin();

function contarVariaveisNoTexto(texto: unknown) {
  const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((numero) => Number.isFinite(numero));
  return numeros.length ? Math.max(...numeros) : 0;
}

function contarVariaveisTemplate(payload: TemplatePayloadDisparo | null) {
  const components = Array.isArray(payload?.components) ? payload.components : [];
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER",
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY",
  );
  const buttons = components.find(
    (item) => String(item.type || "").toUpperCase() === "BUTTONS",
  );

  let total = contarVariaveisNoTexto(header?.text) + contarVariaveisNoTexto(body?.text);
  for (const button of buttons?.buttons || []) {
    if (String(button?.type || "").toUpperCase() === "URL") {
      total += contarVariaveisNoTexto(button?.url);
    }
  }
  return total;
}

async function resolverVariaveisTemplateRotina(params: {
  empresaId: string;
  conversaId: string;
  contato: {
    nome?: string | null;
    whatsapp_profile_name?: string | null;
    email?: string | null;
    telefone?: string | null;
    campanha?: string | null;
    origem?: string | null;
    status_lead?: string | null;
    classificacao?: string | null;
  };
  configuradas: string[];
  total: number;
}) {
  if (params.total === 0) return [];
  if (params.configuradas.length < params.total) {
    throw new Error(
      `O template exige ${params.total} variável(is), mas a ação não possui todas configuradas.`,
    );
  }

  const chaves = params.configuradas.map((item) =>
    normalizarChaveVariavelFluxo(item),
  );
  const precisaProtocoloAtual = chaves.includes("protocolo_atual");
  const precisaUltimoProtocolo = chaves.includes("ultimo_protocolo");

  const [protocoloAtualResult, ultimoProtocoloResult, personalizadasResult] =
    await Promise.all([
      precisaProtocoloAtual
        ? supabase
            .from("conversa_protocolos")
            .select("protocolo")
            .eq("empresa_id", params.empresaId)
            .eq("conversa_id", params.conversaId)
            .eq("ativo", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      precisaUltimoProtocolo
        ? supabase
            .from("conversa_protocolos")
            .select("protocolo")
            .eq("empresa_id", params.empresaId)
            .eq("conversa_id", params.conversaId)
            .eq("ativo", false)
            .order("closed_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("automacao_variaveis")
        .select("chave,valor")
        .eq("empresa_id", params.empresaId)
        .is("execucao_id", null)
        .is("contato_id", null)
        .eq("metadata_json->>tipo", "global_empresa")
        .eq("metadata_json->>ativo", "true"),
    ]);

  if (protocoloAtualResult.error) throw protocoloAtualResult.error;
  if (ultimoProtocoloResult.error) throw ultimoProtocoloResult.error;
  if (personalizadasResult.error) throw personalizadasResult.error;

  const mapa = await montarMapaVariaveisFixasContato(params.contato, {
    protocolo_atual: String(protocoloAtualResult.data?.protocolo || ""),
    ultimo_protocolo: String(ultimoProtocoloResult.data?.protocolo || ""),
  });
  const personalizadas = new Map<string, string>();
  for (const variavel of personalizadasResult.data || []) {
    const chave = normalizarChaveVariavelFluxo(String(variavel.chave || ""));
    if (!chave) continue;
    personalizadas.set(chave, String(variavel.valor || ""));
  }

  const resolvidas = params.configuradas
    .slice(0, params.total)
    .map((configurada) => {
      const original = String(configurada || "").trim();
      const chave = normalizarChaveVariavelFluxo(original);
      if (!chave) return "";
      if (original.toLowerCase().startsWith("texto:")) {
        return original.slice(original.indexOf(":") + 1).trim();
      }
      return mapa.get(chave) || personalizadas.get(chave) || "";
    });

  const faltantes = resolvidas
    .map((valor, index) => ({ valor, index }))
    .filter((item) => !String(item.valor || "").trim())
    .map((item) => `Variável ${item.index + 1}`);
  if (faltantes.length) {
    throw new Error(
      `${faltantes.join(", ")} sem valor para o disparo WhatsApp.`,
    );
  }

  return resolvidas;
}

export async function enviarDisparoWhatsappRotina(params: {
  empresaId: string;
  conversaId: string;
  automacaoId: string;
  execucaoId: string;
  acaoId: string;
  config: Record<string, unknown>;
}) {
  const integracaoId = String(params.config.integracao_whatsapp_id || "").trim();
  const templateId = String(params.config.template_id || "").trim();
  const variaveisConfiguradas = Array.isArray(params.config.variaveis)
    ? params.config.variaveis.map((item) => String(item || "").trim())
    : [];

  if (!integracaoId) {
    throw new Error("O disparo WhatsApp precisa de uma integração.");
  }
  if (!templateId) {
    throw new Error("O disparo WhatsApp precisa de um template.");
  }

  const { data: conversa, error: conversaError } = await supabase
    .from("conversas")
    .select("id,contato_id,integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (conversaError) throw conversaError;
  if (!conversa) {
    throw new Error("Conversa não encontrada para o disparo WhatsApp.");
  }

  const integracaoConversaId = String(
    conversa.integracao_whatsapp_id || "",
  ).trim();
  if (integracaoConversaId !== integracaoId) {
    return {
      ignorada: true,
      motivo: "integracao_da_conversa_diferente_da_acao",
      integracao_configurada_id: integracaoId,
      integracao_conversa_id: integracaoConversaId || null,
    };
  }
  if (!conversa.contato_id) {
    throw new Error("A conversa não possui contato vinculado.");
  }

  const [contatoResult, templateResult, integracaoResult] = await Promise.all([
    supabase
      .from("contatos")
      .select(
        "id,nome,whatsapp_profile_name,email,telefone,campanha,origem,status_lead,classificacao",
      )
      .eq("empresa_id", params.empresaId)
      .eq("id", conversa.contato_id)
      .maybeSingle(),
    supabase
      .from("whatsapp_templates")
      .select(
        "id,nome,idioma,categoria,status,integracao_whatsapp_id,payload,opt_out_habilitado",
      )
      .eq("empresa_id", params.empresaId)
      .eq("id", templateId)
      .eq("integracao_whatsapp_id", integracaoId)
      .maybeSingle(),
    supabase
      .from("integracoes_whatsapp")
      .select("id,status,phone_number_id,token_ref,config_json")
      .eq("empresa_id", params.empresaId)
      .eq("id", integracaoId)
      .maybeSingle(),
  ]);

  if (contatoResult.error) throw contatoResult.error;
  if (templateResult.error) throw templateResult.error;
  if (integracaoResult.error) throw integracaoResult.error;

  const contato = contatoResult.data;
  const template = templateResult.data;
  const integracao = integracaoResult.data;
  if (!contato?.telefone) {
    throw new Error("Contato sem telefone válido para o disparo.");
  }
  if (!template) {
    throw new Error(
      "Template WhatsApp não encontrado para a integração selecionada.",
    );
  }
  if (String(template.status || "").toUpperCase() !== "APPROVED") {
    throw new Error("O template WhatsApp selecionado não está aprovado.");
  }
  if (!integracao || integracao.status !== "ativa") {
    throw new Error(
      "A integração WhatsApp do disparo está inativa ou não foi encontrada.",
    );
  }

  const payload = (template.payload || null) as TemplatePayloadDisparo | null;
  const totalVariaveis = contarVariaveisTemplate(payload);
  const variaveis = await resolverVariaveisTemplateRotina({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    contato,
    configuradas: variaveisConfiguradas,
    total: totalVariaveis,
  });

  const resultado = await enviarTemplateDisparo({
    empresaId: params.empresaId,
    integracaoWhatsappId: integracaoId,
    usuarioId: null,
    numero: contato.telefone,
    nomeContato: contato.nome,
    variaveis,
    template: {
      id: template.id,
      nome: template.nome,
      idioma: template.idioma,
      categoria: template.categoria,
      opt_out_habilitado: template.opt_out_habilitado,
      payload,
    } satisfies TemplateDisparo,
    integracao: integracao as IntegracaoDisparo,
    origem: "rotina_automacao",
  });

  if (!resultado.ok) {
    throw new Error(
      resultado.erro || "Falha ao enviar o disparo WhatsApp da automação.",
    );
  }

  return {
    disparo_whatsapp: true,
    integracao_whatsapp_id: integracaoId,
    template_id: template.id,
    template_nome: template.nome,
    variaveis,
    mensagem_id: resultado.messageId,
    conversa_id: resultado.conversaId,
    contato_id: resultado.contatoId,
    status_envio: resultado.statusDisparo,
    automacao_id: params.automacaoId,
    execucao_id: params.execucaoId,
    acao_id: params.acaoId,
  };
}
