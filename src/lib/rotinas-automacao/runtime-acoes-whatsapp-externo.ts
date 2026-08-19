import {
  montarMapaVariaveisFixasContato,
  normalizarChaveVariavelFluxo,
} from "@/lib/automacoes/variaveis-fixas-contato";
import { buscarRecursoSistemaMapeado } from "@/lib/integracoes/sistemas-mapeados";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  enviarTemplateDisparo,
  type IntegracaoDisparo,
  type TemplateDisparo,
  type TemplatePayloadDisparo,
} from "@/lib/whatsapp/send-template-disparo";

const supabase = getSupabaseAdmin();

function lerCaminho(objeto: unknown, caminho: string): unknown {
  let atual = objeto;
  for (const parte of String(caminho || "").split(".").filter(Boolean)) {
    if (!atual || typeof atual !== "object" || Array.isArray(atual)) return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

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

function formatarValorEvento(
  valor: unknown,
  tipo: string | null | undefined,
) {
  if (valor === null || valor === undefined) return "";

  if (tipo === "money") {
    const numero = Number(valor);
    if (Number.isFinite(numero)) {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(numero / 100);
    }
  }

  if (tipo === "boolean") {
    if (valor === true || valor === "true" || valor === 1 || valor === "1") return "Sim";
    if (valor === false || valor === "false" || valor === 0 || valor === "0") return "Não";
  }

  if ((tipo === "date" || tipo === "datetime") && String(valor).trim()) {
    const data = new Date(String(valor));
    if (!Number.isNaN(data.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        ...(tipo === "datetime" ? { timeStyle: "short" as const } : {}),
        timeZone: "America/Sao_Paulo",
      }).format(data);
    }
  }

  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function campoPreferencial(
  sistema: string,
  recurso: string,
  tipo: string,
  sufixos: string[] = [],
) {
  const mapeamento = buscarRecursoSistemaMapeado(sistema, recurso);
  if (!mapeamento) return null;

  return (
    mapeamento.campos.find(
      (campo) =>
        campo.tipo === tipo &&
        (!sufixos.length || sufixos.some((sufixo) => campo.chave.endsWith(sufixo))),
    ) ||
    mapeamento.campos.find((campo) => campo.tipo === tipo) ||
    null
  );
}

async function resolverVariaveis(params: {
  empresaId: string;
  sistema: string;
  recurso: string;
  contexto: Record<string, unknown>;
  configuradas: string[];
  total: number;
  contatoInferido: {
    nome?: string | null;
    email?: string | null;
    telefone?: string | null;
  };
}) {
  if (params.total === 0) return [];
  if (params.configuradas.length < params.total) {
    throw new Error(
      `O template exige ${params.total} variável(is), mas a ação não possui todas configuradas.`,
    );
  }

  const { data: personalizadas, error } = await supabase
    .from("automacao_variaveis")
    .select("chave,valor")
    .eq("empresa_id", params.empresaId)
    .is("execucao_id", null)
    .is("contato_id", null)
    .eq("metadata_json->>tipo", "global_empresa")
    .eq("metadata_json->>ativo", "true");
  if (error) throw error;

  const mapaFixas = montarMapaVariaveisFixasContato(params.contatoInferido, {
    protocolo_atual: "",
    ultimo_protocolo: "",
  });
  const mapaPersonalizadas = new Map<string, string>();
  for (const variavel of personalizadas || []) {
    const chave = normalizarChaveVariavelFluxo(String(variavel.chave || ""));
    if (chave) mapaPersonalizadas.set(chave, String(variavel.valor || ""));
  }

  const recursoMapeado = buscarRecursoSistemaMapeado(params.sistema, params.recurso);
  const camposPorChave = new Map(
    (recursoMapeado?.campos || []).map((campo) => [campo.chave, campo]),
  );

  const resolvidas = params.configuradas.slice(0, params.total).map((configurada) => {
    const original = String(configurada || "").trim();
    if (!original) return "";

    if (original.toLowerCase().startsWith("texto:")) {
      return original.slice(original.indexOf(":") + 1).trim();
    }

    if (original.toLowerCase().startsWith("evento:")) {
      const chaveEvento = original.slice(original.indexOf(":") + 1).trim();
      const campo = camposPorChave.get(chaveEvento);
      return formatarValorEvento(
        lerCaminho(params.contexto, chaveEvento),
        campo?.tipo,
      );
    }

    const chave = normalizarChaveVariavelFluxo(original);
    return mapaFixas.get(chave) || mapaPersonalizadas.get(chave) || "";
  });

  const faltantes = resolvidas
    .map((valor, index) => ({ valor, index }))
    .filter((item) => !String(item.valor || "").trim())
    .map((item) => `Variável ${item.index + 1}`);
  if (faltantes.length) {
    throw new Error(`${faltantes.join(", ")} sem valor para o disparo WhatsApp.`);
  }

  return resolvidas;
}

export async function enviarDisparoWhatsappEventoMapeado(params: {
  empresaId: string;
  automacaoId: string;
  execucaoId: string;
  acaoId: string;
  sistema: string;
  recurso: string;
  contexto: Record<string, unknown>;
  config: Record<string, unknown>;
}) {
  const integracaoId = String(params.config.integracao_whatsapp_id || "").trim();
  const templateId = String(params.config.template_id || "").trim();
  const variaveisConfiguradas = Array.isArray(params.config.variaveis)
    ? params.config.variaveis.map((item) => String(item || "").trim())
    : [];

  if (!integracaoId) throw new Error("O disparo WhatsApp precisa de uma integração.");
  if (!templateId) throw new Error("O disparo WhatsApp precisa de um template.");

  const recursoMapeado = buscarRecursoSistemaMapeado(params.sistema, params.recurso);
  if (!recursoMapeado) throw new Error("Recurso mapeado não encontrado para o disparo.");

  const campoTelefoneConfigurado = String(params.config.destinatario_campo || "").trim();
  const campoTelefone = campoTelefoneConfigurado
    ? recursoMapeado.campos.find((campo) => campo.chave === campoTelefoneConfigurado) || null
    : campoPreferencial(params.sistema, params.recurso, "phone");
  const campoNome = campoPreferencial(params.sistema, params.recurso, "text", [".nome"]);
  const campoEmail = campoPreferencial(params.sistema, params.recurso, "email");

  const telefone = String(
    campoTelefone ? lerCaminho(params.contexto, campoTelefone.chave) || "" : "",
  ).replace(/\D/g, "");
  const nome = String(
    campoNome ? lerCaminho(params.contexto, campoNome.chave) || "" : "",
  ).trim();
  const email = String(
    campoEmail ? lerCaminho(params.contexto, campoEmail.chave) || "" : "",
  ).trim();

  if (!telefone) {
    throw new Error(
      "O evento não possui telefone mapeado para enviar o disparo WhatsApp.",
    );
  }

  const [templateResult, integracaoResult] = await Promise.all([
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
  if (templateResult.error) throw templateResult.error;
  if (integracaoResult.error) throw integracaoResult.error;

  const template = templateResult.data;
  const integracao = integracaoResult.data;
  if (!template) throw new Error("Template WhatsApp não encontrado para a integração selecionada.");
  if (String(template.status || "").toUpperCase() !== "APPROVED") {
    throw new Error("O template WhatsApp selecionado não está aprovado.");
  }
  if (!integracao || integracao.status !== "ativa") {
    throw new Error("A integração WhatsApp do disparo está inativa ou não foi encontrada.");
  }

  const payload = (template.payload || null) as TemplatePayloadDisparo | null;
  const totalVariaveis = contarVariaveisTemplate(payload);
  const variaveis = await resolverVariaveis({
    empresaId: params.empresaId,
    sistema: params.sistema,
    recurso: params.recurso,
    contexto: params.contexto,
    configuradas: variaveisConfiguradas,
    total: totalVariaveis,
    contatoInferido: { nome, email, telefone },
  });

  const resultado = await enviarTemplateDisparo({
    empresaId: params.empresaId,
    integracaoWhatsappId: integracaoId,
    usuarioId: null,
    numero: telefone,
    nomeContato: nome || null,
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
    origem: "rotina_automacao_integracao_mapeada",
  });

  if (!resultado.ok) {
    throw new Error(resultado.erro || "Falha ao enviar o disparo WhatsApp da automação.");
  }

  return {
    disparo_whatsapp: true,
    telefone,
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
