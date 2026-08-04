"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import { solicitarAtualizacaoDisparosPendentesHeader } from "@/lib/header-summary/events";
import { podeRealizarDisparos as usuarioPodeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import styles from "./disparos-agendados.module.css";

type StatusDisparo = "todos" | "pendente" | "executado" | "cancelado" | "erro";

const ITENS_POR_PAGINA = 20;

// CRM_DISPAROS_PROGRAMADOS_DESC_V2
function obterDataCampoRecenteDisparo(
  valor: any,
  campo: string,
  profundidade = 0
): number {
  if (valor == null || profundidade > 6) return 0;

  if (Array.isArray(valor)) {
    return valor.reduce(
      (maior, item) =>
        Math.max(
          maior,
          obterDataCampoRecenteDisparo(item, campo, profundidade + 1)
        ),
      0
    );
  }

  if (typeof valor !== "object") return 0;

  let maior = 0;
  for (const [chave, item] of Object.entries(valor)) {
    if (chave === campo && typeof item === "string") {
      const timestamp = new Date(item).getTime();
      if (Number.isFinite(timestamp)) maior = Math.max(maior, timestamp);
      continue;
    }

    if (item && typeof item === "object") {
      maior = Math.max(
        maior,
        obterDataCampoRecenteDisparo(item, campo, profundidade + 1)
      );
    }
  }

  return maior;
}

function obterDataProgramadaDisparo(valor: any): number {
  return (
    obterDataCampoRecenteDisparo(valor, "executar_em") ||
    obterDataCampoRecenteDisparo(valor, "created_at")
  );
}

function compararDisparosAgendados(a: any, b: any): number {
  const aCancelado = String(a?.status || "").toLowerCase() === "cancelado";
  const bCancelado = String(b?.status || "").toLowerCase() === "cancelado";

  if (aCancelado !== bCancelado) {
    return aCancelado ? 1 : -1;
  }

  return obterDataProgramadaDisparo(b) - obterDataProgramadaDisparo(a);
}

type IntegracaoWhatsappOpcao = {
  id: string;
  nome_conexao?: string | null;
  numero?: string | null;
};

type ContatoOptOutLike = {
  whatsapp_opt_out?: boolean;
  whatsapp_opt_out_geral?: boolean;
  whatsapp_opt_out_marketing?: boolean;
  whatsapp_opt_out_utility?: boolean;
  origem?: string | null;
  campanha?: string | null;
  origem_exibicao?: string | null;
  campanha_exibicao?: string | null;
};

function obterOrigemContato(contato: ContatoOptOutLike) {
  return contato.origem_exibicao || contato.origem || "";
}

function obterCampanhaContato(contato: ContatoOptOutLike) {
  return contato.campanha_exibicao || contato.campanha || "";
}

function contatoTemOptOutParaCategoria(
  contato: ContatoOptOutLike,
  categoria: string
) {
  if (contato.whatsapp_opt_out_geral === true) return true;

  const possuiEscoposDetalhados =
    contato.whatsapp_opt_out_marketing !== undefined ||
    contato.whatsapp_opt_out_utility !== undefined ||
    contato.whatsapp_opt_out_geral !== undefined;

  if (!possuiEscoposDetalhados && contato.whatsapp_opt_out === true) {
    return true;
  }

  if (categoria === "marketing") {
    return contato.whatsapp_opt_out_marketing === true;
  }

  if (categoria === "utility") {
    return contato.whatsapp_opt_out_utility === true;
  }

  return false;
}

function contatoTemAlgumOptOut(contato: ContatoOptOutLike) {
  return (
    contato.whatsapp_opt_out === true ||
    contato.whatsapp_opt_out_geral === true ||
    contato.whatsapp_opt_out_marketing === true ||
    contato.whatsapp_opt_out_utility === true
  );
}

function rotuloOptOutContato(contato: ContatoOptOutLike) {
  if (contato.whatsapp_opt_out_geral === true) return "Opt-out de disparos";

  const marketing = contato.whatsapp_opt_out_marketing === true;
  const utility = contato.whatsapp_opt_out_utility === true;

  if (marketing && utility) return "Opt-out Marketing e Utility";
  if (marketing) return "Opt-out Marketing";
  if (utility) return "Opt-out Utility";
  return contato.whatsapp_opt_out === true ? "Opt-out de disparos" : null;
}

type DisparoAgendado = {
  id: string;
  execucao_id: string | null;
  fluxo_id: string | null;
  no_id: string | null;
  tipo_agendamento: string;
  executar_em: string;
  status: "pendente" | "executando" | "executado" | "cancelado" | "erro";
  payload_json: Record<string, any>;
  created_at: string;
  executed_at: string | null;
  automacao_fluxos?: {
    id: string;
    nome: string;
  } | null;
  automacao_nos?: {
    id: string;
    titulo: string;
    tipo_no: string;
  } | null;
  envio_status?: "falha" | "sucesso" | "processando" | null;
  envio_label?: string | null;
  envio_message_id?: string | null;
  envio_erro_codigo_meta?: number | string | null;
  envio_erro_tecnico?: string | null;
  envio_erro_amigavel?: string | null;
};

// CRM_DISPAROS_AGRUPADOS_V1
type CanalDisparo = "whatsapp" | "email" | "sistema" | "fluxo";
type StatusGrupoDisparo =
  | "pendente"
  | "executando"
  | "executado"
  | "cancelado"
  | "erro"
  | "parcial";

type GrupoDisparos = {
  id: string;
  agendamentoId: string | null;
  titulo: string;
  contatoNome: string;
  calendarioNome: string;
  compromissoEm: string | null;
  local: string | null;
  status: StatusGrupoDisparo;
  total: number;
  pendentes: number;
  executando: number;
  executados: number;
  cancelados: number;
  erros: number;
  proximaExecucaoEm: string | null;
  ultimaReferenciaEm: string;
  canais: Record<CanalDisparo, number>;
  itens: DisparoAgendado[];
};

function obterCanalDisparo(disparo: DisparoAgendado): CanalDisparo {
  const canal = String(disparo.payload_json?.canal_agenda || "").toLowerCase();
  if (canal === "email") return "email";
  if (canal === "sistema") return "sistema";
  if (canal === "fluxo") return "fluxo";
  return "whatsapp";
}

function canalDisparoLabel(canal: CanalDisparo) {
  if (canal === "email") return "E-mail";
  if (canal === "sistema") return "Sistema";
  if (canal === "fluxo") return "Fluxo";
  return "WhatsApp";
}

function canalDisparoIcone(canal: CanalDisparo) {
  if (canal === "email") return "✉️";
  if (canal === "sistema") return "🔔";
  if (canal === "fluxo") return "⚙️";
  return "💬";
}

function obterDestinoDisparo(disparo: DisparoAgendado) {
  const payload = disparo.payload_json || {};
  const canal = obterCanalDisparo(disparo);
  const valor = String(
    payload.destino_valor || payload.numero_destino || "-"
  );

  if (payload.destino_rotulo) {
    return { rotulo: String(payload.destino_rotulo), valor };
  }
  if (canal === "email") return { rotulo: "E-mail", valor };
  if (canal === "sistema") return { rotulo: "Responsável", valor };
  if (canal === "fluxo") {
    return {
      rotulo: payload.fluxo_pos_atendimento ? "Fluxo de destino" : "Contato",
      valor: String(payload.fluxo_pos_atendimento || valor),
    };
  }
  return { rotulo: "WhatsApp", valor };
}

function obterTipoDisparo(disparo: DisparoAgendado) {
  const payload = disparo.payload_json || {};
  return String(
    payload.tipo_label ||
      payload.template_nome ||
      disparo.automacao_nos?.titulo ||
      "Automação"
  );
}

function obterGrupoId(disparo: DisparoAgendado) {
  const agendamentoId = String(
    disparo.payload_json?.agendamento_id || ""
  ).trim();
  return agendamentoId ? "agendamento:" + agendamentoId : "disparo:" + disparo.id;
}

function millisData(valor?: string | null) {
  const millis = valor ? new Date(valor).getTime() : 0;
  return Number.isFinite(millis) ? millis : 0;
}

function criarGruposDisparos(disparos: DisparoAgendado[]): GrupoDisparos[] {
  const mapa = new Map<string, DisparoAgendado[]>();

  disparos.forEach((disparo) => {
    const id = obterGrupoId(disparo);
    const atuais = mapa.get(id) || [];
    atuais.push(disparo);
    mapa.set(id, atuais);
  });

  const grupos = Array.from(mapa.entries()).map(([id, itensOriginais]) => {
    const itens = [...itensOriginais].sort(compararDisparosAgendados);

    const primeiro = itens[0];
    const payload = primeiro.payload_json || {};
    const pendentes = itens.filter((item) => item.status === "pendente").length;
    const executando = itens.filter((item) => item.status === "executando").length;
    const executados = itens.filter((item) => item.status === "executado").length;
    const cancelados = itens.filter((item) => item.status === "cancelado").length;
    const erros = itens.filter((item) => item.status === "erro").length;

    let status: StatusGrupoDisparo = "parcial";
    if (erros > 0) status = "erro";
    else if (executando > 0) status = "executando";
    else if (pendentes > 0) status = "pendente";
    else if (executados === itens.length) status = "executado";
    else if (cancelados === itens.length) status = "cancelado";

    const proximaExecucao = itens.find((item) =>
      ["pendente", "executando"].includes(item.status)
    );
    const referencias = itens.map((item) =>
      Math.max(
        millisData(item.executed_at),
        millisData(item.executar_em),
        millisData(item.created_at)
      )
    );
    const ultimaReferencia = new Date(Math.max(...referencias, 0)).toISOString();

    const canais: Record<CanalDisparo, number> = {
      whatsapp: 0,
      email: 0,
      sistema: 0,
      fluxo: 0,
    };
    itens.forEach((item) => {
      canais[obterCanalDisparo(item)] += 1;
    });

    return {
      id,
      agendamentoId: payload.agendamento_id || null,
      titulo: String(
        payload.agendamento_titulo || payload.template_nome || "Disparo agendado"
      ),
      contatoNome: String(payload.contato_nome || "Contato não informado"),
      calendarioNome: String(
        payload.calendario_nome || payload.agenda_nome || primeiro.automacao_fluxos?.nome || ""
      ).replace(/^Agenda:\s*/i, ""),
      compromissoEm: payload.agendamento_inicio_at || null,
      local: payload.agendamento_local || null,
      status,
      total: itens.length,
      pendentes,
      executando,
      executados,
      cancelados,
      erros,
      proximaExecucaoEm: proximaExecucao?.executar_em || null,
      ultimaReferenciaEm: ultimaReferencia,
      canais,
      itens,
    };
  });

  const prioridade = (status: StatusGrupoDisparo) => {
    if (status === "erro") return 0;
    if (status === "executando") return 1;
    if (status === "pendente") return 2;
    return 3;
  };

  return grupos.sort(compararDisparosAgendados);
}

function grupoStatusLabel(status: StatusGrupoDisparo) {
  if (status === "parcial") return "Parcial";
  if (status === "erro") return "Atenção";
  return statusLabel(status);
}

function grupoStatusClass(status: StatusGrupoDisparo) {
  if (status === "parcial") return [styles.badge, styles.badgeBlue].join(" ");
  return statusClass(status);
}

function grupoPossuiStatus(grupo: GrupoDisparos, filtro: StatusDisparo) {
  if (filtro === "todos") return true;
  if (filtro === "pendente") {
    return grupo.itens.some((item) =>
      ["pendente", "executando"].includes(item.status)
    );
  }
  return grupo.itens.some((item) => item.status === filtro);
}

function formatarHora(valor?: string | null) {
  if (!valor) return "-";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
}

function formatarData(valor?: string | null) {
  if (!valor) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
} 

function statusLabel(status: string) {
  if (status === "pendente") return "Pendente";
  if (status === "executando") return "Em processamento";
  if (status === "executado") return "Executado";
  if (status === "cancelado") return "Cancelado";
  if (status === "erro") return "Erro";
  return status;
}

function statusClass(status: string) {
  if (status === "pendente") return `${styles.badge} ${styles.badgeYellow}`;
  if (status === "executando") return `${styles.badge} ${styles.badgeYellow}`;
  if (status === "executado") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "cancelado") return `${styles.badge} ${styles.badgeCancel}`;
  if (status === "erro") return `${styles.badge} ${styles.badgeRed}`;
  return `${styles.badge} ${styles.badgeCancel}`;
}

function envioStatusClass(status?: string | null) {
  if (status === "falha") return `${styles.badge} ${styles.badgeRed}`;
  if (status === "sucesso") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "processando") return `${styles.badge} ${styles.badgeYellow}`;
  return `${styles.badge} ${styles.badgeYellow}`;
}

function renderizarTextoTemplate(payload: Record<string, any>) {
  const templatePayload = payload?.template_payload;

  if (!templatePayload?.components?.length) {
    if (payload?.conteudo_renderizado) {
      return String(payload.conteudo_renderizado);
    }

    if (payload?.template_nome) {
      return `Template: ${payload.template_nome}`;
    }

    return "Não foi possível gerar a prévia do template.";
  }

  const variaveis = Array.isArray(payload?.variaveis_resolvidas)
    ? payload.variaveis_resolvidas
    : Array.isArray(payload?.variaveis)
    ? payload.variaveis
    : [];

  function substituirVariaveis(texto: string) {
    return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
      const index = Number(numero) - 1;
      return variaveis[index] || `{{${numero}}}`;
    });
  }

  const partes: string[] = [];

  const header = templatePayload.components.find(
    (item: any) => item.type === "HEADER"
  );

  const body = templatePayload.components.find(
    (item: any) => item.type === "BODY"
  );

  const footer = templatePayload.components.find(
    (item: any) => item.type === "FOOTER"
  );

  if (header?.text) {
    partes.push(`📌 ${substituirVariaveis(header.text)}`);
  }

  if (body?.text) {
    partes.push(substituirVariaveis(body.text));
  }

  if (footer?.text) {
    partes.push(substituirVariaveis(footer.text));
  }

  return partes.join("\n\n").trim() || "Não foi possível gerar a prévia do template.";
}

function contarVariaveisTemplate(template: any) {
  if (!template?.payload?.components?.length) return 0;

  const components = template.payload.components;

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const buttons = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  function contarTexto(texto?: string | null) {
    const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];

    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((numero) => !Number.isNaN(numero));

    if (numeros.length === 0) return 0;

    return Math.max(...numeros);
  }

  const totalHeader = contarTexto(header?.text);
  const totalBody = contarTexto(body?.text);

  const totalBotoes = (buttons?.buttons || []).reduce(
    (total: number, button: any) =>
      String(button?.type || "").toUpperCase() === "URL"
        ? total + contarTexto(button?.url)
        : total,
    0
  );

  return totalHeader + totalBody + totalBotoes;
}

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

function substituirPreviewSequencial(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;

    const variavel = variaveis[index]?.trim();

    return variavel ? `{{${variavel}}}` : `{{${numero}}}`;
  });
}

function montarPreviewTemplateAgendado(
  template: any,
  variaveis: string[]
) {
  if (!template) {
    return "Selecione um template.";
  }

  const components = Array.isArray(template?.payload?.components)
    ? template.payload.components
    : [];

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const footer = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  const partes: string[] = [];

  let offset = 0;

  if (header?.text) {
    partes.push(
      substituirPreviewSequencial(header.text, variaveis, offset)
    );

    const variaveisHeader =
      String(header.text || "").match(/\{\{\d+\}\}/g) || [];

    const numerosHeader = variaveisHeader
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((numero) => !Number.isNaN(numero));

    offset +=
      numerosHeader.length > 0 ? Math.max(...numerosHeader) : 0;
  }

  if (body?.text) {
    partes.push(
      substituirPreviewSequencial(body.text, variaveis, offset)
    );
  }

  if (footer?.text) {
    partes.push(String(footer.text));
  }

  return partes.join("\n\n").trim() || "Template sem conteúdo para prévia.";
}

function extrairPreviewTemplateCompleto(payload: any) {
  const components = Array.isArray(payload?.components)
    ? payload.components
    : [];

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const footer = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  const buttons = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  const partes: string[] = [];

  if (header?.text) {
    partes.push(header.text);
  }

  if (body?.text) {
    partes.push(body.text);
  }

  if (footer?.text) {
    partes.push(footer.text);
  }

  return partes.join("\n\n");
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(numero: string | null | undefined) {
  const limpo = limparNumero(numero);

  if (!limpo) return "Sem telefone";
  return limpo;
}

function contatoTemTelefoneValido(contato: any) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}

function DisparosAgendadosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const headerUser = useHeaderUser();
  const disparoParam = searchParams.get("disparo");
  const grupoParam = searchParams.get("grupo");
  const mobileDetailActive = Boolean(disparoParam || grupoParam);
  const podeRealizarDisparos = usuarioPodeRealizarDisparos(headerUser);

  const [disparos, setDisparos] = useState<DisparoAgendado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusDisparo>("todos");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [filtroCanal, setFiltroCanal] = useState<"todos" | CanalDisparo>("todos");
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoDisparos | null>(null);
  const [grupoParaCancelar, setGrupoParaCancelar] = useState<GrupoDisparos | null>(null);

  const [disparoSelecionado, setDisparoSelecionado] =
    useState<DisparoAgendado | null>(null);

  const [disparoParaCancelar, setDisparoParaCancelar] =
    useState<DisparoAgendado | null>(null);

  const [cancelando, setCancelando] = useState(false);
  const [modalNovoDisparo, setModalNovoDisparo] = useState(false);
  const [integracoes, setIntegracoes] = useState<
    IntegracaoWhatsappOpcao[]
  >([]);
  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [templates, setTemplates] = useState<any[]>([]);
  const [integracaoSelecionada, setIntegracaoSelecionada] = useState("");
  const [templateSelecionado, setTemplateSelecionado] = useState("");
  const [templateVariavel1, setTemplateVariavel1] = useState("nome_contato");
  const [templateVariavel2, setTemplateVariavel2] = useState("campanha");
  const [templateVariavel3, setTemplateVariavel3] =
    useState("numero_contato");
  const [agendamentoData, setAgendamentoData] = useState("");
  const [agendamentoHora, setAgendamentoHora] = useState("");
  const [loadingModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [contatos, setContatos] = useState<any[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<any[]>([]);
  const [buscaContato, setBuscaContato] = useState("");
  const [salvandoDisparo, setSalvandoDisparo] = useState(false);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [totalContatosDisponiveis, setTotalContatosDisponiveis] = useState(0);
  const [origemFiltro, setOrigemFiltro] = useState("");
  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([]);
  const [campanhaFiltro, setCampanhaFiltro] = useState("");
  const [campanhasDisponiveis, setCampanhasDisponiveis] = useState<string[]>([]);
  const [erroModal, setErroModal] = useState("");
  const [
    modalResponsabilidadeListaFriaAberto,
    setModalResponsabilidadeListaFriaAberto,
  ] = useState(false);
  const [
    confirmacaoResponsabilidadeListaFria,
    setConfirmacaoResponsabilidadeListaFria,
  ] = useState(false);
  const [previewCusto, setPreviewCusto] = useState<{
    categoria: string;
    totalSelecionados: number;
    totalIsentos: number;
    totalCobrados: number;
    valorUnitarioUsd: number;
    valorTotalUsd: number;
    cotacaoUsdBrl: number;
    valorTotalBrlEstimado: number;
    valorTotalBrlMin: number;
    valorTotalBrlMax: number;
    margemMinPercent: number;
    margemMaxPercent: number;
    fonteCotacao?: string;
    cotacaoDataHora?: string | null;
    cotacaoFallback?: boolean;
  } | null>(null);
  const [loadingPreviewCusto, setLoadingPreviewCusto] = useState(false);

  async function carregarDisparos() {
    try {
      setCarregando(true);
      setErro("");
      setSucesso("");

      const params = new URLSearchParams();

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      const query = params.toString();
      const res = await fetch(`/api/disparos-agendados${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar disparos agendados.");
      }

      const listaDisparos = json.disparos || [];
      setDisparos(listaDisparos);

      const disparoDaUrl = disparoParam
        ? listaDisparos.find((item: DisparoAgendado) => item.id === disparoParam)
        : null;

      if (disparoDaUrl) {
        setDisparoSelecionado(disparoDaUrl);
      }
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar disparos agendados.");
    } finally {
      setCarregando(false);
    }
  }

  async function cancelarDisparo() {
    if (!disparoParaCancelar) return;
    if (!podeRealizarDisparos) {
      setErro("Você não tem permissão para cancelar disparos.");
      setDisparoParaCancelar(null);
      return;
    }

    try {
      setCancelando(true);
      setErro("");
      setSucesso("");

      const res = await fetch(
        `/api/disparos-agendados/${disparoParaCancelar.id}/cancelar`,
        {
          method: "PATCH",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao cancelar disparo.");
      }

      setSucesso("Disparo cancelado com sucesso.");
      setDisparoParaCancelar(null);
      setDisparoSelecionado(null);
      router.push("/disparos-agendados");
      solicitarAtualizacaoDisparosPendentesHeader();

      await carregarDisparos();
    } catch (error: any) {
      setErro(error?.message || "Erro ao cancelar disparo.");
    } finally {
      setCancelando(false);
    }
  }

  async function cancelarGrupoPendente() {
    if (!grupoParaCancelar) return;
    if (!podeRealizarDisparos) {
      setErro("Você não tem permissão para cancelar disparos.");
      setGrupoParaCancelar(null);
      return;
    }

    const pendentes = grupoParaCancelar.itens.filter(
      (item) => item.status === "pendente"
    );
    if (pendentes.length === 0) {
      setGrupoParaCancelar(null);
      return;
    }

    try {
      setCancelando(true);
      setErro("");
      setSucesso("");

      const resultados = await Promise.all(
        pendentes.map(async (item) => {
          const response = await fetch(
            "/api/disparos-agendados/" + item.id + "/cancelar",
            { method: "PATCH" }
          );
          const json = await response.json();
          return { ok: response.ok && json.ok, error: json.error };
        })
      );

      const falhas = resultados.filter((resultado) => !resultado.ok);
      if (falhas.length > 0) {
        throw new Error(
          falhas[0]?.error || "Não foi possível cancelar todas as automações pendentes."
        );
      }

      setSucesso(
        pendentes.length === 1
          ? "Automação pendente cancelada com sucesso."
          : String(pendentes.length) + " automações pendentes canceladas com sucesso."
      );
      setGrupoParaCancelar(null);
      setGrupoSelecionado(null);
      router.push("/disparos-agendados");
      solicitarAtualizacaoDisparosPendentesHeader();
      await carregarDisparos();
    } catch (error: any) {
      setErro(error?.message || "Erro ao cancelar as automações pendentes.");
    } finally {
      setCancelando(false);
    }
  }

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);

      const res = await fetch("/api/integracoes-whatsapp/listar", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      const lista = (
        Array.isArray(json.data) ? json.data : []
      ) as IntegracaoWhatsappOpcao[];
      setIntegracoes(lista);
      setIntegracaoSelecionada((integracaoAtual) => {
        if (lista.length === 1) return String(lista[0].id || "");

        return lista.some((integracao) => integracao.id === integracaoAtual)
          ? integracaoAtual
          : "";
      });
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar integrações."
      );
    } finally {
      setLoadingIntegracoes(false);
    }
  }

  async function carregarContatos(busca = "", origem = "", campanha = "") {
    if (!integracaoSelecionada) {
      setContatos([]);
      setTotalContatosDisponiveis(0);
      return;
    }

    try {
      setLoadingContatos(true);
      const params = new URLSearchParams({
        pagina: "1",
        limite: "2000",
      });

      if (busca.trim()) params.set("busca", busca.trim());
      if (origem.trim()) params.set("origem", origem.trim());
      if (campanha.trim()) params.set("campanha", campanha.trim());
      if (integracaoSelecionada) {
        params.set("integracao_whatsapp_id", integracaoSelecionada);
      }

      const res = await fetch(`/api/contatos?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao carregar contatos.");
      }

      setContatos(Array.isArray(json.contatos) ? json.contatos : []);
      setTotalContatosDisponiveis(Number(json.total || 0));
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar contatos."
      );
    } finally {
      setLoadingContatos(false);
    }
  }

  async function carregarOpcoesContatos() {
    try {
      const res = await fetch("/api/contatos/opcoes", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar filtros de contatos.");
      }

      setOrigensDisponiveis(
        Array.isArray(json.origens) ? json.origens : []
      );
      setCampanhasDisponiveis(
        Array.isArray(json.campanhas) ? json.campanhas : []
      );
    } catch (error) {
      console.warn(
        "[DISPAROS AGENDADOS] Erro ao carregar filtros de contatos:",
        error
      );
    }
  }

  async function carregarTemplates(integracaoId: string) {
    try {
      if (!integracaoId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoId
        )}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      setTemplates(
        (Array.isArray(json.data) ? json.data : []).filter(
          (item: any) =>
            String(item.status || "").toUpperCase() === "APPROVED"
        )
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar templates."
      );
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function criarDisparoAgendado() {
    try {
      setErroModal("");

      if (!podeRealizarDisparos) {
        setErroModal("Você não tem permissão para agendar disparos.");
        return;
      }

      if (!integracaoSelecionada) {
        setErroModal("Selecione uma integração.");
        return;
      }

      if (!templateSelecionado) {
        setErroModal("Selecione um template.");
        return;
      }

      if (!agendamentoData || !agendamentoHora) {
        setErroModal("Selecione data e hora.");
        return;
      }

      if (contatosSelecionados.length === 0) {
        setErroModal("Selecione pelo menos um contato.");
        return;
      }

      if (temContatosOptOut) {
        setErroModal(
          "A seleção possui contatos com opt-out para a categoria do template. Remova-os para continuar."
        );
        return;
      }

      if (marketingComListaFria) {
        setErroModal(
          "Templates de marketing não podem ser enviados para contatos de lista fria. Remova os contatos sem opt-in para continuar."
        );
        return;
      }

      if (utilityListaFriaSemOptOut) {
        setErroModal(
          "Este template utility não possui o rodapé de opt-out. Recrie o template com a instrução para responder SAIR."
        );
        return;
      }

      if (totalVariaveis > 3) {
        setErroModal(
          "Este template usa mais de 3 variáveis. Selecione um template com no máximo 3 variáveis."
        );
        return;
      }

      const variaveisObrigatorias = variaveisTemplate
        .slice(0, totalVariaveis)
        .map((variavel) =>
          normalizarEntradaVariavelTemplate(variavel)
        );

      if (variaveisObrigatorias.some((variavel) => !variavel)) {
        setErroModal(
          "Preencha todas as variáveis exigidas pelo template."
        );
        return;
      }

      if (
        utilityComListaFria &&
        !confirmacaoResponsabilidadeListaFria
      ) {
        setModalResponsabilidadeListaFriaAberto(true);
        return;
      }

      setSalvandoDisparo(true);
      setErro("");
      setSucesso("");

      const executar_em = new Date(
        `${agendamentoData}T${agendamentoHora}:00`
      ).toISOString();

      const res = await fetch(
        "/api/disparos-agendados/criar",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integracao_whatsapp_id: integracaoSelecionada,
            template_id: templateSelecionado,
            executar_em,

            variaveis: variaveisObrigatorias,
            confirmacao_responsabilidade_lista_fria:
              utilityComListaFria &&
              confirmacaoResponsabilidadeListaFria,

            contatos: contatosSelecionados.map((contato) => ({
              id: contato.id,
              nome: contato.nome,
              telefone: limparNumero(contato.telefone),
              email: contato.email || null,
              origem: obterOrigemContato(contato) || null,
              campanha: obterCampanhaContato(contato) || null,
              status_lead: contato.status_lead || null,
            })),
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || "Erro ao criar disparo."
        );
      }

      setSucesso("Disparo agendado com sucesso.");
      solicitarAtualizacaoDisparosPendentesHeader();

      setModalNovoDisparo(false);

      setIntegracaoSelecionada(
        integracoes.length === 1 ? String(integracoes[0].id || "") : ""
      );
      setTemplateSelecionado("");

      setTemplateVariavel1("nome_contato");
      setTemplateVariavel2("campanha");
      setTemplateVariavel3("numero_contato");

      setAgendamentoData("");
      setAgendamentoHora("");
      setContatosSelecionados([]);
      setBuscaContato("");
      setModalResponsabilidadeListaFriaAberto(false);
      setConfirmacaoResponsabilidadeListaFria(false);

      await carregarDisparos();
    } catch (error: any) {
        setErroModal(
          error?.message ||
          "Erro ao criar disparo."
        );
    } finally {
      setSalvandoDisparo(false);
    }
  }

  async function confirmarResponsabilidadeEAgendar() {
    if (!confirmacaoResponsabilidadeListaFria || !utilityComListaFria) return;

    setModalResponsabilidadeListaFriaAberto(false);
    await criarDisparoAgendado();
  }

  useEffect(() => {
    carregarDisparos();
    carregarIntegracoes();
    carregarOpcoesContatos();
  }, []);


  useEffect(() => {
    setTemplateSelecionado("");

    setTemplateVariavel1("nome_contato");
    setTemplateVariavel2("campanha");
    setTemplateVariavel3("numero_contato");

    if (integracaoSelecionada) {
      carregarTemplates(integracaoSelecionada);
    } else {
      setTemplates([]);
    }
  }, [integracaoSelecionada]);


  useEffect(() => {
    if (!modalNovoDisparo) return;

    const timer = setTimeout(() => {
      carregarContatos(buscaContato, origemFiltro, campanhaFiltro);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    buscaContato,
    origemFiltro,
    campanhaFiltro,
    modalNovoDisparo,
    integracaoSelecionada,
  ]);


  const metricas = useMemo(() => {
    const total = disparos.length;
    const pendentes = disparos.filter((item) =>
      ["pendente", "executando"].includes(item.status)
    ).length;
    const executados = disparos.filter((item) => item.status === "executado").length;
    const cancelados = disparos.filter((item) => item.status === "cancelado").length;
    const erros = disparos.filter((item) => item.status === "erro").length;

    return {
      total,
      pendentes,
      executados,
      cancelados,
      erros,
    };
  }, [disparos]);

  const grupos = useMemo(() => criarGruposDisparos(disparos), [disparos]);

  const gruposFiltrados = useMemo(() => {
    return grupos.filter((grupo) => {
      const correspondeStatus = grupoPossuiStatus(grupo, filtroStatus);
      const correspondeCanal =
        filtroCanal === "todos" ||
        grupo.itens.some((item) => obterCanalDisparo(item) === filtroCanal);
      return correspondeStatus && correspondeCanal;
    });
  }, [grupos, filtroStatus, filtroCanal]);

  const totalPaginas = useMemo(() => {
    return Math.max(1, Math.ceil(gruposFiltrados.length / ITENS_POR_PAGINA));
  }, [gruposFiltrados.length]);

  const gruposPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    return gruposFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);
  }, [gruposFiltrados, paginaAtual]);

  const primeiroItem =
    gruposFiltrados.length === 0 ? 0 : (paginaAtual - 1) * ITENS_POR_PAGINA + 1;
  const ultimoItem = Math.min(
    paginaAtual * ITENS_POR_PAGINA,
    gruposFiltrados.length
  );

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroStatus, filtroCanal, disparos]);

  useEffect(() => {
    if (disparoParam) {
      const disparo = disparos.find((item) => item.id === disparoParam) || null;
      setDisparoSelecionado(disparo);
      setGrupoSelecionado(null);
      if (disparo) {
        setGruposExpandidos((atuais) => {
          const proximos = new Set(atuais);
          proximos.add(obterGrupoId(disparo));
          return proximos;
        });
      }
      return;
    }

    if (grupoParam) {
      const grupo = grupos.find((item) => item.id === grupoParam) || null;
      setGrupoSelecionado(grupo);
      setDisparoSelecionado(null);
      if (grupo) {
        setGruposExpandidos((atuais) => {
          const proximos = new Set(atuais);
          proximos.add(grupo.id);
          return proximos;
        });
      }
      return;
    }

    setDisparoSelecionado(null);
    setGrupoSelecionado(null);
  }, [disparoParam, grupoParam, disparos, grupos]);

  const templateAtual =
    templates.find((item) => item.id === templateSelecionado) || null;

  const categoriaTemplateAtual = String(templateAtual?.categoria || "")
    .trim()
    .toLowerCase();

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(
      contatosSelecionados.map((item) => item.id)
    );

    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveis.filter(
      (contato) =>
        contatoTemTelefoneValido(contato) &&
        !contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual)
    );
  }, [contatosDisponiveis, categoriaTemplateAtual]);

  function adicionarContato(contato: any) {
    if (contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual)) {
      setErro(
        "Este contato solicitou opt-out para a categoria do template selecionado."
      );
      return;
    }

    const telefone = limparNumero(contato.telefone);

    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }

    setErro("");

    setContatosSelecionados((prev) => {
      if (prev.some((item) => item.id === contato.id)) return prev;
      return [...prev, contato];
    });
  }

  function adicionarTodosDisponiveis() {
    const mapaSelecionados = new Set(
      contatosSelecionados.map((item) => item.id)
    );

    const novos = contatosDisponiveisValidos.filter(
      (item) => !mapaSelecionados.has(item.id)
    );

    if (novos.length === 0) {
      setErro("Nenhum contato válido disponível para adicionar.");
      return;
    }

    setErro("");
    setContatosSelecionados((prev) => [...prev, ...novos]);
  }

  function removerContato(contatoId: string) {
    setContatosSelecionados((prev) =>
      prev.filter((item) => item.id !== contatoId)
    );
  }

  function limparSelecao() {
    setContatosSelecionados([]);
    setErro("");
  }

  function abrirDisparo(disparo: DisparoAgendado) {
    setDisparoSelecionado(disparo);
    setGrupoSelecionado(null);
    router.push("/disparos-agendados?disparo=" + encodeURIComponent(disparo.id));
  }

  function abrirGrupo(grupo: GrupoDisparos) {
    setGrupoSelecionado(grupo);
    setDisparoSelecionado(null);
    setGruposExpandidos((atuais) => {
      const proximos = new Set(atuais);
      proximos.add(grupo.id);
      return proximos;
    });
    router.push("/disparos-agendados?grupo=" + encodeURIComponent(grupo.id));
  }

  function alternarGrupo(grupo: GrupoDisparos) {
    if (grupo.total <= 1) {
      abrirDisparo(grupo.itens[0]);
      return;
    }
    setGruposExpandidos((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(grupo.id)) proximos.delete(grupo.id);
      else proximos.add(grupo.id);
      return proximos;
    });
  }

  async function calcularPreviewCustoAgendamento(
    categoria: string,
    contatosLista: any[]
  ) {
    try {
      if (!categoria || contatosLista.length === 0) {
        setPreviewCusto(null);
        return;
      }

      setLoadingPreviewCusto(true);

      const res = await fetch("/api/whatsapp/disparos/custo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoria,
          contatos: contatosLista.map((contato) => ({
            id: contato.id,
            telefone: limparNumero(contato.telefone),
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do agendamento.");
      }

      const totalCobrados = Number(json.totalCobrados || 0);
      const valorTotalUsd = Number(json.valorTotalUsd || 0);

      const valorTotalBrlEstimado =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Number(json.valorTotalBrlEstimado || 0);

      const valorTotalBrlMin =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMin || 0));

      const valorTotalBrlMax =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMax || 0));

      setPreviewCusto({
        categoria: String(json.categoria || ""),
        totalSelecionados: Number(json.totalSelecionados || 0),
        totalIsentos: Number(json.totalIsentos || 0),
        totalCobrados,
        valorUnitarioUsd: Number(json.valorUnitarioUsd || 0),
        valorTotalUsd,
        cotacaoUsdBrl: Number(json.cotacaoUsdBrl || 0),
        valorTotalBrlEstimado,
        valorTotalBrlMin,
        valorTotalBrlMax,
        margemMinPercent: Number(json.margemMinPercent || 0),
        margemMaxPercent: Number(json.margemMaxPercent || 0),
        fonteCotacao: json.fonteCotacao || "",
        cotacaoDataHora: json.cotacaoDataHora || null,
        cotacaoFallback: Boolean(json.cotacaoFallback),
      });
    } catch (error: any) {
      setPreviewCusto(null);
      setErro(error?.message || "Erro ao calcular custo do agendamento.");
    } finally {
      setLoadingPreviewCusto(false);
    }
  }

  const totalContatosListaFria = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          !contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual) &&
          contato.opt_in_whatsapp !== true
      ).length,
    [contatosSelecionados, categoriaTemplateAtual]
  );
  const totalContatosOptOut = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual)
      ).length,
    [contatosSelecionados, categoriaTemplateAtual]
  );
  const temContatosOptOut = totalContatosOptOut > 0;
  const temContatosListaFria = totalContatosListaFria > 0;
  const marketingComListaFria =
    categoriaTemplateAtual === "marketing" && temContatosListaFria;
  const utilityComListaFria =
    categoriaTemplateAtual === "utility" && temContatosListaFria;
  const utilityListaFriaSemOptOut =
    utilityComListaFria &&
    templateAtual?.opt_out_habilitado !== true;

  const totalVariaveis = useMemo(() => {
    return contarVariaveisTemplate(templateAtual);
  }, [templateAtual]);

  const variaveisTemplate = useMemo(
    () => [
      templateVariavel1,
      templateVariavel2,
      templateVariavel3,
    ],
    [
      templateVariavel1,
      templateVariavel2,
      templateVariavel3,
    ]
  );

  const previewTemplate = useMemo(() => {
    return montarPreviewTemplateAgendado(
      templateAtual,
      variaveisTemplate
    );
  }, [templateAtual, variaveisTemplate]);


  useEffect(() => {
    const categoria = String(templateAtual?.categoria || "").toLowerCase();

    if (!modalNovoDisparo || !categoria || contatosSelecionados.length === 0) {
      setPreviewCusto(null);
      return;
    }

    calcularPreviewCustoAgendamento(categoria, contatosSelecionados);
  }, [
    modalNovoDisparo,
    templateAtual?.id,
    templateAtual?.categoria,
    contatosSelecionados,
  ]);

  useEffect(() => {
    setModalResponsabilidadeListaFriaAberto(false);
    setConfirmacaoResponsabilidadeListaFria(false);
  }, [templateSelecionado, contatosSelecionados]);
   
  return (
    <>
      <Header
        mobileBackHref={mobileDetailActive ? "/disparos-agendados" : undefined}
        mobileBackLabel="Voltar para disparos"
        title="Disparos agendados"
        subtitle="Acompanhe, gerencie e cancele disparos de templates WhatsApp criados pelos fluxos de automação."
      />

      <main
        className={`${styles.pageContent} ${
          mobileDetailActive ? styles.mobileDetailActive : ""
        }`}
      >
        <section className={styles.mainPanel}>
          <header className={styles.editorHeader}>
            <div>
              <p className={styles.eyebrow}>Agenda de templates</p>
              <h2 className={styles.editorTitle}>Disparos agendados</h2>
              <p className={styles.editorSubtitle}>
                Visualize disparos criados pelos blocos de automação.
              </p>
            </div>

          <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={carregarDisparos}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
                
              {podeRealizarDisparos ? (
                <Link
                  href="/disparos-whatsapp"
                  className={styles.primaryButton}
                >
                  + Novo disparo
                </Link>
              ) : null}
            </div>
          </header>

          {(erro || sucesso) && (
            <div className={styles.alertArea}>
              {erro && <div className={styles.errorAlert}>{erro}</div>}
            </div>
          )}
          <FeedbackToast
            success={sucesso}
            onSuccessDismiss={() => setSucesso("")}
          />

          <div className={styles.searchBar}>
            <input
              className={styles.input}
              placeholder="Buscar agendamento, contato, template, telefone ou e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  carregarDisparos();
                }
              }}
            />

            <select
              className={styles.input}
              value={filtroCanal}
              onChange={(event) =>
                setFiltroCanal(event.target.value as "todos" | CanalDisparo)
              }
              aria-label="Filtrar por canal"
            >
              <option value="todos">Todos os canais</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="sistema">Sistema</option>
              <option value="fluxo">Fluxo</option>
            </select>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={carregarDisparos}
            >
              Buscar
            </button>
          </div>

          <div className={styles.metricsGrid}>
            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "todos" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("todos")}
            >
              <span>Total de automações</span>
              <strong>{metricas.total}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "pendente" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("pendente")}
            >
              <span>Pendentes</span>
              <strong>{metricas.pendentes}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "executado" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("executado")}
            >
              <span>Executados</span>
              <strong>{metricas.executados}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "cancelado" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("cancelado")}
            >
              <span>Cancelados</span>
              <strong>{metricas.cancelados}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "erro" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("erro")}
            >
              <span>Erros</span>
              <strong>{metricas.erros}</strong>
            </button>
          </div>

          <div className={styles.groupsSummary}>
            <span>
              {grupos.length} {grupos.length === 1 ? "grupo visual" : "grupos visuais"}
            </span>
            <span>As métricas acima continuam contabilizando cada automação.</span>
          </div>

          <div className={styles.listArea}>
            {carregando ? (
              <div className={styles.emptyState}>Carregando disparos...</div>
            ) : gruposFiltrados.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo agendado encontrado.
              </div>
            ) : (
              <div className={styles.disparosList}>
                {gruposPaginados.map((grupo) => {
                  const expandido = gruposExpandidos.has(grupo.id);
                  const canais = (["whatsapp", "email", "sistema", "fluxo"] as CanalDisparo[])
                    .filter((canal) => grupo.canais[canal] > 0);

                  if (grupo.total === 1) {
                    const disparo = grupo.itens[0];
                    const payload = disparo.payload_json || {};
                    const destino = obterDestinoDisparo(disparo);
                    const canal = obterCanalDisparo(disparo);
                    const fluxoNome = disparo.automacao_fluxos?.nome || "Fluxo não encontrado";
                    const blocoTitulo =
                      disparo.automacao_nos?.titulo ||
                      payload.automacao_no_titulo ||
                      "Bloco não encontrado";

                    return (
                      <article
                        key={grupo.id}
                        className={styles.disparoCard}
                        onClick={() => abrirDisparo(disparo)}
                      >
                        <div className={styles.disparoMain}>
                          <div className={styles.disparoIcon}>
                            {canalDisparoIcone(canal)}
                          </div>
                          <div className={styles.disparoInfo}>
                            <div className={styles.disparoTop}>
                              <strong className={styles.disparoTitle}>
                                {obterTipoDisparo(disparo)}
                              </strong>
                              <span className={statusClass(disparo.status)}>
                                {statusLabel(disparo.status)}
                              </span>
                            </div>
                            <div className={styles.disparoMetaRow}>
                              <p className={styles.disparoMeta}>
                                {destino.rotulo}: <strong>{destino.valor}</strong>
                              </p>
                              <p className={styles.disparoScheduledAt}>
                                Agendado: <strong>{formatarData(disparo.executar_em)}</strong>
                              </p>
                            </div>
                            <p className={styles.disparoMeta}>
                              Fluxo: {fluxoNome} · Bloco: {blocoTitulo}
                            </p>
                          </div>
                        </div>
                        <div className={styles.disparoActions}>
                          {payload.conversa_id ? (
                            <Link
                              href={"/conversas?conversaId=" + payload.conversa_id}
                              className={styles.secondaryButton}
                              onClick={(event) => event.stopPropagation()}
                            >
                              Abrir conversa
                            </Link>
                          ) : null}
                          {disparo.status === "pendente" && podeRealizarDisparos ? (
                            <button
                              type="button"
                              className={styles.dangerButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDisparoParaCancelar(disparo);
                              }}
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  }

                  return (
                    <article
                      key={grupo.id}
                      className={[
                        styles.groupCard,
                        grupoSelecionado?.id === grupo.id ? styles.groupCardSelected : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <div
                        className={styles.groupHeader}
                        role="button"
                        tabIndex={0}
                        onClick={() => alternarGrupo(grupo)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            alternarGrupo(grupo);
                          }
                        }}
                      >
                        <div className={styles.groupIdentity}>
                          <div className={styles.groupTitleRow}>
                            <div className={styles.groupIcon}>🗓️</div>
                            <div>
                              <strong className={styles.groupTitle}>{grupo.titulo}</strong>
                              <p className={styles.groupMeta}>
                                {grupo.contatoNome}
                                {grupo.calendarioNome ? " · " + grupo.calendarioNome : ""}
                              </p>
                            </div>
                          </div>
                          <span className={grupoStatusClass(grupo.status)}>
                            {grupoStatusLabel(grupo.status)}
                          </span>
                        </div>

                        <div className={styles.groupStats}>
                          <span><strong>{grupo.total}</strong> automações</span>
                          {grupo.executados > 0 ? <span>{grupo.executados} executadas</span> : null}
                          {grupo.pendentes + grupo.executando > 0 ? (
                            <span>{grupo.pendentes + grupo.executando} pendentes</span>
                          ) : null}
                          {grupo.cancelados > 0 ? <span>{grupo.cancelados} canceladas</span> : null}
                          {grupo.erros > 0 ? <span>{grupo.erros} com erro</span> : null}
                        </div>

                        <div className={styles.groupScheduleGrid}>
                          <div className={styles.groupSchedule}>
                            <span>Próxima execução</span>
                            <strong>{formatarData(grupo.proximaExecucaoEm)}</strong>
                          </div>
                          <div className={styles.groupSchedule}>
                            <span>Compromisso</span>
                            <strong>{formatarData(grupo.compromissoEm)}</strong>
                          </div>
                        </div>

                        <div className={styles.groupChannels}>
                          {canais.map((canal) => (
                            <span key={canal} className={styles.channelChip}>
                              {canalDisparoIcone(canal)} {canalDisparoLabel(canal)} {grupo.canais[canal]}
                            </span>
                          ))}
                        </div>

                        <div className={styles.groupFooterActions}>
                          {grupo.pendentes > 0 && podeRealizarDisparos ? (
                            <button
                              type="button"
                              className={styles.dangerButton}
                              onClick={(event) => {
                                event.stopPropagation();
                                setGrupoParaCancelar(grupo);
                              }}
                            >
                              Cancelar pendentes
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              abrirGrupo(grupo);
                            }}
                          >
                            Ver resumo
                          </button>
                          <button
                            type="button"
                            className={styles.expandButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              alternarGrupo(grupo);
                            }}
                            aria-expanded={expandido}
                          >
                            {expandido ? "Ocultar automações ↑" : "Ver automações ↓"}
                          </button>
                        </div>
                      </div>

                      {expandido ? (
                        <div className={styles.groupItems}>
                          {grupo.itens.map((disparo) => {
                            const canal = obterCanalDisparo(disparo);
                            const destino = obterDestinoDisparo(disparo);
                            return (
                              <div key={disparo.id} className={styles.groupItem}>
                                <button
                                  type="button"
                                  className={styles.groupItemMainButton}
                                  onClick={() => abrirDisparo(disparo)}
                                >
                                  <span className={styles.groupItemTime}>
                                    {formatarHora(disparo.executar_em)}
                                  </span>
                                  <span className={styles.groupItemChannel}>
                                    {canalDisparoIcone(canal)} {canalDisparoLabel(canal)}
                                  </span>
                                  <span className={styles.groupItemInfo}>
                                    <strong>{obterTipoDisparo(disparo)}</strong>
                                    <small>{destino.rotulo}: {destino.valor}</small>
                                  </span>
                                  <span className={statusClass(disparo.status)}>
                                    {statusLabel(disparo.status)}
                                  </span>
                                </button>
                                {disparo.status === "pendente" && podeRealizarDisparos ? (
                                  <button
                                    type="button"
                                    className={styles.groupItemCancel}
                                    onClick={() => setDisparoParaCancelar(disparo)}
                                    aria-label={"Cancelar " + obterTipoDisparo(disparo)}
                                  >
                                    Cancelar
                                  </button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </article>
                  );
                })}

                {gruposFiltrados.length > ITENS_POR_PAGINA ? (
                  <div className={styles.paginationBar}>
                    <span className={styles.paginationInfo}>
                      Exibindo {primeiroItem} a {ultimoItem} de {gruposFiltrados.length} grupos
                    </span>
                    <div className={styles.paginationActions}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() => setPaginaAtual((atual) => Math.max(1, atual - 1))}
                        disabled={paginaAtual <= 1}
                      >
                        Anterior
                      </button>
                      <span className={styles.paginationCurrent}>
                        Página {paginaAtual} de {totalPaginas}
                      </span>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() => setPaginaAtual((atual) => Math.min(totalPaginas, atual + 1))}
                        disabled={paginaAtual >= totalPaginas}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {grupoSelecionado ? (
          <aside className={styles.detailsPanel}>
            <div className={styles.propertiesHeader}>
              <div>
                <p className={styles.eyebrow}>Automações do agendamento</p>
                <h3 className={styles.propertiesTitle}>{grupoSelecionado.titulo}</h3>
                <p className={styles.panelSubtitle}>
                  {grupoSelecionado.contatoNome}
                  {grupoSelecionado.calendarioNome
                    ? " · " + grupoSelecionado.calendarioNome
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => {
                  setGrupoSelecionado(null);
                  router.push("/disparos-agendados");
                }}
                aria-label="Fechar resumo do grupo"
              >
                ×
              </button>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Resumo</h4>
              <div className={styles.detailsGrid}>
                <div className={styles.detailGroup}>
                  <span>Status geral</span>
                  <strong className={grupoStatusClass(grupoSelecionado.status)}>
                    {grupoStatusLabel(grupoSelecionado.status)}
                  </strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Total</span>
                  <strong>{grupoSelecionado.total} automações</strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Executadas</span>
                  <strong>{grupoSelecionado.executados}</strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Pendentes</span>
                  <strong>{grupoSelecionado.pendentes + grupoSelecionado.executando}</strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Canceladas</span>
                  <strong>{grupoSelecionado.cancelados}</strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Erros</span>
                  <strong>{grupoSelecionado.erros}</strong>
                </div>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Agendamento</h4>
              <div className={styles.detailsGrid}>
                <div className={styles.detailGroup}>
                  <span>Compromisso</span>
                  <strong>{formatarData(grupoSelecionado.compromissoEm)}</strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Próxima execução</span>
                  <strong>{formatarData(grupoSelecionado.proximaExecucaoEm)}</strong>
                </div>
              </div>
              {grupoSelecionado.local ? (
                <div className={styles.detailGroup}>
                  <span>Local</span>
                  <strong>{grupoSelecionado.local}</strong>
                </div>
              ) : null}
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Linha do tempo</h4>
              <div className={styles.groupTimeline}>
                {grupoSelecionado.itens.map((disparo) => {
                  const canal = obterCanalDisparo(disparo);
                  const destino = obterDestinoDisparo(disparo);
                  return (
                    <button
                      key={disparo.id}
                      type="button"
                      className={styles.timelineItem}
                      onClick={() => abrirDisparo(disparo)}
                    >
                      <span className={styles.timelineTime}>{formatarHora(disparo.executar_em)}</span>
                      <span className={styles.timelineIcon}>{canalDisparoIcone(canal)}</span>
                      <span className={styles.timelineContent}>
                        <strong>{obterTipoDisparo(disparo)}</strong>
                        <small>{canalDisparoLabel(canal)} · {destino.valor}</small>
                      </span>
                      <span className={statusClass(disparo.status)}>
                        {statusLabel(disparo.status)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.panelActions}>
              <Link href="/agendas" className={styles.secondaryButton}>
                Abrir agenda
              </Link>
              {grupoSelecionado.pendentes > 0 && podeRealizarDisparos ? (
                <button
                  type="button"
                  className={styles.dangerButtonFull}
                  onClick={() => setGrupoParaCancelar(grupoSelecionado)}
                >
                  Cancelar automações pendentes
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}

        {disparoSelecionado ? (() => {
          const payload = disparoSelecionado.payload_json || {};
          const canal = obterCanalDisparo(disparoSelecionado);
          const destino = obterDestinoDisparo(disparoSelecionado);
          const ehAgenda = Boolean(payload.agendamento_id);
          return (
            <aside className={styles.detailsPanel}>
              <div className={styles.propertiesHeader}>
                <div>
                  <p className={styles.eyebrow}>
                    {ehAgenda ? "Automação do agendamento" : "Disparo agendado"}
                  </p>
                  <h3 className={styles.propertiesTitle}>
                    {obterTipoDisparo(disparoSelecionado)}
                  </h3>
                  <p className={styles.panelSubtitle}>
                    {canalDisparoIcone(canal)} {canalDisparoLabel(canal)}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setDisparoSelecionado(null);
                    router.push("/disparos-agendados");
                  }}
                  aria-label="Fechar detalhes"
                >
                  ×
                </button>
              </div>

              <div className={styles.detailsSection}>
                <h4 className={styles.detailsSectionTitle}>Resumo</h4>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailGroup}>
                    <span>Status</span>
                    <strong className={statusClass(disparoSelecionado.status)}>
                      {statusLabel(disparoSelecionado.status)}
                    </strong>
                  </div>
                  <div className={styles.detailGroup}>
                    <span>Status do envio</span>
                    <strong className={envioStatusClass(disparoSelecionado.envio_status)}>
                      {disparoSelecionado.envio_label || "Ainda não executado"}
                    </strong>
                  </div>
                  <div className={styles.detailGroup}>
                    <span>Tipo</span>
                    <strong>{obterTipoDisparo(disparoSelecionado)}</strong>
                  </div>
                  <div className={styles.detailGroup}>
                    <span>Canal</span>
                    <strong>{canalDisparoLabel(canal)}</strong>
                  </div>
                </div>
              </div>

              {ehAgenda ? (
                <div className={styles.detailsSection}>
                  <h4 className={styles.detailsSectionTitle}>Agendamento</h4>
                  <div className={styles.detailGroup}>
                    <span>Compromisso</span>
                    <strong>{payload.agendamento_titulo || "-"}</strong>
                  </div>
                  <div className={styles.detailsGrid}>
                    <div className={styles.detailGroup}>
                      <span>Cliente</span>
                      <strong>{payload.contato_nome || "-"}</strong>
                    </div>
                    <div className={styles.detailGroup}>
                      <span>Data e hora</span>
                      <strong>{formatarData(payload.agendamento_inicio_at)}</strong>
                    </div>
                  </div>
                  <div className={styles.detailsGrid}>
                    <div className={styles.detailGroup}>
                      <span>Calendário</span>
                      <strong>{payload.calendario_nome || payload.agenda_nome || "-"}</strong>
                    </div>
                    <div className={styles.detailGroup}>
                      <span>Responsável</span>
                      <strong>{payload.responsavel_nome || "-"}</strong>
                    </div>
                  </div>
                  {payload.agendamento_local ? (
                    <div className={styles.detailGroup}>
                      <span>Local</span>
                      <strong>{payload.agendamento_local}</strong>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.detailsSection}>
                <h4 className={styles.detailsSectionTitle}>Destino</h4>
                <div className={styles.detailGroup}>
                  <span>{destino.rotulo}</span>
                  <strong>{destino.valor}</strong>
                </div>
              </div>

              <div className={styles.detailsSection}>
                <h4 className={styles.detailsSectionTitle}>Origem da automação</h4>
                <div className={styles.detailGroup}>
                  <span>{ehAgenda ? "Calendário" : "Fluxo"}</span>
                  <strong>{disparoSelecionado.automacao_fluxos?.nome || "-"}</strong>
                </div>
                <div className={styles.detailGroup}>
                  <span>Regra ou bloco</span>
                  <strong>
                    {disparoSelecionado.automacao_nos?.titulo ||
                      payload.automacao_no_titulo ||
                      "-"}
                  </strong>
                </div>
              </div>

              <div className={styles.detailsSection}>
                <h4 className={styles.detailsSectionTitle}>Datas</h4>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailGroup}>
                    <span>Criado em</span>
                    <strong>{formatarData(disparoSelecionado.created_at)}</strong>
                  </div>
                  <div className={styles.detailGroup}>
                    <span>Programado para</span>
                    <strong>{formatarData(disparoSelecionado.executar_em)}</strong>
                  </div>
                  <div className={styles.detailGroup}>
                    <span>Executado em</span>
                    <strong>{formatarData(disparoSelecionado.executed_at)}</strong>
                  </div>
                  {payload.cancelado_em ? (
                    <div className={styles.detailGroup}>
                      <span>Cancelado em</span>
                      <strong>{formatarData(payload.cancelado_em)}</strong>
                    </div>
                  ) : null}
                </div>
              </div>

              {disparoSelecionado.envio_status === "falha" &&
              disparoSelecionado.envio_erro_amigavel ? (
                <details className={styles.envioErroDetailsSelect}>
                  <summary className={styles.envioErroSummary}>
                    <span>Falha no envio</span>
                    <small>Ver detalhes</small>
                  </summary>
                  <div className={styles.envioErroBox}>
                    <p>{disparoSelecionado.envio_erro_amigavel}</p>
                    {disparoSelecionado.envio_erro_tecnico ? (
                      <small>Detalhe técnico: {disparoSelecionado.envio_erro_tecnico}</small>
                    ) : null}
                  </div>
                </details>
              ) : null}

              <div className={styles.detailGroupPrev}>
                <span>
                  {canal === "whatsapp"
                    ? "Prévia do template"
                    : canal === "email"
                    ? "Prévia do e-mail"
                    : canal === "sistema"
                    ? "Prévia da notificação"
                    : "Resumo do fluxo"}
                </span>
                {canal === "whatsapp" ? (
                  <div className={styles.whatsappPreviewArea}>
                    <div className={styles.whatsappBubble}>
                      <strong className={styles.whatsappPreviewTitle}>
                        {payload.template_nome || "Template WhatsApp"}
                      </strong>
                      <p className={styles.whatsappPreviewText}>
                        {renderizarTextoTemplate(payload)}
                      </p>
                      <div className={styles.whatsappPreviewMeta}>
                        <p className={styles.whatsappPreviewFooter}>Equipe de atendimento</p>
                        <p className={styles.whatsappPreviewTime}>
                          {formatarData(disparoSelecionado.executar_em)}
                        </p>
                      </div>
                      {payload.template_payload?.components
                        ?.find((item: any) => String(item.type || "").toUpperCase() === "BUTTONS")
                        ?.buttons?.map((botao: any, index: number) => (
                          <div key={index} className={styles.whatsappPreviewButton}>
                            ↩ {botao.text || "Botão"}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.channelPreviewCard}>
                    <div className={styles.channelPreviewHeader}>
                      <span className={styles.channelPreviewIcon}>
                        {canalDisparoIcone(canal)}
                      </span>
                      <div>
                        <strong>{obterTipoDisparo(disparoSelecionado)}</strong>
                        <small>{canalDisparoLabel(canal)}</small>
                      </div>
                    </div>
                    <div className={styles.channelPreviewDestination}>
                      <span>{destino.rotulo}</span>
                      <strong>{destino.valor}</strong>
                    </div>
                    <p className={styles.channelPreviewText}>
                      {renderizarTextoTemplate(payload)}
                    </p>
                  </div>
                )}
              </div>

              <div className={styles.panelActions}>
                {payload.conversa_id ? (
                  <Link
                    href={"/conversas?conversaId=" + payload.conversa_id}
                    className={styles.secondaryButton}
                  >
                    Abrir conversa
                  </Link>
                ) : null}
                {ehAgenda ? (
                  <Link href="/agendas" className={styles.secondaryButton}>
                    Abrir agenda
                  </Link>
                ) : null}
                {disparoSelecionado.status === "pendente" && podeRealizarDisparos ? (
                  <button
                    type="button"
                    className={styles.dangerButtonFull}
                    onClick={() => setDisparoParaCancelar(disparoSelecionado)}
                  >
                    Cancelar automação
                  </button>
                ) : null}
              </div>
            </aside>
          );
        })() : null}

        {modalNovoDisparo && podeRealizarDisparos ? (
          <div
            className={styles.modalOverlay}
            onClick={() => setModalNovoDisparo(false)}
          >
            <div
              className={`${styles.modalCard} ${styles.modalDisparoCard}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>WhatsApp</p>

                  <h2 className={styles.modalTitle}>
                    Agendar disparo
                  </h2>

                  <p className={styles.modalSubtitle}>
                    Crie um disparo agendado manual de template WhatsApp.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setErroModal("");
                    setModalNovoDisparo(false);

                    setTemplateVariavel1("nome_contato");
                    setTemplateVariavel2("campanha");
                    setTemplateVariavel3("numero_contato");
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                {erroModal && (
                  <div className={styles.errorAlert}>
                    {erroModal}
                  </div>
                )}
                {loadingModal ? (
                  <div className={styles.emptyState}>
                    Carregando dados do disparo...
                  </div>
                ) : (
                <div className={styles.disparoModalGrid}>
                  <div className={styles.disparoModalMain}>
                    <div className={styles.formSection}>
                      <div className={styles.formSectionHeader}>
                        <h3>Configurações</h3>
                        <p>Selecione integração, template e agendamento.</p>
                      </div>

                      <div className={styles.formGrid}>
                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Integração WhatsApp
                          </label>

                          <select
                            className={styles.input}
                            value={integracaoSelecionada}
                            onChange={(e) => {
                              setIntegracaoSelecionada(e.target.value);
                              setTemplateSelecionado("");
                              setContatosSelecionados([]);
                              setConfirmacaoResponsabilidadeListaFria(false);
                            }}
                            disabled={
                              loadingIntegracoes || integracoes.length <= 1
                            }
                          >
                            <option value="">Selecionar integração</option>

                            {integracoes.map((integracao) => (
                              <option
                                key={integracao.id}
                                value={integracao.id}
                              >
                              {integracao.nome_conexao
                                ? `${integracao.nome_conexao} • ${integracao.numero || "Sem número"}`
                                : integracao.numero || "Integração sem nome"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Template
                          </label>

                          <select
                            className={styles.input}
                            value={templateSelecionado}
                            onChange={(e) => setTemplateSelecionado(e.target.value)}
                          >
                            <option value="">Selecionar template</option>

                            {integracaoSelecionada && !loadingTemplates && templates.length === 0 && (
                              <option value="" disabled>
                                Nenhum template aprovado para esta integração
                              </option>
                            )}

                            {templates.map((template) => (
                              <option
                                key={template.id}
                                value={template.id}
                              >
                                {template.nome} • {template.idioma}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Data
                          </label>

                        <input
                          type="date"
                          className={styles.input}
                          value={agendamentoData}
                          onChange={(e) => setAgendamentoData(e.target.value)}
                        />
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Hora
                          </label>

                          <input
                            type="time"
                            className={styles.input}
                            value={agendamentoHora}
                            onChange={(e) => setAgendamentoHora(e.target.value)}
                          />
                        </div>

                      </div>
                        {totalVariaveis > 0 ? (
                          <div className={styles.templateVariablesSection}>
                            <div className={styles.templateVariablesHint}>
                              Este template usa <strong>{totalVariaveis}</strong>{" "}
                              variável(is).

                              {" "}Variável 1 substitui{" "}
                              <strong>{"{{1}}"}</strong>

                              {totalVariaveis >= 2 ? (
                                <>
                                  , Variável 2 substitui{" "}
                                  <strong>{"{{2}}"}</strong>
                                </>
                              ) : null}

                              {totalVariaveis >= 3 ? (
                                <>
                                  {" "}e Variável 3 substitui{" "}
                                  <strong>{"{{3}}"}</strong>
                                </>
                              ) : null}
                              .
                            </div>

                            <div className={styles.templateVariablesGrid}>
                              <div className={styles.fieldGroup}>
                                <label className={styles.label}>
                                  Variável 1
                                </label>

                                <input
                                  type="text"
                                  className={styles.input}
                                  value={templateVariavel1}
                                  onChange={(e) =>
                                    setTemplateVariavel1(
                                      normalizarEntradaVariavelTemplate(
                                        e.target.value
                                      )
                                    )
                                  }
                                  placeholder="nome_contato"
                                />
                              </div>

                              {totalVariaveis >= 2 ? (
                                <div className={styles.fieldGroup}>
                                  <label className={styles.label}>
                                    Variável 2
                                  </label>

                                  <input
                                    type="text"
                                    className={styles.input}
                                    value={templateVariavel2}
                                    onChange={(e) =>
                                      setTemplateVariavel2(
                                        normalizarEntradaVariavelTemplate(
                                          e.target.value
                                        )
                                      )
                                    }
                                    placeholder="campanha"
                                  />
                                </div>
                              ) : null}

                              {totalVariaveis >= 3 ? (
                                <div className={styles.fieldGroup}>
                                  <label className={styles.label}>
                                    Variável 3
                                  </label>

                                  <input
                                    type="text"
                                    className={styles.input}
                                    value={templateVariavel3}
                                    onChange={(e) =>
                                      setTemplateVariavel3(
                                        normalizarEntradaVariavelTemplate(
                                          e.target.value
                                        )
                                      )
                                    }
                                    placeholder="numero_contato"
                                  />
                                </div>
                              ) : null}
                            </div>

                            <span className={styles.templateVariablesHelp}>
                                Variáveis fixas: {"{{nome_whatsapp}}"}, {"{{nome_contato}}"}, {"{{email_contato}}"}, {"{{numero_contato}}"}, {"{{campanha}}"}, {"{{origem}}"}, {"{{status_lead}}"}, {"{{protocolo_atual}}"} e {"{{ultimo_protocolo}}"}.
                            </span>
                          </div>
                        ) : templateAtual ? (
                          <div className={styles.templateWithoutVariables}>
                            Este template não possui variáveis.
                          </div>
                        ) : null}
                    </div>

                    <div className={styles.formSection}>
                      <div className={styles.formSectionHeader}>
                        <h3>Destinatários</h3>
                        <p>Selecione quem receberá o disparo.</p>
                      </div>

                        <div className={styles.contactsSearchRow}>
                          <div className={styles.field}>
                            <label className={styles.label}>Buscar contatos salvos</label>
                            <input
                              value={buscaContato}
                              onChange={(e) => setBuscaContato(e.target.value)}
                              className={styles.input}
                              placeholder="Busque por nome, telefone, email, campanha..."
                            />
                          </div>

                          <div className={styles.field}>
                            <label className={styles.label}>Filtrar por origem</label>
                            <select
                              value={origemFiltro}
                              onChange={(e) => setOrigemFiltro(e.target.value)}
                              className={styles.input}
                            >
                            <option value="">
                              {origensDisponiveis.length > 0
                                ? "Todas as origens"
                                : "Sem origens"}
                            </option>

                              {origensDisponiveis.map((origem) => (
                                <option key={origem} value={origem}>
                                  {origem}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className={styles.field}>
                            <label className={styles.label}>Filtrar por campanha</label>

                            <select
                              value={campanhaFiltro}
                              onChange={(e) => setCampanhaFiltro(e.target.value)}
                              className={styles.input}
                            >
                            <option value="">
                              {campanhasDisponiveis.length > 0
                                ? "Todas as campanhas"
                                : "Sem campanhas"}
                            </option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                            </select>
                          </div>
                        </div>
                    </div>

                    <div className={styles.contactsSection}>
                      <div className={styles.contactsColumn}>
                        <div className={styles.contactsHeader}>
                          <h3 className={styles.contactsTitle}>
                            Disponíveis
                          </h3>

                          <div className={styles.contactsHeaderActions}>
                            <button
                              type="button"
                              className={styles.TextButtonAdd}
                              onClick={adicionarTodosDisponiveis}
                              disabled={contatosDisponiveisValidos.length === 0}
                            >
                              Add todos
                            </button>

                            <span className={styles.contactsCount}>
                              {contatosDisponiveis.length}
                            </span>
                          </div>
                        </div>

                        <div className={styles.contactsList}>
                          {loadingContatos ? (
                            <div className={styles.emptyMiniState}>Carregando contatos...</div>
                          ) : contatosDisponiveis.length === 0 ? (
                            <div className={styles.emptyMiniState}>
                              Nenhum contato disponível.
                            </div>
                          ) : (
                            contatosDisponiveis.map((contato) => {
                              const telefoneValido = contatoTemTelefoneValido(contato);

                              return (
                                <div key={contato.id} className={styles.contactCard}>
                                  <div className={styles.contactMain}>
                                    <strong className={styles.contactName}>
                                      {contato.nome || contato.telefone || "Sem nome"}
                                    </strong>

                                    <p className={styles.contactMeta}>
                                      {formatarTelefone(contato.telefone)}
                                    </p>

                                    {contato.email ? (
                                      <p className={styles.contactMeta}>{contato.email}</p>
                                    ) : null}

                                    <div className={styles.contactBadges}>
                                      {obterOrigemContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterOrigemContato(contato)}
                                        </span>
                                      ) : null}

                                      {contato.status_lead ? (
                                        <span className={styles.contactBadge}>
                                          {contato.status_lead}
                                        </span>
                                      ) : null}

                                      {obterCampanhaContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterCampanhaContato(contato)}
                                        </span>
                                      ) : null}

                                      <span
                                        className={
                                          contatoTemAlgumOptOut(contato)
                                            ? styles.contactBadgeOptOut
                                            : contato.opt_in_whatsapp === true
                                            ? styles.contactBadgeOptIn
                                            : styles.contactBadgeCold
                                        }
                                      >
                                        {contatoTemAlgumOptOut(contato)
                                          ? rotuloOptOutContato(contato)
                                          : contato.opt_in_whatsapp === true
                                          ? "Opt-in WhatsApp"
                                          : "Lista fria"}
                                      </span>

                                      {!telefoneValido ? (
                                        <span className={styles.contactBadgeWarning}>
                                          Sem telefone válido
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className={styles.ButtonAdd}
                                    onClick={() => adicionarContato(contato)}
                                    disabled={
                                      !telefoneValido ||
                                      contatoTemOptOutParaCategoria(
                                        contato,
                                        categoriaTemplateAtual
                                      )
                                    }
                                  >
                                    Adicionar
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className={styles.contactsColumn}>
                        <div className={styles.contactsHeader}>
                          <h3 className={styles.contactsTitle}>
                            Selecionados
                          </h3>

                          <div className={styles.contactsHeaderActions}>
                            <button
                              type="button"
                              className={styles.TextButtonRemover}
                              onClick={() => setContatosSelecionados([])}
                              disabled={contatosSelecionados.length === 0}
                            >
                              Remover todos
                            </button>

                            <span className={styles.contactsCount}>
                              {contatosSelecionados.length}
                            </span>
                          </div>
                        </div>

                        <div className={styles.contactsList}>
                          {contatosSelecionados.length === 0 ? (
                            <div className={styles.emptyMiniState}>
                              Nenhum contato selecionado.
                            </div>
                          ) : (
                            contatosSelecionados.map((contato) => (
                              <div key={contato.id} className={styles.contactCardSelected}>
                                  <div className={styles.contactMain}>
                                    <strong className={styles.contactName}>
                                      {contato.nome || contato.telefone || "Sem nome"}
                                    </strong>

                                    <p className={styles.contactMeta}>
                                      {formatarTelefone(contato.telefone)}
                                    </p>

                                    {contato.email ? (
                                      <p className={styles.contactMeta}>{contato.email}</p>
                                    ) : null}

                                    <div className={styles.contactBadges}>
                                      {obterOrigemContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterOrigemContato(contato)}
                                        </span>
                                      ) : null}

                                      {contato.status_lead ? (
                                        <span className={styles.contactBadge}>
                                          {contato.status_lead}
                                        </span>
                                      ) : null}

                                      {obterCampanhaContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterCampanhaContato(contato)}
                                        </span>
                                      ) : null}

                                      <span
                                        className={
                                          contatoTemAlgumOptOut(contato)
                                            ? styles.contactBadgeOptOut
                                            : contato.opt_in_whatsapp === true
                                            ? styles.contactBadgeOptIn
                                            : styles.contactBadgeCold
                                        }
                                      >
                                        {contatoTemAlgumOptOut(contato)
                                          ? rotuloOptOutContato(contato)
                                          : contato.opt_in_whatsapp === true
                                          ? "Opt-in WhatsApp"
                                          : "Lista fria"}
                                      </span>
                                    </div>
                                  </div>

                                <button
                                  type="button"
                                  className={styles.dangerButton}
                                  onClick={() => removerContato(contato.id)}
                                >
                                  Remover
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {temContatosOptOut ? (
                      <div
                        className={`${styles.coldListNotice} ${styles.coldListNoticeBlocked}`}
                        role="alert"
                      >
                        <strong>Agendamento bloqueado por opt-out</strong>
                        <p>
                          {totalContatosOptOut} contato(s) selecionado(s)
                          solicitaram o bloqueio da categoria do template
                          selecionado. Remova-os para continuar.
                        </p>
                      </div>
                    ) : null}

                    {temContatosListaFria ? (
                      <div
                        className={`${styles.coldListNotice} ${
                          marketingComListaFria || utilityListaFriaSemOptOut
                            ? styles.coldListNoticeBlocked
                            : styles.coldListNoticeWarning
                        }`}
                        role={
                          marketingComListaFria || utilityListaFriaSemOptOut
                            ? "alert"
                            : "status"
                        }
                      >
                        <strong>
                          {marketingComListaFria
                            ? "Agendamento de marketing bloqueado"
                            : utilityListaFriaSemOptOut
                            ? "Template sem opt-out"
                            : `${totalContatosListaFria} contato(s) de lista fria selecionado(s)`}
                        </strong>
                        <p>
                          {marketingComListaFria
                            ? "Remova os contatos sem opt-in para agendar um template de marketing."
                            : utilityListaFriaSemOptOut
                            ? "Recrie este template utility com o rodapé obrigatório para responder SAIR antes de utilizá-lo com lista fria."
                            : "O template utility exigirá a confirmação de responsabilidade antes do agendamento."}
                        </p>
                        <span>
                          O contato possui opt-in quando já existe uma mensagem
                          recebida dele no WhatsApp da empresa.
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <aside className={styles.disparoPreviewSidebar}>
                    <div className={styles.previewCard}>
                      <span className={styles.previewBadge}>Prévia</span>

                      <div className={styles.whatsappPreviewArea}>
                        <div className={styles.whatsappBubble}>
                          <strong className={styles.whatsappPreviewTitle}>
                            {templateAtual?.nome || "Template WhatsApp"}
                          </strong>

                          <p className={styles.whatsappPreviewText}>
                            {templateAtual
                              ? previewTemplate
                              : "Selecione um template para visualizar a mensagem."}
                          </p>

                          <div className={styles.whatsappPreviewMeta}>
                            <span className={styles.whatsappPreviewFooter}>
                              Equipe de atendimento
                            </span>

                            <span className={styles.whatsappPreviewTime}>
                              {agendamentoHora || "--:--"}
                            </span>
                          </div>

                          {templateAtual?.payload?.components
                            ?.find((item: any) => item.type === "BUTTONS")
                            ?.buttons?.map((botao: any, index: number) => (
                              <div key={index} className={styles.whatsappPreviewButton}>
                                ↩ {botao.text || "Botão"}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.scheduleCard}>
                      <span className={styles.scheduleLabel}>
                        Agendamento
                      </span>

                      <strong className={styles.scheduleDate}>
                        {agendamentoData && agendamentoHora
                          ? `${agendamentoData} às ${agendamentoHora}`
                          : "Nenhuma data selecionada"}
                      </strong>

                      <p className={styles.scheduleDescription}>
                        O disparo será enviado automaticamente
                        na data configurada.
                      </p>
                    </div>
                                        
                    {templateAtual && contatosSelecionados.length > 0 && (
                      <div className={styles.disparoCustoBox}>
                        <div className={styles.disparoCustoHeader}>
                          <span className={styles.disparoCustoEyebrow}>
                            Estimativa de cobrança
                          </span>

                          <span className={styles.disparoCustoCategoria}>
                            {String(previewCusto?.categoria || templateAtual?.categoria || "-").toUpperCase()}
                          </span>
                        </div>

                        <div className={styles.disparoCustoMain}>
                          <div className={styles.disparoCustoValorPrincipal}>
                            {loadingPreviewCusto
                              ? "Calculando..."
                              : `R$ ${(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ ${(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}`}
                          </div>

                          <div className={styles.disparoCustoMetaLinha}>
                            <span>
                              <strong>USD:</strong>{" "}
                              {`US$ ${(previewCusto?.valorTotalUsd ?? 0).toFixed(4)}`}
                            </span>

                            <span>
                              <strong>Cobrados:</strong>{" "}
                              {previewCusto?.totalCobrados ?? 0}
                            </span>

                            <span>
                              <strong>Isentos:</strong>{" "}
                              {previewCusto?.totalIsentos ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className={styles.disparoCustoAviso}>
                          A cobrança pode ser processada pela Meta usando o método de pagamento
                          vinculado à conta empresarial. O valor final pode variar conforme câmbio,
                          impostos, IOF, taxas e regras de cobrança.
                        </div>
                      </div>
                    )}

                  </aside>
                </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setErroModal("");
                    setModalNovoDisparo(false);

                    setTemplateVariavel1("nome_contato");
                    setTemplateVariavel2("campanha");
                    setTemplateVariavel3("numero_contato");
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={criarDisparoAgendado}
                  disabled={
                    salvandoDisparo ||
                    marketingComListaFria ||
                    temContatosOptOut ||
                    utilityListaFriaSemOptOut
                  }
                >
                  {temContatosOptOut
                    ? "Opt-out bloqueado"
                    : utilityListaFriaSemOptOut
                    ? "Template sem opt-out"
                    : marketingComListaFria
                    ? "Marketing bloqueado"
                    : salvandoDisparo
                    ? "Agendando..."
                    : "Agendar disparo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {modalResponsabilidadeListaFriaAberto &&
        podeRealizarDisparos &&
        utilityComListaFria ? (
          <div
            className={styles.modalOverlay}
            onClick={() => {
              setModalResponsabilidadeListaFriaAberto(false);
              setConfirmacaoResponsabilidadeListaFria(false);
            }}
          >
            <div
              className={styles.modalCard}
              role="dialog"
              aria-modal="true"
              aria-labelledby="responsabilidade-agendamento-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Lista fria</p>
                  <h3
                    id="responsabilidade-agendamento-titulo"
                    className={styles.modalTitle}
                  >
                    Confirmar responsabilidade
                  </h3>
                  <p className={styles.modalSubtitle}>
                    O template utility será agendado para{" "}
                    {totalContatosListaFria} contato(s) sem histórico de
                    mensagem recebida.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  aria-label="Fechar"
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.riskBox}>
                  <strong>Este envio possui risco para a conta WhatsApp.</strong>
                  <p>
                    O conteúdo deve ser estritamente transacional ou de
                    serviço. Promoção, prospecção ou oferta em template utility
                    pode resultar em denúncias, limitação ou banimento pela
                    Meta.
                  </p>
                </div>

                <label className={styles.responsibilityCheckbox}>
                  <input
                    type="checkbox"
                    checked={confirmacaoResponsabilidadeListaFria}
                    onChange={(e) =>
                      setConfirmacaoResponsabilidadeListaFria(e.target.checked)
                    }
                  />
                  <span>
                    Confirmo que o conteúdo é utility, que possuo base legal
                    para o contato e que assumo integralmente os riscos deste
                    envio à lista fria.
                  </span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);
                  }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={confirmarResponsabilidadeEAgendar}
                  disabled={
                    !confirmacaoResponsabilidadeListaFria || salvandoDisparo
                  }
                >
                  {salvandoDisparo ? "Agendando..." : "Assumir e agendar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {grupoParaCancelar && podeRealizarDisparos ? (
          <div className={styles.modalOverlay}>
            <div className={styles.modalCard}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Cancelar automações</p>
                  <h3 className={styles.modalTitle}>Confirmar cancelamento do grupo</h3>
                </div>
                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => setGrupoParaCancelar(null)}
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                  <strong>
                    {grupoParaCancelar.pendentes} {grupoParaCancelar.pendentes === 1
                      ? "automação pendente será cancelada."
                      : "automações pendentes serão canceladas."}
                  </strong>
                  <p>
                    As automações já executadas, canceladas ou com erro não serão alteradas.
                    O cancelamento será registrado individualmente para manter a auditoria.
                  </p>
                </div>
                <div className={styles.groupCancelSummary}>
                  <span>Agendamento</span>
                  <strong>{grupoParaCancelar.titulo}</strong>
                  <small>{grupoParaCancelar.contatoNome}</small>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setGrupoParaCancelar(null)}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={cancelarGrupoPendente}
                  disabled={cancelando}
                >
                  {cancelando ? "Cancelando..." : "Cancelar pendentes"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {disparoParaCancelar && podeRealizarDisparos ? (
          <div className={styles.modalOverlay}>
            <div className={`${styles.modalCard}`}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Cancelar disparo</p>
                  <h3 className={styles.modalTitle}>Confirmar cancelamento</h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => setDisparoParaCancelar(null)}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                  <strong>Cancelando esse disparo não será enviado.</strong>
                  <p>
                    O template{" "}
                    <strong>
                      {disparoParaCancelar.payload_json?.template_nome || "selecionado"}
                    </strong>{" "}
                    está agendado para{" "}
                    <strong>{formatarData(disparoParaCancelar.executar_em)}</strong>.
                  </p>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setDisparoParaCancelar(null)}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={cancelarDisparo}
                  disabled={cancelando}
                >
                  {cancelando ? "Cancelando..." : "Cancelar disparo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

export default function DisparosAgendadosPage() {
  return (
    <Suspense fallback={null}>
      <DisparosAgendadosPageContent />
    </Suspense>
  );
}
