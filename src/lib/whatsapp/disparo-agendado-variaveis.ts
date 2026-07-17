import {
  chaveEhVariavelFixaContato,
  chaveEhVariavelNomeWhatsapp,
  montarMapaVariaveisFixasContato,
  normalizarChaveVariavelFluxo,
} from "@/lib/automacoes/variaveis-fixas-contato";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { TemplatePayloadDisparo } from "@/lib/whatsapp/send-template-disparo";

type RegistroGenerico = Record<string, unknown>;

type ContatoAgendado = {
  id?: string | null;
  nome?: string | null;
  whatsapp_profile_name?: string | null;
  telefone?: string | null;
  email?: string | null;
  empresa?: string | null;
  origem?: string | null;
  campanha?: string | null;
  status_lead?: string | null;
  classificacao?: string | null;
};

type ComponenteTemplate = {
  type?: string;
  text?: string;
  format?: string;
  buttons?: Array<{
    type?: string;
    url?: string;
  }>;
};

const supabaseAdmin = getSupabaseAdmin();

function objeto(valor: unknown): RegistroGenerico {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as RegistroGenerico)
    : {};
}

function listaTexto(valor: unknown) {
  return Array.isArray(valor)
    ? valor.map((item) => String(item || "").trim())
    : [];
}

function contarVariaveisNoTexto(texto?: string | null) {
  const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
  const numeros = matches
    .map((item) => Number(item.replace(/[{}]/g, "")))
    .filter((numero) => Number.isFinite(numero));

  return numeros.length > 0 ? Math.max(...numeros) : 0;
}

function coletarRequisitosTemplate(payload: TemplatePayloadDisparo | null) {
  const componentes = Array.isArray(payload?.components)
    ? (payload.components as ComponenteTemplate[])
    : [];
  const requisitos: Array<{
    componente: string;
    posicaoGlobal: number;
    marcador: string;
  }> = [];
  let posicaoGlobal = 0;

  function adicionar(componente: string, texto?: string | null) {
    const total = contarVariaveisNoTexto(texto);

    for (let index = 0; index < total; index += 1) {
      requisitos.push({
        componente,
        posicaoGlobal,
        marcador: `{{${index + 1}}}`,
      });
      posicaoGlobal += 1;
    }
  }

  const header = componentes.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = componentes.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const buttons = componentes.find(
    (item) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  adicionar("cabecalho", header?.text);
  adicionar("corpo", body?.text);

  for (const [index, button] of (buttons?.buttons || []).entries()) {
    if (String(button?.type || "").toUpperCase() === "URL") {
      adicionar(`botao_url_${index + 1}`, button?.url);
    }
  }

  return {
    header,
    requisitos,
  };
}

function validarVariaveisTemplate(params: {
  payload: TemplatePayloadDisparo | null;
  variaveis: string[];
  variaveisConfig: string[];
}) {
  const { header, requisitos } = coletarRequisitosTemplate(params.payload);
  const formatoHeader = String(header?.format || "").toUpperCase();

  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(formatoHeader)) {
    throw new Error(
      "O template agendado possui cabecalho de midia, que ainda nao e suportado por este fluxo."
    );
  }

  const faltantes = requisitos.filter(
    (requisito) =>
      !String(params.variaveis[requisito.posicaoGlobal] || "").trim()
  );

  if (faltantes.length === 0) return;

  const detalhes = faltantes
    .map((requisito) => {
      const configurada = params.variaveisConfig[requisito.posicaoGlobal];
      return configurada
        ? `${requisito.componente} ${requisito.marcador} (${configurada})`
        : `${requisito.componente} ${requisito.marcador}`;
    })
    .join(", ");

  throw new Error(
    `Template agendado com variaveis obrigatorias sem valor: ${detalhes}.`
  );
}

async function carregarNomePerfilWhatsapp(params: {
  empresaId: string;
  conversaId: string | null;
}) {
  if (!params.conversaId) return "";

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("metadata_json")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("remetente_tipo", "contato")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("[DISPARO AGENDADO FILA] Nome do perfil indisponivel:", error);
    return "";
  }

  for (const mensagem of data || []) {
    const metadata = objeto(mensagem.metadata_json);
    const nome = String(
      metadata.whatsapp_profile_name ||
        metadata.profile_name ||
        metadata.nome_perfil_whatsapp ||
        ""
    ).trim();

    if (nome) return nome;
  }

  return "";
}

async function buscarContatoAgendado(params: {
  empresaId: string;
  conversaId: string | null;
  contatoId: string | null;
  payload: RegistroGenerico;
}) {
  if (params.conversaId) {
    const { data, error } = await supabaseAdmin
      .from("conversas")
      .select(
        `
          id,
          contato_id,
          contatos:contato_id (
            id,
            nome,
            whatsapp_profile_name,
            telefone,
            email,
            empresa,
            origem,
            campanha,
            status_lead,
            classificacao
          )
        `
      )
      .eq("id", params.conversaId)
      .eq("empresa_id", params.empresaId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar conversa agendada: ${error.message}`);
    }

    const contatoRelacao = Array.isArray(data?.contatos)
      ? data?.contatos[0]
      : data?.contatos;

    if (contatoRelacao) {
      return contatoRelacao as ContatoAgendado;
    }
  }

  if (params.contatoId) {
    const { data, error } = await supabaseAdmin
      .from("contatos")
      .select(
        "id, nome, whatsapp_profile_name, telefone, email, empresa, origem, campanha, status_lead, classificacao"
      )
      .eq("id", params.contatoId)
      .eq("empresa_id", params.empresaId)
      .maybeSingle();

    if (error) {
      throw new Error(`Erro ao buscar contato agendado: ${error.message}`);
    }

    if (data) return data as ContatoAgendado;
  }

  return {
    id: params.contatoId,
    nome: String(params.payload.contato_nome || "").trim() || null,
    telefone: String(params.payload.numero_destino || "").trim() || null,
    origem: String(params.payload.origem_contato || "").trim() || null,
    campanha: String(params.payload.campanha || "").trim() || null,
    status_lead: String(params.payload.status_lead || "").trim() || null,
    classificacao: String(params.payload.classificacao || "").trim() || null,
  } satisfies ContatoAgendado;
}

async function resolverValores(params: {
  empresaId: string;
  execucaoId: string | null;
  conversaId: string | null;
  contato: ContatoAgendado;
  variaveisConfig: string[];
  payload: RegistroGenerico;
}) {
  if (params.variaveisConfig.length === 0) return [];

  const chaves = params.variaveisConfig
    .map((item) => normalizarChaveVariavelFluxo(item))
    .filter(Boolean);
  const mapaAutomacao = new Map<string, string>();

  if (params.execucaoId && chaves.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("automacao_variaveis")
      .select("chave, valor")
      .eq("empresa_id", params.empresaId)
      .eq("execucao_id", params.execucaoId)
      .in("chave", chaves);

    if (error) {
      throw new Error(`Erro ao resolver variaveis da automacao: ${error.message}`);
    }

    for (const variavel of data || []) {
      mapaAutomacao.set(
        String(variavel.chave || "").toLowerCase(),
        String(variavel.valor || "")
      );
    }
  }

  let protocoloAtual = "";
  let ultimoProtocolo = "";

  if (params.conversaId && chaves.includes("protocolo_atual")) {
    const { data } = await supabaseAdmin
      .from("conversa_protocolos")
      .select("protocolo")
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    protocoloAtual = String(data?.protocolo || "").trim();
  }

  if (params.conversaId && chaves.includes("ultimo_protocolo")) {
    const { data } = await supabaseAdmin
      .from("conversa_protocolos")
      .select("protocolo")
      .eq("empresa_id", params.empresaId)
      .eq("conversa_id", params.conversaId)
      .eq("ativo", false)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    ultimoProtocolo = String(data?.protocolo || "").trim();
  }

  const precisaNomeWhatsapp = chaves.some(chaveEhVariavelNomeWhatsapp);
  const nomeWhatsapp = precisaNomeWhatsapp
    ? (await carregarNomePerfilWhatsapp({
        empresaId: params.empresaId,
        conversaId: params.conversaId,
      })) ||
      String(
        params.payload.nome_whatsapp ||
          params.payload.whatsapp_profile_name ||
          params.contato.whatsapp_profile_name ||
          ""
      ).trim()
    : "";

  const fixasContato = montarMapaVariaveisFixasContato(params.contato, {
    nome_whatsapp: nomeWhatsapp,
    protocolo_atual: protocoloAtual,
    ultimo_protocolo: ultimoProtocolo,
  });
  const mapaPayload = new Map<string, string>();

  function adicionarPayload(chave: string, valor: unknown) {
    const chaveNormalizada = normalizarChaveVariavelFluxo(chave);
    const texto = String(valor || "").trim();

    if (chaveNormalizada && texto) {
      mapaPayload.set(chaveNormalizada, texto);
    }
  }

  for (const chave of [
    "agenda_data",
    "agenda_hora",
    "agenda_inicio_at",
    "agenda_fim_at",
    "agenda_agendamento_id",
    "agenda_id",
    "agenda_nome",
    "nome_whatsapp",
    "whatsapp_profile_name",
    "contato_nome",
    "numero_destino",
    "campanha",
    "origem_contato",
    "status_lead",
    "classificacao",
    "classificacao_lead",
  ]) {
    adicionarPayload(chave, params.payload[chave]);
  }

  adicionarPayload("nome_contato", params.payload.contato_nome);
  adicionarPayload("nome", params.payload.contato_nome);
  adicionarPayload("numero_contato", params.payload.numero_destino);
  adicionarPayload("contato_numero", params.payload.numero_destino);
  adicionarPayload("telefone", params.payload.numero_destino);
  adicionarPayload("telefone_contato", params.payload.numero_destino);
  adicionarPayload("contato_telefone", params.payload.numero_destino);

  return chaves.map((chave) => {
    if (chaveEhVariavelFixaContato(chave)) {
      return fixasContato.get(chave) || mapaPayload.get(chave) || "";
    }

    if (mapaAutomacao.has(chave)) {
      return mapaAutomacao.get(chave) || "";
    }

    if (mapaPayload.has(chave)) {
      return mapaPayload.get(chave) || "";
    }

    if (chave === "nome") return String(params.contato.nome || "");
    if (chave === "telefone") return String(params.contato.telefone || "");
    if (chave === "email") return String(params.contato.email || "");
    if (chave === "empresa") return String(params.contato.empresa || "");
    if (chave === "campanha") return String(params.contato.campanha || "");
    if (chave === "origem") return String(params.contato.origem || "");

    if (
      chave === "status_lead" ||
      chave === "status" ||
      chave === "classificacao" ||
      chave === "classificacao_lead" ||
      chave === "lead_classificacao"
    ) {
      return (
        fixasContato.get(chave) ||
        String(params.contato.classificacao || params.contato.status_lead || "")
      );
    }

    if (chave === "protocolo_atual") return protocoloAtual;
    if (chave === "ultimo_protocolo") return ultimoProtocolo;

    return "";
  });
}

export async function resolverDisparoAgendadoParaFila(params: {
  agendamentoId: string;
  templatePayload: TemplatePayloadDisparo | null;
}) {
  const { data: agendamento, error } = await supabaseAdmin
    .from("automacao_agendamentos")
    .select("id, empresa_id, execucao_id, status, payload_json")
    .eq("id", params.agendamentoId)
    .maybeSingle();

  if (error || !agendamento) {
    throw new Error(
      `Agendamento do item nao encontrado: ${error?.message || params.agendamentoId}`
    );
  }

  if (!["executando", "pendente"].includes(String(agendamento.status || ""))) {
    throw new Error(
      `Agendamento nao pode mais ser processado (status: ${agendamento.status}).`
    );
  }

  const payload = objeto(agendamento.payload_json);
  const conversaId = String(payload.conversa_id || "").trim() || null;
  const contatoId = String(payload.contato_id || "").trim() || null;
  const variaveisConfig = listaTexto(payload.variaveis);
  const contato = await buscarContatoAgendado({
    empresaId: agendamento.empresa_id,
    conversaId,
    contatoId,
    payload,
  });
  const variaveis = await resolverValores({
    empresaId: agendamento.empresa_id,
    execucaoId: agendamento.execucao_id || null,
    conversaId,
    contato,
    variaveisConfig,
    payload,
  });

  validarVariaveisTemplate({
    payload: params.templatePayload,
    variaveis,
    variaveisConfig,
  });

  return {
    variaveis,
    nomeContato:
      String(contato.nome || payload.contato_nome || "").trim() || null,
  };
}
