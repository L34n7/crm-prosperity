"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, CircleStop, Search } from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { solicitarAtualizacaoDisparosPendentesHeader } from "@/lib/header-summary/events";
import styles from "./disparos-whatsapp.module.css";
import { createClient } from "@/lib/supabase/client";
import { podeRealizarDisparos as usuarioPodeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

type IntegracaoWhatsApp = {
  id: string;
  nome_conexao: string;
  numero: string | null;
  status: string | null;
  waba_id: string | null;
  phone_number_status?: string | null;
  quality_rating?: string | null;
  meta_account_mode?: string | null;
  meta_saude_ultima_verificacao_em?: string | null;
};

type LimiteMeta = {
  limite: number;
  usados: number;
  restantes: number;
  percentual: number;
  tier: string | null;
  origem: string;
  alerta: "normal" | "amarelo" | "vermelho";
};

type TemplateButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: TemplateButton[];
};

type WhatsAppTemplate = {
  id: string;
  empresa_id: string;
  integracao_whatsapp_id: string;
  waba_id: string;
  meta_template_id: string | null;
  nome: string;
  categoria: string;
  idioma: string;
  status: string;
  opt_out_habilitado: boolean;
  quality_rating: string | null;
  rejeicao_motivo: string | null;
  payload: {
    name?: string;
    category?: string;
    language?: string;
    components?: TemplateComponent[];
  } | null;
  created_at: string;
  updated_at: string;
};

type PerfilDinamico = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioSetorVinculo = {
  id?: string;
  usuario_id: string;
  setor_id: string;
  is_principal?: boolean;
  created_at?: string;
};

type UsuarioLogado = {
  id: string;
  empresa_id?: string | null;
  setores_ids?: string[];
  usuarios_setores?: UsuarioSetorVinculo[];
  setor_principal_id?: string | null;
  permissoes?: string[];
  perfis_dinamicos?: PerfilDinamico[];
};

type ResultadoDisparo = {
  id?: string;
  created_at?: string;
  numero: string;
  nome_contato?: string | null;
  ok: boolean;
  status?: number | null;
  status_disparo?: string | null;
  status_label?: string | null;
  template_nome?: string | null;
  template_categoria?: string | null;
  categoria?: string | null;
  mensagem_template?: string | null;
  message_id?: string | null;
  conversa_id?: string | null;
  conversa_protocolo_id?: string | null;
  erro?: string | null;
  erro_amigavel?: string | null;
  erro_tecnico?: string | null;
  metadata_json?: any;
  origem_historico?: string | null;
  campanha_id?: string | null;
  campanha_nome?: string | null;
  status_campanha?: string | null;
  total_itens?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_cancelados?: number | null;
  pausa_motivo?: string | null;
};

type CampanhaDisparoAndamento = {
  id: string;
  nome?: string | null;
  integracao_whatsapp_id?: string | null;
  usuario_id?: string | null;
  status: string | null;
  template_nome?: string | null;
  total?: number;
  enviados?: number;
  falhas?: number;
  cancelados?: number;
  pendentes?: number;
  processando?: number;
  processados?: number;
  motivo?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  paused_at?: string | null;
  finished_at?: string | null;
};

type DisparoAndamentoPayload = {
  ok?: boolean;
  bloquear_disparos?: boolean;
  bloqueio_escopo?: "usuario" | "integracao" | "empresa";
  campanha?: CampanhaDisparoAndamento | null;
};

type CampanhaDisparoRealtimeRow = {
  id?: unknown;
  nome?: unknown;
  empresa_id?: unknown;
  integracao_whatsapp_id?: unknown;
  usuario_id?: unknown;
  status?: unknown;
  template_nome?: unknown;
  total_itens?: unknown;
  total_pendentes?: unknown;
  total_processando?: unknown;
  total_enviados?: unknown;
  total_falhas?: unknown;
  total_cancelados?: unknown;
  pausa_motivo?: unknown;
  erro?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  started_at?: unknown;
  paused_at?: unknown;
  finished_at?: unknown;
};

type ContatoOpcao = {
  id: string;
  empresa_id: string;
  nome: string | null;
  whatsapp_profile_name?: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  origem_exibicao?: string | null;
  campanha_exibicao?: string | null;
  status_lead: string | null;
  opt_in_whatsapp?: boolean;
  whatsapp_opt_out?: boolean;
  whatsapp_opt_out_geral?: boolean;
  whatsapp_opt_out_marketing?: boolean;
  whatsapp_opt_out_utility?: boolean;
  whatsapp_disparo_cooldown_ativo?: boolean;
  whatsapp_disparo_cooldown_categoria?: string | null;
  whatsapp_disparo_cooldown_expira_em?: string | null;
  whatsapp_disparo_cooldown_ocorrencias?: number | null;
  whatsapp_disparo_cooldown_horas?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function obterOrigemContato(contato: ContatoOpcao) {
  return contato.origem_exibicao || contato.origem || "";
}

function obterCampanhaContato(contato: ContatoOpcao) {
  return contato.campanha_exibicao || contato.campanha || "";
}

function contatoTemOptOutParaCategoria(
  contato: ContatoOpcao,
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

function contatoTemAlgumOptOut(contato: ContatoOpcao) {
  return (
    contato.whatsapp_opt_out === true ||
    contato.whatsapp_opt_out_geral === true ||
    contato.whatsapp_opt_out_marketing === true ||
    contato.whatsapp_opt_out_utility === true
  );
}

function rotuloOptOutContato(contato: ContatoOpcao) {
  if (contato.whatsapp_opt_out_geral === true) return "Opt-out de disparos";

  const marketing = contato.whatsapp_opt_out_marketing === true;
  const utility = contato.whatsapp_opt_out_utility === true;

  if (marketing && utility) return "Opt-out Marketing e Utility";
  if (marketing) return "Opt-out Marketing";
  if (utility) return "Opt-out Utility";
  return contato.whatsapp_opt_out === true ? "Opt-out de disparos" : null;
}

function contatoTemCooldownMarketing(contato: ContatoOpcao) {
  return (
    contato.whatsapp_disparo_cooldown_ativo === true &&
    String(contato.whatsapp_disparo_cooldown_categoria || "marketing")
      .trim()
      .toLowerCase() === "marketing"
  );
}

function formatarDuracaoCooldownContato(contato: ContatoOpcao) {
  const horas = Math.max(
    1,
    Math.floor(Number(contato.whatsapp_disparo_cooldown_horas || 6))
  );

  if (horas >= 24 && horas % 24 === 0) {
    const dias = horas / 24;
    return `${dias}d`;
  }

  return `${horas}hr`;
}

type CampanhaHistoricoFiltro = {
  id: string;
  nome?: string | null;
  template_nome?: string | null;
  total_itens?: number | null;
  total_enviados?: number | null;
  created_at?: string | null;
  status?: string | null;
};

type TotaisHistorico = {
  total: number;
  sucesso: number;
  processando: number;
  falha: number;
};

type PaginaHistoricoCache = {
  resultados: ResultadoDisparo[];
  temMais: boolean;
  proximoCursor: string | null;
};

type ConsultaHistoricoCache = {
  atualizadoEm: number;
  paginaAtual: number;
  paginas: Record<string, PaginaHistoricoCache>;
  totais: TotaisHistorico | null;
};

type CampanhasHistoricoCache = {
  atualizadoEm: number;
  campanhas: CampanhaHistoricoFiltro[];
};

type HistoricoCachePersistido = {
  versao: 1;
  consultas: Record<string, ConsultaHistoricoCache>;
  campanhasPorEmpresa: Record<string, CampanhasHistoricoCache>;
};

type CampanhaConflitoContato = {
  campanha_id: string;
  campanha_nome: string;
  template_nome?: string | null;
  enviado_em?: string | null;
};

type GrupoConflitoDisparo = {
  campanha_id: string;
  campanha_nome: string;
  template_nome?: string | null;
  total_contatos: number;
  contatos_ids: string[];
  ultimo_envio_em?: string | null;
};

type DecisaoConflitoDisparo = {
  acao: "incluir" | "remover";
  contatoIds: string[];
};

const EVENTO_DISPARO_ANDAMENTO = "crm:whatsapp-disparo-andamento";
const EVENTO_DISPARO_REFRESH = "crm:whatsapp-disparo-refresh";
const STATUS_CAMPANHAS_ATIVAS = new Set(["pendente", "enviando"]);
const TEMPO_CARD_CAMPANHA_TERMINAL_MS = 8000;
const TESTE_CARD_PAGINA_DISPARO_KEY =
  "crm-whatsapp-disparo-page-card-test";
const HISTORICO_CACHE_STORAGE_KEY = "crm:disparos:historico-cache:v1";
const HISTORICO_CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORICO_CACHE_MAX_CONSULTAS = 20;

let historicoCacheMemoria: HistoricoCachePersistido | null = null;

function criarHistoricoCacheVazio(): HistoricoCachePersistido {
  return {
    versao: 1,
    consultas: {},
    campanhasPorEmpresa: {},
  };
}

function carregarHistoricoCachePersistido() {
  if (historicoCacheMemoria) return historicoCacheMemoria;

  if (typeof window === "undefined") {
    historicoCacheMemoria = criarHistoricoCacheVazio();
    return historicoCacheMemoria;
  }

  try {
    const valor = window.sessionStorage.getItem(HISTORICO_CACHE_STORAGE_KEY);
    const parsed = valor
      ? (JSON.parse(valor) as HistoricoCachePersistido)
      : null;

    historicoCacheMemoria =
      parsed?.versao === 1 ? parsed : criarHistoricoCacheVazio();
  } catch {
    historicoCacheMemoria = criarHistoricoCacheVazio();
  }

  return historicoCacheMemoria;
}

function persistirHistoricoCache() {
  if (typeof window === "undefined" || !historicoCacheMemoria) return;

  try {
    window.sessionStorage.setItem(
      HISTORICO_CACHE_STORAGE_KEY,
      JSON.stringify(historicoCacheMemoria)
    );
  } catch {
    // O cache em memória continua disponível se o limite da sessão for atingido.
  }
}

function chaveConsultaHistorico(
  empresaId: string,
  status: string,
  campanhaId: string,
  busca: string
) {
  return JSON.stringify([
    empresaId,
    status,
    campanhaId,
    busca.trim().toLocaleLowerCase("pt-BR"),
  ]);
}

function obterConsultaHistoricoCache(chave: string) {
  const cache = carregarHistoricoCachePersistido();
  const consulta = cache.consultas[chave];

  if (!consulta) return null;

  if (Date.now() - consulta.atualizadoEm > HISTORICO_CACHE_TTL_MS) {
    delete cache.consultas[chave];
    persistirHistoricoCache();
    return null;
  }

  return consulta;
}

function salvarConsultaHistoricoCache(
  chave: string,
  consulta: ConsultaHistoricoCache
) {
  const cache = carregarHistoricoCachePersistido();
  cache.consultas[chave] = consulta;

  const chaves = Object.entries(cache.consultas).sort(
    ([, a], [, b]) => b.atualizadoEm - a.atualizadoEm
  );

  for (const [chaveAntiga] of chaves.slice(HISTORICO_CACHE_MAX_CONSULTAS)) {
    delete cache.consultas[chaveAntiga];
  }

  persistirHistoricoCache();
}

function obterCampanhasHistoricoCache(empresaId: string) {
  const cache = carregarHistoricoCachePersistido();
  const registro = cache.campanhasPorEmpresa[empresaId];

  if (!registro) return null;

  if (Date.now() - registro.atualizadoEm > HISTORICO_CACHE_TTL_MS) {
    delete cache.campanhasPorEmpresa[empresaId];
    persistirHistoricoCache();
    return null;
  }

  return registro.campanhas;
}

function salvarCampanhasHistoricoCache(
  empresaId: string,
  campanhas: CampanhaHistoricoFiltro[]
) {
  const cache = carregarHistoricoCachePersistido();
  cache.campanhasPorEmpresa[empresaId] = {
    atualizadoEm: Date.now(),
    campanhas,
  };
  persistirHistoricoCache();
}

function invalidarHistoricoCacheEmpresa(empresaId: string) {
  const cache = carregarHistoricoCachePersistido();

  for (const chave of Object.keys(cache.consultas)) {
    try {
      const [empresaConsulta] = JSON.parse(chave) as string[];
      if (empresaConsulta === empresaId) {
        delete cache.consultas[chave];
      }
    } catch {
      delete cache.consultas[chave];
    }
  }

  delete cache.campanhasPorEmpresa[empresaId];
  persistirHistoricoCache();
}

type VariavelPersonalizada = {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  escopo: "global" | "disparos" | "fluxos";
  ativo: boolean;
};

type OpcaoVariavelTemplate = {
  chave: string;
  descricao: string;
  categoria: "Fixa" | "Personalizada";
};

type ProtocolosContatoMap = Record<
  string,
  {
    protocolo_atual: string;
    ultimo_protocolo: string;
  }
>;

const VARIAVEIS_FIXAS_SISTEMA = [
  {
    chave: "nome_contato",
    exemplo: "{{nome_contato}}",
    descricao: "Nome salvo no cadastro do contato.",
  },
  {
    chave: "nome",
    exemplo: "{{nome}}",
    descricao: "Nome do contato.",
  },
  {
    chave: "nome_whatsapp",
    exemplo: "{{nome_whatsapp}}",
    descricao:
      "Nome do perfil do WhatsApp quando existir; se não existir, usa o nome salvo no contato.",
  },
  {
    chave: "email_contato",
    exemplo: "{{email_contato}}",
    descricao: "E-mail salvo no cadastro do contato.",
  },
  {
    chave: "numero_contato",
    exemplo: "{{numero_contato}}",
    descricao: "Número/telefone salvo no cadastro do contato.",
  },
  {
    chave: "campanha",
    exemplo: "{{campanha}}",
    descricao: "Campanha vinculada ao contato.",
  },
  {
    chave: "origem",
    exemplo: "{{origem}}",
    descricao: "Origem do contato.",
  },
  {
    chave: "status_lead",
    exemplo: "{{status_lead}}",
    descricao: "Status atual do lead.",
  },
  {
    chave: "protocolo_atual",
    exemplo: "{{protocolo_atual}}",
    descricao: "Protocolo ativo da conversa atual do contato.",
  },
  {
    chave: "ultimo_protocolo",
    exemplo: "{{ultimo_protocolo}}",
    descricao: "Último protocolo encerrado/inativo do contato.",
  },
];

function extrairBody(payload: WhatsAppTemplate["payload"]) {
  const body = payload?.components?.find((item) => item.type === "BODY");
  return body?.text || "";
}

function extrairHeader(payload: WhatsAppTemplate["payload"]) {
  const header = payload?.components?.find((item) => item.type === "HEADER");
  return header?.text || "";
}

function extrairFooter(payload: WhatsAppTemplate["payload"]) {
  const footer = payload?.components?.find((item) => item.type === "FOOTER");
  return footer?.text || "";
}

function extrairQuickReplies(payload: WhatsAppTemplate["payload"]) {
  const buttons = payload?.components?.find((item) => item.type === "BUTTONS");

  return (
    buttons?.buttons
      ?.filter((button) => button?.type === "QUICK_REPLY" && button?.text)
      .map((button) => button.text || "")
      .filter(Boolean) || []
  );
}

function contarVariaveisTemplate(template: WhatsAppTemplate | null) {
  if (!template?.payload?.components?.length) return 0;

  const components = template.payload.components;
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const buttons = components.find(
    (item) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  function contarTexto(texto?: string | null) {
    const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];
    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((n) => !Number.isNaN(n));

    if (numeros.length === 0) return 0;
    return Math.max(...numeros);
  }

  const totalButtons = (buttons?.buttons || []).reduce(
    (total, button) =>
      String(button?.type || "").toUpperCase() === "URL"
        ? total + contarTexto(button?.url)
        : total,
    0
  );

  return contarTexto(header?.text) + contarTexto(body?.text) + totalButtons;
}

function substituirPreviewSequencial(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;
    return variaveis[index]?.trim() || `{{${numero}}}`;
  });
}

function montarPreviewTemplateDisparo(
  template: WhatsAppTemplate | null,
  variaveis: string[]
) {
  if (!template) return null;

  const components = template.payload?.components || [];
  const header = components.find(
    (item) => String(item.type || "").toUpperCase() === "HEADER"
  );
  const body = components.find(
    (item) => String(item.type || "").toUpperCase() === "BODY"
  );
  const footer = components.find(
    (item) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  let offset = 0;
  const headerTexto = substituirPreviewSequencial(
    header?.text || "",
    variaveis,
    offset
  ).trim();
  offset += contarVariaveisTemplate({
    ...template,
    payload: {
      ...template.payload,
      components: header ? [header] : [],
    },
  });

  const bodyTexto = substituirPreviewSequencial(
    body?.text || "",
    variaveis,
    offset
  ).trim();

  return {
    titulo: headerTexto || template.nome || "Template WhatsApp",
    corpo: bodyTexto || "Template sem conteúdo para prévia.",
    rodape: String(footer?.text || "").trim() || "Equipe de atendimento",
  };
}

function normalizarVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
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

function normalizarBuscaVariavelTemplate(valor: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function SeletorVariavelTemplate({
  label,
  value,
  onChange,
  opcoes,
  carregando,
}: {
  label: string;
  value: string;
  onChange: (chave: string) => void;
  opcoes: OpcaoVariavelTemplate[];
  carregando: boolean;
}) {
  const inputId = useId();
  const listboxId = useId();
  const descricaoId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(value);
  const [buscando, setBuscando] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const opcaoSelecionada = useMemo(
    () => opcoes.find((opcao) => opcao.chave === value) || null,
    [opcoes, value]
  );

  const opcoesFiltradas = useMemo(() => {
    if (!buscando) return opcoes;

    const termo = normalizarBuscaVariavelTemplate(busca);
    if (!termo) return opcoes;

    return opcoes.filter((opcao) => {
      const conteudo = normalizarBuscaVariavelTemplate(
        `${opcao.chave} ${opcao.descricao} ${opcao.categoria}`
      );
      return conteudo.includes(termo);
    });
  }, [busca, buscando, opcoes]);

  const fecharLista = useCallback(() => {
    setAberto(false);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(-1);
  }, [value]);

  const abrirLista = useCallback(() => {
    const indiceSelecionado = opcoes.findIndex(
      (opcao) => opcao.chave === value
    );

    setAberto(true);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(
      indiceSelecionado >= 0 ? indiceSelecionado : opcoes.length > 0 ? 0 : -1
    );
  }, [opcoes, value]);

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        fecharLista();
      }
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    return () => document.removeEventListener("pointerdown", fecharAoClicarFora);
  }, [aberto, fecharLista]);

  useEffect(() => {
    if (
      !aberto ||
      indiceAtivo < 0 ||
      indiceAtivo >= opcoesFiltradas.length
    ) {
      return;
    }

    document
      .getElementById(`${listboxId}-option-${indiceAtivo}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [aberto, indiceAtivo, listboxId, opcoesFiltradas.length]);

  function selecionarOpcao(opcao: OpcaoVariavelTemplate) {
    onChange(opcao.chave);
    setBusca(opcao.chave);
    setBuscando(false);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function navegarOpcoes(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && aberto) {
      event.preventDefault();
      fecharLista();
      return;
    }

    if (event.key === "Tab") {
      fecharLista();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!aberto) {
        abrirLista();
        return;
      }

      if (opcoesFiltradas.length === 0) return;

      const direcao = event.key === "ArrowDown" ? 1 : -1;
      setIndiceAtivo((indiceAtual) => {
        if (indiceAtual < 0) {
          return direcao > 0 ? 0 : opcoesFiltradas.length - 1;
        }

        return (
          (indiceAtual + direcao + opcoesFiltradas.length) %
          opcoesFiltradas.length
        );
      });
      return;
    }

    if (
      event.key === "Enter" &&
      aberto &&
      indiceAtivo >= 0 &&
      opcoesFiltradas[indiceAtivo]
    ) {
      event.preventDefault();
      selecionarOpcao(opcoesFiltradas[indiceAtivo]);
    }
  }

  return (
    <div className={styles.variableComboboxField} ref={containerRef}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <div
        className={`${styles.variableComboboxControl} ${
          aberto ? styles.variableComboboxControlOpen : ""
        }`}
      >
        <Search
          size={16}
          strokeWidth={2}
          className={styles.variableComboboxSearchIcon}
          aria-hidden="true"
        />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={listboxId}
          aria-describedby={descricaoId}
          aria-activedescendant={
            aberto &&
            indiceAtivo >= 0 &&
            indiceAtivo < opcoesFiltradas.length
              ? `${listboxId}-option-${indiceAtivo}`
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={aberto ? busca : value}
          placeholder="Selecione uma variável"
          className={styles.variableComboboxInput}
          onFocus={(event) => {
            abrirLista();
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!aberto) abrirLista();
            if (!buscando) event.currentTarget.select();
          }}
          onChange={(event) => {
            setBusca(event.target.value);
            setBuscando(true);
            setAberto(true);
            setIndiceAtivo(0);
          }}
          onKeyDown={navegarOpcoes}
        />
        <button
          type="button"
          className={styles.variableComboboxToggle}
          aria-label={aberto ? "Fechar variáveis" : "Abrir variáveis"}
          aria-expanded={aberto}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (aberto) {
              fecharLista();
            } else {
              abrirLista();
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={aberto ? styles.variableComboboxChevronOpen : ""}
          />
        </button>
      </div>

      {aberto ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções para ${label}`}
          className={styles.variableComboboxMenu}
        >
          {opcoesFiltradas.map((opcao, index) => {
            const selecionada = opcao.chave === value;
            const ativa = index === indiceAtivo;

            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={`${opcao.categoria}-${opcao.chave}`}
                type="button"
                role="option"
                aria-selected={selecionada}
                className={`${styles.variableComboboxOption} ${
                  ativa ? styles.variableComboboxOptionActive : ""
                } ${selecionada ? styles.variableComboboxOptionSelected : ""}`}
                onMouseEnter={() => setIndiceAtivo(index)}
                onClick={() => selecionarOpcao(opcao)}
              >
                <span className={styles.variableComboboxOptionHeader}>
                  <strong>{`{{${opcao.chave}}}`}</strong>
                  <span className={styles.variableComboboxCategory}>
                    {opcao.categoria}
                  </span>
                  {selecionada ? (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className={styles.variableComboboxCheck}
                    />
                  ) : null}
                </span>
                <small>{opcao.descricao}</small>
              </button>
            );
          })}

          {opcoesFiltradas.length === 0 ? (
            <div className={styles.variableComboboxEmpty}>
              Nenhuma variável encontrada.
            </div>
          ) : null}

          {carregando ? (
            <div className={styles.variableComboboxLoading}>
              Carregando variáveis personalizadas...
            </div>
          ) : null}
        </div>
      ) : null}

      <p id={descricaoId} className={styles.variableComboboxDescription}>
        {opcaoSelecionada
          ? opcaoSelecionada.descricao
          : "Selecione uma variável disponível para este campo."}
      </p>
    </div>
  );
}

function resolverVariavelContato(
  valor: string,
  contato: ContatoOpcao,
  variaveisPersonalizadas: VariavelPersonalizada[] = [],
  protocolosPorContato: ProtocolosContatoMap = {}
) {
  const texto = String(valor || "").trim();
  const chave = normalizarVariavelTemplate(texto);

  if (!texto) return "";

  if (chave === "nome" || chave === "nome_contato" || chave === "contato_nome") {
    return contato.nome || "Cliente";
  }

  if (
    chave === "nome_whatsapp" ||
    chave === "whatsapp_nome" ||
    chave === "nome_perfil_whatsapp" ||
    chave === "perfil_whatsapp_nome"
  ) {
    return contato.whatsapp_profile_name || contato.nome || "";
  }

  if (
    chave === "telefone" ||
    chave === "numero" ||
    chave === "numero_contato" ||
    chave === "contato_numero"
  ) {
    return contato.telefone || "";
  }

  if (chave === "email" || chave === "email_contato" || chave === "contato_email") {
    return contato.email || "";
  }

  if (chave === "campanha") {
    return (
      obterCampanhaContato(contato) ||
      contato.status_lead ||
      contato.telefone ||
      ""
    );
  }

  if (chave === "status_lead" || chave === "status") {
    return (
      contato.status_lead ||
      obterCampanhaContato(contato) ||
      contato.telefone ||
      ""
    );
  }

  if (chave === "origem") {
    return obterOrigemContato(contato);
  }

  if (chave === "protocolo_atual") {
    return protocolosPorContato[contato.id]?.protocolo_atual || "";
  }

  if (chave === "ultimo_protocolo") {
    return protocolosPorContato[contato.id]?.ultimo_protocolo || "";
  }

  const variavelPersonalizada = variaveisPersonalizadas.find(
    (item) => normalizarVariavelTemplate(item.chave) === chave
  );

  if (variavelPersonalizada) {
    return variavelPersonalizada.valor || "";
  }

  return texto;
}

function formatarStatusIntegracao(status?: string | null) {
  if (!status) return "Sem status";

  switch (status.toLowerCase()) {
    case "ativo":
      return "Ativa";
    case "conectado":
      return "Conectada";
    case "inativo":
      return "Inativa";
    default:
      return status;
  }
}

function getTemplateStatusLabel(status: string | null | undefined) {
  if (!status) return "Sem status";

  switch (status.toUpperCase()) {
    case "PENDING":
      return "Em análise";
    case "APPROVED":
      return "Aprovado";
    case "REJECTED":
      return "Rejeitado";
    case "PAUSED":
      return "Pausado";
    case "DISABLED":
      return "Desativado";
    case "ARCHIVED":
      return "Arquivado";
    case "ERRO_ENVIO":
      return "Erro no envio";
    default:
      return status;
  }
}

function formatarCategoriaMeta(categoria: string | null | undefined) {
  switch (String(categoria || "").toUpperCase()) {
    case "UTILITY":
      return "UTILITY";
    case "MARKETING":
      return "MARKETING";
    case "AUTHENTICATION":
      return "Autenticação";
    default:
      return categoria || "-";
  }
}

function normalizarMetadataJson(metadata: any) {
  if (!metadata) return null;

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  return metadata;
}

function obterFeedbackErroDisparo(item: ResultadoDisparo) {
  if (disparoEstaProcessando(item)) return null;
  if (disparoTeveSucesso(item)) return null;

  const metadata = normalizarMetadataJson(item.metadata_json);

  const erroMeta =
    metadata?.whatsapp_status?.raw_status?.errors?.[0] ||
    metadata?.meta_response?.error ||
    null;

  const codigo = Number(erroMeta?.code || 0);

  const mensagemTecnica =
    item.erro_tecnico ||
    item.erro ||
    metadata?.whatsapp_status?.error_message ||
    erroMeta?.message ||
    erroMeta?.title ||
    "Falha ao enviar mensagem.";

  switch (codigo) {
    case 131031:
      return {
        titulo: "Conta WhatsApp Business bloqueada pela Meta",
        descricao:
          "A Meta bloqueou ou desativou a conta WhatsApp Business vinculada a este número. Enquanto o status estiver desativado/bloqueado, o CRM não consegue enviar mensagens por essa integração. Acesse o Gerenciador do WhatsApp na Meta e solicite uma análise se acreditar que foi um engano.",
        detalhe: mensagemTecnica,
      };

    case 131042:
      return {
        titulo: "Falha por pendência financeira na Meta",
        descricao:
          "A conta WhatsApp Business possui pendências financeiras ou não configurou um metodo de pagamento na Meta. Para regularizar, acesse o Gerenciador de Negócios da Meta, vá em Cobrança/Pagamentos, selecione a conta WhatsApp Business e quite o valor pendente. Depois da confirmação do pagamento, tente enviar o disparo novamente.",        detalhe: mensagemTecnica,
      };

    case 131026:
      return {
        titulo: "Número indisponível no WhatsApp",
        descricao:
          "O número do destinatário pode estar inválido, bloqueado ou indisponível para receber mensagens pelo WhatsApp.",
        detalhe: mensagemTecnica,
      };

    case 470:
      return {
        titulo: "Janela de atendimento encerrada",
        descricao:
          "A janela de 24 horas com este contato foi encerrada. Para iniciar uma nova conversa, envie um template aprovado.",
        detalhe: mensagemTecnica,
      };

    case 368:
      return {
        titulo: "Conta temporariamente bloqueada pela Meta",
        descricao:
          "A Meta bloqueou temporariamente o envio de mensagens desta conta WhatsApp.",
        detalhe: mensagemTecnica,
      };

    default:
      if (item.erro_amigavel) {
        return {
          titulo: "Falha no envio",
          descricao: item.erro_amigavel,
          detalhe: mensagemTecnica,
        };
      }

      return {
        titulo: "Falha no envio",
        descricao: mensagemTecnica,
        detalhe: mensagemTecnica,
      };
  }
}


function getTemplateStatusClass(status: string | null | undefined) {
  if (!status) return styles.badgeGray;

  switch (status.toUpperCase()) {
    case "PENDING":
      return styles.badgeYellow;
    case "APPROVED":
      return styles.badgeGreen;
    case "REJECTED":
      return styles.badgeRed;
    case "PAUSED":
    case "DISABLED":
    case "ARCHIVED":
      return styles.badgeGray;
    default:
      return styles.badgeBlue;
  }
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(numero: string | null | undefined) {
  const limpo = limparNumero(numero);

  if (!limpo) return "Sem telefone";
  return limpo;
}

function formatarNumeroMeta(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "0";
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function formatarPercentualMeta(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "0%";
  return `${Math.round(valor * 100)}%`;
}

function formatarLimiteTierMeta(tier?: string | null) {
  const valor = String(tier || "").trim().toUpperCase();

  if (!valor) return "Limite padrão do sistema";
  if (valor.includes("UNLIMITED")) return "Alcance sem limite informado";
  if (valor.includes("100K")) return "Até 100 mil contatos únicos em 24h";
  if (valor.includes("10K")) return "Até 10 mil contatos únicos em 24h";
  if (valor.includes("1K")) return "Até 1 mil contatos únicos em 24h";
  if (valor.includes("250")) return "Até 250 contatos únicos em 24h";
  if (valor.includes("50")) return "Até 50 contatos únicos em 24h";

  return "Limite informado pela Meta";
}

function formatarQualidadeMeta(quality?: string | null) {
  const valor = String(quality || "").trim().toUpperCase();

  switch (valor) {
    case "GREEN":
    case "HIGH":
      return "Saúdavel";
    case "YELLOW":
    case "MEDIUM":
      return "Atenção";
    case "RED":
    case "LOW":
      return "Risco alto";
    default:
      return "Não informada";
  }
}

function formatarModoMeta(mode?: string | null) {
  const valor = String(mode || "").trim().toUpperCase();

  switch (valor) {
    case "LIVE":
      return "Em produção";
    case "SANDBOX":
    case "TEST":
    case "TESTING":
      return "Ambiente de teste";
    default:
      return "Nao informado";
  }
}

function contatoTemTelefoneValido(contato: ContatoOpcao) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}

function formatarDataHora(data?: string | null) {
  if (!data) return "";

  try {
    return new Date(data).toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

function dataHojeParaInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarDataHoraCurta(data?: string | null) {
  if (!data) return "";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(data))
      .replace(",", "");
  } catch {
    return "";
  }
}

function nomeCampanhaHistorico(campanha?: CampanhaHistoricoFiltro | null) {
  if (!campanha) return "Disparo em massa";
  if (campanha.nome) return campanha.nome;

  const total = Number(campanha.total_itens || 0);
  const unidade = total === 1 ? "contato" : "contatos";
  const data = formatarDataHoraCurta(campanha.created_at) || "data nao informada";

  return `Disparo em massa - ${data} - ${total} ${unidade}`;
}

function truncarNomeBadge(valor: string, limite = 34) {
  const texto = String(valor || "").trim();

  if (texto.length <= limite) return texto;

  return `${texto.slice(0, Math.max(0, limite - 3)).trim()}...`;
}

function normalizarTextoBusca(valor?: string | null) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function emitirRefreshDisparoEmMassa() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_DISPARO_REFRESH));
}

function textoCampanha(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function inteiroCampanha(valor: unknown) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, Math.trunc(numero)) : 0;
}

function campanhaEstaAtiva(campanha?: CampanhaDisparoAndamento | null) {
  return STATUS_CAMPANHAS_ATIVAS.has(String(campanha?.status || ""));
}

function campanhaFoiConcluida(campanha?: CampanhaDisparoAndamento | null) {
  return String(campanha?.status || "") === "concluida";
}

function motivoCampanhaRealtime(row: CampanhaDisparoRealtimeRow) {
  const motivo = textoCampanha(row.pausa_motivo) || textoCampanha(row.erro);

  if (motivo) return motivo;

  switch (textoCampanha(row.status)) {
    case "pausada_por_conta_bloqueada":
      return "A Meta bloqueou ou desativou a conta WhatsApp Business durante o disparo.";
    case "pausada_por_lista_invalida":
      return "A lista apresentou muitos numeros invalidos ou indisponiveis.";
    case "pausada_por_erro_meta":
      return "A Meta retornou erros que exigem pausa operacional.";
    case "pausada_por_falhas":
      return "Muitas mensagens falharam no lote processado.";
    case "cancelada":
      return "O disparo foi cancelado antes de concluir todos os envios.";
    case "erro":
      return "O disparo foi interrompido por erro operacional.";
    default:
      return null;
  }
}

function normalizarCampanhaRealtime(
  row: unknown
): CampanhaDisparoAndamento | null {
  if (!row || typeof row !== "object") return null;

  const campanha = row as CampanhaDisparoRealtimeRow;
  const id = textoCampanha(campanha.id);

  if (!id) return null;

  const total = inteiroCampanha(campanha.total_itens);
  const enviados = inteiroCampanha(campanha.total_enviados);
  const falhas = inteiroCampanha(campanha.total_falhas);
  const cancelados = inteiroCampanha(campanha.total_cancelados);
  const pendentes = inteiroCampanha(campanha.total_pendentes);
  const processando = inteiroCampanha(campanha.total_processando);

  return {
    id,
    nome: textoCampanha(campanha.nome),
    integracao_whatsapp_id: textoCampanha(campanha.integracao_whatsapp_id),
    usuario_id: textoCampanha(campanha.usuario_id),
    status: textoCampanha(campanha.status),
    template_nome: textoCampanha(campanha.template_nome),
    total,
    enviados,
    falhas,
    cancelados,
    pendentes,
    processando,
    processados: Math.min(total, enviados + falhas + cancelados),
    motivo: motivoCampanhaRealtime(campanha),
    created_at: textoCampanha(campanha.created_at),
    updated_at: textoCampanha(campanha.updated_at),
    started_at: textoCampanha(campanha.started_at),
    paused_at: textoCampanha(campanha.paused_at),
    finished_at: textoCampanha(campanha.finished_at),
  };
}

function progressoCampanha(campanha: CampanhaDisparoAndamento) {
  const total = inteiroCampanha(campanha.total);

  if (!total) return 0;

  const processados = Math.min(
    total,
    Math.max(
      inteiroCampanha(campanha.processados),
      inteiroCampanha(campanha.enviados) + inteiroCampanha(campanha.falhas)
    )
  );

  return Math.max(4, Math.min(100, Math.round((processados / total) * 100)));
}

function rotuloStatusCampanha(campanha: CampanhaDisparoAndamento) {
  if (campanhaEstaAtiva(campanha)) return "Processando";
  if (campanhaFoiConcluida(campanha)) return "Concluido";
  return "Interrompido";
}

function descricaoCampanhaTerminal(campanha: CampanhaDisparoAndamento) {
  if (campanhaFoiConcluida(campanha)) {
    return "Disparo em massa finalizado com sucesso.";
  }

  return (
    campanha.motivo ||
    "Disparo em massa interrompido pelo sistema de seguranca."
  );
}

function criarCampanhaPaginaTeste(
  modo: string,
  integracaoWhatsappId?: string | null
): CampanhaDisparoAndamento | null {
  const valor = modo.trim().toLowerCase();

  if (!valor || valor === "off" || valor === "false") return null;

  if (valor === "success" || valor === "sucesso" || valor === "concluida") {
    return {
      id: "teste-pagina-disparo-sucesso",
      integracao_whatsapp_id: integracaoWhatsappId || null,
      status: "concluida",
      template_nome: "teste_visual",
      total: 250,
      enviados: 244,
      falhas: 6,
      cancelados: 0,
      pendentes: 0,
      processando: 0,
      processados: 250,
      motivo: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };
  }

  if (
    valor === "paused" ||
    valor === "pausado" ||
    valor === "breaker" ||
    valor === "erro"
  ) {
    return {
      id: "teste-pagina-disparo-pausado",
      integracao_whatsapp_id: integracaoWhatsappId || null,
      status: "pausada_por_falhas",
      template_nome: "teste_visual",
      total: 250,
      enviados: 87,
      falhas: 14,
      cancelados: 149,
      pendentes: 149,
      processando: 0,
      processados: 101,
      motivo:
        "Campanha pausada automaticamente porque muitas mensagens falharam no ultimo lote.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      paused_at: new Date().toISOString(),
    };
  }

  return {
    id: "teste-pagina-disparo-ativo",
    integracao_whatsapp_id: integracaoWhatsappId || null,
    status: "enviando",
    template_nome: "teste_visual",
    total: 250,
    enviados: 72,
    falhas: 2,
    cancelados: 0,
    pendentes: 175,
    processando: 1,
    processados: 74,
    motivo: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  };
}

function valorNumericoHistorico(...valores: unknown[]) {
  for (const valor of valores) {
    const numero = Number(valor);

    if (Number.isFinite(numero)) {
      return Math.max(0, Math.trunc(numero));
    }
  }

  return 0;
}

function historicoEhCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json);

  return (
    item.origem_historico === "campanha_pausada" ||
    metadata?.tipo === "campanha_disparo_pausada"
  );
}

function obterTotaisCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};

  const totalItens = valorNumericoHistorico(
    item.total_itens,
    metadata.total_itens
  );
  const totalEnviados = valorNumericoHistorico(
    item.total_enviados,
    metadata.total_enviados
  );
  const totalFalhas = valorNumericoHistorico(
    item.total_falhas,
    metadata.total_falhas
  );
  const totalCanceladosDireto = valorNumericoHistorico(
    item.total_cancelados,
    metadata.total_cancelados
  );
  const totalCanceladosCalculado = Math.max(
    totalItens - totalEnviados - totalFalhas,
    0
  );

  return {
    totalItens,
    totalEnviados,
    totalFalhas,
    totalCancelados: Math.max(totalCanceladosDireto, totalCanceladosCalculado),
  };
}

function obterTituloCampanhaPausada(item: ResultadoDisparo) {
  if (item.campanha_nome) return item.campanha_nome;

  const totais = obterTotaisCampanhaPausada(item);
  const data = formatarDataHora(item.created_at) || "data não informada";
  const unidade = totais.totalItens === 1 ? "contato" : "contatos";

  return `Disparo em massa dia: ${data}, ${totais.totalItens} ${unidade}`;
}

function obterMotivoCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};
  const motivoMetadata =
    typeof metadata.pausa_motivo === "string" ? metadata.pausa_motivo : "";

  return (
    item.pausa_motivo ||
    item.erro_amigavel ||
    item.erro ||
    motivoMetadata ||
    "O disparo em massa foi cancelado automaticamente para proteger a conta WhatsApp e a estabilidade do sistema."
  );
}

function obterCategoriaHistorico(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};

  return (
    item.template_categoria ||
    item.categoria ||
    metadata.template_categoria ||
    metadata.categoria ||
    metadata.template?.category ||
    metadata.template?.categoria ||
    null
  );
}

function obterStatusCampanhaPausada(item: ResultadoDisparo) {
  const metadata = normalizarMetadataJson(item.metadata_json) || {};
  const status = String(item.status_campanha || metadata.status_campanha || "");

  switch (status) {
    case "pausada_por_conta_bloqueada":
      return "Cancelado por bloqueio da Meta";
    case "pausada_por_lista_invalida":
      return "Cancelado por lista inválida";
    case "pausada_por_erro_meta":
      return "Cancelado por erro da Meta";
    case "pausada_por_falhas":
      return "Cancelado por muitas falhas";
    case "cancelada":
      return "Disparo em massa cancelado";
    default:
      return item.status_label || "Disparo em massa cancelado";
  }
}

function normalizarStatusDisparo(item: ResultadoDisparo) {
  return String(item.status_disparo || "").toLowerCase().trim();
}

function disparoEstaProcessando(item: ResultadoDisparo) {
  return normalizarStatusDisparo(item) === "processando";
}

function disparoTeveSucesso(item: ResultadoDisparo) {
  return item.ok === true || normalizarStatusDisparo(item) === "sucesso";
}

function disparoTeveFalha(item: ResultadoDisparo) {
  if (historicoEhCampanhaPausada(item)) return true;

  const status = normalizarStatusDisparo(item);

  if (status === "processando") return false;
  if (status === "sucesso") return false;

  return item.ok === false || status === "falha";
}


const ITENS_HISTORICO_POR_PAGINA = 7;

export default function DisparosWhatsAppPage() {
  const supabaseRealtimeRef = useRef<ReturnType<typeof createClient> | null>(
    null
  );
  const timerCardCampanhaRef = useRef<number | null>(null);
  const historicoConsultaAtivaRef = useRef("");
  const contatosConsultaAtivaRef = useRef(0);
  const [usuarioLogado, setUsuarioLogado] = useState<UsuarioLogado | null>(null);

  const [integracoes, setIntegracoes] = useState<IntegracaoWhatsApp[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [contatos, setContatos] = useState<ContatoOpcao[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<ContatoOpcao[]>([]);

  const [loadingUsuario, setLoadingUsuario] = useState(true);
  const [loadingIntegracoes, setLoadingIntegracoes] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingSaudeMeta, setLoadingSaudeMeta] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [cancelandoCampanha, setCancelandoCampanha] = useState(false);
  const [modalCancelarCampanhaAberto, setModalCancelarCampanhaAberto] =
    useState(false);
  const [disparoEmMassaProcessando, setDisparoEmMassaProcessando] =
    useState(false);
  const [integracaoDisparoProcessando, setIntegracaoDisparoProcessando] =
    useState(false);
  const [campanhaPagina, setCampanhaPagina] =
    useState<CampanhaDisparoAndamento | null>(null);
  const [totalContatosDisponiveis, setTotalContatosDisponiveis] = useState(0);
  const [limiteMeta, setLimiteMeta] = useState<LimiteMeta | null>(null);
  const [saudeMetaIntegracao, setSaudeMetaIntegracao] =
    useState<Partial<IntegracaoWhatsApp> | null>(null);

  const [integracaoId, setIntegracaoId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateVariavel1, setTemplateVariavel1] = useState("");
  const [templateVariavel2, setTemplateVariavel2] = useState("");
  const [templateVariavel3, setTemplateVariavel3] = useState("");
  const [nomeCampanhaDisparo, setNomeCampanhaDisparo] = useState("");
  const [agendarDisparo, setAgendarDisparo] = useState(false);
  const [agendamentoData, setAgendamentoData] = useState("");
  const [agendamentoHora, setAgendamentoHora] = useState("");
  const [buscaContato, setBuscaContato] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState("");
  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([]);

  const [campanhaFiltro, setCampanhaFiltro] = useState("");
  const [campanhasDisponiveis, setCampanhasDisponiveis] = useState<string[]>([]);
  const [disparoAnteriorFiltroContatos, setDisparoAnteriorFiltroContatos] =
    useState("");

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [erroConflitos, setErroConflitos] = useState("");
  const [resultado, setResultado] = useState<ResultadoDisparo[]>([]);
  const [totaisHistorico, setTotaisHistorico] = useState<TotaisHistorico>({
    total: 0,
    sucesso: 0,
    processando: 0,
    falha: 0,
  });
  const [historicoTemMais, setHistoricoTemMais] = useState(false);
  const [campanhasHistorico, setCampanhasHistorico] = useState<
    CampanhaHistoricoFiltro[]
  >([]);
  const [mensagensExpandidas, setMensagensExpandidas] = useState<string[]>([]);
  const [paginaHistorico, setPaginaHistorico] = useState(1);

  const [modalConfirmacaoAberto, setModalConfirmacaoAberto] = useState(false);
  const [confirmacaoCobranca, setConfirmacaoCobranca] = useState(false);
  const [
    modalResponsabilidadeListaFriaAberto,
    setModalResponsabilidadeListaFriaAberto,
  ] = useState(false);
  const [
    confirmacaoResponsabilidadeListaFria,
    setConfirmacaoResponsabilidadeListaFria,
  ] = useState(false);
  const [modalVariaveisAberto, setModalVariaveisAberto] = useState(false);
  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizada[]
  >([]);
  const [loadingVariaveis, setLoadingVariaveis] = useState(false);
  const [salvandoVariavel, setSalvandoVariavel] = useState(false);
  const [erroVariavelModal, setErroVariavelModal] = useState("");
  const [novaVariavelChave, setNovaVariavelChave] = useState("");
  const [novaVariavelValor, setNovaVariavelValor] = useState("");
  const [novaVariavelDescricao, setNovaVariavelDescricao] = useState("");

  const [filtroHistorico, setFiltroHistorico] = useState<
    "todos" | "sucesso" | "falha" | "processando"
  >("todos");
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [buscaHistoricoConsulta, setBuscaHistoricoConsulta] = useState("");
  const [filtroHistoricoCampanha, setFiltroHistoricoCampanha] = useState("");
  const [loadingConflitos, setLoadingConflitos] = useState(false);

  const [gruposConflitoDisparo, setGruposConflitoDisparo] = useState<
    GrupoConflitoDisparo[]
  >([]);
  const [conflitosPorContato, setConflitosPorContato] = useState<
    Record<string, CampanhaConflitoContato[]>
  >({});

  const [historicoDisparosPorContato, setHistoricoDisparosPorContato] = useState<
    Record<string, CampanhaConflitoContato[]>
  >({});

  const [decisoesConflitoDisparo, setDecisoesConflitoDisparo] = useState<
    Record<string, DecisaoConflitoDisparo>
  >({});

  const [previewCusto, setPreviewCusto] = useState<{
    categoria: string;
    totalSelecionados: number;
    totalIsentos: number;
    totalCobrados: number;
    totalTelefonesIsentosUnicos: number;
    totalTelefonesCobradosUnicos: number;
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

  function getSupabaseRealtime() {
    if (!supabaseRealtimeRef.current) {
      supabaseRealtimeRef.current = createClient();
    }

    return supabaseRealtimeRef.current;
  }

  const aplicarCampanhaPagina = useCallback(
    (campanhaAtual: CampanhaDisparoAndamento | null) => {
      setCampanhaPagina(campanhaAtual);
    },
    []
  );

  const carregarCampanhaPagina = useCallback(
    async (integracaoWhatsappId = "") => {
      const integracaoConsultaId = integracaoWhatsappId.trim();
      const params = new URLSearchParams();
      const campanhaTeste =
        typeof window !== "undefined"
          ? criarCampanhaPaginaTeste(
              window.localStorage.getItem(TESTE_CARD_PAGINA_DISPARO_KEY) || "",
              integracaoConsultaId || null
            )
          : null;

      if (campanhaTeste) {
        aplicarCampanhaPagina(campanhaTeste);
        return;
      }

      if (integracaoConsultaId) {
        params.set("integracao_id", integracaoConsultaId);
      } else {
        params.set("escopo", "empresa");
      }

      try {
        const res = await fetch(
          `/api/whatsapp/disparos/andamento?${params.toString()}`,
          {
            cache: "no-store",
          }
        );
        const json = (await res.json()) as DisparoAndamentoPayload;

        if (!res.ok || json.ok === false) return;

        aplicarCampanhaPagina(json.campanha || null);
      } catch {
        return;
      }
    },
    [aplicarCampanhaPagina]
  );

  async function carregarUsuarioLogado() {
    try {
      setLoadingUsuario(true);

      const res = await fetch("/api/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar usuário logado.");
      }

      setUsuarioLogado(data.usuario || null);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar usuário logado.");
    } finally {
      setLoadingUsuario(false);
    }
  }

  async function carregarIntegracoes() {
    try {
      setLoadingIntegracoes(true);
      setErro("");

      const res = await fetch("/api/integracoes-whatsapp/listar", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar integrações.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];
      setIntegracoes(lista);
      setIntegracaoId((integracaoAtual) => {
        if (lista.length === 1) return String(lista[0].id || "");

        return lista.some(
          (integracao: IntegracaoWhatsApp) =>
            integracao.id === integracaoAtual
        )
          ? integracaoAtual
          : "";
      });
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar integrações.");
    } finally {
      setLoadingIntegracoes(false);
    }
  }

  async function carregarTemplates(integracaoSelecionadaId: string) {
    try {
      if (!integracaoSelecionadaId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      setErro("");

      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoSelecionadaId
        )}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      const lista = Array.isArray(json.data) ? json.data : [];
      const aprovados = lista.filter(
        (item: WhatsAppTemplate) => item.status?.toUpperCase() === "APPROVED"
      );
      

      setTemplates(aprovados);
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function carregarContatos(
    busca = "",
    origem = "",
    campanha = "",
    disparoAnteriorId = ""
  ) {
    const requisicaoId = ++contatosConsultaAtivaRef.current;

    try {
      setLoadingContatos(true);
      setErro("");

      const params = new URLSearchParams();

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      if (origem.trim()) {
        params.set("origem", origem.trim());
      }

      if (campanha.trim()) {
        params.set("campanha", campanha.trim());
      }

      if (disparoAnteriorId.trim()) {
        params.set("disparo_anterior_id", disparoAnteriorId.trim());
      }

      if (integracaoId) {
        params.set("integracao_whatsapp_id", integracaoId);
      }

      params.set("pagina", "1");
      params.set("limite", "2000");

      const res = await fetch(`/api/contatos?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao carregar contatos.");
      }

      if (contatosConsultaAtivaRef.current !== requisicaoId) return;

      const lista = Array.isArray(json.contatos) ? json.contatos : [];
      setContatos(lista);
      setTotalContatosDisponiveis(Number(json.total || 0));

    } catch (error: any) {
      if (contatosConsultaAtivaRef.current !== requisicaoId) return;

      setErro(error?.message || "Erro ao carregar contatos.");
      if (disparoAnteriorId) {
        setContatos([]);
        setTotalContatosDisponiveis(0);
      }
    } finally {
      if (contatosConsultaAtivaRef.current === requisicaoId) {
        setLoadingContatos(false);
      }
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
        "[DISPAROS WHATSAPP] Erro ao carregar filtros de contatos:",
        error
      );
    }
  }

  const carregarHistorico = useCallback(
    async (
      opcoes: {
        pagina?: number;
        forcar?: boolean;
        restaurarPagina?: boolean;
      } = {}
    ) => {
      const empresaId = usuarioLogado?.empresa_id;

      if (!empresaId) return;

      const forcar = opcoes.forcar ?? true;

      if (forcar) {
        invalidarHistoricoCacheEmpresa(empresaId);
      }

      const chaveConsulta = chaveConsultaHistorico(
        empresaId,
        filtroHistorico,
        filtroHistoricoCampanha,
        buscaHistoricoConsulta
      );
      let consultaCache = obterConsultaHistoricoCache(chaveConsulta);
      const paginaRestaurada =
        opcoes.restaurarPagina && consultaCache?.paginaAtual
          ? consultaCache.paginaAtual
          : 1;
      const paginaAlvo = Math.max(
        1,
        forcar ? 1 : opcoes.pagina || paginaRestaurada
      );
      const requisicaoId = `${chaveConsulta}:${paginaAlvo}:${Date.now()}`;
      historicoConsultaAtivaRef.current = requisicaoId;

      const campanhasCache = obterCampanhasHistoricoCache(empresaId);

      if (campanhasCache) {
        setCampanhasHistorico(campanhasCache);
      }

      const paginaCache = !forcar
        ? consultaCache?.paginas[String(paginaAlvo)]
        : null;

      if (paginaCache && campanhasCache) {
        consultaCache = {
          ...consultaCache!,
          paginaAtual: paginaAlvo,
          atualizadoEm: Date.now(),
        };
        salvarConsultaHistoricoCache(chaveConsulta, consultaCache);
        setResultado(paginaCache.resultados);
        setHistoricoTemMais(paginaCache.temMais);
        setTotaisHistorico(
          consultaCache.totais || {
            total: paginaCache.resultados.length,
            sucesso: paginaCache.resultados.filter(disparoTeveSucesso).length,
            processando: paginaCache.resultados.filter(disparoEstaProcessando)
              .length,
            falha: paginaCache.resultados.filter(disparoTeveFalha).length,
          }
        );
        setPaginaHistorico(paginaAlvo);
        setLoadingHistorico(false);
        return;
      }

      const paginaAnterior =
        paginaAlvo > 1
          ? consultaCache?.paginas[String(paginaAlvo - 1)]
          : null;

      if (paginaAlvo > 1 && !paginaAnterior?.proximoCursor) {
        setHistoricoTemMais(false);
        return;
      }

      try {
        setLoadingHistorico(true);

        const params = new URLSearchParams({
          limit: String(ITENS_HISTORICO_POR_PAGINA),
          status: filtroHistorico,
        });

        if (paginaAnterior?.proximoCursor) {
          params.set("cursor", paginaAnterior.proximoCursor);
        }

        if (filtroHistoricoCampanha) {
          params.set("campanha_id", filtroHistoricoCampanha);
        }

        if (buscaHistoricoConsulta) {
          params.set("busca", buscaHistoricoConsulta);
        }

        if (!consultaCache?.totais) {
          params.set("incluir_totais", "true");
        }

        if (!campanhasCache) {
          params.set("incluir_campanhas", "true");
        }

        const res = await fetch(`/api/whatsapp/disparos/historico?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(
            json.error || "Erro ao carregar histórico de disparos."
          );
        }

        if (historicoConsultaAtivaRef.current !== requisicaoId) return;

        const resultadosPagina = Array.isArray(json.resultados)
          ? (json.resultados as ResultadoDisparo[])
          : [];
        const totaisRecebidos = json.totais
          ? {
              total: Number(json.totais.total || 0),
              sucesso: Number(json.totais.sucesso || 0),
              processando: Number(json.totais.processando || 0),
              falha: Number(json.totais.falha || 0),
            }
          : consultaCache?.totais || null;
        const novaConsulta: ConsultaHistoricoCache = {
          atualizadoEm: Date.now(),
          paginaAtual: paginaAlvo,
          paginas: {
            ...(consultaCache?.paginas || {}),
            [String(paginaAlvo)]: {
              resultados: resultadosPagina,
              temMais: json.tem_mais === true,
              proximoCursor:
                typeof json.proximo_cursor === "string"
                  ? json.proximo_cursor
                  : null,
            },
          },
          totais: totaisRecebidos,
        };

        salvarConsultaHistoricoCache(chaveConsulta, novaConsulta);

        if (Array.isArray(json.campanhas)) {
          const campanhas = json.campanhas as CampanhaHistoricoFiltro[];
          salvarCampanhasHistoricoCache(empresaId, campanhas);
          setCampanhasHistorico(campanhas);
        }

        setResultado(resultadosPagina);
        setHistoricoTemMais(json.tem_mais === true);
        setTotaisHistorico(
          totaisRecebidos || {
            total: resultadosPagina.length,
            sucesso: resultadosPagina.filter(disparoTeveSucesso).length,
            processando: resultadosPagina.filter(disparoEstaProcessando).length,
            falha: resultadosPagina.filter(disparoTeveFalha).length,
          }
        );
        setPaginaHistorico(paginaAlvo);
      } catch (error) {
        if (historicoConsultaAtivaRef.current !== requisicaoId) return;

        setErro(
          error instanceof Error
            ? error.message
            : "Erro ao carregar histórico de disparos."
        );
      } finally {
        if (historicoConsultaAtivaRef.current === requisicaoId) {
          setLoadingHistorico(false);
        }
      }
    },
    [
      usuarioLogado?.empresa_id,
      filtroHistorico,
      filtroHistoricoCampanha,
      buscaHistoricoConsulta,
    ]
  );

  async function carregarConflitosDisparo(contatosLista: ContatoOpcao[]) {
    const contatosValidos = contatosLista.filter(contatoTemTelefoneValido);

    if (contatosValidos.length === 0) {
      setGruposConflitoDisparo([]);
      setConflitosPorContato({});
      setDecisoesConflitoDisparo({});
      setErroConflitos("");
      return;
    }

    try {
      setLoadingConflitos(true);
      setErroConflitos("");

      const res = await fetch("/api/whatsapp/disparos/conflitos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          janela_dias: 7,
          contatos: contatosValidos.map((contato) => ({
            id: contato.id,
            telefone: contato.telefone,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao verificar contatos repetidos.");
      }

      const grupos = Array.isArray(json.grupos)
        ? (json.grupos as GrupoConflitoDisparo[])
        : [];
      const contatosConflito =
        json.contatos && typeof json.contatos === "object"
          ? (json.contatos as Record<string, CampanhaConflitoContato[]>)
          : {};
      const contatosSelecionadosIds = new Set(contatosLista.map((item) => item.id));
      const campanhasAtuais = new Set(grupos.map((grupo) => grupo.campanha_id));

      setGruposConflitoDisparo(grupos);
      setConflitosPorContato(contatosConflito);
      setDecisoesConflitoDisparo((prev) => {
        const proximo: Record<string, DecisaoConflitoDisparo> = {};

        for (const [campanhaId, decisao] of Object.entries(prev)) {
          if (!campanhasAtuais.has(campanhaId)) continue;

          const contatoIds = decisao.contatoIds.filter((contatoId) =>
            contatosSelecionadosIds.has(contatoId)
          );

          if (contatoIds.length === 0) continue;

          proximo[campanhaId] = {
            ...decisao,
            contatoIds,
          };
        }

        return proximo;
      });
    } catch (error: any) {
      setErroConflitos(
        error?.message || "Erro ao verificar contatos repetidos."
      );
    } finally {
      setLoadingConflitos(false);
    }
  }


    async function carregarHistoricoDisparosDosContatos(contatosLista: ContatoOpcao[]) {
      const contatosValidos = contatosLista.filter(contatoTemTelefoneValido);

      if (contatosValidos.length === 0) {
        setHistoricoDisparosPorContato({});
        return;
      }

      try {
        const res = await fetch("/api/whatsapp/disparos/conflitos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            janela_dias: 7,
            contatos: contatosValidos.map((contato) => ({
              id: contato.id,
              telefone: contato.telefone,
            })),
          }),
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          return;
        }

        const contatosConflito =
          json.contatos && typeof json.contatos === "object"
            ? (json.contatos as Record<string, CampanhaConflitoContato[]>)
            : {};

        setHistoricoDisparosPorContato(contatosConflito);
      } catch {
        return;
      }
    }

  async function carregarBloqueioDisparoEmMassa(integracaoWhatsappId = "") {
    const integracaoConsultaId = integracaoWhatsappId.trim();
    const params = new URLSearchParams();

    if (integracaoConsultaId) {
      params.set("integracao_id", integracaoConsultaId);
    }

    const queryString = params.toString();

    try {
      const res = await fetch(
        `/api/whatsapp/disparos/andamento${
          queryString ? `?${queryString}` : ""
        }`,
        {
          cache: "no-store",
        }
      );

      const json = (await res.json()) as DisparoAndamentoPayload;

      if (!res.ok || json.ok === false) {
        if (integracaoConsultaId) {
          setIntegracaoDisparoProcessando(false);
        } else {
          setDisparoEmMassaProcessando(false);
        }
        return;
      }

      if (integracaoConsultaId) {
        setIntegracaoDisparoProcessando(json.bloquear_disparos === true);
      } else {
        setDisparoEmMassaProcessando(json.bloquear_disparos === true);
      }
    } catch {
      if (integracaoConsultaId) {
        setIntegracaoDisparoProcessando(false);
      } else {
        setDisparoEmMassaProcessando(false);
      }
    }
  }

  async function carregarSaudeMeta(integracaoWhatsappId: string) {
    try {
      setLoadingSaudeMeta(true);

      const params = new URLSearchParams({
        integracao_id: integracaoWhatsappId,
      });
      const res = await fetch(`/api/whatsapp/limite-meta?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar saude Meta.");
      }

      setLimiteMeta(json.limite_meta || null);
      setSaudeMetaIntegracao(json.integracao || null);
    } catch (error: any) {
      setLimiteMeta(null);
      setSaudeMetaIntegracao(null);
      console.warn("[DISPAROS WHATSAPP] Erro ao carregar saude Meta:", error);
    } finally {
      setLoadingSaudeMeta(false);
    }
  }

  useEffect(() => {
    carregarUsuarioLogado();
    carregarIntegracoes();
    carregarContatos("", "", "");
    carregarOpcoesContatos();
    carregarBloqueioDisparoEmMassa();
    carregarCampanhaPagina();
    carregarVariaveisPersonalizadas();
  }, [carregarCampanhaPagina]);

  useEffect(() => {
    const handleAndamento = (event: Event) => {
      const detalhe = (event as CustomEvent<DisparoAndamentoPayload>).detail;
      setDisparoEmMassaProcessando(detalhe?.bloquear_disparos === true);
      carregarCampanhaPagina(integracaoId);
    };

    window.addEventListener(EVENTO_DISPARO_ANDAMENTO, handleAndamento);

    return () => {
      window.removeEventListener(EVENTO_DISPARO_ANDAMENTO, handleAndamento);
    };
  }, [carregarCampanhaPagina, integracaoId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarContatos(
        buscaContato,
        origemFiltro,
        campanhaFiltro,
        disparoAnteriorFiltroContatos
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [
    buscaContato,
    origemFiltro,
    campanhaFiltro,
    disparoAnteriorFiltroContatos,
    integracaoId,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarHistoricoDisparosDosContatos(contatos);
    }, 500);

    return () => clearTimeout(timer);
  }, [contatos]);

  useEffect(() => {
    const timer = setTimeout(() => {
      carregarConflitosDisparo(contatosSelecionados);
    }, 450);

    return () => clearTimeout(timer);
  }, [contatosSelecionados]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaHistoricoConsulta(buscaHistorico.trim());
    }, 400);

    return () => window.clearTimeout(timer);
  }, [buscaHistorico]);

  useEffect(() => {
    if (!usuarioLogado?.empresa_id) return;

    void carregarHistorico({
      forcar: false,
      restaurarPagina: true,
    });
  }, [usuarioLogado?.empresa_id, carregarHistorico]);

  useEffect(() => {
    setTemplateId("");
    setMensagem("");
    setErro("");

    if (integracaoId) {
      carregarTemplates(integracaoId);
      carregarSaudeMeta(integracaoId);
      carregarBloqueioDisparoEmMassa(integracaoId);
      carregarCampanhaPagina(integracaoId);
    } else {
      setTemplates([]);
      setLimiteMeta(null);
      setSaudeMetaIntegracao(null);
      setIntegracaoDisparoProcessando(false);
      carregarCampanhaPagina();
    }
  }, [integracaoId, carregarCampanhaPagina]);

  useEffect(() => {
    if (!integracaoId || !integracaoDisparoProcessando) return;

    const timer = window.setInterval(() => {
      carregarBloqueioDisparoEmMassa(integracaoId);
    }, 2 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [integracaoId, integracaoDisparoProcessando]);

  useEffect(() => {
    const empresaId = usuarioLogado?.empresa_id;

    if (!empresaId) return;

    const supabase = getSupabaseRealtime();
    const channel = supabase
      .channel(`crm-whatsapp-disparo-page:${empresaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_disparo_campanhas",
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const row = payload.new || payload.old;

          if (!row || typeof row !== "object") return;

          const campanhaRealtime = normalizarCampanhaRealtime(row);

          if (!campanhaRealtime) return;

          if (
            integracaoId &&
            campanhaRealtime.integracao_whatsapp_id !== integracaoId
          ) {
            return;
          }

          aplicarCampanhaPagina(campanhaRealtime);

          if (!campanhaEstaAtiva(campanhaRealtime)) {
            void carregarHistorico();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    usuarioLogado?.empresa_id,
    integracaoId,
    aplicarCampanhaPagina,
    carregarHistorico,
  ]);

  useEffect(() => {
    if (timerCardCampanhaRef.current) {
      window.clearTimeout(timerCardCampanhaRef.current);
      timerCardCampanhaRef.current = null;
    }

    if (!campanhaPagina || campanhaEstaAtiva(campanhaPagina)) return;

    timerCardCampanhaRef.current = window.setTimeout(() => {
      setCampanhaPagina(null);
    }, TEMPO_CARD_CAMPANHA_TERMINAL_MS);

    return () => {
      if (timerCardCampanhaRef.current) {
        window.clearTimeout(timerCardCampanhaRef.current);
        timerCardCampanhaRef.current = null;
      }
    };
  }, [campanhaPagina, campanhaPagina?.id, campanhaPagina?.status]);

  useEffect(() => {
    if (!campanhaEstaAtiva(campanhaPagina)) return;

    const timer = window.setInterval(() => {
      carregarCampanhaPagina(integracaoId);
    }, 2 * 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void carregarCampanhaPagina(integracaoId);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    campanhaPagina,
    campanhaPagina?.id,
    campanhaPagina?.status,
    integracaoId,
    carregarCampanhaPagina,
  ]);

  const permissoes = usuarioLogado?.permissoes || [];
  const podeDisparar = usuarioPodeRealizarDisparos({ permissoes });

  const disparoBloqueado =
    disparoEmMassaProcessando || integracaoDisparoProcessando;
  const textoDisparoBloqueado = integracaoDisparoProcessando
    ? "Integracao em processamento"
    : "Disparo em processamento";

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const telefonesSelecionadosUnicos = useMemo(() => {
    return Array.from(
      new Set(
        contatosSelecionados
          .map((contato) => limparNumero(contato.telefone))
          .filter((telefone) => telefone.length >= 10)
      )
    );
  }, [contatosSelecionados]);

  const totalTelefonesQueConsomemLimite = previewCusto
    ? Number(previewCusto.totalTelefonesCobradosUnicos || 0)
    : telefonesSelecionadosUnicos.length;
  const totalTelefonesIsentosLimite = previewCusto
    ? Number(previewCusto.totalTelefonesIsentosUnicos || 0)
    : 0;
  const saldoEstimadoAposSelecao = limiteMeta
    ? limiteMeta.restantes - totalTelefonesQueConsomemLimite
    : null;
  const selecaoExcedeLimite =
    typeof saldoEstimadoAposSelecao === "number" && saldoEstimadoAposSelecao < 0;

  const templateSelecionado = useMemo(() => {
    return templates.find((item) => item.id === templateId) || null;
  }, [templates, templateId]);

  const categoriaTemplateSelecionado = String(
    templateSelecionado?.categoria || ""
  )
    .trim()
    .toLowerCase();
  const contatosListaFriaSelecionados = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          !contatoTemOptOutParaCategoria(
            contato,
            categoriaTemplateSelecionado
          ) &&
          contato.opt_in_whatsapp !== true
      ),
    [contatosSelecionados, categoriaTemplateSelecionado]
  );
  const contatosOptOutSelecionados = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          contatoTemOptOutParaCategoria(
            contato,
            categoriaTemplateSelecionado
          )
      ),
    [contatosSelecionados, categoriaTemplateSelecionado]
  );
  const contatosCooldownSelecionados = useMemo(
    () =>
      categoriaTemplateSelecionado === "utility"
        ? []
        : contatosSelecionados.filter(contatoTemCooldownMarketing),
    [contatosSelecionados, categoriaTemplateSelecionado]
  );
  const totalContatosOptOut = contatosOptOutSelecionados.length;
  const temContatosOptOut = totalContatosOptOut > 0;
  const totalContatosCooldown = contatosCooldownSelecionados.length;
  const temContatosCooldown = totalContatosCooldown > 0;
  const totalContatosListaFria = contatosListaFriaSelecionados.length;
  const temContatosListaFria = totalContatosListaFria > 0;
  const marketingComListaFria =
    categoriaTemplateSelecionado === "marketing" && temContatosListaFria;
  const utilityComListaFria =
    categoriaTemplateSelecionado === "utility" && temContatosListaFria;
  const utilityListaFriaSemOptOut =
    utilityComListaFria &&
    templateSelecionado?.opt_out_habilitado !== true;

  const totalVariaveis = useMemo(() => {
    return contarVariaveisTemplate(templateSelecionado);
  }, [templateSelecionado]);

  const variaveisTemplate = useMemo(
    () => [templateVariavel1, templateVariavel2, templateVariavel3],
    [templateVariavel1, templateVariavel2, templateVariavel3]
  );

  const opcoesVariaveisTemplate = useMemo<OpcaoVariavelTemplate[]>(() => {
    const chavesAdicionadas = new Set<string>();
    const opcoes: OpcaoVariavelTemplate[] = [];

    for (const variavel of VARIAVEIS_FIXAS_SISTEMA) {
      if (chavesAdicionadas.has(variavel.chave)) continue;

      chavesAdicionadas.add(variavel.chave);
      opcoes.push({
        chave: variavel.chave,
        descricao: variavel.descricao,
        categoria: "Fixa",
      });
    }

    for (const variavel of variaveisPersonalizadas) {
      const chave = normalizarEntradaVariavelTemplate(variavel.chave);
      if (!variavel.ativo || !chave || chavesAdicionadas.has(chave)) continue;

      chavesAdicionadas.add(chave);
      opcoes.push({
        chave,
        descricao:
          variavel.descricao?.trim() ||
          "Variável personalizada cadastrada pela empresa.",
        categoria: "Personalizada",
      });
    }

    return opcoes;
  }, [variaveisPersonalizadas]);

  const previewTemplateSelecionado = useMemo(() => {
    return montarPreviewTemplateDisparo(templateSelecionado, variaveisTemplate);
  }, [templateSelecionado, variaveisTemplate]);

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));
    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  const obterHistoricoDisparosDoContato = useCallback(
    (contatoId: string) => {
      const campanhasHistorico = historicoDisparosPorContato[contatoId] || [];
      const campanhasConflito = conflitosPorContato[contatoId] || [];

      const mapa = new Map<string, CampanhaConflitoContato>();

      for (const campanha of campanhasHistorico) {
        mapa.set(campanha.campanha_id, campanha);
      }

      for (const campanha of campanhasConflito) {
        mapa.set(campanha.campanha_id, campanha);
      }

      return Array.from(mapa.values());
    },
    [historicoDisparosPorContato, conflitosPorContato]
  );

  const contatoPassaFiltrosSelecionados = useCallback(
    (contato: ContatoOpcao) => {
      const busca = normalizarTextoBusca(buscaContato);

      if (busca) {
        const textoContato = normalizarTextoBusca(
          [
            contato.nome,
            contato.telefone,
            contato.email,
            obterOrigemContato(contato),
            obterCampanhaContato(contato),
            contato.status_lead,
            ...obterHistoricoDisparosDoContato(contato.id).map(
              (campanha) => campanha.campanha_nome
            ),
          ]
            .filter(Boolean)
            .join(" ")
        );

        if (!textoContato.includes(busca)) return false;
      }

      if (
        origemFiltro &&
        obterOrigemContato(contato) !== origemFiltro
      ) {
        return false;
      }
      if (
        campanhaFiltro &&
        obterCampanhaContato(contato) !== campanhaFiltro
      ) {
        return false;
      }

      return true;
    },
    [
      buscaContato,
      campanhaFiltro,
      conflitosPorContato,
      origemFiltro,
    ]
  );

  const contatosDisponiveisFiltrados = useMemo(() => {
    return contatosDisponiveis.filter(contatoPassaFiltrosSelecionados);
  }, [contatosDisponiveis, contatoPassaFiltrosSelecionados]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveisFiltrados.filter(
      (contato) =>
        contatoTemTelefoneValido(contato) &&
        !contatoTemOptOutParaCategoria(
          contato,
          categoriaTemplateSelecionado
        ) &&
        !(
          contatoTemCooldownMarketing(contato) &&
          categoriaTemplateSelecionado !== "utility"
        )
    );
  }, [contatosDisponiveisFiltrados, categoriaTemplateSelecionado]);

  const contatosSelecionadosFiltrados = useMemo(() => {
    return contatosSelecionados.filter(contatoPassaFiltrosSelecionados);
  }, [contatosSelecionados, contatoPassaFiltrosSelecionados]);

  const gruposConflitoAtivos = useMemo(() => {
    const idsSelecionados = new Set(contatosSelecionados.map((item) => item.id));

    return gruposConflitoDisparo
      .map((grupo) => ({
        ...grupo,
        contatos_ids: grupo.contatos_ids.filter((contatoId) =>
          idsSelecionados.has(contatoId)
        ),
      }))
      .filter((grupo) => grupo.contatos_ids.length > 0);
  }, [contatosSelecionados, gruposConflitoDisparo]);

  const gruposConflitoPendentes = useMemo(() => {
    return gruposConflitoAtivos.filter((grupo) => {
      const decisao = decisoesConflitoDisparo[grupo.campanha_id];
      const decididos = new Set(decisao?.contatoIds || []);

      return grupo.contatos_ids.some((contatoId) => !decididos.has(contatoId));
    });
  }, [decisoesConflitoDisparo, gruposConflitoAtivos]);

  const temConflitosPendentes = gruposConflitoPendentes.length > 0;

  const campanhasDisparoAnteriorFiltro = useMemo(
    () =>
      campanhasHistorico
        .filter((campanha) => Boolean(campanha.id))
        .map((campanha) => ({
          id: campanha.id,
          nome:
            campanha.nome ||
            campanha.template_nome ||
            "Disparo sem nome",
          total: Math.max(
            0,
            Number(campanha.total_enviados ?? campanha.total_itens ?? 0)
          ),
        }))
        .filter((campanha) => campanha.total > 0),
    [campanhasHistorico]
  );

  const totalContatosComConflitoSelecionados = useMemo(() => {
    const ids = new Set<string>();

    for (const grupo of gruposConflitoAtivos) {
      for (const contatoId of grupo.contatos_ids) {
        ids.add(contatoId);
      }
    }

    return ids.size;
  }, [gruposConflitoAtivos]);

  const totalSucesso = totaisHistorico.sucesso;
  const totalFalha = totaisHistorico.falha;
  const totalProcessando = totaisHistorico.processando;
  const resultadoFiltrado = resultado;
  const totalResultadosFiltroAtivo =
    filtroHistorico === "sucesso"
      ? totaisHistorico.sucesso
      : filtroHistorico === "processando"
      ? totaisHistorico.processando
      : filtroHistorico === "falha"
      ? totaisHistorico.falha
      : totaisHistorico.total;

  const totalPaginasHistorico = useMemo(() => {
    return Math.max(
      1,
      Math.ceil(totalResultadosFiltroAtivo / ITENS_HISTORICO_POR_PAGINA)
    );
  }, [totalResultadosFiltroAtivo]);

  const resultadoHistoricoPaginado = resultadoFiltrado;

  const primeiroItemHistorico =
    totalResultadosFiltroAtivo === 0
      ? 0
      : (paginaHistorico - 1) * ITENS_HISTORICO_POR_PAGINA + 1;

  const ultimoItemHistorico = Math.min(
    resultadoHistoricoPaginado.length === 0
      ? 0
      : primeiroItemHistorico + resultadoHistoricoPaginado.length - 1,
    totalResultadosFiltroAtivo
  );

  const campanhaPaginaAtiva = campanhaEstaAtiva(campanhaPagina);
  const campanhaPaginaConcluida = campanhaFoiConcluida(campanhaPagina);
  const progressoCampanhaPagina = campanhaPagina
    ? progressoCampanha(campanhaPagina)
    : 0;
  const integracaoCampanhaPagina = useMemo(() => {
    if (!campanhaPagina?.integracao_whatsapp_id) return null;

    return (
      integracoes.find(
        (item) => item.id === campanhaPagina.integracao_whatsapp_id
      ) || null
    );
  }, [integracoes, campanhaPagina?.integracao_whatsapp_id]);

  function adicionarContato(contato: ContatoOpcao) {
    if (
      contatoTemOptOutParaCategoria(
        contato,
        categoriaTemplateSelecionado
      )
    ) {
      setErro(
        "Este contato solicitou opt-out para a categoria do template selecionado."
      );
      return;
    }

    if (
      contatoTemCooldownMarketing(contato) &&
      categoriaTemplateSelecionado !== "utility"
    ) {
      setErro(
        "Este contato esta em pausa temporaria para disparos de marketing porque a Meta recusou uma entrega recente."
      );
      return;
    }

    const telefone = limparNumero(contato.telefone);

    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }

    setErro("");
    invalidarDecisoesConflitoParaContatos([contato.id]);
    setContatosSelecionados((prev) => {
      if (prev.some((item) => item.id === contato.id)) return prev;
      return [...prev, contato];
    });
  }

  function adicionarTodosDisponiveis() {
    const mapaSelecionados = new Set(contatosSelecionados.map((item) => item.id));

    const novos = contatosDisponiveisValidos.filter(
      (item) => !mapaSelecionados.has(item.id)
    );

    if (novos.length === 0) {
      setErro("Nenhum contato válido disponível para adicionar.");
      return;
    }

    setErro("");
    invalidarDecisoesConflitoParaContatos(novos.map((item) => item.id));
    setContatosSelecionados((prev) => [...prev, ...novos]);
  }

  function removerContato(contatoId: string) {
    setContatosSelecionados((prev) => prev.filter((item) => item.id !== contatoId));
  }

  function limparSelecao() {
    setContatosSelecionados([]);
    setMensagem("");
    setErro("");
    setErroConflitos("");
    setGruposConflitoDisparo([]);
    setConflitosPorContato({});
    setDecisoesConflitoDisparo({});
  }

  function invalidarDecisoesConflitoParaContatos(contatoIds: string[]) {
    const ids = new Set(contatoIds.filter(Boolean));

    if (ids.size === 0) return;

    setDecisoesConflitoDisparo((prev) => {
      const proximo: Record<string, DecisaoConflitoDisparo> = {};

      for (const [campanhaId, decisao] of Object.entries(prev)) {
        const contatoIdsRestantes = decisao.contatoIds.filter(
          (contatoId) => !ids.has(contatoId)
        );

        if (contatoIdsRestantes.length === 0) continue;

        proximo[campanhaId] = {
          ...decisao,
          contatoIds: contatoIdsRestantes,
        };
      }

      return proximo;
    });
  }

  function marcarGrupoConflitoComoIncluido(grupo: GrupoConflitoDisparo) {
    const contatoIds = grupo.contatos_ids.filter((contatoId) =>
      contatosSelecionados.some((contato) => contato.id === contatoId)
    );

    if (contatoIds.length === 0) return;

    setDecisoesConflitoDisparo((prev) => ({
      ...prev,
      [grupo.campanha_id]: {
        acao: "incluir",
        contatoIds,
      },
    }));
  }

  function removerGrupoConflitoDoEnvio(grupo: GrupoConflitoDisparo) {
    const contatoIdsGrupo = grupo.contatos_ids.filter((contatoId) =>
      contatosSelecionados.some((contato) => contato.id === contatoId)
    );
    const contatoIdsParaRemover = new Set<string>();

    for (const contatoId of contatoIdsGrupo) {
      const outrosGrupos = gruposConflitoAtivos.filter(
        (outroGrupo) =>
          outroGrupo.campanha_id !== grupo.campanha_id &&
          outroGrupo.contatos_ids.includes(contatoId)
      );
      const manterPorOutroGrupo = outrosGrupos.some((outroGrupo) => {
        const decisao = decisoesConflitoDisparo[outroGrupo.campanha_id];
        const contatoJaDecidido = decisao?.contatoIds?.includes(contatoId);

        return decisao?.acao === "incluir" || !contatoJaDecidido;
      });

      if (!manterPorOutroGrupo) {
        contatoIdsParaRemover.add(contatoId);
      }
    }

    setDecisoesConflitoDisparo((prev) => ({
      ...prev,
      [grupo.campanha_id]: {
        acao: "remover",
        contatoIds: contatoIdsGrupo,
      },
    }));

    if (contatoIdsParaRemover.size > 0) {
      setContatosSelecionados((prev) =>
        prev.filter((contato) => !contatoIdsParaRemover.has(contato.id))
      );
    }
  }

  function formatarMoedaBRL(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatarMoedaUSD(valor?: number | null) {
    return `US$ ${Number(valor || 0).toFixed(4)}`;
  }

  function formatarNumeroCotacao(valor?: number | null) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  async function carregarVariaveisPersonalizadas(
    options: { erroNoModal?: boolean } = {}
  ) {
    try {
      setLoadingVariaveis(true);

      const res = await fetch("/api/variaveis", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar variáveis.");
      }

      setVariaveisPersonalizadas(
        Array.isArray(json.variaveis) ? json.variaveis : []
      );
    } catch (error: unknown) {
      const mensagem =
        error instanceof Error ? error.message : "Erro ao carregar variáveis.";

      if (options.erroNoModal) {
        setErroVariavelModal(mensagem);
      } else {
        setErro(mensagem);
      }
    } finally {
      setLoadingVariaveis(false);
    }
  }

  async function salvarVariavelPersonalizada() {
    try {
      setErro("");
      setErroVariavelModal("");
      setMensagem("");

      const chave = normalizarEntradaVariavelTemplate(novaVariavelChave);
      const valor = novaVariavelValor.trim();

      if (!chave) {
        setErroVariavelModal("Informe o nome da variável.");
        return;
      }

      if (!valor) {
        setErroVariavelModal("Informe o valor da variável.");
        return;
      }

      setSalvandoVariavel(true);

      const res = await fetch("/api/variaveis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chave,
          valor,
          descricao: novaVariavelDescricao.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar variável.");
      }

      setNovaVariavelChave("");
      setNovaVariavelValor("");
      setNovaVariavelDescricao("");

      setMensagem("Variável salva com sucesso.");
      await carregarVariaveisPersonalizadas({ erroNoModal: true });
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao salvar variável."
      );
    } finally {
      setSalvandoVariavel(false);
    }
  }

  async function removerVariavelPersonalizada(id: string) {
    try {
      setErro("");
      setErroVariavelModal("");
      setMensagem("");

      const res = await fetch("/api/variaveis", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao remover variável.");
      }

      setMensagem("Variável removida com sucesso.");
      await carregarVariaveisPersonalizadas({ erroNoModal: true });
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao remover variável."
      );
    }
  }

  function aplicarVariavelNoCampo(chave: string) {
    const valor = normalizarEntradaVariavelTemplate(chave);

    if (!valor) return;

    if (totalVariaveis <= 1) {
      setTemplateVariavel1(valor);
      return;
    }

    if (!templateVariavel1.trim()) {
      setTemplateVariavel1(valor);
      return;
    }

    if (totalVariaveis >= 2 && !templateVariavel2.trim()) {
      setTemplateVariavel2(valor);
      return;
    }

    if (totalVariaveis >= 3 && !templateVariavel3.trim()) {
      setTemplateVariavel3(valor);
      return;
    }

    setTemplateVariavel1(valor);
  }


  function variaveisUsamProtocolo(variaveis: string[]) {
    return variaveis.some((variavel) => {
      const chave = normalizarVariavelTemplate(variavel);

      return chave === "protocolo_atual" || chave === "ultimo_protocolo";
    });
  }

  async function carregarProtocolosDosContatos(
    contatosLista: ContatoOpcao[]
  ): Promise<ProtocolosContatoMap> {
    try {
      if (contatosLista.length === 0) return {};

      const res = await fetch("/api/variaveis/protocolos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contato_ids: contatosLista.map((contato) => contato.id),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao buscar protocolos dos contatos.");
      }

      return json.protocolos || {};
    } catch (error: any) {
      throw new Error(error?.message || "Erro ao buscar protocolos dos contatos.");
    }
  }

  async function cancelarCampanhaEmAndamento() {
    if (!campanhaPagina?.id || !campanhaPaginaAtiva) return;
    if (!podeDisparar) {
      setErro("Você não tem permissão para cancelar disparos.");
      return;
    }

    try {
      setCancelandoCampanha(true);
      setErro("");
      setMensagem("");

      const res = await fetch(
        `/api/whatsapp/disparos/${encodeURIComponent(
          campanhaPagina.id
        )}/cancelar`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            motivo: "Cancelado manualmente na tela de disparos.",
          }),
        }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao cancelar disparo em massa.");
      }

      const resumo =
        json.resumo && typeof json.resumo === "object" ? json.resumo : {};
      const total = Number(
        resumo.total_itens ?? campanhaPagina.total ?? 0
      );
      const enviados = Number(
        resumo.total_enviados ?? campanhaPagina.enviados ?? 0
      );
      const falhas = Number(
        resumo.total_falhas ?? campanhaPagina.falhas ?? 0
      );
      const cancelados = Number(
        resumo.total_cancelados ??
          Math.max(total - enviados - falhas, 0)
      );

      setCampanhaPagina((atual) =>
        atual
          ? {
              ...atual,
              status: "cancelada",
              enviados,
              falhas,
              cancelados,
              pendentes: 0,
              processando: 0,
              processados: Math.min(
                total,
                enviados + falhas + cancelados
              ),
              motivo:
                json.motivo ||
                "Disparo em massa cancelado manualmente.",
              updated_at: new Date().toISOString(),
              finished_at: new Date().toISOString(),
            }
          : atual
      );
      setDisparoEmMassaProcessando(false);
      setIntegracaoDisparoProcessando(false);
      setModalCancelarCampanhaAberto(false);
      setMensagem(
        `Disparo cancelado. Enviados: ${enviados}. Cancelados: ${cancelados}.`
      );
      emitirRefreshDisparoEmMassa();

      await Promise.all([
        carregarHistorico(),
        carregarBloqueioDisparoEmMassa(integracaoId),
      ]);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao cancelar disparo em massa."
      );
      setModalCancelarCampanhaAberto(false);
      await carregarCampanhaPagina(integracaoId);
    } finally {
      setCancelandoCampanha(false);
    }
  }


  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setMensagem("");
    setErro("");

    if (!podeDisparar) {
      setErro("Você não tem permissão para realizar disparos.");
      return;
    }

    if (disparoBloqueado && !agendarDisparo) {
      setErro(
        integracaoDisparoProcessando
          ? "Ja existe um disparo em massa em processamento nesta integracao WhatsApp. Aguarde a finalizacao antes de iniciar outro."
          : "Ja existe um disparo em massa em processamento. Aguarde a finalizacao antes de iniciar outro."
      );
      return;
    }

    if (!integracaoId) {
      setErro("Selecione a integração WhatsApp.");
      return;
    }

    if (!templateId) {
      setErro("Selecione o template.");
      return;
    }

    if (contatosSelecionados.length === 0) {
      setErro("Selecione pelo menos um contato.");
      return;
    }

    if (temContatosOptOut) {
      setErro(
        "A seleção possui contatos com opt-out para a categoria do template. Remova-os para continuar."
      );
      return;
    }

    if (temContatosCooldown) {
      setErro(
        "A seleção possui contatos em pausa temporária para disparos de marketing. Remova-os para continuar."
      );
      return;
    }

    if (marketingComListaFria) {
      setErro(
        "Templates de marketing não podem ser enviados para contatos de lista fria. Remova os contatos sem opt-in para continuar."
      );
      return;
    }

    if (utilityListaFriaSemOptOut) {
      setErro(
        "Este template utility não possui o rodapé de opt-out. Recrie o template com a instrução para responder SAIR."
      );
      return;
    }

    let executarEm: Date | null = null;

    if (agendarDisparo) {
      if (!agendamentoData || !agendamentoHora) {
        setErro("Selecione a data e a hora do disparo agendado.");
        return;
      }

      executarEm = new Date(`${agendamentoData}T${agendamentoHora}:00`);

      if (
        Number.isNaN(executarEm.getTime()) ||
        executarEm.getTime() <= Date.now()
      ) {
        setErro("A data e a hora do agendamento precisam ser futuras.");
        return;
      }
    }

    if (temConflitosPendentes) {
      setErro(
        "Resolva os contatos repetidos dos ultimos 7 dias antes de enviar o disparo."
      );
      return;
    }

    if (totalVariaveis > 3) {
      setErro("Este template usa mais de 3 variáveis. Use um template com até 3 variáveis para esta tela.");
      return;
    }

    const variaveisObrigatorias = variaveisTemplate
      .slice(0, totalVariaveis)
      .map((item) => normalizarVariavelTemplate(item));

    if (variaveisObrigatorias.some((item) => !item)) {
      setErro("Preencha os campos Variável 1, 2 e 3 exigidos pelo template.");
      return;
    }

    try {
      setDisparando(true);

      if (agendarDisparo && executarEm) {
        const res = await fetch("/api/disparos-agendados/criar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integracao_whatsapp_id: integracaoId,
            template_id: templateId,
            nome_campanha: nomeCampanhaDisparo,
            executar_em: executarEm.toISOString(),
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
        });
        const json = await res.json();

        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Erro ao agendar disparo.");
        }

        setMensagem(
          `Disparo agendado com sucesso para ${formatarDataHora(
            executarEm.toISOString()
          )}. Contatos: ${Number(
            json.quantidade || contatosSelecionados.length
          )}.`
        );
        solicitarAtualizacaoDisparosPendentesHeader();
        setAgendarDisparo(false);
        setAgendamentoData("");
        setAgendamentoHora("");
        setNomeCampanhaDisparo("");
        setContatosSelecionados([]);
        return;
      }

      const protocolosPorContato = variaveisUsamProtocolo(variaveisObrigatorias)
        ? await carregarProtocolosDosContatos(contatosSelecionados)
        : {};

      const destinatarios = contatosSelecionados.map((contato) => ({
        contato_id: contato.id,
        numero: limparNumero(contato.telefone),
        variaveis:
          totalVariaveis > 0
            ? variaveisObrigatorias.map((variavel) =>
                resolverVariavelContato(
                  variavel,
                  contato,
                  variaveisPersonalizadas,
                  protocolosPorContato
                )
              )
            : [],
      }));

      const res = await fetch("/api/whatsapp/disparos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_whatsapp_id: integracaoId,
          template_id: templateId,
          nome_campanha: nomeCampanhaDisparo,
          confirmacao_responsabilidade_lista_fria:
            utilityComListaFria &&
            confirmacaoResponsabilidadeListaFria,
          destinatarios,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        if (json.bloquear_disparos) {
          if (json.bloqueio_escopo === "integracao") {
            setIntegracaoDisparoProcessando(true);
          } else {
            setDisparoEmMassaProcessando(true);
          }

          if (json.campanha) {
            aplicarCampanhaPagina(json.campanha);
          } else {
            carregarCampanhaPagina(integracaoId);
          }

          emitirRefreshDisparoEmMassa();
        }

        const detalhe = json.detalhe ? `\n\n${json.detalhe}` : "";
        throw new Error(
          `${json.error || "Erro ao realizar disparo."}${detalhe}`
        );
      }

      if (json.queued) {
        setDisparoEmMassaProcessando(true);
        setIntegracaoDisparoProcessando(true);
        carregarCampanhaPagina(integracaoId);
        emitirRefreshDisparoEmMassa();

        setMensagem(
          `Campanha criada e enfileirada. Os ${Number(
            json.total || contatosSelecionados.length
          )} disparos serão processados gradualmente em segundo plano.`
        );

        await carregarHistorico();

        return;
      }

      const listaResultado = Array.isArray(json.resultados) ? json.resultados : [];

      const sucesso = listaResultado.filter((item: ResultadoDisparo) => item.ok).length;
      const falha = listaResultado.filter((item: ResultadoDisparo) => !item.ok).length;

      setMensagem(
        `Disparo enviado para a Meta. Aguardando confirmação de entrega pelo WhatsApp. Aceitos: ${sucesso}. Falhas imediatas: ${falha}.`
      );

      await carregarHistorico();

    } catch (error: any) {
      setErro(error?.message || "Erro ao realizar disparo.");
    } finally {
      if (integracaoId) {
        carregarSaudeMeta(integracaoId);
        carregarBloqueioDisparoEmMassa(integracaoId);
        carregarCampanhaPagina(integracaoId);
      }

      setDisparando(false);
    }
  }


  async function calcularPreviewCusto(
    categoria: string,
    contatosLista: ContatoOpcao[]
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
            telefone: contato.telefone,
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do disparo.");
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
        totalTelefonesIsentosUnicos: Number(
          json.totalTelefonesIsentosUnicos ?? 0
        ),
        totalTelefonesCobradosUnicos: Number(
          json.totalTelefonesCobradosUnicos ?? totalCobrados ?? 0
        ),
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
      setErro(error?.message || "Erro ao calcular custo do disparo.");
    } finally {
      setLoadingPreviewCusto(false);
    }
  }

  function alternarMensagemExpandida(chave: string) {
    setMensagensExpandidas((prev) =>
      prev.includes(chave)
        ? prev.filter((item) => item !== chave)
        : [...prev, chave]
    );
  }

  function resumirMensagem(texto?: string | null) {
    const conteudo = String(texto || "").trim();

    if (!conteudo) return "Sem conteúdo";

    const partes = conteudo
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (partes.length === 0) return conteudo;

    return partes[0];
  }

  function formatarBRL(valor: number) {
  return valor < 1
    ? valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 3,
      })
    : valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
}

  function abrirConfirmacaoDisparo() {
    if (!podeDisparar) {
      setErro("Você não tem permissão para realizar disparos.");
      return;
    }

    if (agendarDisparo) {
      const executarEm = new Date(
        `${agendamentoData}T${agendamentoHora}:00`
      );

      if (
        !agendamentoData ||
        !agendamentoHora ||
        Number.isNaN(executarEm.getTime()) ||
        executarEm.getTime() <= Date.now()
      ) {
        setErro("Selecione uma data e hora futuras para o agendamento.");
        return;
      }
    }

    if (temContatosOptOut) {
      setErro(
        "A seleção possui contatos com opt-out para a categoria do template. Remova-os para continuar."
      );
      return;
    }

    if (temContatosCooldown) {
      setErro(
        "A seleção possui contatos em pausa temporária para disparos de marketing. Remova-os para continuar."
      );
      return;
    }

    if (marketingComListaFria) {
      setErro(
        "Templates de marketing não podem ser enviados para contatos de lista fria. Remova os contatos sem opt-in para continuar."
      );
      return;
    }

    if (utilityListaFriaSemOptOut) {
      setErro(
        "Este template utility não possui o rodapé de opt-out. Recrie o template com a instrução para responder SAIR."
      );
      return;
    }

    setErro("");
    setConfirmacaoCobranca(false);
    setConfirmacaoResponsabilidadeListaFria(false);
    setModalConfirmacaoAberto(true);
  }

  async function confirmarEDisparar() {
    if (!confirmacaoCobranca) return;

    setModalConfirmacaoAberto(false);
    setConfirmacaoCobranca(false);

    if (utilityComListaFria) {
      setConfirmacaoResponsabilidadeListaFria(false);
      setModalResponsabilidadeListaFriaAberto(true);
      return;
    }

    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    await handleSubmit(fakeEvent);
  }

  async function confirmarResponsabilidadeEDisparar() {
    if (!confirmacaoResponsabilidadeListaFria || !utilityComListaFria) return;

    setModalResponsabilidadeListaFriaAberto(false);

    const fakeEvent = {
      preventDefault: () => {},
    } as React.FormEvent<HTMLFormElement>;

    await handleSubmit(fakeEvent);
    setConfirmacaoResponsabilidadeListaFria(false);
  }

  function renderBadgeCooldownContato(contato: ContatoOpcao) {
    if (!contatoTemCooldownMarketing(contato)) return null;
    if (categoriaTemplateSelecionado === "utility") return null;

    const duracao = formatarDuracaoCooldownContato(contato);
    const expiraEm = contato.whatsapp_disparo_cooldown_expira_em;
    const tooltip = [
      "Pausa temporaria para disparos de marketing.",
      "A Meta recusou uma entrega recente para este contato por limite de qualidade ou frequencia.",
      expiraEm ? `Expira em ${formatarDataHora(expiraEm)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span className={styles.contactBadgeCooldown} title={tooltip}>
        Pausa {duracao}
      </span>
    );
  }

  function renderBadgesDisparoAntigo(contato: ContatoOpcao) {
    const campanhas =
      historicoDisparosPorContato[contato.id] ||
      conflitosPorContato[contato.id] ||
      [];

    if (campanhas.length === 0) return null;

    const campanhasVisiveis = campanhas.slice(0, 3);
    const totalOculto = Math.max(0, campanhas.length - campanhasVisiveis.length);

    return (
      <div className={styles.massHistoryBadges}>
        {campanhasVisiveis.map((campanha) => (
          <span
            key={`${contato.id}-${campanha.campanha_id}`}
            className={styles.massHistoryBadge}
            title={`${campanha.campanha_nome}${
              campanha.enviado_em
                ? ` - ${formatarDataHora(campanha.enviado_em)}`
                : ""
            }`}
          >
            {truncarNomeBadge(campanha.campanha_nome, 70)}
          </span>
        ))}

        {totalOculto > 0 ? (
          <span className={styles.massHistoryBadgeMore}>+{totalOculto}</span>
        ) : null}
      </div>
    );
  }


  useEffect(() => {
    const categoria = String(templateSelecionado?.categoria || "").toLowerCase();

    if (!categoria || contatosSelecionados.length === 0) {
      setPreviewCusto(null);
      return;
    }

    calcularPreviewCusto(categoria, contatosSelecionados);
  }, [templateSelecionado, contatosSelecionados]);

  return (
    <>
      <Header
        title="Disparos WhatsApp"
        subtitle="Selecione a conexão WhatsApp, o template aprovado e os contatos salvos para enviar mensagens."
      />

      <div className={styles.pageContent}>
        <div className={styles.layout}>
          <section className={styles.formCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderContent}>
                <div>
                  <p className={styles.eyebrow}>Operação</p>
                  <h2 className={styles.cardTitle}>Novo disparo</h2>
                  <p className={styles.cardSubtitle}>
                    Escolha a conexão, selecione o template e defina os contatos.
                  </p>
                </div>

                <a
                  href="https://business.facebook.com/latest/billing_hub/accounts/details"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.metaPaymentButton}
                >
                  Configurar pagamento na Meta
                </a>
              </div>
            </div>

              {loadingUsuario || loadingIntegracoes ? (
                <div className={styles.emptyState}>Carregando dados...</div>
              ) : !podeDisparar ? (
                <div className={styles.inlineBlock}>
                  <div className={styles.errorAlert}>
                    Você pode acompanhar os disparos, mas não possui permissão
                    para enviar ou agendar novas campanhas.
                  </div>
                </div> 
              ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.setupColumn}>
                      <div className={styles.field}>
                        <label className={styles.label}>Integração WhatsApp</label>
                        <select
                          value={integracaoId} 
                          onChange={(e) => {
                            setIntegracaoId(e.target.value);
                            setContatosSelecionados([]);
                            setConfirmacaoResponsabilidadeListaFria(false);
                          }}
                          className={styles.input}
                          disabled={integracoes.length <= 1}
                        >
                          <option value="">Selecione uma conexão</option>
                          {integracoes.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome_conexao} {item.numero ? `- ${item.numero}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.field}>
                        <label className={styles.label}>Template aprovado</label>
                        <select
                          value={templateId}
                          onChange={(e) => setTemplateId(e.target.value)}
                          className={styles.input}
                          disabled={!integracaoId || loadingTemplates}
                        >
                          <option value="">
                            {!integracaoId
                              ? "Selecione uma conexão primeiro"
                              : loadingTemplates
                              ? "Carregando templates..."
                              : "Selecione um template"}
                          </option>

                          {templates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome} - {getTemplateStatusLabel(item.status)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={`${styles.field} ${styles.campaignNameField}`}>
                        <div className={styles.labelWithHelp}>
                          <label className={styles.label}>Nome do Disparo em massa</label>

                          <span className={styles.optional}>Opcional</span>

                          <span className={styles.infoTooltipWrapper}>
                            <button
                              type="button"
                              className={styles.infoTooltipButton}
                              aria-label="Ajuda sobre o nome do disparo em massa"
                            >
                              i
                            </button>

                            <span className={styles.infoTooltipText}>
                              Se deixar vazio, o CRM cria um nome padrão com data, hora e quantidade.
                              Mesmo com nome personalizado, esses dados serão adicionados no final.
                            </span>
                          </span>
                        </div>

                        <input
                          value={nomeCampanhaDisparo}
                          onChange={(e) => setNomeCampanhaDisparo(e.target.value)}
                          className={styles.input}
                          maxLength={90}
                          placeholder="Ex: ALERTA ATUALIZACAO"
                        />
                      </div>
                    </div>
                <div className={styles.setupPreviewGrid}>
                  <div className={styles.field}>

                    
                    <div
                      className={`${styles.scheduleToggleCard} ${
                        agendarDisparo ? styles.scheduleToggleCardActive : ""
                      }`}
                    >
                      <label className={styles.scheduleToggleRow}>
                        <span className={styles.scheduleToggleText}>
                          <strong>Agendar disparo</strong>
                        </span>

                        <input
                          type="checkbox"
                          checked={agendarDisparo}
                          onChange={(e) => setAgendarDisparo(e.target.checked)}
                          className={styles.scheduleToggleInput}
                        />
                        <span
                          className={styles.scheduleToggleControl}
                          aria-hidden="true"
                        />
                      </label>

                      {agendarDisparo ? (
                        <div className={styles.scheduleFields}>
                          <div className={styles.field}>
                            <label className={styles.label}>Data</label>
                            <input
                              type="date"
                              value={agendamentoData}
                              min={dataHojeParaInput()}
                              onChange={(e) =>
                                setAgendamentoData(e.target.value)
                              }
                              className={styles.input}
                            />
                          </div>

                          <div className={styles.field}>
                            <label className={styles.label}>Hora</label>
                            <input
                              type="time"
                              value={agendamentoHora}
                              onChange={(e) =>
                                setAgendamentoHora(e.target.value)
                              }
                              className={styles.input}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    
                      {totalVariaveis > 0 ? (
                        <>
                          <div className={styles.templateHintRow}>
                            <div className={styles.templateHint}>
                              Este template usa <strong>{totalVariaveis}</strong> variável(is).
                              Variável 1 substitui <strong>{" {{1}}"}</strong>, Variável 2 substitui
                              <strong>{" {{2}}"}</strong> e Variável 3 substitui <strong>{" {{3}}"}</strong>.
                            </div>

                            <button
                              type="button"
                              className={styles.variablesButton}
                              onClick={() => {
                                setErroVariavelModal("");
                                setModalVariaveisAberto(true);
                              }}
                            >
                              Gerenciar variáveis
                            </button>
                          </div>

                          <div className={styles.templateVariablesGrid}>
                            <SeletorVariavelTemplate
                              label="Variável 1"
                              value={templateVariavel1}
                              onChange={setTemplateVariavel1}
                              opcoes={opcoesVariaveisTemplate}
                              carregando={loadingVariaveis}
                            />

                            {totalVariaveis >= 2 ? (
                              <SeletorVariavelTemplate
                                label="Variável 2"
                                value={templateVariavel2}
                                onChange={setTemplateVariavel2}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}

                            {totalVariaveis >= 3 ? (
                              <SeletorVariavelTemplate
                                label="Variável 3"
                                value={templateVariavel3}
                                onChange={setTemplateVariavel3}
                                opcoes={opcoesVariaveisTemplate}
                                carregando={loadingVariaveis}
                              />
                            ) : null}
                          </div>
                        </>
                      ) : null}
                  </div>

                  <aside className={styles.previewSideCard}>
                    <div className={styles.previewTopLine}>
                      {templateSelecionado ? (
                        <span className={styles.previewCategoryBadge}>
                          {formatarCategoriaMeta(
                            templateSelecionado.categoria
                          )}
                        </span>
                      ) : null}
                      <strong>Prévia</strong>
                    </div>

                    {templateSelecionado ? (
                      <>
                        <div className={styles.whatsappPreviewArea}>
                          <div className={styles.whatsappBubble}>
                            <strong className={styles.whatsappPreviewTitle}>
                              {previewTemplateSelecionado?.titulo || templateSelecionado.nome}
                            </strong>

                            <p className={styles.whatsappPreviewText}>
                              {previewTemplateSelecionado?.corpo || extrairBody(templateSelecionado.payload)}
                            </p>

                            <div className={styles.whatsappPreviewMeta}>
                              <span className={styles.whatsappPreviewFooter}>
                                {previewTemplateSelecionado?.rodape || "Equipe de atendimento"}
                              </span>

                              <span className={styles.whatsappPreviewTime}>
                                {agendarDisparo && agendamentoHora
                                  ? agendamentoHora
                                  : new Date().toLocaleTimeString("pt-BR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                              </span>
                            </div>

                            {extrairQuickReplies(templateSelecionado.payload).map((texto, index) => (
                              <div key={`${texto}-${index}`} className={styles.whatsappPreviewButton}>
                                ↩ {texto}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={styles.previewEmptyState}>
                        Selecione um template aprovado para visualizar a mensagem do WhatsApp.
                      </div>
                    )}
                  </aside>
                </div>

                <div className={styles.contactsFilterCard}>
                  <div className={styles.contactsFilterHeader}>
                    <div>
                      <h3>Filtrar contatos</h3>
                      <p>Selecione quem receberá o disparo.</p>
                    </div>

                    <button
                      type="button"
                      className={styles.clearFiltersButton}
                      onClick={() => {
                        setBuscaContato("");
                        setOrigemFiltro("");
                        setCampanhaFiltro("");
                        setDisparoAnteriorFiltroContatos("");
                      }}
                      disabled={
                        !buscaContato &&
                        !origemFiltro &&
                        !campanhaFiltro &&
                        !disparoAnteriorFiltroContatos
                      }
                    >
                      Limpar filtros
                    </button>
                  </div>

                  <div className={styles.searchFilters}>
                    <div className={styles.field}>
                      <label className={styles.label}>Buscar contatos salvos</label>
                      <input
                        value={buscaContato}
                        onChange={(e) => setBuscaContato(e.target.value)}
                        className={styles.input}
                        placeholder="Busque por nome, WhatsApp, telefone, e-mail, campanha..."
                      />
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por origem</label>
                      <select
                        value={origemFiltro}
                        onChange={(e) => setOrigemFiltro(e.target.value)}
                        className={styles.input}
                      >
                      {origensDisponiveis.length > 0 ? (
                        <>
                          <option value="">Todas as origens</option>

                          {origensDisponiveis.map((origem) => (
                            <option key={origem} value={origem}>
                              {origem}
                            </option>
                          ))}
                        </>
                      ) : (
                        <option value="">Nenhuma origem encontrada</option>
                      )}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Filtrar por campanha</label>
                      <select
                        value={campanhaFiltro}
                        onChange={(e) => setCampanhaFiltro(e.target.value)}
                        className={styles.input}
                      >
                        {campanhasDisponiveis.length > 0 ? (
                          <>
                            <option value="">Todas as campanhas</option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                          </>
                        ) : (
                          <option value="">Nenhuma campanha encontrada</option>
                        )}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Disparo anterior</label>
                      <select
                        value={disparoAnteriorFiltroContatos}
                        onChange={(e) => {
                          contatosConsultaAtivaRef.current += 1;
                          setDisparoAnteriorFiltroContatos(e.target.value);
                          setContatos([]);
                          setTotalContatosDisponiveis(0);
                          setLoadingContatos(true);
                        }}
                        className={styles.input}
                        disabled={
                          loadingContatos ||
                          campanhasDisparoAnteriorFiltro.length === 0
                        }
                      >
                        <option value="">Todos</option>
                        {campanhasDisparoAnteriorFiltro.map((campanha) => (
                          <option key={campanha.id} value={campanha.id}>
                            {truncarNomeBadge(campanha.nome, 50)} ({campanha.total})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className={styles.contactsSection}>
                  <div className={styles.contactsColumn}>
                    <div className={styles.contactsHeader}>
                      <h3 className={styles.contactsTitle}>Disponíveis</h3>

                      <div className={styles.contactsHeaderActions}>
                        <button
                          type="button"
                          className={styles.TextButtonAdd}
                          onClick={adicionarTodosDisponiveis}
                          disabled={
                            loadingContatos ||
                            contatosDisponiveisValidos.length === 0
                          }
                        >
                          Add todos
                        </button>

                        <span className={styles.contactsCount}>
                          {loadingContatos
                            ? "..."
                            : buscaContato ||
                              origemFiltro ||
                              campanhaFiltro ||
                              disparoAnteriorFiltroContatos
                            ? `${contatosDisponiveisFiltrados.length}/${totalContatosDisponiveis}`
                            : totalContatosDisponiveis}
                        </span>
                      </div>
                    </div>

                    <div className={styles.contactsList}>
                      {loadingContatos ? (
                        <div className={styles.emptyMiniState}>Carregando contatos...</div>
                      ) : contatosDisponiveisFiltrados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato salvo disponível.
                        </div>
                      ) : (
                        contatosDisponiveisFiltrados.map((contato) => {
                          const telefoneValido = contatoTemTelefoneValido(contato);
                          const cooldownMarketingAtivo =
                            contatoTemCooldownMarketing(contato) &&
                            categoriaTemplateSelecionado !== "utility";

                          return (
                            <div key={contato.id} className={styles.contactCard}>
                              <div className={styles.contactMain}>
                                <strong className={styles.contactName}>
                                  {contato.nome || "Sem nome"}
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

                                  {renderBadgeCooldownContato(contato)}
                                </div>
                                {renderBadgesDisparoAntigo(contato)}
                              </div>

                              <button
                                type="button"
                                className={styles.ButtonAdd}
                                onClick={() => adicionarContato(contato)}
                                disabled={
                                  !telefoneValido ||
                                  contatoTemOptOutParaCategoria(
                                    contato,
                                    categoriaTemplateSelecionado
                                  ) ||
                                  cooldownMarketingAtivo
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
                      <h3 className={styles.contactsTitle}>Selecionados</h3>

                      <div className={styles.contactsHeaderActions}>
                        <button
                          type="button"
                          className={styles.TextButtonRemover}
                          onClick={limparSelecao}
                          disabled={contatosSelecionados.length === 0}
                        >
                          Remover todos
                        </button>

                        <span className={styles.contactsCount}>
                          {contatosSelecionadosFiltrados.length ===
                          contatosSelecionados.length
                            ? contatosSelecionados.length
                            : `${contatosSelecionadosFiltrados.length}/${contatosSelecionados.length}`}
                        </span>
                      </div>
                    </div>

                    <div className={styles.contactsList}>
                      {contatosSelecionados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato selecionado.
                        </div>
                      ) : contatosSelecionadosFiltrados.length === 0 ? (
                        <div className={styles.emptyMiniState}>
                          Nenhum contato selecionado encontrado para estes filtros.
                        </div>
                      ) : (
                        contatosSelecionadosFiltrados.map((contato) => (
                          <div key={contato.id} className={styles.contactCardSelected}>
                            <div className={styles.contactMain}>
                              <strong className={styles.contactName}>
                                {contato.nome || "Sem nome"}
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

                                {renderBadgeCooldownContato(contato)}
                              </div>
                              {renderBadgesDisparoAntigo(contato)}
                            </div>

                            <button
                              type="button"
                              className={styles.removeButton}
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
                    <strong>Disparo bloqueado por opt-out</strong>
                    <p>
                      {totalContatosOptOut} contato(s) selecionado(s)
                      solicitaram o bloqueio da categoria do template
                      selecionado. Remova-os da seleção para continuar.
                    </p>
                  </div>
                ) : null}

                {temContatosCooldown ? (
                  <div
                    className={`${styles.coldListNotice} ${styles.coldListNoticeBlocked}`}
                    role="alert"
                  >
                    <strong>Disparo bloqueado por pausa da Meta</strong>
                    <p>
                      {totalContatosCooldown} contato(s) selecionado(s) estão
                      em pausa temporária para marketing porque a Meta recusou
                      uma entrega recente por limite de qualidade ou frequência.
                      Remova-os da seleção para continuar.
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
                        ? "Disparo de marketing bloqueado"
                        : utilityListaFriaSemOptOut
                        ? "Template sem opt-out"
                        : `${totalContatosListaFria} contato(s) de lista fria selecionado(s)`}
                    </strong>
                    <p>
                      {marketingComListaFria
                        ? `A Meta exige opt-in para mensagens de marketing. Remova os ${totalContatosListaFria} contato(s) de lista fria ou selecione somente contatos com opt-in para liberar o envio.`
                        : utilityListaFriaSemOptOut
                        ? "Recrie este template utility com o rodapé obrigatório para responder SAIR antes de utilizá-lo com lista fria."
                        : "Templates utility podem ser enviados, mas exigirão uma confirmação de responsabilidade depois da confirmação dos valores."}
                    </p>
                    <span>
                      Nesta tela, o contato possui opt-in quando já existe uma
                      mensagem recebida dele no WhatsApp da empresa.
                    </span>
                  </div>
                ) : null}

                {(loadingConflitos ||
                  erroConflitos ||
                  gruposConflitoAtivos.length > 0) && (
                  <div
                    className={`${styles.conflictCard} ${
                      temConflitosPendentes
                        ? styles.conflictCardPending
                        : styles.conflictCardResolved
                    }`}
                  >
                    <div className={styles.conflictHeader}>
                      <div>
                        <span className={styles.conflictEyebrow}>
                          Contatos repetidos
                        </span>
                        <strong>
                          {loadingConflitos
                            ? "Verificando contatos dos ultimos 7 dias..."
                            : temConflitosPendentes
                            ? `${totalContatosComConflitoSelecionados} contato(s) precisam de decisão`
                            : "Contatos repetidos resolvidos"}
                        </strong>
                      </div>

                      <span
                        className={`${styles.conflictStatus} ${
                          temConflitosPendentes
                            ? styles.conflictStatusBlocked
                            : styles.conflictStatusUnlocked
                        }`}
                      >
                        {temConflitosPendentes ? "Envio bloqueado" : "Envio desbloqueado"}
                      </span>
                    </div>

                    {erroConflitos ? (
                      <p className={styles.conflictError}>{erroConflitos}</p>
                    ) : null}

                    {!loadingConflitos && gruposConflitoAtivos.length > 0 ? (
                      <div className={styles.conflictGroups}>
                        {gruposConflitoAtivos.map((grupo) => {
                          const decisao =
                            decisoesConflitoDisparo[grupo.campanha_id];
                            const decisaoTexto =
                              decisao?.acao === "incluir"
                                ? "Contato mantido"
                                : decisao?.acao === "remover"
                                ? "Removido do envio"
                                : "Pendente";

                            const decisaoClasse =
                              decisao?.acao === "incluir"
                                ? styles.conflictDecisionIncluded
                                : decisao?.acao === "remover"
                                ? styles.conflictDecisionRemoved
                                : styles.conflictDecisionPending;

                            return (
                            <div
                              key={grupo.campanha_id}
                              className={styles.conflictGroup}
                            >
                              <div className={styles.conflictGroupMain}>
                                <strong>{grupo.campanha_nome}</strong>
                                <span>
                                  {grupo.contatos_ids.length} contato(s) ja
                                  receberam este disparo
                                  {grupo.ultimo_envio_em
                                    ? ` em ${formatarDataHora(
                                        grupo.ultimo_envio_em
                                      )}`
                                    : ""}
                                </span>
                              </div>

                              <span className={`${styles.conflictDecision} ${decisaoClasse}`}>
                                {decisaoTexto}
                              </span>

                              <div className={styles.conflictActions}>
                                <button
                                  type="button"
                                  className={styles.removerButton}
                                  onClick={() =>
                                    removerGrupoConflitoDoEnvio(grupo)
                                  }
                                >
                                  Remover do envio
                                </button>

                                <button
                                  type="button"
                                  className={styles.ButtonAdd}
                                  onClick={() =>
                                    marcarGrupoConflitoComoIncluido(grupo)
                                  }
                                >
                                  Manter
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                )}

                {mensagem ? (
                  <FeedbackToast
                    success={mensagem}
                    onSuccessDismiss={() => setMensagem("")}
                  />
                ) : null}
                {erro ? <div className={styles.errorAlert}>{erro}</div> : null}

                {(loadingSaudeMeta || limiteMeta) && (
                  <div
                    className={`${styles.metaHealthCard} ${
                      selecaoExcedeLimite || limiteMeta?.alerta === "vermelho"
                        ? styles.metaHealthDanger
                        : limiteMeta?.alerta === "amarelo"
                        ? styles.metaHealthWarning
                        : ""
                    }`}
                  >
                    <div className={styles.metaHealthHeader}>
                      <div>
                        <span>Controle preventivo da Meta</span>
                        <strong>Capacidade segura para este disparo</strong>
                        <p>
                          O CRM acompanha o limite de contatos únicos iniciados
                          pela empresa nas últimas 24 horas e bloqueia envios
                          que poderiam ultrapassar esse teto.
                        </p>
                      </div>

                      <div className={styles.metaHealthHeaderActions}>
                        <a
                          href="https://business.facebook.com/latest/whatsapp_manager/messaging_limits"
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.metaCapacityButton}
                        >
                          Mais capacidade
                        </a>
                        <strong className={styles.metaHealthUsageBadge}>
                          {loadingSaudeMeta
                            ? "Atualizando"
                            : `${formatarPercentualMeta(limiteMeta?.percentual)} usado`}
                        </strong>
                      </div>
                    </div>

                    <div className={styles.metaHealthGrid}>
                      <div>
                        <span>Capacidade da conta</span>
                        <strong>{formatarNumeroMeta(limiteMeta?.limite)}</strong>
                      </div>
                      <div>
                        <span>Ainda disponíveis</span>
                        <strong>{formatarNumeroMeta(limiteMeta?.restantes)}</strong>
                      </div>
                      <div>
                        <span>Ja comprometidos</span>
                        <strong>{formatarNumeroMeta(limiteMeta?.usados)}</strong>
                      </div>
                      <div>
                        <span>Consomem limite</span>
                        <strong>
                          {formatarNumeroMeta(totalTelefonesQueConsomemLimite)}
                        </strong>
                      </div>
                      <div>
                        <span>Disponíveis após envio</span>
                        <strong>
                        {typeof saldoEstimadoAposSelecao === "number"
                          ? formatarNumeroMeta(Math.max(saldoEstimadoAposSelecao, 0))
                          : "0"}
                        </strong>
                      </div>
                    </div>

                    <div className={styles.metaHealthMeta}>
                      <span>
                        Alcance: {formatarLimiteTierMeta(limiteMeta?.tier)}
                      </span>
                      <span>
                        Reputação do número:{" "}
                        {formatarQualidadeMeta(
                          saudeMetaIntegracao?.quality_rating ||
                            integracaoSelecionada?.quality_rating
                        )}
                      </span>
                      <span>
                        Ambiente:{" "}
                        {formatarModoMeta(
                          saudeMetaIntegracao?.meta_account_mode ||
                            integracaoSelecionada?.meta_account_mode
                        )}
                      </span>
                      <span>
                        Selecionados:{" "}
                        {formatarNumeroMeta(telefonesSelecionadosUnicos.length)}
                      </span>
                      {totalTelefonesIsentosLimite > 0 && (
                        <span>
                          Isentos por conversa aberta:{" "}
                          {formatarNumeroMeta(totalTelefonesIsentosLimite)}
                        </span>
                      )}
                    </div>

                    {selecaoExcedeLimite && (
                      <p className={styles.metaHealthAlert}>
                        {agendarDisparo
                          ? "A selecao ultrapassa o limite disponivel agora. O CRM vai reavaliar o limite quando chegar o horario agendado."
                          : "A selecao atual ultrapassa o limite disponivel. O CRM vai bloquear o envio antes de chamar a Meta."}
                      </p>
                    )}
                  </div>
                )}

                <div className={styles.submitBar}>
                  {/* ESQUERDA */}
                  <div className={styles.submitLeft}>
                    <span>Template: {templateSelecionado?.nome}</span>
                    {agendarDisparo && agendamentoData && agendamentoHora ? (
                      <span>
                        Agendado:{" "}
                        {formatarDataHora(
                          new Date(
                            `${agendamentoData}T${agendamentoHora}:00`
                          ).toISOString()
                        )}
                      </span>
                    ) : null}
                    <span>Variáveis: {totalVariaveis}</span>
                  </div>

                  {/* CENTRO */}
                  <div className={styles.submitCenter}>
                    <span>
                      <strong>Categoria:</strong> {formatarCategoriaMeta(previewCusto?.categoria)}
                    </span>

                    <span>
                      <strong>Qtd.:</strong> {previewCusto?.totalSelecionados}
                    </span>

                    <span>
                      <strong>Isentos:</strong> {previewCusto?.totalIsentos}
                    </span>

                    <span>
                      <strong>Cobrados:</strong> {previewCusto?.totalCobrados}
                    </span>

                    <span>
                      <strong>USD:</strong> {previewCusto?.valorTotalUsd?.toFixed(4)}
                    </span>

                    <span className={styles.totalBrlRange}>
                      <strong>Total:</strong>{" "}
                      R$ {previewCusto?.valorTotalBrlMin?.toFixed(2)} ~ R${" "}
                      {previewCusto?.valorTotalBrlMax?.toFixed(2)}
                    </span>
                  </div>

                  {/* DIREITA */}
                  <div className={styles.submitRight}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={abrirConfirmacaoDisparo}
                      disabled={
                        !templateSelecionado ||
                        contatosSelecionados.length === 0 ||
                        (agendarDisparo &&
                          (!agendamentoData || !agendamentoHora)) ||
                        disparando ||
                        (!agendarDisparo && disparoBloqueado) ||
                        (!agendarDisparo && selecaoExcedeLimite) ||
                        loadingConflitos ||
                        temConflitosPendentes ||
                        marketingComListaFria ||
                        temContatosOptOut ||
                        temContatosCooldown ||
                        utilityListaFriaSemOptOut
                      }
                    >
                      {temContatosOptOut
                        ? "Opt-out bloqueado"
                        : temContatosCooldown
                        ? "Pausa Meta"
                        : utilityListaFriaSemOptOut
                        ? "Template sem opt-out"
                        : marketingComListaFria
                        ? "Marketing bloqueado"
                        : temConflitosPendentes
                        ? "Resolver repetidos"
                        : !agendarDisparo && disparoBloqueado
                        ? textoDisparoBloqueado
                        : agendarDisparo
                        ? "Agendar disparo"
                        : "Enviar disparos"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>

          {campanhaPagina ? (
            <section
              className={`${styles.massProgressCard} ${
                campanhaPaginaAtiva
                  ? styles.massProgressActive
                  : campanhaPaginaConcluida
                  ? styles.massProgressSuccess
                  : styles.massProgressWarning
              }`}
              role="status"
              aria-live="polite"
            >
              <div className={styles.massProgressHeader}>
                <span
                  className={
                    campanhaPaginaAtiva
                      ? styles.massProgressSpinner
                      : styles.massProgressDot
                  }
                />

                <div className={styles.massProgressTitleGroup}>
                  <p className={styles.eyebrow}>Disparo em massa</p>
                  <h2 className={styles.massProgressTitle}>
                    {campanhaPagina.nome || rotuloStatusCampanha(campanhaPagina)}
                  </h2>
                  <p className={styles.massProgressSubtitle}>
                    {rotuloStatusCampanha(campanhaPagina)}
                    {" - "}
                    Template: {campanhaPagina.template_nome || "-"}
                    {" - "}
                    Integracao:{" "}
                    {integracaoCampanhaPagina?.nome_conexao ||
                      integracaoCampanhaPagina?.numero ||
                      "WhatsApp"}
                  </p>
                </div>

                <div className={styles.massProgressHeaderActions}>
                  <span className={styles.massProgressStatus}>
                    {campanhaPagina.enviados || 0}/{campanhaPagina.total || 0}
                  </span>

                  {campanhaPaginaAtiva && podeDisparar ? (
                    <button
                      type="button"
                      className={styles.massProgressCancelButton}
                      onClick={() => setModalCancelarCampanhaAberto(true)}
                      disabled={cancelandoCampanha}
                      aria-label="Cancelar disparo em massa"
                    >
                      <CircleStop size={16} aria-hidden="true" />
                      {cancelandoCampanha ? "Cancelando..." : "Cancelar disparo"}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.massProgressMetrics}>
                <div>
                  <strong>{campanhaPagina.total || 0}</strong>
                  <span>Total</span>
                </div>

                <div>
                  <strong>{campanhaPagina.enviados || 0}</strong>
                  <span>Enviados</span>
                </div>

                <div>
                  <strong>{campanhaPagina.falhas || 0}</strong>
                  <span>Falhas</span>
                </div>

                <div>
                  <strong>{campanhaPagina.cancelados || 0}</strong>
                  <span>Cancelados</span>
                </div>
              </div>

              <div className={styles.massProgressTrack} aria-hidden="true">
                <span style={{ width: `${progressoCampanhaPagina}%` }} />
              </div>

              {!campanhaPaginaAtiva ? (
                <p className={styles.massProgressMessage}>
                  {descricaoCampanhaTerminal(campanhaPagina)}
                </p>
              ) : null}
            </section>
          ) : null}

      <section className={styles.resultsCard}>
        <div className={styles.cardHeader}>
          <div>
            <p className={styles.eyebrow}>Histórico</p>
            <h2 className={styles.cardTitle}>Resultados dos disparos</h2>
            <p className={styles.cardSubtitle}>
              Os disparos salvos ficam sempre visíveis aqui.
            </p>
          </div>
        </div>

          <div className={styles.resultsSummary}>
            <button
              type="button"
              className={
                filtroHistorico === "todos"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("todos")}
            >
              <span className={styles.summaryLabel}>Total</span>
              <strong className={styles.summaryValue}>
                {totaisHistorico.total}
              </strong>
            </button>

            <button
              type="button"
              className={
                filtroHistorico === "sucesso"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("sucesso")}
            >
              <span className={styles.summaryLabel}>Enviados</span>
              <strong className={styles.summaryValue}>{totalSucesso}</strong>
            </button>

            <button
              type="button"
              className={
                filtroHistorico === "processando"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("processando")}
            >
              <span className={styles.summaryLabel}>Pendentes</span>
              <strong className={styles.summaryValue}>{totalProcessando}</strong>
            </button>

            <button
              type="button"
              className={
                filtroHistorico === "falha"
                  ? `${styles.summaryCard} ${styles.summaryCardActive}`
                  : styles.summaryCard
              }
              onClick={() => setFiltroHistorico("falha")}
            >
              <span className={styles.summaryLabel}>Falhas</span>
              <strong className={styles.summaryValue}>{totalFalha}</strong>
            </button>
          </div>

          <div className={styles.historySearchBar}>
            <div className={styles.historySearchField}>
              <label className={styles.label}>Busca</label>
              <input
                value={buscaHistorico}
                onChange={(e) => setBuscaHistorico(e.target.value)}
                className={styles.input}
                placeholder="Busque por número, nome ou template..."
              />
            </div>

            <div className={styles.historyMassFilter}>
              <label className={styles.label}>Disparo em massa</label>
              <select
                value={filtroHistoricoCampanha}
                onChange={(e) => setFiltroHistoricoCampanha(e.target.value)}
                className={styles.input}
              >
                <option value="">Todos os disparos em massa</option>
                {campanhasHistorico.map((campanha) => (
                  <option key={campanha.id} value={campanha.id}>
                    {nomeCampanhaHistorico(campanha)}
                  </option>
                ))}
              </select>
            </div>
          </div>

            {loadingHistorico ? (
              <div className={styles.emptyState}>Carregando histórico...</div>
            ) : resultadoFiltrado.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo encontrado para este filtro.
              </div>
            ) : (
              <div className={styles.resultsList}>
                {resultadoHistoricoPaginado.map((item, index) => {
                  if (historicoEhCampanhaPausada(item)) {
                    const totais = obterTotaisCampanhaPausada(item);
                    const motivo = obterMotivoCampanhaPausada(item);

                    return (
                      <div
                        key={item.id || item.campanha_id || `campanha-${index}`}
                        className={`${styles.resultItem} ${styles.resultError} ${styles.resultMassCancelled}`}
                      >
                        <div className={styles.resultCompactHeader}>
                          <div className={styles.resultCompactMain}>
                            <strong className={styles.resultCompactName}>
                              {obterTituloCampanhaPausada(item)}
                            </strong>

                            <p className={styles.resultCompactMeta}>
                              Template: {item.template_nome || "-"}
                              {" • "}
                              Categoria: {formatarCategoriaMeta(obterCategoriaHistorico(item))}
                              {" • "}
                              Disparo interrompido pelo sistema de segurança
                            </p>
                          </div>

                          <span
                            className={`${styles.resultStatus} ${styles.massCancelledStatus}`}
                          >
                            {obterStatusCampanhaPausada(item)}
                          </span>
                        </div>

                        <div className={styles.massCancelledMetrics}>
                          <div className={styles.massCancelledMetric}>
                            <strong>{totais.totalItens}</strong>
                            <span>Total</span>
                          </div>

                          <div className={styles.massCancelledMetric}>
                            <strong>{totais.totalEnviados}</strong>
                            <span>Enviados</span>
                          </div>

                          <div className={styles.massCancelledMetric}>
                            <strong>{totais.totalCancelados}</strong>
                            <span>Cancelados</span>
                          </div>

                          <div className={styles.massCancelledMetric}>
                            <strong>{totais.totalFalhas}</strong>
                            <span>Falhas</span>
                          </div>
                        </div>

                        <div className={styles.resultErrorFeedback}>
                          <strong className={styles.resultErrorTitle}>
                            Disparo em massa cancelado
                          </strong>

                          <p className={styles.resultErrorDescription}>
                            {String(motivo)}
                          </p>

                          <p className={styles.resultErrorDetail}>
                            Foram enviados {totais.totalEnviados} disparos.{" "}
                            {totais.totalCancelados} disparos foram cancelados
                            antes do envio.
                            {totais.totalFalhas > 0
                              ? ` ${totais.totalFalhas} disparos falharam durante o processamento.`
                              : ""}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                  <div
                    key={item.id || `${item.numero}-${index}`}
                    className={`${styles.resultItem} ${
                      disparoEstaProcessando(item)
                        ? styles.resultProcessing
                        : disparoTeveSucesso(item)
                        ? styles.resultSuccess
                        : styles.resultError
                    }`}
                  >
                  <div className={styles.resultCompactHeader}>
                    <div className={styles.resultCompactMain}>
                      <strong className={styles.resultCompactName}>
                        {item.nome_contato || "Sem nome"} • {item.numero}
                      </strong>

                        <p className={styles.resultCompactMeta}>
                          Template: {item.template_nome || "-"}
                          {" • "}
                          Categoria: {formatarCategoriaMeta(obterCategoriaHistorico(item))}
                          {" • "}
                          {formatarDataHora(item.created_at)}

                        {item.campanha_nome ? (
                          <>
                            {"   "}
                            <span
                              className={styles.badgeMassHistory}
                              title={item.campanha_nome}
                            >
                              {truncarNomeBadge(item.campanha_nome, 42)}
                            </span>
                          </>
                        ) : null}

                        {item.origem_historico === "agendado" ? (
                          <>
                            {" • "}
                            <span className={styles.badgeAgendado}>
                              ⏰ Disparo agendado
                            </span>
                          </>
                        ) : null}

                        {item.origem_historico === "individual" ? (
                          <>
                            {" • "}
                            <span className={styles.badgeIndividual}>
                              👤 Disparo individual
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <span className={styles.resultStatus}>
                      {item.status_label ||
                        (disparoEstaProcessando(item)
                          ? "Aguardando confirmação"
                          : disparoTeveSucesso(item)
                          ? "Enviado"
                          : "Falha")}
                    </span>
                  </div>

                    {item.mensagem_template ? (
                      (() => {
                        const chaveMensagem = item.id || `${item.numero}-${index}`;
                        const expandida = mensagensExpandidas.includes(chaveMensagem);
                        const mensagemExibida = expandida
                          ? item.mensagem_template
                          : resumirMensagem(item.mensagem_template);

                        return (
                          <div className={styles.resultCompactMessageRow}>
                            <p
                              className={`${styles.resultCompactMessage} ${
                                !expandida ? styles.resultCompactMessageCollapsed : ""
                              }`}
                            >
                              {mensagemExibida}
                            </p>

                            <button
                              type="button"
                              className={styles.expandMessageButton}
                              onClick={() => alternarMensagemExpandida(chaveMensagem)}
                            >
                              {expandida ? "Ocultar" : "Ver mensagem"}
                            </button>
                          </div>
                        );
                      })()
                    ) : null}

                    {(() => {
                      const feedbackErro = obterFeedbackErroDisparo(item);

                      if (!feedbackErro) return null;

                      return (
                        <div className={styles.resultErrorFeedback}>
                          <strong className={styles.resultErrorTitle}>
                            {feedbackErro.titulo}
                          </strong>

                          <p className={styles.resultErrorDescription}>
                            {feedbackErro.descricao}
                          </p>

                          {feedbackErro.detalhe ? (
                            <p className={styles.resultErrorDetail}>
                              Detalhe técnico: {feedbackErro.detalhe}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                  );
                })}
                
                {totalResultadosFiltroAtivo > ITENS_HISTORICO_POR_PAGINA ||
                paginaHistorico > 1 ||
                historicoTemMais ? (
                  <div className={styles.paginationBar}>
                    <span className={styles.paginationInfo}>
                      Mostrando {primeiroItemHistorico} a {ultimoItemHistorico} de{" "}
                      {totalResultadosFiltroAtivo} disparos
                    </span>

                    <div className={styles.paginationActions}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          void carregarHistorico({
                            pagina: Math.max(1, paginaHistorico - 1),
                            forcar: false,
                          })
                        }
                        disabled={paginaHistorico <= 1 || loadingHistorico}
                      >
                        Anterior
                      </button>

                      <span className={styles.paginationCurrent}>
                        Página {paginaHistorico} de {totalPaginasHistorico}
                      </span>

                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          void carregarHistorico({
                            pagina: paginaHistorico + 1,
                            forcar: false,
                          })
                        }
                        disabled={!historicoTemMais || loadingHistorico}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      {modalVariaveisAberto && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setErroVariavelModal("");
            setModalVariaveisAberto(false);
          }}
        >
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Variáveis</p>
                <h3 className={styles.modalTitle}>Gerenciar variáveis</h3>
                <p className={styles.modalSubtitle}>
                  Cadastre variáveis personalizadas e consulte as variáveis fixas disponíveis para disparos e fluxos.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => {
                  setErroVariavelModal("");
                  setModalVariaveisAberto(false);
                }}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Cadastrar variável personalizada</h4>

                <div className={styles.variableFormGrid}>
                  <div className={styles.field}>
                    <label className={styles.label}>Nome da variável</label>
                    <input
                      value={novaVariavelChave}
                      onChange={(e) =>
                        setNovaVariavelChave(
                          normalizarEntradaVariavelTemplate(e.target.value)
                        )
                      }
                      className={styles.input}
                      placeholder="ex: desconto"
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Mensagem da variável</label>

                  <textarea
                    value={novaVariavelValor}
                    onChange={(e) => setNovaVariavelValor(e.target.value)}
                    className={styles.textarea}
                    placeholder="Digite a mensagem da variável..."
                    rows={4}
                  />
                </div>


                <div className={styles.field}>
                  <label className={styles.label}>Descrição Interna</label>
                  <textarea
                    value={novaVariavelDescricao}
                    onChange={(e) => setNovaVariavelDescricao(e.target.value)}
                    className={styles.textareadesc}
                    placeholder="ex: essa váriavel é sobre desconto."
                  />
                </div>

                <div className={styles.variablePreviewBox}>
                  A variável será usada assim:{" "}
                  <strong>
                    {"{{"}
                    {normalizarEntradaVariavelTemplate(novaVariavelChave) || "nome_variavel"}
                    {"}}"}
                  </strong>
                </div>

                {erroVariavelModal && (
                  <div className={styles.errorAlert}>{erroVariavelModal}</div>
                )}

                <div className={styles.variableFormActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={salvarVariavelPersonalizada}
                    disabled={salvandoVariavel}
                  >
                    {salvandoVariavel ? "Salvando..." : "Salvar variável"}
                  </button>
                </div>
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Variáveis cadastradas</h4>

                {loadingVariaveis ? (
                  <div className={styles.emptyMiniState}>Carregando variáveis...</div>
                ) : variaveisPersonalizadas.length === 0 ? (
                  <div className={styles.emptyMiniState}>
                    Nenhuma variável personalizada cadastrada.
                  </div>
                ) : (
                  <div className={styles.variablesList}>
                    {variaveisPersonalizadas.map((item) => (
                      <div key={item.id} className={styles.variableItem}>
                        <div className={styles.variableMain}>
                          <strong className={styles.variableCode}>
                            {"{{"}
                            {item.chave}
                            {"}}"}
                          </strong>

                          <p className={styles.variablePerson}>
                            <strong>Mensagem da variável: </strong>{item.valor}
                          </p>

                          {item.descricao ? (
                            <p className={styles.variablePerson}>
                              <strong>Descrição Interna: </strong>{item.descricao}
                            </p>
                          ) : null}
                        </div>

                        <div className={styles.variableActions}>
                          <button
                            type="button"
                            className={styles.variableUseButton}
                            onClick={() => aplicarVariavelNoCampo(item.chave)}
                          >
                            Usar
                          </button>

                          <button
                            type="button"
                            className={styles.variableDeleteButton}
                            onClick={() => removerVariavelPersonalizada(item.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Variáveis fixas do sistema</h4>

                <div className={styles.variablesList}>
                  {VARIAVEIS_FIXAS_SISTEMA.map((item) => (
                    <div key={item.chave} className={styles.variableItem}>
                      <div className={styles.variableMain}>
                        <strong className={styles.variableCode}>{item.exemplo}</strong>
                        <p className={styles.variableDescription}>{item.descricao}</p>
                      </div>

                      <button
                        type="button"
                        className={styles.variableUseButton}
                        onClick={() => aplicarVariavelNoCampo(item.chave)}
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setErroVariavelModal("");
                  setModalVariaveisAberto(false);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCancelarCampanhaAberto &&
      campanhaPaginaAtiva &&
      campanhaPagina &&
      podeDisparar ? (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            if (!cancelandoCampanha) {
              setModalCancelarCampanhaAberto(false);
            }
          }}
        >
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Interromper campanha</p>
                <h3 className={styles.modalTitle}>
                  Cancelar disparos pendentes?
                </h3>
                <p className={styles.modalSubtitle}>
                  Os envios que ainda não foram processados serão cancelados.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setModalCancelarCampanhaAberto(false)}
                disabled={cancelandoCampanha}
                aria-label="Fechar confirmacao"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.cancelCampaignSummary}>
                <strong>{campanhaPagina.nome || "Disparo em massa"}</strong>
                <div>
                  <span>
                    Enviados: <strong>{campanhaPagina.enviados || 0}</strong>
                  </span>
                  <span>
                    Restantes:{" "}
                    <strong>
                      {Math.max(
                        Number(campanhaPagina.total || 0) -
                          Number(campanhaPagina.enviados || 0) -
                          Number(campanhaPagina.falhas || 0) -
                          Number(campanhaPagina.cancelados || 0),
                        0
                      )}
                    </strong>
                  </span>
                </div>
              </div>

              <div className={styles.modalAlert}>
                Mensagens ja aceitas pela Meta não podem ser desfeitas e
                continuarao aparecendo como enviadas.
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalCancelarCampanhaAberto(false)}
                disabled={cancelandoCampanha}
              >
                Continuar disparo
              </button>

              <button
                type="button"
                className={styles.cancelCampaignConfirmButton}
                onClick={cancelarCampanhaEmAndamento}
                disabled={cancelandoCampanha}
              >
                <CircleStop size={16} aria-hidden="true" />
                {cancelandoCampanha
                  ? "Cancelando..."
                  : "Cancelar disparos pendentes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalConfirmacaoAberto && podeDisparar && (
        <div className={styles.modalOverlay} onClick={() => setModalConfirmacaoAberto(false)}>
          <div
            className={styles.modalConfirmacao}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Confirmação de cobrança</p>
                <h3 className={styles.modalTitle}>
                  {agendarDisparo
                    ? "Confirmar agendamento"
                    : "Confirmar disparo de mensagens"}
                </h3>
                <p className={styles.modalSubtitle}>
                  Revise as informações abaixo antes de continuar. Este envio pode gerar cobrança.
                </p>
              </div>

              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setModalConfirmacaoAberto(false)}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Resumo do disparo</h4>

                <div className={styles.modalGridResumo}>
                  {agendarDisparo && agendamentoData && agendamentoHora ? (
                    <div className={styles.modalInfoItem}>
                      <span className={styles.modalInfoLabel}>Data e hora</span>
                      <strong className={styles.modalInfoValue}>
                        {formatarDataHora(
                          new Date(
                            `${agendamentoData}T${agendamentoHora}:00`
                          ).toISOString()
                        )}
                      </strong>
                    </div>
                  ) : null}

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Disparo em massa</span>
                    <strong className={styles.modalInfoValue}>
                      {nomeCampanhaDisparo.trim() || "Nome automatico"}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Template</span>
                    <strong className={styles.modalInfoValue}>
                      {templateSelecionado?.nome || "-"}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Categoria</span>
                    <strong className={styles.modalInfoValue}>
                      {formatarCategoriaMeta(previewCusto?.categoria || templateSelecionado?.categoria)}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Selecionados</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalSelecionados ?? contatosSelecionados.length}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Isentos</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalIsentos ?? 0}
                    </strong>
                  </div>

                  <div className={styles.modalInfoItem}>
                    <span className={styles.modalInfoLabel}>Cobrados</span>
                    <strong className={styles.modalInfoValue}>
                      {previewCusto?.totalCobrados ?? 0}
                    </strong>
                  </div>
                </div>
              </div>

              <div className={styles.modalDestaqueFinanceiro}>
                <span className={styles.modalFinanceiroLabel}>Total estimado</span>
                <strong className={styles.modalFinanceiroValor}>
                  R$ {(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ {(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}
                </strong>
                <p className={styles.modalFinanceiroObs}>
                  Valor de referência calculado a partir do total em USD e da cotação atual.
                </p>
              </div>

              <div className={styles.modalAlert}>
                <strong>Atenção:</strong> a cobrança pode ser processada pela Meta usando o método de pagamento vinculado à conta comercial. O valor final faturado pode variar em relação à estimativa exibida nesta tela.
              </div>

              <div className={styles.modalSection}>
                <h4 className={styles.modalSectionTitle}>Informações importantes</h4>

                <ul className={styles.modalList}>
                  {agendarDisparo ? (
                    <li>
                      No horario escolhido, o disparo sera criado e processado
                      gradualmente pela fila.
                    </li>
                  ) : null}
                  <li>O valor em real exibido aqui é uma estimativa e serve apenas como referência.</li>
                  <li>O valor final pode variar conforme cotação do USD, IOF, impostos, tarifas bancárias e regras de cobrança aplicáveis.</li>
                  <li>Conversas isentas não entram no total cobrado.</li>
                  <li>Templates de marketing podem gerar cobrança mesmo quando existe uma conversa ativa.</li>
                  <li>Após a confirmação, o disparo será enfileirado e processado gradualmente.</li>
                </ul>
              </div>

              <label className={styles.modalCheckbox}>
                <input
                  type="checkbox"
                  checked={confirmacaoCobranca}
                  onChange={(e) => setConfirmacaoCobranca(e.target.checked)}
                />
                <span>
                  Li as informações acima e estou ciente de que este disparo pode gerar cobrança.
                </span>
              </label>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalConfirmacaoAberto(false)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarEDisparar}
                disabled={
                  !confirmacaoCobranca ||
                  disparando ||
                  (!agendarDisparo && disparoBloqueado) ||
                  (agendarDisparo &&
                    (!agendamentoData || !agendamentoHora)) ||
                  loadingConflitos ||
                  temConflitosPendentes
                }
              >
                {temConflitosPendentes
                  ? "Resolver repetidos"
                  : !agendarDisparo && disparoBloqueado
                  ? textoDisparoBloqueado
                  : agendarDisparo
                  ? "Confirmar agendamento"
                  : "Confirmar e enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalResponsabilidadeListaFriaAberto &&
        podeDisparar &&
        utilityComListaFria && (
          <div
            className={styles.modalOverlay}
            onClick={() => {
              setModalResponsabilidadeListaFriaAberto(false);
              setConfirmacaoResponsabilidadeListaFria(false);
            }}
          >
            <div
              className={styles.modalConfirmacao}
              role="dialog"
              aria-modal="true"
              aria-labelledby="responsabilidade-lista-fria-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.modalEyebrow}>Lista fria</p>
                  <h3
                    id="responsabilidade-lista-fria-titulo"
                    className={styles.modalTitle}
                  >
                    Confirmar responsabilidade pelo envio
                  </h3>
                  <p className={styles.modalSubtitle}>
                    O template utility será enviado para{" "}
                    {totalContatosListaFria} contato(s) sem histórico de
                    mensagem recebida.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.modalClose}
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
                <div className={styles.modalRiskAlert}>
                  <strong>Este envio possui risco para a conta WhatsApp.</strong>
                  <p>
                    Templates utility devem conter somente informações
                    transacionais ou de serviço solicitadas pelo contato. Usar
                    esse tipo de template para promoção, prospecção ou conteúdo
                    de marketing pode causar denúncias, redução da qualidade,
                    limitação ou banimento pela Meta.
                  </p>
                </div>

                <div className={styles.modalSection}>
                  <h4 className={styles.modalSectionTitle}>
                    Ao continuar, você declara que:
                  </h4>
                  <ul className={styles.modalList}>
                    <li>
                      revisou o conteúdo e confirma que ele é realmente
                      utility, sem oferta ou promoção;
                    </li>
                    <li>
                      possui base legal e autorização adequadas para contatar
                      os destinatários;
                    </li>
                    <li>
                      assume a responsabilidade por bloqueios, denúncias,
                      limitações ou banimento aplicados pela Meta.
                    </li>
                  </ul>
                </div>

                <label className={styles.modalCheckbox}>
                  <input
                    type="checkbox"
                    checked={confirmacaoResponsabilidadeListaFria}
                    onChange={(e) =>
                      setConfirmacaoResponsabilidadeListaFria(e.target.checked)
                    }
                  />
                  <span>
                    Li e compreendi os riscos. Confirmo que o conteúdo é
                    utility e assumo integralmente a responsabilidade por este
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
                  onClick={confirmarResponsabilidadeEDisparar}
                  disabled={
                    !confirmacaoResponsabilidadeListaFria || disparando
                  }
                >
                  {disparando
                    ? "Processando..."
                    : agendarDisparo
                    ? "Assumir e agendar"
                    : "Assumir e enviar"}
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
