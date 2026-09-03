"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import styles from "./page.module.css";

type ModoAtendimento = "economico" | "geral";
type FallbackTipo = "fluxo" | "transferir_humano" | "nenhum";
type CondicaoGatilho = "exata" | "inicia_com" | "contem" | "regex";
type EstrategiaTransferencia =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";
type NivelConsumo = "ideal" | "atencao" | "alto";

type Ferramenta = {
  id?: string;
  tipo: string;
  ativo: boolean;
  config_json: Record<string, unknown>;
};

type Conhecimento = {
  id: string;
  titulo: string;
  categoria?: string | null;
  conteudo: string;
  palavras_chave?: string[];
  prioridade?: number;
};

type GatilhoAgente = {
  id?: string;
  tipo_gatilho: "palavra_chave";
  valor: string;
  condicao: CondicaoGatilho;
  ativo: boolean;
};

type TransferenciaFallback = {
  escopo_fila: "setor" | "geral";
  setor_id: string | null;
  estrategia_transferencia: EstrategiaTransferencia;
  atendente_id: string | null;
  incluir_administradores_distribuicao: boolean;
  mensagem: string;
};

type RegraConsumo = {
  amarelo: number;
  vermelho: number;
  unidade: "caracteres" | "mensagens";
  ideal: string;
  atencao: string;
  alto: string;
};

type Agente = {
  id: string;
  nome: string;
  descricao?: string | null;
  status: "ativo" | "inativo";
  modelo: string;
  prompt_sistema: string;
  tom_voz?: string | null;
  instrucoes?: string | null;
  max_mensagens_contexto: number;
  debounce_ms: number;
  modo_atendimento: ModoAtendimento;
  fluxos_ids?: string[];
  fallback_exclusivo?: boolean;
  gatilhos?: GatilhoAgente[];
  fallback_tipo: FallbackTipo;
  fallback_fluxo_id?: string | null;
  fallback_transferencia_json?: TransferenciaFallback;
  fallback_sem_contingencia_aceito?: boolean;
  integracoes_whatsapp_ids?: string[];
  ferramentas: Ferramenta[];
  conhecimentos: Conhecimento[];
};

type OpcaoIntegracao = {
  id: string;
  nome_conexao?: string | null;
  numero?: string | null;
  phone_number_display_name?: string | null;
  verified_name?: string | null;
  status?: string | null;
};

type Opcao = { id: string; nome: string };
type OpcaoAgenda = {
  id: string;
  nome: string;
  timezone?: string | null;
  duracao_minutos?: number | null;
};
type OpcaoAtendente = {
  id: string;
  nome?: string | null;
  email?: string | null;
  setor_ids?: string[];
};

type RespostaLista = {
  ok: boolean;
  agentes: Agente[];
  opcoes: {
    integracoes: OpcaoIntegracao[];
    fluxos: Opcao[];
    setores: Opcao[];
    agendas: OpcaoAgenda[];
    atendentes: OpcaoAtendente[];
  };
  error?: string;
};

const LIMITE_CARACTERISTICAS = 5;
const MENSAGEM_TRANSFERENCIA_PADRAO =
  "Aguarde que um dos nossos atendentes já vai te responder...";

const TRANSFERENCIA_PADRAO: TransferenciaFallback = {
  escopo_fila: "geral",
  setor_id: null,
  estrategia_transferencia: "fila_setor",
  atendente_id: null,
  incluir_administradores_distribuicao: false,
  mensagem: MENSAGEM_TRANSFERENCIA_PADRAO,
};

const CARACTERISTICAS_SUGERIDAS = [
  "Alegre",
  "Carismático",
  "Empático",
  "Objetivo",
  "Profissional",
  "Acolhedor",
  "Didático",
  "Persuasivo",
  "Descontraído",
  "Formal",
  "Proativo",
  "Consultivo",
];

const FERRAMENTAS_AGENDA = new Set<string>([
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
]);

const FERRAMENTAS = [
  {
    tipo: "consultar_conhecimento",
    titulo: "Consultar conhecimento",
    descricao: "Busca trechos relevantes da base aprovada do agente.",
  },
  {
    tipo: "consultar_contato",
    titulo: "Consultar contato",
    descricao: "Lê somente os dados do contato da conversa atual.",
  },
  {
    tipo: "consultar_agenda",
    titulo: "Consultar agenda",
    descricao: "Consulta disponibilidade somente na agenda configurada para este agente.",
  },
  {
    tipo: "criar_agendamento",
    titulo: "Criar agendamento",
    descricao: "Cria na agenda configurada após revalidar o horário no backend.",
  },
  {
    tipo: "remarcar_agendamento",
    titulo: "Remarcar agendamento",
    descricao: "Remarca compromissos da agenda configurada com validação de conflito.",
  },
  {
    tipo: "cancelar_agendamento",
    titulo: "Cancelar agendamento",
    descricao: "Cancela compromissos da agenda configurada de forma idempotente.",
  },
  {
    tipo: "transferir_humano",
    titulo: "Transferir para humano",
    descricao: "Permite que o agente transfira a conversa durante o atendimento.",
  },
] as const;

const CONDICOES_GATILHO: Array<{ valor: CondicaoGatilho; label: string }> = [
  { valor: "contem", label: "Contém" },
  { valor: "exata", label: "É exatamente" },
  { valor: "inicia_com", label: "Começa com" },
  { valor: "regex", label: "Expressão regular (regex)" },
];

const REGRAS_CONSUMO = {
  nome: {
    amarelo: 41,
    vermelho: 70,
    unidade: "caracteres",
    ideal: "Tamanho adequado. O nome é enviado em todas as chamadas da IA, mas neste tamanho o impacto no consumo é pequeno.",
    atencao: "O nome passou de 40 caracteres e pode aumentar o consumo recorrente de tokens durante o atendimento. Prefira uma identificação mais curta.",
    alto: "O nome está muito longo e adiciona texto desnecessário em todas as chamadas da IA. Reduza para uma identificação objetiva.",
  },
  caracteristicas: {
    amarelo: 81,
    vermelho: 140,
    unidade: "caracteres",
    ideal: "Tamanho adequado para definir o comportamento do agente sem aumentar demais o contexto.",
    atencao: "As características passaram de 80 caracteres e podem causar consumo maior de tokens durante o atendimento. Mantenha apenas as que realmente mudam a resposta.",
    alto: "As características estão muito longas e vão impactar em um grande consumo de tokens ao longo dos atendimentos. Remova termos repetidos ou pouco relevantes.",
  },
  prompt: {
    amarelo: 1401,
    vermelho: 2200,
    unidade: "caracteres",
    ideal: "Tamanho dentro da faixa recomendada para manter um agente completo sem aumentar demais o contexto fixo.",
    atencao: "O prompt passou de 1.400 caracteres e pode causar consumo maior de tokens durante o atendimento. Remova repetições e leve informações consultáveis para a base de conhecimento.",
    alto: "O prompt está muito longo e vai impactar em um grande consumo de tokens em cada atendimento. Resuma regras, elimine repetições e separe informações consultáveis na base de conhecimento.",
  },
  instrucoes: {
    amarelo: 851,
    vermelho: 1400,
    unidade: "caracteres",
    ideal: "Tamanho adequado para complementar o prompt com regras específicas sem aumentar demais o contexto.",
    atencao: "As instruções passaram de 850 caracteres e podem causar consumo maior de tokens durante o atendimento. Evite repetir regras que já estão no prompt principal.",
    alto: "As instruções estão muito longas e vão impactar em um grande consumo de tokens em cada atendimento. Mantenha somente exceções e regras realmente necessárias.",
  },
  contexto: {
    amarelo: 7,
    vermelho: 10,
    unidade: "mensagens",
    ideal: "Quantidade recomendada para manter boa continuidade da conversa com consumo controlado de tokens.",
    atencao: "O contexto passou de 6 mensagens e pode causar consumo maior de tokens durante o atendimento, porque mais histórico é reenviado em cada chamada.",
    alto: "O contexto está muito alto e vai impactar em um grande consumo de tokens durante o atendimento. Reduza a quantidade de mensagens recentes sempre que possível.",
  },
  conhecimentoTitulo: {
    amarelo: 41,
    vermelho: 70,
    unidade: "caracteres",
    ideal: "Tamanho adequado. Um título curto ajuda a busca e mantém o trecho consultado mais enxuto.",
    atencao: "O título passou de 40 caracteres e pode aumentar o contexto quando este conhecimento for consultado. Prefira um título direto.",
    alto: "O título está muito longo e adiciona texto desnecessário quando o conhecimento é enviado para a IA. Resuma o assunto em poucas palavras.",
  },
} satisfies Record<string, RegraConsumo>;

function nivelConsumo(valor: number, regra: RegraConsumo): NivelConsumo {
  if (valor > regra.vermelho) return "alto";
  if (valor >= regra.amarelo) return "atencao";
  return "ideal";
}

function estiloCampoConsumo(nivel: NivelConsumo) {
  if (nivel === "alto") {
    return {
      borderColor: "var(--crm-danger-strong)",
      background: "var(--crm-danger-bg)",
    };
  }
  if (nivel === "atencao") {
    return {
      borderColor: "var(--crm-warning-strong)",
      background: "var(--crm-warning-bg)",
    };
  }
  return undefined;
}

function OrientacaoConsumo({ valor, regra }: { valor: number; regra: RegraConsumo }) {
  const nivel = nivelConsumo(valor, regra);
  const mensagem = nivel === "alto" ? regra.alto : nivel === "atencao" ? regra.atencao : regra.ideal;
  const cor =
    nivel === "alto"
      ? "var(--crm-danger-text)"
      : nivel === "atencao"
        ? "var(--crm-warning-text)"
        : "var(--crm-text-muted)";
  return (
    <small className={styles.fieldHint} style={{ color: cor }}>
      <strong>{valor.toLocaleString("pt-BR")} {regra.unidade}</strong> - {mensagem}
    </small>
  );
}

function cloneAgente(agente: Agente): Agente {
  return JSON.parse(JSON.stringify(agente));
}

function normalizarAgente(agente: Agente, integracoes: OpcaoIntegracao[]) {
  const clone = cloneAgente(agente);
  clone.modo_atendimento = clone.modo_atendimento === "geral" ? "geral" : "economico";
  clone.fluxos_ids = Array.isArray(clone.fluxos_ids) ? clone.fluxos_ids : [];
  clone.gatilhos = Array.isArray(clone.gatilhos) ? clone.gatilhos : [];
  clone.fallback_tipo = ["fluxo", "transferir_humano", "nenhum"].includes(
    clone.fallback_tipo
  )
    ? clone.fallback_tipo
    : "nenhum";
  clone.fallback_transferencia_json = {
    ...TRANSFERENCIA_PADRAO,
    ...(clone.fallback_transferencia_json || {}),
  };
  if (integracoes.length === 1) {
    clone.integracoes_whatsapp_ids = [integracoes[0].id];
  }
  return clone;
}

function extrairCaracteristicas(valor?: string | null) {
  const vistos = new Set<string>();
  return String(valor || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const chave = item.toLocaleLowerCase("pt-BR");
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, LIMITE_CARACTERISTICAS);
}

export default function AgentesIaPage() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [editor, setEditor] = useState<Agente | null>(null);
  const [integracoes, setIntegracoes] = useState<OpcaoIntegracao[]>([]);
  const [fluxos, setFluxos] = useState<Opcao[]>([]);
  const [setores, setSetores] = useState<Opcao[]>([]);
  const [agendas, setAgendas] = useState<OpcaoAgenda[]>([]);
  const [atendentes, setAtendentes] = useState<OpcaoAtendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [buscaCaracteristica, setBuscaCaracteristica] = useState("");
  const [seletorCaracteristicasAberto, setSeletorCaracteristicasAberto] = useState(false);
  const [novoConhecimento, setNovoConhecimento] = useState({
    titulo: "",
    categoria: "",
    conteudo: "",
    palavras_chave: "",
  });
  const [teste, setTeste] = useState("");
  const [respostaTeste, setRespostaTeste] = useState("");
  const [testando, setTestando] = useState(false);

  const selecionado = useMemo(
    () => agentes.find((agente) => agente.id === selecionadoId) || null,
    [agentes, selecionadoId]
  );

  const caracteristicasSelecionadas = useMemo(
    () => extrairCaracteristicas(editor?.tom_voz),
    [editor?.tom_voz]
  );

  const caracteristicasFiltradas = useMemo(() => {
    const busca = buscaCaracteristica.trim().toLocaleLowerCase("pt-BR");
    const selecionadas = new Set(
      caracteristicasSelecionadas.map((item) => item.toLocaleLowerCase("pt-BR"))
    );
    return CARACTERISTICAS_SUGERIDAS.filter((item) => {
      if (selecionadas.has(item.toLocaleLowerCase("pt-BR"))) return false;
      return !busca || item.toLocaleLowerCase("pt-BR").includes(busca);
    });
  }, [buscaCaracteristica, caracteristicasSelecionadas]);

  const podeAdicionarPersonalizada = useMemo(() => {
    const busca = buscaCaracteristica.trim();
    if (!busca || caracteristicasSelecionadas.length >= LIMITE_CARACTERISTICAS) return false;
    const chave = busca.toLocaleLowerCase("pt-BR");
    return ![...CARACTERISTICAS_SUGERIDAS, ...caracteristicasSelecionadas].some(
      (item) => item.toLocaleLowerCase("pt-BR") === chave
    );
  }, [buscaCaracteristica, caracteristicasSelecionadas]);

  const usaFerramentasAgenda = useMemo(
    () =>
      editor?.ferramentas?.some(
        (item) => item.ativo && FERRAMENTAS_AGENDA.has(item.tipo)
      ) || false,
    [editor?.ferramentas]
  );

  const agendaConfiguradaId = useMemo(() => {
    for (const item of editor?.ferramentas || []) {
      if (!FERRAMENTAS_AGENDA.has(item.tipo)) continue;
      const agendaId = String(item.config_json?.agenda_id || "").trim();
      if (agendaId) return agendaId;
    }
    return "";
  }, [editor?.ferramentas]);

  const transferencia = useMemo(
    () => ({ ...TRANSFERENCIA_PADRAO, ...(editor?.fallback_transferencia_json || {}) }),
    [editor?.fallback_transferencia_json]
  );

  const todosFluxosEconomico = (editor?.fluxos_ids || []).length === 0;
  const gatilhosValidos = (editor?.gatilhos || []).filter((item) => item.valor.trim());

  async function carregar(preferirId?: string) {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/agentes-ia", { cache: "no-store" });
      const json = (await res.json()) as RespostaLista;
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao carregar agentes.");
      const opcoesIntegracoes = json.opcoes?.integracoes || [];
      const agentesNormalizados = (json.agentes || []).map((agente) =>
        normalizarAgente(agente, opcoesIntegracoes)
      );
      setAgentes(agentesNormalizados);
      setIntegracoes(opcoesIntegracoes);
      setFluxos(json.opcoes?.fluxos || []);
      setSetores(json.opcoes?.setores || []);
      setAgendas(json.opcoes?.agendas || []);
      setAtendentes(json.opcoes?.atendentes || []);
      const proximoId =
        (preferirId && agentesNormalizados.some((item) => item.id === preferirId) && preferirId) ||
        (selecionadoId && agentesNormalizados.some((item) => item.id === selecionadoId) && selecionadoId) ||
        agentesNormalizados[0]?.id ||
        "";
      setSelecionadoId(proximoId);
      const proximo = agentesNormalizados.find((item) => item.id === proximoId) || null;
      setEditor(proximo ? cloneAgente(proximo) : null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao carregar agentes.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selecionado) {
      setEditor(normalizarAgente(selecionado, integracoes));
      setRespostaTeste("");
      setTeste("");
      setBuscaCaracteristica("");
      setSeletorCaracteristicasAberto(false);
    }
  }, [selecionado, integracoes]);

  async function criarAgente() {
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: `Agente ${agentes.length + 1}` }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao criar agente.");
      await carregar(json.agente.id);
      setSucesso("Agente criado pausado. Configure o modo, o roteamento e a contingência antes de ativar.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao criar agente.");
    }
  }

  function ferramentaAtiva(tipo: string) {
    return editor?.ferramentas?.some((item) => item.tipo === tipo && item.ativo) || false;
  }

  function configFerramenta(tipo: string) {
    return editor?.ferramentas?.find((item) => item.tipo === tipo)?.config_json || {};
  }

  function alternarFerramenta(tipo: string) {
    if (!editor) return;
    const existe = editor.ferramentas.find((item) => item.tipo === tipo);
    const ativando = !existe || !existe.ativo;
    const configAgenda =
      ativando && FERRAMENTAS_AGENDA.has(tipo) && agendaConfiguradaId
        ? { agenda_id: agendaConfiguradaId }
        : {};
    const proxima = existe
      ? editor.ferramentas.map((item) =>
          item.tipo === tipo
            ? {
                ...item,
                ativo: !item.ativo,
                config_json: { ...(item.config_json || {}), ...configAgenda },
              }
            : item
        )
      : [...editor.ferramentas, { tipo, ativo: true, config_json: configAgenda }];
    setEditor({ ...editor, ferramentas: proxima });
  }

  function atualizarConfigFerramenta(tipo: string, chave: string, valor: unknown) {
    if (!editor) return;
    const existe = editor.ferramentas.find((item) => item.tipo === tipo);
    const proxima = existe
      ? editor.ferramentas.map((item) =>
          item.tipo === tipo
            ? { ...item, config_json: { ...(item.config_json || {}), [chave]: valor } }
            : item
        )
      : [...editor.ferramentas, { tipo, ativo: true, config_json: { [chave]: valor } }];
    setEditor({ ...editor, ferramentas: proxima });
  }

  function atualizarAgendaFerramentas(agendaId: string) {
    if (!editor) return;
    const proxima = editor.ferramentas.map((item) =>
      FERRAMENTAS_AGENDA.has(item.tipo)
        ? {
            ...item,
            config_json: { ...(item.config_json || {}), agenda_id: agendaId || null },
          }
        : item
    );
    setEditor({ ...editor, ferramentas: proxima });
  }

  function alternarIntegracao(id: string) {
    if (!editor || integracoes.length <= 1) return;
    const atuais = editor.integracoes_whatsapp_ids || [];
    const proximos = atuais.includes(id)
      ? atuais.filter((item) => item !== id)
      : [...atuais, id];
    setEditor({ ...editor, integracoes_whatsapp_ids: proximos });
  }

  function alterarModo(modo: ModoAtendimento) {
    if (!editor) return;
    setEditor({
      ...editor,
      modo_atendimento: modo,
      fallback_exclusivo: modo === "geral" ? editor.fallback_exclusivo : false,
    });
  }

  function alternarFluxo(id: string) {
    if (!editor) return;
    const atuais = editor.fluxos_ids || [];
    if (atuais.length === 0) {
      setEditor({ ...editor, fluxos_ids: [id] });
      return;
    }
    const proximos = atuais.includes(id)
      ? atuais.filter((item) => item !== id)
      : [...atuais, id];
    setEditor({ ...editor, fluxos_ids: proximos });
  }

  function adicionarGatilho() {
    if (!editor) return;
    setEditor({
      ...editor,
      gatilhos: [
        ...(editor.gatilhos || []),
        { tipo_gatilho: "palavra_chave", valor: "", condicao: "contem", ativo: true },
      ],
    });
  }

  function atualizarGatilho(indice: number, patch: Partial<GatilhoAgente>) {
    if (!editor) return;
    const gatilhos = (editor.gatilhos || []).map((item, atual) =>
      atual === indice ? { ...item, ...patch } : item
    );
    setEditor({ ...editor, gatilhos });
  }

  function removerGatilho(indice: number) {
    if (!editor) return;
    setEditor({
      ...editor,
      gatilhos: (editor.gatilhos || []).filter((_, atual) => atual !== indice),
    });
  }

  function alterarFallbackTipo(tipo: FallbackTipo) {
    if (!editor) return;
    setEditor({
      ...editor,
      fallback_tipo: tipo,
      fallback_fluxo_id: tipo === "fluxo" ? editor.fallback_fluxo_id : null,
      fallback_sem_contingencia_aceito:
        tipo === "nenhum" ? false : editor.fallback_sem_contingencia_aceito,
      fallback_transferencia_json: {
        ...TRANSFERENCIA_PADRAO,
        ...(editor.fallback_transferencia_json || {}),
      },
    });
  }

  function atualizarTransferencia(patch: Partial<TransferenciaFallback>) {
    if (!editor) return;
    const proxima = { ...transferencia, ...patch };
    if (patch.escopo_fila === "geral") {
      proxima.setor_id = null;
      proxima.atendente_id = null;
      proxima.estrategia_transferencia = "fila_setor";
      proxima.incluir_administradores_distribuicao = false;
    }
    if (patch.estrategia_transferencia && patch.estrategia_transferencia !== "atendente_especifico") {
      proxima.atendente_id = null;
    }
    setEditor({ ...editor, fallback_transferencia_json: proxima });
  }

  function adicionarCaracteristica(valor: string) {
    if (!editor) return;
    const item = valor.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!item) return;
    const atuais = extrairCaracteristicas(editor.tom_voz);
    if (atuais.length >= LIMITE_CARACTERISTICAS) return;
    if (
      atuais.some(
        (atual) => atual.toLocaleLowerCase("pt-BR") === item.toLocaleLowerCase("pt-BR")
      )
    ) {
      setBuscaCaracteristica("");
      return;
    }
    setEditor({ ...editor, tom_voz: [...atuais, item].join(", ") });
    setBuscaCaracteristica("");
    setSeletorCaracteristicasAberto(true);
  }

  function removerCaracteristica(valor: string) {
    if (!editor) return;
    const proximas = extrairCaracteristicas(editor.tom_voz).filter((item) => item !== valor);
    setEditor({ ...editor, tom_voz: proximas.join(", ") || null });
  }

  function validarAntesDeAtivar() {
    if (!editor) return false;
    if (usaFerramentasAgenda && !agendaConfiguradaId) {
      setErro("Selecione e salve a agenda obrigatória antes de ativar o agente.");
      return false;
    }
    if (
      editor.modo_atendimento === "geral" &&
      !editor.fallback_exclusivo &&
      gatilhosValidos.length === 0
    ) {
      setErro("No modo Geral, adicione pelo menos uma palavra-chave ou marque o agente como fallback exclusivo.");
      return false;
    }
    if (editor.fallback_tipo === "fluxo" && !editor.fallback_fluxo_id) {
      setErro("Selecione o fluxo que assumirá quando a IA estiver indisponível.");
      return false;
    }
    if (
      editor.fallback_tipo === "transferir_humano" &&
      transferencia.escopo_fila === "setor" &&
      !transferencia.setor_id
    ) {
      setErro("Selecione o setor da transferência de contingência.");
      return false;
    }
    if (
      editor.fallback_tipo === "transferir_humano" &&
      transferencia.estrategia_transferencia === "atendente_especifico" &&
      !transferencia.atendente_id
    ) {
      setErro("Selecione o atendente específico da contingência.");
      return false;
    }
    if (editor.fallback_tipo === "nenhum" && !editor.fallback_sem_contingencia_aceito) {
      setErro("Confirme o aviso de responsabilidade para ativar o agente sem contingência.");
      return false;
    }
    return true;
  }

  async function salvar() {
    if (!editor) return;
    if (usaFerramentasAgenda && !agendaConfiguradaId) {
      setErro("Selecione a agenda obrigatória antes de salvar as ferramentas de agenda.");
      setSucesso("");
      return;
    }
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const integracoesSelecionadas =
        integracoes.length === 1 ? [integracoes[0].id] : editor.integracoes_whatsapp_ids;
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editor.id,
          acao: "salvar",
          nome: editor.nome,
          descricao: editor.descricao,
          prompt_sistema: editor.prompt_sistema,
          tom_voz: editor.tom_voz,
          instrucoes: editor.instrucoes,
          max_mensagens_contexto: editor.max_mensagens_contexto,
          debounce_ms: editor.debounce_ms,
          modo_atendimento: editor.modo_atendimento,
          fluxos_ids: editor.fluxos_ids || [],
          fallback_exclusivo: editor.fallback_exclusivo === true,
          gatilhos: editor.gatilhos || [],
          fallback_tipo: editor.fallback_tipo,
          fallback_fluxo_id: editor.fallback_fluxo_id,
          fallback_transferencia_json: transferencia,
          fallback_sem_contingencia_aceito:
            editor.fallback_sem_contingencia_aceito === true,
          integracoes_whatsapp_ids: integracoesSelecionadas,
          ferramentas: editor.ferramentas,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao salvar agente.");
      const agentesNormalizados = (json.agentes || []).map((agente: Agente) =>
        normalizarAgente(agente, integracoes)
      );
      setAgentes(agentesNormalizados);
      const atualizado = agentesNormalizados.find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
      setSucesso("Configuração salva.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar agente.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarEstado(acao: "ativar" | "pausar") {
    if (!editor) return;
    if (acao === "ativar" && !validarAntesDeAtivar()) return;
    setAlterandoStatus(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editor.id, acao }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || (acao === "ativar" ? "Erro ao ativar agente." : "Erro ao pausar agente.")
        );
      }
      const agentesNormalizados = (json.agentes || []).map((agente: Agente) =>
        normalizarAgente(agente, integracoes)
      );
      setAgentes(agentesNormalizados);
      const atualizado = agentesNormalizados.find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
      setSucesso(acao === "ativar" ? "Agente ativado." : "Agente pausado.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao alterar estado do agente.");
    } finally {
      setAlterandoStatus(false);
    }
  }

  async function apagarDefinitivamente() {
    if (!editor || editor.status === "ativo") return;
    setApagando(true);
    setErro("");
    setSucesso("");
    try {
      const res = await fetch(`/api/agentes-ia?id=${encodeURIComponent(editor.id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao apagar agente.");
      setConfirmandoExclusao(false);
      setSelecionadoId("");
      await carregar();
      setSucesso("Agente apagado definitivamente.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao apagar agente.");
    } finally {
      setApagando(false);
    }
  }

  async function adicionarConhecimento() {
    if (!editor || !novoConhecimento.titulo.trim() || !novoConhecimento.conteudo.trim()) return;
    setErro("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editor.id,
          acao: "adicionar_conhecimento",
          ...novoConhecimento,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao adicionar conhecimento.");
      const agentesNormalizados = (json.agentes || []).map((agente: Agente) =>
        normalizarAgente(agente, integracoes)
      );
      setAgentes(agentesNormalizados);
      const atualizado = agentesNormalizados.find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
      setNovoConhecimento({ titulo: "", categoria: "", conteudo: "", palavras_chave: "" });
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao adicionar conhecimento.");
    }
  }

  async function excluirConhecimento(conhecimentoId: string) {
    if (!editor) return;
    setErro("");
    try {
      const res = await fetch("/api/agentes-ia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editor.id,
          acao: "excluir_conhecimento",
          conhecimento_id: conhecimentoId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao excluir conhecimento.");
      const agentesNormalizados = (json.agentes || []).map((agente: Agente) =>
        normalizarAgente(agente, integracoes)
      );
      setAgentes(agentesNormalizados);
      const atualizado = agentesNormalizados.find((item: Agente) => item.id === editor.id);
      if (atualizado) setEditor(cloneAgente(atualizado));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao excluir conhecimento.");
    }
  }

  async function testar() {
    if (!editor || !teste.trim()) return;
    setTestando(true);
    setErro("");
    setRespostaTeste("");
    try {
      const res = await fetch("/api/agentes-ia/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editor.id, mensagem: teste }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Erro ao testar agente.");
      setRespostaTeste(json.resposta || "Sem resposta.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao testar agente.");
    } finally {
      setTestando(false);
    }
  }

  if (carregando) {
    return (
      <div className={styles.loadingPage}>
        <Loader2 size={24} className={styles.spin} />
        <span>Carregando agentes...</span>
      </div>
    );
  }

  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              <Sparkles size={15} /> Automação inteligente
            </span>
            <h1>Agentes de IA</h1>
            <p>
              Escolha quando a IA entra no atendimento, como cada agente é roteado e o que acontece caso a IA fique indisponível.
            </p>
          </div>
          <button type="button" className={styles.primaryButton} onClick={criarAgente}>
            <Plus size={18} /> Novo agente
          </button>
        </header>

        {(erro || sucesso) && (
          <div className={`${styles.notice} ${erro ? styles.noticeError : styles.noticeSuccess}`}>
            {erro || sucesso}
          </div>
        )}

        <div className={styles.workspace}>
          <aside className={styles.agentList}>
            <div className={styles.listHeader}>
              <strong>Seus agentes</strong>
              <span>{agentes.length}</span>
            </div>
            {agentes.length === 0 ? (
              <div className={styles.emptyList}>
                <Bot size={30} />
                <div>
                  <strong>Nenhum agente criado</strong>
                  <p>Crie seu primeiro agente para começar.</p>
                </div>
              </div>
            ) : (
              agentes.map((agente) => {
                const ativo = agente.status === "ativo";
                return (
                  <button
                    key={agente.id}
                    type="button"
                    className={`${styles.agentCard} ${
                      agente.id === selecionadoId ? styles.agentCardActive : ""
                    }`}
                    onClick={() => setSelecionadoId(agente.id)}
                  >
                    <span className={styles.agentIcon}>
                      <Bot size={19} />
                    </span>
                    <span className={styles.agentCardText}>
                      <strong>{agente.nome}</strong>
                      <small>
                        {agente.modo_atendimento === "economico" ? "Econômico" : "Geral"} · {ativo ? "Ativo" : "Pausado"}
                      </small>
                    </span>
                    <span
                      className={`${styles.statusDot} ${
                        ativo ? styles.status_ativo : styles.status_inativo
                      }`}
                    />
                  </button>
                );
              })
            )}
          </aside>

          <section className={styles.editorArea}>
            {!editor ? (
              <div className={styles.emptyEditor}>
                <Bot size={42} />
                <h2>Crie seu primeiro agente</h2>
                <p>Todo novo agente começa pausado e só atende depois de ser ativado.</p>
              </div>
            ) : (
              <>
                <div className={styles.editorTopbar}>
                  <div>
                    <span
                      className={`${styles.badge} ${
                        editor.status === "ativo" ? styles.badgeActive : styles.badgePaused
                      }`}
                    >
                      <Zap size={13} /> {editor.status === "ativo" ? "Ativo" : "Pausado"}
                    </span>
                    <h2>{editor.nome}</h2>
                  </div>
                  <div className={styles.topActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={salvar}
                      disabled={salvando || alterandoStatus}
                    >
                      {salvando ? <Loader2 size={17} className={styles.spin} /> : <Save size={17} />}
                      Salvar
                    </button>
                    <span className={styles.actionDivider} aria-hidden="true" />
                    {editor.status === "ativo" ? (
                      <button
                        type="button"
                        className={styles.pauseButton}
                        onClick={() => alterarEstado("pausar")}
                        disabled={alterandoStatus}
                      >
                        {alterandoStatus ? (
                          <Loader2 size={17} className={styles.spin} />
                        ) : (
                          <Pause size={17} />
                        )}
                        Pausar
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.dangerGhost}
                          onClick={() => setConfirmandoExclusao(true)}
                          disabled={alterandoStatus}
                        >
                          <Trash2 size={16} /> Apagar
                        </button>
                        <button
                          type="button"
                          className={styles.activateButton}
                          onClick={() => alterarEstado("ativar")}
                          disabled={alterandoStatus}
                        >
                          {alterandoStatus ? (
                            <Loader2 size={17} className={styles.spin} />
                          ) : (
                            <Play size={17} />
                          )}
                          Ativar
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <section className={styles.panel}>
                  <div className={styles.panelTitle}>
                    <Sparkles size={18} />
                    <div>
                      <h3>Modo de atendimento</h3>
                      <p>
                        O custo de tokens por resposta da IA é o mesmo nos dois modos. O que muda é quantas vezes a IA precisa entrar no atendimento.
                      </p>
                    </div>
                  </div>
                  <div className={styles.gridTwo}>
                    <label
                      className={`${styles.toolCard} ${
                        editor.modo_atendimento === "economico" ? styles.toolCardActive : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="modo_agente"
                        checked={editor.modo_atendimento === "economico"}
                        onChange={() => alterarModo("economico")}
                      />
                      <strong>Econômico</strong>
                      <p>
                        O Fluxo faz o primeiro atendimento e não usa este agente enquanto a conversa segue o caminho esperado. A IA entra quando o cliente responde algo inválido ou fora do que o Fluxo consegue tratar.
                      </p>
                      <p>
                        <b>Exemplo:</b> o Fluxo pergunta “Sim ou Não”; o cliente responde “depende do valor”. O agente assume a partir daí.
                      </p>
                      <p>
                        <b>Por que economiza:</b> cada resposta da IA custa igual ao modo Geral, mas a IA é chamada menos vezes.
                      </p>
                    </label>

                    <label
                      className={`${styles.toolCard} ${
                        editor.modo_atendimento === "geral" ? styles.toolCardActive : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="modo_agente"
                        checked={editor.modo_atendimento === "geral"}
                        onChange={() => alterarModo("geral")}
                      />
                      <strong>Geral</strong>
                      <p>
                        A IA atende desde a abertura da conversa, antes de um Fluxo ser iniciado. Ela pode ser acionada por palavras-chave ou funcionar como o fallback exclusivo do WhatsApp.
                      </p>
                      <p>
                        <b>Exemplo:</b> “quero orçamento” chama o agente configurado para essa palavra. Sem palavra-chave, o agente fallback exclusivo assume.
                      </p>
                      <p>
                        <b>Consumo:</b> tende a gastar mais tokens no total porque participa de mais atendimentos.
                      </p>
                    </label>
                  </div>
                </section>

                <div className={styles.gridTwo}>
                  <section className={styles.panel}>
                    <div className={styles.panelTitle}>
                      <Bot size={18} />
                      <div>
                        <h3>Identidade e comportamento</h3>
                        <p>Defina quem é o agente e como ele deve se comunicar.</p>
                      </div>
                    </div>
                    <div className={styles.scopeHint}>
                      <strong>Referência real de consumo:</strong> as chamadas mais econômicas do agente Especialista CRM Prosperity ficaram em aproximadamente 946–980 tokens de entrada, usando 4 mensagens de contexto. O perfil enxuto de referência usa cerca de 1.356 caracteres de prompt, 812 de instruções e 56 de características. As faixas abaixo são orientativas e não bloqueiam a configuração.
                    </div>
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Nome</span>
                        <input
                          value={editor.nome}
                          style={estiloCampoConsumo(
                            nivelConsumo(editor.nome.length, REGRAS_CONSUMO.nome)
                          )}
                          onChange={(event) => setEditor({ ...editor, nome: event.target.value })}
                        />
                        <OrientacaoConsumo valor={editor.nome.length} regra={REGRAS_CONSUMO.nome} />
                      </label>
                      <label className={styles.field}>
                        <span>Descrição interna</span>
                        <input
                          value={editor.descricao || ""}
                          onChange={(event) =>
                            setEditor({ ...editor, descricao: event.target.value })
                          }
                          placeholder="Ex.: Especialista em orçamento e vendas"
                        />
                        <small className={styles.fieldHint}>
                          Uso interno. Este texto não é enviado ao modelo e não aumenta o contexto do atendimento.
                        </small>
                      </label>
                    </div>

                    <div className={`${styles.field} ${styles.characteristicsField}`}>
                      <div className={styles.fieldHeading}>
                        <span>Características da resposta</span>
                        <small>
                          {caracteristicasSelecionadas.length}/{LIMITE_CARACTERISTICAS}
                        </small>
                      </div>
                      <div
                        className={styles.characteristicsBox}
                        style={estiloCampoConsumo(
                          nivelConsumo(
                            String(editor.tom_voz || "").length,
                            REGRAS_CONSUMO.caracteristicas
                          )
                        )}
                      >
                        {caracteristicasSelecionadas.length > 0 && (
                          <div className={styles.characteristicChips}>
                            {caracteristicasSelecionadas.map((item) => (
                              <span key={item} className={styles.characteristicChip}>
                                {item}
                                <button
                                  type="button"
                                  onClick={() => removerCaracteristica(item)}
                                  title={`Remover ${item}`}
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className={styles.characteristicSearch}>
                          <Search size={16} />
                          <input
                            value={buscaCaracteristica}
                            disabled={caracteristicasSelecionadas.length >= LIMITE_CARACTERISTICAS}
                            onFocus={() => setSeletorCaracteristicasAberto(true)}
                            onBlur={() =>
                              window.setTimeout(() => setSeletorCaracteristicasAberto(false), 120)
                            }
                            onChange={(event) => {
                              setBuscaCaracteristica(event.target.value);
                              setSeletorCaracteristicasAberto(true);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && buscaCaracteristica.trim()) {
                                event.preventDefault();
                                adicionarCaracteristica(buscaCaracteristica);
                              }
                            }}
                            placeholder="Buscar ou adicionar característica..."
                          />
                        </div>
                        {seletorCaracteristicasAberto &&
                          caracteristicasSelecionadas.length < LIMITE_CARACTERISTICAS && (
                            <div className={styles.characteristicsDropdown}>
                              {caracteristicasFiltradas.map((item) => (
                                <button
                                  key={item}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => adicionarCaracteristica(item)}
                                >
                                  <Plus size={14} /> {item}
                                </button>
                              ))}
                              {podeAdicionarPersonalizada && (
                                <button
                                  type="button"
                                  className={styles.customCharacteristic}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => adicionarCaracteristica(buscaCaracteristica)}
                                >
                                  <Plus size={14} /> Adicionar “{buscaCaracteristica.trim().slice(0, 40)}”
                                </button>
                              )}
                            </div>
                          )}
                      </div>
                      <OrientacaoConsumo
                        valor={String(editor.tom_voz || "").length}
                        regra={REGRAS_CONSUMO.caracteristicas}
                      />
                    </div>

                    <label className={styles.field}>
                      <span>Prompt principal</span>
                      <textarea
                        rows={7}
                        value={editor.prompt_sistema || ""}
                        style={estiloCampoConsumo(
                          nivelConsumo(
                            String(editor.prompt_sistema || "").length,
                            REGRAS_CONSUMO.prompt
                          )
                        )}
                        onChange={(event) =>
                          setEditor({ ...editor, prompt_sistema: event.target.value })
                        }
                        placeholder="Explique o papel, limites, oferta e comportamento esperado do agente."
                      />
                      <OrientacaoConsumo
                        valor={String(editor.prompt_sistema || "").length}
                        regra={REGRAS_CONSUMO.prompt}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Instruções adicionais</span>
                      <textarea
                        rows={4}
                        value={editor.instrucoes || ""}
                        style={estiloCampoConsumo(
                          nivelConsumo(
                            String(editor.instrucoes || "").length,
                            REGRAS_CONSUMO.instrucoes
                          )
                        )}
                        onChange={(event) =>
                          setEditor({ ...editor, instrucoes: event.target.value })
                        }
                        placeholder="Regras específicas do negócio."
                      />
                      <OrientacaoConsumo
                        valor={String(editor.instrucoes || "").length}
                        regra={REGRAS_CONSUMO.instrucoes}
                      />
                    </label>
                  </section>

                  <section className={styles.panel}>
                    <div className={styles.panelTitle}>
                      <MessageCircle size={18} />
                      <div>
                        <h3>Onde e quando este agente atende</h3>
                        <p>
                          {integracoes.length === 1
                            ? "O único WhatsApp da empresa é vinculado automaticamente."
                            : "Defina o WhatsApp e o escopo que pode acionar este agente."}
                        </p>
                      </div>
                    </div>

                    {integracoes.length > 1 && (
                      <>
                        <div className={styles.scopeHint}>
                          Sem nenhum número marcado, este agente vale para <strong>todas as integrações</strong>.
                        </div>
                        <div className={styles.checkList}>
                          {integracoes.map((integracao) => {
                            const checked = (editor.integracoes_whatsapp_ids || []).includes(
                              integracao.id
                            );
                            const nome =
                              integracao.nome_conexao ||
                              integracao.phone_number_display_name ||
                              integracao.verified_name ||
                              "WhatsApp";
                            return (
                              <label key={integracao.id} className={styles.checkRow}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => alternarIntegracao(integracao.id)}
                                />
                                <span>
                                  <strong>{nome}</strong>
                                  <small>{integracao.numero || integracao.status || "Integração"}</small>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {editor.modo_atendimento === "economico" ? (
                      <>
                        <div className={styles.scopeHint}>
                          <strong>Fluxos protegidos pelo agente:</strong> ele só assume quando um destes Fluxos está aguardando uma resposta e o cliente sai do caminho esperado.
                        </div>
                        <label className={styles.checkRow}>
                          <input
                            type="checkbox"
                            checked={todosFluxosEconomico}
                            onChange={() => setEditor({ ...editor, fluxos_ids: [] })}
                          />
                          <span>
                            <strong>Todos os fluxos</strong>
                            <small>Usa este agente como especialista econômico para qualquer Fluxo compatível com a integração.</small>
                          </span>
                        </label>
                        {!todosFluxosEconomico && (
                          <div className={styles.checkList}>
                            {fluxos.map((fluxo) => (
                              <label key={fluxo.id} className={styles.checkRow}>
                                <input
                                  type="checkbox"
                                  checked={(editor.fluxos_ids || []).includes(fluxo.id)}
                                  onChange={() => alternarFluxo(fluxo.id)}
                                />
                                <span>
                                  <strong>{fluxo.nome}</strong>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                        {todosFluxosEconomico && fluxos.length > 0 && (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => setEditor({ ...editor, fluxos_ids: [fluxos[0].id] })}
                          >
                            Selecionar fluxos específicos
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <label className={styles.checkRow}>
                          <input
                            type="checkbox"
                            checked={editor.fallback_exclusivo === true}
                            onChange={(event) =>
                              setEditor({ ...editor, fallback_exclusivo: event.target.checked })
                            }
                          />
                          <span>
                            <strong>Fallback exclusivo desta integração</strong>
                            <small>
                              Atende qualquer nova conversa que não tenha sido direcionada por uma palavra-chave para outro agente Geral.
                            </small>
                          </span>
                        </label>

                        <div className={styles.scopeHint}>
                          <strong>Palavras-chave:</strong> usam a mesma lógica dos gatilhos de Fluxo. Na abertura da conversa, uma correspondência tem prioridade sobre o agente fallback.
                        </div>

                        {(editor.gatilhos || []).map((gatilho, indice) => (
                          <div key={gatilho.id || `gatilho-${indice}`} className={styles.knowledgeItem}>
                            <div style={{ flex: 1 }}>
                              <div className={styles.formGrid}>
                                <label className={styles.field}>
                                  <span>Condição</span>
                                  <select
                                    value={gatilho.condicao}
                                    onChange={(event) =>
                                      atualizarGatilho(indice, {
                                        condicao: event.target.value as CondicaoGatilho,
                                      })
                                    }
                                  >
                                    {CONDICOES_GATILHO.map((opcao) => (
                                      <option key={opcao.valor} value={opcao.valor}>
                                        {opcao.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className={styles.field}>
                                  <span>Palavra ou expressão</span>
                                  <input
                                    value={gatilho.valor}
                                    onChange={(event) =>
                                      atualizarGatilho(indice, { valor: event.target.value })
                                    }
                                    placeholder={
                                      gatilho.condicao === "regex"
                                        ? "Ex.: ^quero (orçamento|preço)$"
                                        : "Ex.: quero orçamento"
                                    }
                                  />
                                  <small className={styles.fieldHint}>
                                    Usada apenas no roteamento inicial. Não é adicionada ao contexto do modelo.
                                  </small>
                                </label>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removerGatilho(indice)}
                              title="Remover palavra-chave"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={adicionarGatilho}
                        >
                          <Plus size={16} /> Adicionar palavra-chave
                        </button>
                      </>
                    )}
                  </section>
                </div>

                <section className={styles.panel}>
                  <div className={styles.panelTitle}>
                    <CheckCircle2 size={18} />
                    <div>
                      <h3>Contingência quando a IA não puder atender</h3>
                      <p>
                        Defina o que o CRM deve fazer quando os tokens de IA acabarem. Você pode manter o atendimento por Fluxo, transferir para uma pessoa ou assumir explicitamente o risco de ficar sem resposta automática.
                      </p>
                    </div>
                  </div>

                  <div className={styles.toolsGrid}>
                    <label
                      className={`${styles.toolCard} ${
                        editor.fallback_tipo === "fluxo" ? styles.toolCardActive : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="fallback_tipo"
                        checked={editor.fallback_tipo === "fluxo"}
                        onChange={() => alterarFallbackTipo("fluxo")}
                      />
                      <strong>Executar um Fluxo</strong>
                      <p>O agente sai de cena e o Fluxo escolhido continua o atendimento sem consumir tokens de IA.</p>
                    </label>
                    <label
                      className={`${styles.toolCard} ${
                        editor.fallback_tipo === "transferir_humano" ? styles.toolCardActive : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="fallback_tipo"
                        checked={editor.fallback_tipo === "transferir_humano"}
                        onChange={() => alterarFallbackTipo("transferir_humano")}
                      />
                      <strong>Transferir atendimento</strong>
                      <p>Usa as mesmas regras do bloco de transferência: fila, atendente específico ou rodízio.</p>
                    </label>
                    <label
                      className={`${styles.toolCard} ${
                        editor.fallback_tipo === "nenhum" ? styles.toolCardActive : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="fallback_tipo"
                        checked={editor.fallback_tipo === "nenhum"}
                        onChange={() => alterarFallbackTipo("nenhum")}
                      />
                      <strong>Sem contingência</strong>
                      <p>Não inicia Fluxo nem transfere. Exige confirmação de responsabilidade antes da ativação.</p>
                    </label>
                  </div>

                  {editor.fallback_tipo === "fluxo" && (
                    <label className={styles.field}>
                      <span>Fluxo de contingência</span>
                      <select
                        value={editor.fallback_fluxo_id || ""}
                        onChange={(event) =>
                          setEditor({ ...editor, fallback_fluxo_id: event.target.value || null })
                        }
                      >
                        <option value="">Selecione um fluxo</option>
                        {fluxos.map((fluxo) => (
                          <option key={fluxo.id} value={fluxo.id}>
                            {fluxo.nome}
                          </option>
                        ))}
                      </select>
                      <small className={styles.fieldHint}>
                        Este Fluxo é iniciado diretamente quando o saldo de IA chegar a zero, sem depender de uma nova palavra-chave.
                      </small>
                    </label>
                  )}

                  {editor.fallback_tipo === "transferir_humano" && (
                    <>
                      <div className={styles.formGrid}>
                        <label className={styles.field}>
                          <span>Destino</span>
                          <select
                            value={transferencia.escopo_fila}
                            onChange={(event) =>
                              atualizarTransferencia({
                                escopo_fila: event.target.value as "setor" | "geral",
                              })
                            }
                          >
                            <option value="geral">Fila geral</option>
                            <option value="setor">Setor específico</option>
                          </select>
                        </label>

                        {transferencia.escopo_fila === "setor" && (
                          <label className={styles.field}>
                            <span>Setor</span>
                            <select
                              value={transferencia.setor_id || ""}
                              onChange={(event) =>
                                atualizarTransferencia({ setor_id: event.target.value || null })
                              }
                            >
                              <option value="">Selecione o setor</option>
                              {setores.map((setor) => (
                                <option key={setor.id} value={setor.id}>
                                  {setor.nome}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>

                      {transferencia.escopo_fila === "setor" && (
                        <div className={styles.formGrid}>
                          <label className={styles.field}>
                            <span>Estratégia de transferência</span>
                            <select
                              value={transferencia.estrategia_transferencia}
                              onChange={(event) =>
                                atualizarTransferencia({
                                  estrategia_transferencia:
                                    event.target.value as EstrategiaTransferencia,
                                })
                              }
                            >
                              <option value="fila_setor">Fila do setor</option>
                              <option value="atendente_especifico">Atendente específico</option>
                              <option value="rodizio_aleatorio">Rodízio aleatório</option>
                              <option value="menos_conversas">Menor número de conversas</option>
                            </select>
                          </label>

                          {transferencia.estrategia_transferencia === "atendente_especifico" && (
                            <label className={styles.field}>
                              <span>Atendente</span>
                              <select
                                value={transferencia.atendente_id || ""}
                                onChange={(event) =>
                                  atualizarTransferencia({
                                    atendente_id: event.target.value || null,
                                  })
                                }
                              >
                                <option value="">Selecione o atendente</option>
                                {atendentes.map((atendente) => (
                                  <option key={atendente.id} value={atendente.id}>
                                    {atendente.nome || atendente.email || "Atendente"}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      )}

                      {transferencia.escopo_fila === "setor" &&
                        ["rodizio_aleatorio", "menos_conversas"].includes(
                          transferencia.estrategia_transferencia
                        ) && (
                          <label className={styles.checkRow}>
                            <input
                              type="checkbox"
                              checked={transferencia.incluir_administradores_distribuicao}
                              onChange={(event) =>
                                atualizarTransferencia({
                                  incluir_administradores_distribuicao: event.target.checked,
                                })
                              }
                            />
                            <span>
                              <strong>Incluir administradores no rodízio</strong>
                              <small>
                                Administradores ativos também poderão receber automaticamente a conversa.
                              </small>
                            </span>
                          </label>
                        )}

                      <label className={styles.field}>
                        <span>Mensagem antes da transferência · opcional</span>
                        <textarea
                          rows={3}
                          value={transferencia.mensagem}
                          onChange={(event) =>
                            atualizarTransferencia({ mensagem: event.target.value })
                          }
                          placeholder={MENSAGEM_TRANSFERENCIA_PADRAO}
                        />
                        <small className={styles.fieldHint}>
                          Você pode apagar o texto para transferir sem enviar mensagem ao cliente. Esta mensagem não entra no contexto normal da IA; só é usada na contingência.
                        </small>
                      </label>
                    </>
                  )}

                  {editor.fallback_tipo === "nenhum" && (
                    <div className={styles.deleteWarning}>
                      <strong>Atenção:</strong> se o saldo de tokens de IA chegar a zero, este agente não terá um Fluxo nem uma transferência para manter o atendimento.
                      <label className={styles.checkRow} style={{ marginTop: 10 }}>
                        <input
                          type="checkbox"
                          checked={editor.fallback_sem_contingencia_aceito === true}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              fallback_sem_contingencia_aceito: event.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>Estou ciente e quero manter o agente sem contingência</strong>
                          <small>
                            Entendo que, sem saldo de IA, o atendimento automático pode ficar sem resposta até os tokens serem restabelecidos ou alguém assumir a conversa.
                          </small>
                        </span>
                      </label>
                    </div>
                  )}

                  <div className={styles.formGrid} style={{ marginTop: 12 }}>
                    <label className={styles.field}>
                      <span>Contexto recente</span>
                      <input
                        type="number"
                        min={4}
                        max={40}
                        value={editor.max_mensagens_contexto}
                        style={estiloCampoConsumo(
                          nivelConsumo(editor.max_mensagens_contexto, REGRAS_CONSUMO.contexto)
                        )}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            max_mensagens_contexto: Number(event.target.value),
                          })
                        }
                      />
                      <OrientacaoConsumo
                        valor={editor.max_mensagens_contexto}
                        regra={REGRAS_CONSUMO.contexto}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Debounce (ms)</span>
                      <input
                        type="number"
                        min={250}
                        max={10000}
                        step={50}
                        value={editor.debounce_ms}
                        onChange={(event) =>
                          setEditor({ ...editor, debounce_ms: Number(event.target.value) })
                        }
                      />
                      <small className={styles.fieldHint}>
                        Não entra no contexto da IA. Apenas define quanto tempo o sistema espera para agrupar mensagens próximas antes de processar.
                      </small>
                    </label>
                  </div>
                  <div className={styles.securityNote}>
                    <CheckCircle2 size={17} />
                    <span>
                      Quando um humano assume a conversa, o agente é bloqueado. O saldo oficial de tokens é revalidado antes do processamento da IA.
                    </span>
                  </div>
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelTitle}>
                    <Wrench size={18} />
                    <div>
                      <h3>Ferramentas do agente</h3>
                      <p>Somente ferramentas habilitadas são expostas ao modelo.</p>
                    </div>
                  </div>
                  <div className={styles.scopeHint}>
                    <strong>Consumo de contexto:</strong> cada ferramenta ativa adiciona sua definição e esquema à chamada do modelo. Ative somente as ferramentas que este agente realmente precisa usar.
                  </div>
                  {usaFerramentasAgenda && (
                    <div className={styles.formGrid}>
                      <label className={styles.field}>
                        <span>Agenda obrigatória</span>
                        <select
                          value={agendaConfiguradaId}
                          onChange={(event) => atualizarAgendaFerramentas(event.target.value)}
                        >
                          <option value="">Selecione uma agenda</option>
                          {agendas.map((agenda) => (
                            <option key={agenda.id} value={agenda.id}>
                              {agenda.nome}
                              {agenda.duracao_minutos ? ` · ${agenda.duracao_minutos} min` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <div className={styles.toolsGrid}>
                    {FERRAMENTAS.map((ferramenta) => (
                      <div
                        key={ferramenta.tipo}
                        className={`${styles.toolCard} ${
                          ferramentaAtiva(ferramenta.tipo) ? styles.toolCardActive : ""
                        }`}
                      >
                        <label className={styles.toolToggle}>
                          <input
                            type="checkbox"
                            checked={ferramentaAtiva(ferramenta.tipo)}
                            onChange={() => alternarFerramenta(ferramenta.tipo)}
                          />
                          <span className={styles.toggleVisual} />
                        </label>
                        <div>
                          <strong>{ferramenta.titulo}</strong>
                          <p>{ferramenta.descricao}</p>
                        </div>
                        {ferramenta.tipo === "transferir_humano" &&
                          ferramentaAtiva(ferramenta.tipo) && (
                            <select
                              className={styles.inlineSelect}
                              value={String(configFerramenta(ferramenta.tipo).setor_id || "")}
                              onChange={(event) =>
                                atualizarConfigFerramenta(
                                  ferramenta.tipo,
                                  "setor_id",
                                  event.target.value || null
                                )
                              }
                            >
                              <option value="">Fila geral</option>
                              {setores.map((setor) => (
                                <option key={setor.id} value={setor.id}>
                                  {setor.nome}
                                </option>
                              ))}
                            </select>
                          )}
                      </div>
                    ))}
                  </div>
                </section>

                <div className={styles.gridTwo}>
                  <section className={styles.panel}>
                    <div className={styles.panelTitle}>
                      <BookOpen size={18} />
                      <div>
                        <h3>Base de conhecimento</h3>
                        <p>Conteúdo aprovado e pesquisável pelo agente.</p>
                      </div>
                    </div>
                    <div className={styles.scopeHint}>
                      <strong>Como funciona:</strong> cada conhecimento pode ter no máximo 850 caracteres, que é o limite de texto enviado ao modelo por resultado consultado. Para conteúdos maiores, divida o assunto em conhecimentos separados. A base inteira não é enviada em todas as respostas.
                    </div>
                    <div className={styles.knowledgeForm}>
                      <label className={styles.field} style={{ marginBottom: 0 }}>
                        <span>Título do conhecimento</span>
                        <input
                          placeholder="Ex.: Planos e preços"
                          value={novoConhecimento.titulo}
                          style={estiloCampoConsumo(
                            nivelConsumo(
                              novoConhecimento.titulo.length,
                              REGRAS_CONSUMO.conhecimentoTitulo
                            )
                          )}
                          onChange={(event) =>
                            setNovoConhecimento({ ...novoConhecimento, titulo: event.target.value })
                          }
                        />
                        <OrientacaoConsumo
                          valor={novoConhecimento.titulo.length}
                          regra={REGRAS_CONSUMO.conhecimentoTitulo}
                        />
                      </label>
                      <label className={styles.field} style={{ marginBottom: 0 }}>
                        <span>Categoria</span>
                        <input
                          placeholder="Ex.: Comercial"
                          value={novoConhecimento.categoria}
                          onChange={(event) =>
                            setNovoConhecimento({ ...novoConhecimento, categoria: event.target.value })
                          }
                        />
                        <small className={styles.fieldHint}>
                          Ajuda a organizar a base. A categoria não é enviada diretamente ao modelo no trecho consultado.
                        </small>
                      </label>
                      <label
                        className={styles.field}
                        style={{ gridColumn: "1 / -1", marginBottom: 0 }}
                      >
                        <span>Conteúdo · máximo 850 caracteres</span>
                        <textarea
                          rows={5}
                          maxLength={850}
                          placeholder="Conteúdo confiável que o agente pode usar"
                          value={novoConhecimento.conteudo}
                          onChange={(event) =>
                            setNovoConhecimento({ ...novoConhecimento, conteudo: event.target.value })
                          }
                        />
                      </label>
                      <label className={styles.field} style={{ marginBottom: 0 }}>
                        <span>Palavras-chave</span>
                        <input
                          placeholder="Ex.: plano, preço, usuários"
                          value={novoConhecimento.palavras_chave}
                          onChange={(event) =>
                            setNovoConhecimento({
                              ...novoConhecimento,
                              palavras_chave: event.target.value,
                            })
                          }
                        />
                        <small className={styles.fieldHint}>
                          Ajudam na recuperação do conteúdo. Não são adicionadas como um bloco fixo em cada resposta da IA.
                        </small>
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={adicionarConhecimento}
                      >
                        <Plus size={16} /> Adicionar conhecimento
                      </button>
                    </div>
                    <div className={styles.knowledgeList}>
                      {(editor.conhecimentos || []).map((item) => (
                        <article key={item.id} className={styles.knowledgeItem}>
                          <div>
                            <strong>{item.titulo}</strong>
                            {item.categoria && <small>{item.categoria}</small>}
                            <p>{item.conteudo}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => excluirConhecimento(item.id)}
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </article>
                      ))}
                      {!editor.conhecimentos?.length && (
                        <div className={styles.emptyKnowledge}>Nenhum conhecimento cadastrado.</div>
                      )}
                    </div>
                  </section>

                  <section className={styles.panel}>
                    <div className={styles.panelTitle}>
                      <Sparkles size={18} />
                      <div>
                        <h3>Testar agente</h3>
                        <p>Simula uma resposta sem executar ações no CRM.</p>
                      </div>
                    </div>
                    <div className={styles.testBox}>
                      <textarea
                        rows={5}
                        value={teste}
                        onChange={(event) => setTeste(event.target.value)}
                        placeholder="Ex.: Vocês atendem sábado?"
                      />
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={testar}
                        disabled={testando || !teste.trim()}
                      >
                        {testando ? (
                          <Loader2 size={16} className={styles.spin} />
                        ) : (
                          <Sparkles size={16} />
                        )}
                        Testar resposta
                      </button>
                      {respostaTeste && (
                        <div className={styles.testAnswer}>
                          <span>Resposta do agente</span>
                          <p>{respostaTeste}</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {confirmandoExclusao && editor && editor.status !== "ativo" && (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !apagando) setConfirmandoExclusao(false);
          }}
        >
          <div
            className={styles.deleteModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-agent-title"
          >
            <div className={styles.deleteModalIcon}>
              <AlertTriangle size={24} />
            </div>
            <div className={styles.deleteModalContent}>
              <span className={styles.deleteEyebrow}>Exclusão definitiva</span>
              <h2 id="delete-agent-title">Apagar “{editor.nome}”?</h2>
              <p>Esta ação é permanente e não poderá ser desfeita.</p>
              <div className={styles.deleteWarning}>
                Configurações, gatilhos, ferramentas, base de conhecimento, memória e registros técnicos vinculados a este agente serão removidos definitivamente.
              </div>
            </div>
            <div className={styles.deleteModalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setConfirmandoExclusao(false)}
                disabled={apagando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={apagarDefinitivamente}
                disabled={apagando}
              >
                {apagando ? <Loader2 size={17} className={styles.spin} /> : <Trash2 size={17} />}
                Apagar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
