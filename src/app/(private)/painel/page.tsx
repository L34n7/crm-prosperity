import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Building2,
  CalendarRange,
  CircleDollarSign,
  Clock3,
  Filter,
  MessageSquareReply,
  Minus,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import Header from "@/components/Header";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import reportStyles from "../relatorios/page.module.css";
import styles from "./page.module.css";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string | string[];
    inicio?: string | string[];
    fim?: string | string[];
  }>;
};

type ProtocoloRow = {
  id: string;
  conversa_id: string;
  contato_id: string | null;
  started_at: string;
  closed_at: string | null;
  resultado: string | null;
  valor_convertido: number | string | null;
  contato_novo_no_inicio: boolean | null;
  iniciado_com_bot: boolean | null;
  finalizado_com_bot: boolean | null;
  finalizado_por_tipo: string | null;
};

type MensagemRow = {
  conversa_protocolo_id: string | null;
  remetente_tipo: "contato" | "bot" | "usuario" | "sistema" | string;
  remetente_id: string | null;
  created_at: string;
};

type ExecucaoRow = {
  id: string;
  fluxo_id: string;
  conversa_protocolo_id: string | null;
  status: string;
  started_at: string;
};

type ConversaRow = {
  id: string;
  rastreamento_campanha_id: string | null;
  responsavel_id: string | null;
  status: string | null;
  aguardando_atendente: boolean | null;
};

type CampanhaRow = { id: string; nome: string };
type FluxoRow = { id: string; nome: string };
type UsuarioRow = { id: string; nome: string | null };

type Metricas = {
  entradas: number;
  novosContatos: number;
  atendidos: number;
  engajados: number;
  qualificados: number;
  convertidos: number;
  perdidos: number;
  semResposta: number;
  automacao: number;
  taxaResposta: number;
  coberturaAutomacao: number;
  taxaQualificacao: number;
  taxaConversao: number;
  tempoMedioPrimeiraResposta: number | null;
  medianaPrimeiraResposta: number | null;
  receita: number;
};

type CampanhaMetric = {
  id: string;
  nome: string;
  entradas: number;
  automacao: number;
  semResposta: number;
  qualificados: number;
  convertidos: number;
  taxaResposta: number;
  coberturaAutomacao: number;
  medianaResposta: number | null;
};

type FluxoMetric = {
  id: string;
  nome: string;
  execucoes: number;
  finalizadas: number;
  canceladas: number;
  protocolos: number;
};

type EquipeMetric = {
  id: string;
  nome: string;
  protocolos: number;
  mensagens: number;
  qualificados: number;
  convertidos: number;
  tempoMedioResposta: number | null;
};

type SeriePonto = { key: string; label: string; valor: number };

const TIME_ZONE = "America/Sao_Paulo";
const SAO_PAULO_OFFSET = "-03:00";
const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
const ATALHOS = [
  { valor: "hoje", label: "Hoje" },
  { valor: "3", label: "3 dias" },
  { valor: "15", label: "15 dias" },
  { valor: "30", label: "30 dias" },
] as const;

type AtalhoPeriodo = (typeof ATALHOS)[number]["valor"];

function primeiroValor(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor;
}

function normalizarAtalho(valor: string | string[] | undefined): AtalhoPeriodo {
  const recebido = primeiroValor(valor);
  return ATALHOS.some((atalho) => atalho.valor === recebido)
    ? (recebido as AtalhoPeriodo)
    : "30";
}

function numero(valor: number | string | null | undefined) {
  const convertido = Number(valor ?? 0);
  return Number.isFinite(convertido) ? convertido : 0;
}

function percentual(parte: number, total: number) {
  if (total <= 0) return 0;
  return (parte / total) * 100;
}

function media(valores: number[]) {
  if (!valores.length) return null;
  return valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
}

function mediana(valores: number[]) {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

function formatarInteiro(valor: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(valor);
}

function formatarPercentual(valor: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(valor)}%`;
}

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor);
}

function formatarDuracao(minutos: number | null) {
  if (minutos === null || !Number.isFinite(minutos)) return "—";
  if (minutos < 1) return "< 1 min";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = Math.floor(minutos / 60);
  const restante = Math.round(minutos % 60);
  if (horas < 24) return restante ? `${horas}h ${restante}min` : `${horas}h`;
  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;
  return horasRestantes ? `${dias}d ${horasRestantes}h` : `${dias}d`;
}

function variacao(atual: number, anterior: number) {
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function partesData(data: Date) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));
  return {
    ano: mapa.get("year") || "",
    mes: mapa.get("month") || "",
    dia: mapa.get("day") || "",
    hora: mapa.get("hour") || "00",
    minuto: mapa.get("minute") || "00",
  };
}

function formatarDateTimeLocal(data: Date) {
  const p = partesData(data);
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}`;
}

function inicioDoDiaSaoPaulo(data: Date) {
  const p = partesData(data);
  return new Date(`${p.ano}-${p.mes}-${p.dia}T00:00:00${SAO_PAULO_OFFSET}`);
}

function parseDateTimeLocal(valor: string | string[] | undefined) {
  const recebido = primeiroValor(valor);
  if (!recebido || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(recebido)) return null;
  const data = new Date(`${recebido}:00${SAO_PAULO_OFFSET}`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function dataLocalKey(data: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

function dataCurta(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(data);
}

function horaCurta(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(data);
}

function formatarIntervalo(inicio: Date, fim: Date) {
  const formato = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formato.format(inicio)} → ${formato.format(fim)}`;
}

function calcularIntervalo(
  parametros: Awaited<NonNullable<PageProps["searchParams"]>>,
) {
  const agora = new Date();
  const inicioCustom = parseDateTimeLocal(parametros.inicio);
  const fimCustom = parseDateTimeLocal(parametros.fim);
  const tentouCustom = Boolean(primeiroValor(parametros.inicio) || primeiroValor(parametros.fim));

  if (inicioCustom && fimCustom && inicioCustom.getTime() <= fimCustom.getTime()) {
    const duracao = Math.max(fimCustom.getTime() - inicioCustom.getTime(), 60_000);
    return {
      inicio: inicioCustom,
      fim: fimCustom,
      inicioAnterior: new Date(inicioCustom.getTime() - duracao),
      fimAnterior: new Date(inicioCustom.getTime() - 1),
      atalho: null as AtalhoPeriodo | null,
      custom: true,
      invalido: false,
    };
  }

  const atalho = normalizarAtalho(parametros.periodo);
  const fim = agora;
  const inicioHoje = inicioDoDiaSaoPaulo(agora);
  const dias = atalho === "hoje" ? 1 : Number(atalho);
  const inicio = new Date(inicioHoje.getTime() - (dias - 1) * DIA_MS);
  const duracao = Math.max(fim.getTime() - inicio.getTime(), 60_000);

  return {
    inicio,
    fim,
    inicioAnterior: new Date(inicio.getTime() - duracao),
    fimAnterior: new Date(inicio.getTime() - 1),
    atalho,
    custom: false,
    invalido: tentouCustom,
  };
}

function criarSerieVolume(protocolos: ProtocoloRow[], inicio: Date, fim: Date): SeriePonto[] {
  const duracao = fim.getTime() - inicio.getTime();
  const porBucket = new Map<string, number>();

  if (duracao <= 48 * HORA_MS) {
    for (const protocolo of protocolos) {
      const data = new Date(protocolo.started_at);
      const bucket = new Date(Math.floor(data.getTime() / HORA_MS) * HORA_MS);
      const chave = String(bucket.getTime());
      porBucket.set(chave, (porBucket.get(chave) ?? 0) + 1);
    }

    const inicioHora = new Date(Math.floor(inicio.getTime() / HORA_MS) * HORA_MS);
    const fimHora = new Date(Math.floor(fim.getTime() / HORA_MS) * HORA_MS);
    const serie: SeriePonto[] = [];
    for (let cursor = inicioHora.getTime(); cursor <= fimHora.getTime(); cursor += HORA_MS) {
      const data = new Date(cursor);
      const chave = String(cursor);
      serie.push({ key: chave, label: horaCurta(data), valor: porBucket.get(chave) ?? 0 });
    }
    return serie;
  }

  for (const protocolo of protocolos) {
    const chave = dataLocalKey(new Date(protocolo.started_at));
    porBucket.set(chave, (porBucket.get(chave) ?? 0) + 1);
  }

  const inicioDia = inicioDoDiaSaoPaulo(inicio);
  const fimDia = inicioDoDiaSaoPaulo(fim);
  const serie: SeriePonto[] = [];
  for (let cursor = inicioDia.getTime(); cursor <= fimDia.getTime(); cursor += DIA_MS) {
    const data = new Date(cursor);
    const key = dataLocalKey(data);
    serie.push({ key, label: dataCurta(data), valor: porBucket.get(key) ?? 0 });
  }
  return serie;
}

function criarPathSerie(valores: number[], largura = 1000, altura = 220) {
  if (!valores.length) return "";
  const paddingX = 18;
  const paddingY = 20;
  const maximo = Math.max(...valores, 1);
  const divisor = Math.max(valores.length - 1, 1);

  return valores
    .map((valor, indice) => {
      const x = valores.length === 1
        ? largura / 2
        : paddingX + (indice / divisor) * (largura - paddingX * 2);
      const y = altura - paddingY - (valor / maximo) * (altura - paddingY * 2);
      return `${indice === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function agruparPorProtocolo<T extends { conversa_protocolo_id: string | null }>(linhas: T[]) {
  const mapa = new Map<string, T[]>();
  for (const linha of linhas) {
    if (!linha.conversa_protocolo_id) continue;
    const atual = mapa.get(linha.conversa_protocolo_id) ?? [];
    atual.push(linha);
    mapa.set(linha.conversa_protocolo_id, atual);
  }
  return mapa;
}

function calcularMetricas(
  protocolos: ProtocoloRow[],
  mensagensPorProtocolo: Map<string, MensagemRow[]>,
  execucoesPorProtocolo: Map<string, ExecucaoRow[]>,
): Metricas {
  const temposResposta: number[] = [];
  let atendidos = 0;
  let engajados = 0;
  let semResposta = 0;
  let automacao = 0;

  for (const protocolo of protocolos) {
    const mensagens = [...(mensagensPorProtocolo.get(protocolo.id) ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const entrada = mensagens.find((mensagem) => mensagem.remetente_tipo === "contato");
    const saida = mensagens.find(
      (mensagem) => mensagem.remetente_tipo === "bot" || mensagem.remetente_tipo === "usuario",
    );

    if (saida) atendidos += 1;
    else semResposta += 1;

    if (entrada && saida) {
      const diferenca =
        (new Date(saida.created_at).getTime() - new Date(entrada.created_at).getTime()) / 60_000;
      if (diferenca >= 0) temposResposta.push(diferenca);

      const respondeuDepois = mensagens.some(
        (mensagem) =>
          mensagem.remetente_tipo === "contato" &&
          new Date(mensagem.created_at).getTime() > new Date(saida.created_at).getTime(),
      );
      if (respondeuDepois) engajados += 1;
    }

    if (protocolo.iniciado_com_bot || (execucoesPorProtocolo.get(protocolo.id)?.length ?? 0) > 0) {
      automacao += 1;
    }
  }

  const entradas = protocolos.length;
  const qualificados = protocolos.filter((protocolo) => protocolo.resultado === "qualificado").length;
  const convertidos = protocolos.filter((protocolo) => protocolo.resultado === "convertido").length;
  const perdidos = protocolos.filter((protocolo) => protocolo.resultado === "perdido").length;
  const novosContatos = protocolos.filter((protocolo) => protocolo.contato_novo_no_inicio).length;
  const receita = protocolos.reduce((soma, protocolo) => soma + numero(protocolo.valor_convertido), 0);

  return {
    entradas,
    novosContatos,
    atendidos,
    engajados,
    qualificados,
    convertidos,
    perdidos,
    semResposta,
    automacao,
    taxaResposta: percentual(atendidos, entradas),
    coberturaAutomacao: percentual(automacao, entradas),
    taxaQualificacao: percentual(qualificados, entradas),
    taxaConversao: percentual(convertidos, entradas),
    tempoMedioPrimeiraResposta: media(temposResposta),
    medianaPrimeiraResposta: mediana(temposResposta),
    receita,
  };
}

function Trend({ atual, anterior, inverter = false }: { atual: number; anterior: number; inverter?: boolean }) {
  const valor = variacao(atual, anterior);
  const positivo = inverter ? valor <= 0 : valor >= 0;
  const Icone = valor > 0 ? ArrowUpRight : valor < 0 ? ArrowDownRight : Minus;

  return (
    <span className={positivo ? reportStyles.trendPositive : reportStyles.trendNegative}>
      <Icone size={14} />
      {Math.abs(valor).toFixed(0)}% vs. período anterior
    </span>
  );
}

export default async function PainelPage({ searchParams }: PageProps) {
  const parametros = (await searchParams) ?? {};
  const contexto = await getUsuarioContexto();

  if (!contexto.ok) redirect("/login");
  if (!contexto.usuario.empresa_id) redirect("/configurar-ambiente");

  const empresaId = contexto.usuario.empresa_id;
  const supabase = getSupabaseAdmin();
  const nicho = await buscarNichoEmpresa(empresaId);
  const intervalo = calcularIntervalo(parametros);
  const inicioAnteriorMs = intervalo.inicioAnterior.getTime();
  const fimAnteriorMs = intervalo.fimAnterior.getTime();
  const inicioAtualMs = intervalo.inicio.getTime();
  const fimAtualMs = intervalo.fim.getTime();

  const [{ data: empresa }, protocolosResp] = await Promise.all([
    supabase
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("id", empresaId)
      .maybeSingle(),
    supabase
      .from("conversa_protocolos")
      .select(
        "id, conversa_id, contato_id, started_at, closed_at, resultado, valor_convertido, contato_novo_no_inicio, iniciado_com_bot, finalizado_com_bot, finalizado_por_tipo",
      )
      .eq("empresa_id", empresaId)
      .gte("started_at", intervalo.inicioAnterior.toISOString())
      .lte("started_at", intervalo.fim.toISOString())
      .order("started_at", { ascending: true })
      .limit(5000),
  ]);

  if (protocolosResp.error) {
    console.error("Erro ao carregar protocolos do painel:", protocolosResp.error);
  }

  const protocolos = (protocolosResp.data ?? []) as ProtocoloRow[];
  const idsProtocolos = protocolos.map((protocolo) => protocolo.id);
  const idsConversas = Array.from(new Set(protocolos.map((protocolo) => protocolo.conversa_id)));

  const mensagensPromise = idsProtocolos.length
    ? supabase
        .from("mensagens")
        .select("conversa_protocolo_id, remetente_tipo, remetente_id, created_at")
        .eq("empresa_id", empresaId)
        .in("conversa_protocolo_id", idsProtocolos)
        .order("created_at", { ascending: true })
        .limit(15000)
    : Promise.resolve({ data: [], error: null });

  const execucoesPromise = idsProtocolos.length
    ? supabase
        .from("automacao_execucoes")
        .select("id, fluxo_id, conversa_protocolo_id, status, started_at")
        .eq("empresa_id", empresaId)
        .in("conversa_protocolo_id", idsProtocolos)
        .limit(10000)
    : Promise.resolve({ data: [], error: null });

  const conversasPromise = idsConversas.length
    ? supabase
        .from("conversas")
        .select("id, rastreamento_campanha_id, responsavel_id, status, aguardando_atendente")
        .eq("empresa_id", empresaId)
        .in("id", idsConversas)
        .limit(5000)
    : Promise.resolve({ data: [], error: null });

  const [mensagensResp, execucoesResp, conversasResp, campanhasResp, fluxosResp, usuariosResp] =
    await Promise.all([
      mensagensPromise,
      execucoesPromise,
      conversasPromise,
      supabase.from("rastreamento_campanhas").select("id, nome").eq("empresa_id", empresaId).limit(2000),
      supabase.from("automacao_fluxos").select("id, nome").eq("empresa_id", empresaId).limit(2000),
      supabase.from("usuarios").select("id, nome").eq("empresa_id", empresaId).limit(2000),
    ]);

  for (const [nome, resposta] of [
    ["mensagens", mensagensResp],
    ["execuções", execucoesResp],
    ["conversas", conversasResp],
    ["campanhas", campanhasResp],
    ["fluxos", fluxosResp],
    ["usuários", usuariosResp],
  ] as const) {
    if (resposta.error) console.error(`Erro ao carregar ${nome} do painel:`, resposta.error);
  }

  const mensagens = (mensagensResp.data ?? []) as MensagemRow[];
  const execucoes = (execucoesResp.data ?? []) as ExecucaoRow[];
  const conversas = (conversasResp.data ?? []) as ConversaRow[];
  const campanhas = (campanhasResp.data ?? []) as CampanhaRow[];
  const fluxos = (fluxosResp.data ?? []) as FluxoRow[];
  const usuarios = (usuariosResp.data ?? []) as UsuarioRow[];

  const mensagensPorProtocolo = agruparPorProtocolo(mensagens);
  const execucoesPorProtocolo = agruparPorProtocolo(execucoes);
  const conversasPorId = new Map(conversas.map((conversa) => [conversa.id, conversa]));
  const campanhasPorId = new Map(campanhas.map((campanha) => [campanha.id, campanha.nome]));
  const fluxosPorId = new Map(fluxos.map((fluxo) => [fluxo.id, fluxo.nome]));
  const usuariosPorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.nome || "Usuário"]));

  const protocolosAtuais = protocolos.filter((protocolo) => {
    const data = new Date(protocolo.started_at).getTime();
    return data >= inicioAtualMs && data <= fimAtualMs;
  });
  const protocolosAnteriores = protocolos.filter((protocolo) => {
    const data = new Date(protocolo.started_at).getTime();
    return data >= inicioAnteriorMs && data <= fimAnteriorMs;
  });

  const metricas = calcularMetricas(protocolosAtuais, mensagensPorProtocolo, execucoesPorProtocolo);
  const metricasAnteriores = calcularMetricas(protocolosAnteriores, mensagensPorProtocolo, execucoesPorProtocolo);

  const campanhaAgrupada = new Map<string, ProtocoloRow[]>();
  for (const protocolo of protocolosAtuais) {
    const campanhaId = conversasPorId.get(protocolo.conversa_id)?.rastreamento_campanha_id ?? "sem-campanha";
    const atual = campanhaAgrupada.get(campanhaId) ?? [];
    atual.push(protocolo);
    campanhaAgrupada.set(campanhaId, atual);
  }

  const campanhaMetrics: CampanhaMetric[] = Array.from(campanhaAgrupada.entries())
    .map(([id, linhas]) => {
      const dados = calcularMetricas(linhas, mensagensPorProtocolo, execucoesPorProtocolo);
      return {
        id,
        nome: id === "sem-campanha" ? "Sem campanha identificada" : campanhasPorId.get(id) ?? "Campanha não encontrada",
        entradas: dados.entradas,
        automacao: dados.automacao,
        semResposta: dados.semResposta,
        qualificados: dados.qualificados,
        convertidos: dados.convertidos,
        taxaResposta: dados.taxaResposta,
        coberturaAutomacao: dados.coberturaAutomacao,
        medianaResposta: dados.medianaPrimeiraResposta,
      };
    })
    .sort((a, b) => b.entradas - a.entradas)
    .slice(0, 8);

  const execucoesAtuais = execucoes.filter((execucao) => {
    const data = new Date(execucao.started_at).getTime();
    return data >= inicioAtualMs && data <= fimAtualMs;
  });
  const fluxosAgrupados = new Map<string, ExecucaoRow[]>();
  for (const execucao of execucoesAtuais) {
    const atual = fluxosAgrupados.get(execucao.fluxo_id) ?? [];
    atual.push(execucao);
    fluxosAgrupados.set(execucao.fluxo_id, atual);
  }

  const fluxoMetrics: FluxoMetric[] = Array.from(fluxosAgrupados.entries())
    .map(([id, linhas]) => ({
      id,
      nome: fluxosPorId.get(id) ?? "Fluxo não encontrado",
      execucoes: linhas.length,
      finalizadas: linhas.filter((linha) => linha.status === "finalizado").length,
      canceladas: linhas.filter((linha) => linha.status === "cancelado").length,
      protocolos: new Set(linhas.map((linha) => linha.conversa_protocolo_id).filter(Boolean)).size,
    }))
    .sort((a, b) => b.execucoes - a.execucoes)
    .slice(0, 6);

  const equipeMap = new Map<
    string,
    {
      protocolos: Set<string>;
      mensagens: number;
      qualificados: Set<string>;
      convertidos: Set<string>;
      tempos: number[];
    }
  >();

  for (const protocolo of protocolosAtuais) {
    const mensagensProtocolo = [...(mensagensPorProtocolo.get(protocolo.id) ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const primeiraEntrada = mensagensProtocolo.find((mensagem) => mensagem.remetente_tipo === "contato");
    const mensagensHumanas = mensagensProtocolo.filter(
      (mensagem) => mensagem.remetente_tipo === "usuario" && mensagem.remetente_id,
    );
    const primeiroHumano = mensagensHumanas[0];

    for (const mensagem of mensagensHumanas) {
      const usuarioId = mensagem.remetente_id as string;
      const atual = equipeMap.get(usuarioId) ?? {
        protocolos: new Set<string>(),
        mensagens: 0,
        qualificados: new Set<string>(),
        convertidos: new Set<string>(),
        tempos: [],
      };
      atual.protocolos.add(protocolo.id);
      atual.mensagens += 1;
      if (protocolo.resultado === "qualificado") atual.qualificados.add(protocolo.id);
      if (protocolo.resultado === "convertido") atual.convertidos.add(protocolo.id);
      equipeMap.set(usuarioId, atual);
    }

    if (primeiraEntrada && primeiroHumano?.remetente_id) {
      const diferenca =
        (new Date(primeiroHumano.created_at).getTime() - new Date(primeiraEntrada.created_at).getTime()) / 60_000;
      if (diferenca >= 0) equipeMap.get(primeiroHumano.remetente_id)?.tempos.push(diferenca);
    }
  }

  const equipeMetrics: EquipeMetric[] = Array.from(equipeMap.entries())
    .map(([id, dados]) => ({
      id,
      nome: usuariosPorId.get(id) ?? "Usuário não encontrado",
      protocolos: dados.protocolos.size,
      mensagens: dados.mensagens,
      qualificados: dados.qualificados.size,
      convertidos: dados.convertidos.size,
      tempoMedioResposta: media(dados.tempos),
    }))
    .sort((a, b) => b.protocolos - a.protocolos)
    .slice(0, 6);

  const serieVolume = criarSerieVolume(protocolosAtuais, intervalo.inicio, intervalo.fim);
  const caminhoSerie = criarPathSerie(serieVolume.map((ponto) => ponto.valor));
  const maiorPonto = Math.max(...serieVolume.map((ponto) => ponto.valor), 0);
  const pontoPico = serieVolume.find((ponto) => ponto.valor === maiorPonto);
  const labelSerie = intervalo.fim.getTime() - intervalo.inicio.getTime() <= 48 * HORA_MS ? "hora" : "dia";

  const rotulos =
    nicho.codigo === "imobiliaria"
      ? {
          entrada: "Leads recebidos",
          qualificado: "Leads qualificados",
          convertido: "Vendas / locações",
          receita: "Receita atribuída",
          entidade: "lead",
        }
      : nicho.codigo === "medicina" || nicho.codigo === "odontologia"
        ? {
            entrada: "Pacientes recebidos",
            qualificado: "Pacientes qualificados",
            convertido: "Conversões",
            receita: "Receita atribuída",
            entidade: "paciente",
          }
        : {
            entrada: "Contatos recebidos",
            qualificado: "Qualificados",
            convertido: "Conversões",
            receita: "Receita atribuída",
            entidade: "contato",
          };

  const funil = [
    { label: "Entraram", valor: metricas.entradas },
    { label: "Atendidos", valor: metricas.atendidos },
    { label: "Engajaram", valor: metricas.engajados },
    { label: "Qualificados", valor: metricas.qualificados },
    { label: "Converteram", valor: metricas.convertidos },
  ];

  const alertas = [
    metricas.coberturaAutomacao < 70
      ? {
          titulo: "Cobertura de automação abaixo do ideal",
          texto: `${formatarPercentual(metricas.coberturaAutomacao)} dos atendimentos iniciaram com automação no período.`,
          tom: "critical" as const,
        }
      : {
          titulo: "Automação cobrindo a maior parte das entradas",
          texto: `${formatarPercentual(metricas.coberturaAutomacao)} dos atendimentos passaram pela automação.`,
          tom: "positive" as const,
        },
    metricas.semResposta > 0
      ? {
          titulo: `${metricas.semResposta} ${metricas.semResposta === 1 ? rotulos.entidade : `${rotulos.entidade}s`} sem resposta`,
          texto: "Há protocolos no período sem mensagem do bot ou da equipe após a entrada.",
          tom: "warning" as const,
        }
      : {
          titulo: "Nenhuma entrada ficou sem resposta",
          texto: "Todos os protocolos do período possuem ao menos uma resposta registrada.",
          tom: "positive" as const,
        },
    metricas.medianaPrimeiraResposta !== null && metricas.medianaPrimeiraResposta > 15
      ? {
          titulo: "SLA de primeira resposta merece atenção",
          texto: `A mediana atual está em ${formatarDuracao(metricas.medianaPrimeiraResposta)}.`,
          tom: "warning" as const,
        }
      : {
          titulo: "SLA de resposta saudável",
          texto: `Mediana de primeira resposta em ${formatarDuracao(metricas.medianaPrimeiraResposta)}.`,
          tom: "positive" as const,
        },
  ];

  const inicioInput = formatarDateTimeLocal(intervalo.inicio);
  const fimInput = formatarDateTimeLocal(intervalo.fim);
  const labelIntervalo = formatarIntervalo(intervalo.inicio, intervalo.fim);
  const meioSerie = Math.floor(serieVolume.length / 2);

  return (
    <>
      <Header
        title="Painel"
        subtitle="Indicadores operacionais e comerciais para acompanhar a operação do primeiro contato à conversão."
      />

      <main className={reportStyles.pageContent}>
        <section className={reportStyles.hero}>
          <div className={reportStyles.heroCopy}>
            <div className={reportStyles.heroEyebrow}>
              <Sparkles size={16} />
              <span>Analytics operacional · Atualizado com dados reais</span>
            </div>
            <h2>{empresa?.nome_fantasia || "Sua empresa"}</h2>
            <p>
              Visão gerencial de atendimento, automação, campanhas, equipe e resultado comercial em uma única leitura.
            </p>
          </div>

          <div className={styles.heroRange}>
            <CalendarRange size={18} />
            <div>
              <span>Intervalo analisado</span>
              <strong>{labelIntervalo}</strong>
            </div>
          </div>
        </section>

        <section className={styles.filterPanel} aria-label="Filtros do painel">
          <div className={styles.filterHeader}>
            <div>
              <span className={styles.filterEyebrow}><Filter size={14} /> Período</span>
              <h3>Escolha o intervalo dos indicadores</h3>
            </div>
            <span className={styles.timezoneBadge}>Horário de Brasília</span>
          </div>

          <div className={styles.shortcutGrid}>
            {ATALHOS.map((atalho) => (
              <Link
                key={atalho.valor}
                href={`/painel?periodo=${atalho.valor}`}
                className={intervalo.atalho === atalho.valor && !intervalo.custom ? styles.shortcutActive : styles.shortcutLink}
              >
                {atalho.label}
              </Link>
            ))}
          </div>

          <form className={styles.customForm} action="/painel" method="get">
            <label className={styles.field}>
              <span>Data / hora inicial</span>
              <input type="datetime-local" name="inicio" defaultValue={inicioInput} max={fimInput} />
            </label>
            <label className={styles.field}>
              <span>Data / hora final</span>
              <input type="datetime-local" name="fim" defaultValue={fimInput} min={inicioInput} />
            </label>
            <button type="submit" className={styles.applyButton}>Aplicar período</button>
          </form>

          <div className={styles.filterFooter}>
            <span>{intervalo.custom ? "Período personalizado ativo" : `Atalho ativo: ${ATALHOS.find((item) => item.valor === intervalo.atalho)?.label ?? "30 dias"}`}</span>
            <span>A comparação dos KPIs usa o intervalo imediatamente anterior com a mesma duração.</span>
          </div>

          {intervalo.invalido ? (
            <div className={styles.filterWarning}>
              O intervalo personalizado informado era inválido ou incompleto. O painel voltou para os últimos 30 dias.
            </div>
          ) : null}
        </section>

        <section className={reportStyles.kpiGrid} aria-label="Indicadores principais">
          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><Users size={18} /></span><Trend atual={metricas.entradas} anterior={metricasAnteriores.entradas} /></div>
            <p>{rotulos.entrada}</p>
            <strong>{formatarInteiro(metricas.entradas)}</strong>
            <small>{formatarInteiro(metricas.novosContatos)} novos no período</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><MessageSquareReply size={18} /></span><Trend atual={metricas.taxaResposta} anterior={metricasAnteriores.taxaResposta} /></div>
            <p>Taxa de resposta</p>
            <strong>{formatarPercentual(metricas.taxaResposta)}</strong>
            <small>{formatarInteiro(metricas.semResposta)} sem resposta registrada</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><Clock3 size={18} /></span><Trend atual={metricas.medianaPrimeiraResposta ?? 0} anterior={metricasAnteriores.medianaPrimeiraResposta ?? 0} inverter /></div>
            <p>Mediana da 1ª resposta</p>
            <strong>{formatarDuracao(metricas.medianaPrimeiraResposta)}</strong>
            <small>Média: {formatarDuracao(metricas.tempoMedioPrimeiraResposta)}</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><Bot size={18} /></span><Trend atual={metricas.coberturaAutomacao} anterior={metricasAnteriores.coberturaAutomacao} /></div>
            <p>Cobertura da automação</p>
            <strong>{formatarPercentual(metricas.coberturaAutomacao)}</strong>
            <small>{formatarInteiro(metricas.automacao)} protocolos com fluxo/bot</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><BadgeCheck size={18} /></span><Trend atual={metricas.qualificados} anterior={metricasAnteriores.qualificados} /></div>
            <p>{rotulos.qualificado}</p>
            <strong>{formatarInteiro(metricas.qualificados)}</strong>
            <small>{formatarPercentual(metricas.taxaQualificacao)} das entradas</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><Target size={18} /></span><Trend atual={metricas.convertidos} anterior={metricasAnteriores.convertidos} /></div>
            <p>{rotulos.convertido}</p>
            <strong>{formatarInteiro(metricas.convertidos)}</strong>
            <small>{formatarPercentual(metricas.taxaConversao)} de conversão</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><CircleDollarSign size={18} /></span><Trend atual={metricas.receita} anterior={metricasAnteriores.receita} /></div>
            <p>{rotulos.receita}</p>
            <strong>{formatarMoeda(metricas.receita)}</strong>
            <small>Com base no valor convertido registrado</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}><span className={reportStyles.kpiIcon}><TrendingUp size={18} /></span><Trend atual={metricas.engajados} anterior={metricasAnteriores.engajados} /></div>
            <p>Engajamento após resposta</p>
            <strong>{formatarPercentual(percentual(metricas.engajados, metricas.atendidos))}</strong>
            <small>{formatarInteiro(metricas.engajados)} contatos responderam após o atendimento</small>
          </article>
        </section>

        <section className={reportStyles.primaryGrid}>
          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Volume</span>
                <h3>Entradas ao longo do período</h3>
              </div>
              <span className={reportStyles.panelBadge}>{pontoPico ? `Pico: ${maiorPonto} por ${labelSerie} (${pontoPico.label})` : "Sem entradas"}</span>
            </div>

            <div className={reportStyles.lineChart} role="img" aria-label="Evolução das entradas no período selecionado">
              <div className={reportStyles.chartGrid} aria-hidden="true" />
              <svg viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
                {caminhoSerie ? <path className={reportStyles.chartArea} d={`${caminhoSerie} L982 200 L18 200 Z`} /> : null}
                {caminhoSerie ? <path className={reportStyles.chartLine} d={caminhoSerie} /> : null}
              </svg>
              <div className={reportStyles.chartLabels}>
                <span>{serieVolume[0]?.label ?? "—"}</span>
                <span>{serieVolume[meioSerie]?.label ?? "—"}</span>
                <span>{serieVolume.at(-1)?.label ?? "—"}</span>
              </div>
            </div>
          </article>

          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Jornada</span>
                <h3>Funil de atendimento</h3>
              </div>
              <span className={reportStyles.panelBadge}>{formatarPercentual(metricas.taxaConversao)} conversão</span>
            </div>

            <div className={reportStyles.funnelList}>
              {funil.map((etapa, indice) => {
                const largura = metricas.entradas ? Math.max(8, percentual(etapa.valor, metricas.entradas)) : 0;
                return (
                  <div className={reportStyles.funnelItem} key={etapa.label}>
                    <div className={reportStyles.funnelMeta}>
                      <span><b>{indice + 1}</b>{etapa.label}</span>
                      <strong>{formatarInteiro(etapa.valor)}</strong>
                    </div>
                    <div className={reportStyles.funnelTrack}><span style={{ width: `${largura}%` }} /></div>
                    <small>{formatarPercentual(percentual(etapa.valor, metricas.entradas))} das entradas</small>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className={reportStyles.alertGrid} aria-label="Alertas gerenciais">
          {alertas.map((alerta) => (
            <article className={`${reportStyles.alertCard} ${reportStyles[`alert_${alerta.tom}`]}`} key={alerta.titulo}>
              <span className={reportStyles.alertIcon}>{alerta.tom === "positive" ? <Zap size={18} /> : <AlertTriangle size={18} />}</span>
              <div><strong>{alerta.titulo}</strong><p>{alerta.texto}</p></div>
            </article>
          ))}
        </section>

        <section className={reportStyles.panel}>
          <div className={reportStyles.panelHeader}>
            <div><span className={reportStyles.sectionEyebrow}>Aquisição</span><h3>Performance por campanha</h3></div>
            <span className={reportStyles.panelBadge}><Building2 size={14} /> {campanhaMetrics.length} origens analisadas</span>
          </div>

          {campanhaMetrics.length ? (
            <div className={reportStyles.tableWrap}>
              <table className={reportStyles.dataTable}>
                <thead><tr><th>Campanha</th><th>Entradas</th><th>Automação</th><th>Resposta</th><th>Mediana</th><th>Qualificados</th><th>Conversões</th></tr></thead>
                <tbody>
                  {campanhaMetrics.map((campanha) => (
                    <tr key={campanha.id}>
                      <td><strong>{campanha.nome}</strong><small>{campanha.semResposta} sem resposta</small></td>
                      <td>{campanha.entradas}</td>
                      <td><span className={reportStyles.metricPill}>{formatarPercentual(campanha.coberturaAutomacao)}</span></td>
                      <td>{formatarPercentual(campanha.taxaResposta)}</td>
                      <td>{formatarDuracao(campanha.medianaResposta)}</td>
                      <td>{campanha.qualificados}</td>
                      <td>{campanha.convertidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className={reportStyles.emptyState}>Nenhuma campanha com protocolos no período selecionado.</div>}
        </section>

        <section className={reportStyles.secondaryGrid}>
          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div><span className={reportStyles.sectionEyebrow}>Automação</span><h3>Performance dos fluxos</h3></div>
              <Workflow size={18} className={reportStyles.panelIcon} />
            </div>

            {fluxoMetrics.length ? (
              <div className={reportStyles.rankingList}>
                {fluxoMetrics.map((fluxo) => {
                  const finalizacao = percentual(fluxo.finalizadas, fluxo.execucoes);
                  return (
                    <div className={reportStyles.rankingItem} key={fluxo.id}>
                      <div className={reportStyles.rankingTop}>
                        <div><strong>{fluxo.nome}</strong><small>{fluxo.protocolos} protocolos · {fluxo.canceladas} canceladas</small></div>
                        <b>{formatarPercentual(finalizacao)}</b>
                      </div>
                      <div className={reportStyles.progressTrack}><span style={{ width: `${Math.min(100, finalizacao)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : <div className={reportStyles.emptyState}>Nenhuma execução de fluxo no período.</div>}
          </article>

          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div><span className={reportStyles.sectionEyebrow}>Equipe</span><h3>Atendimento humano</h3></div>
              <UserRoundCheck size={18} className={reportStyles.panelIcon} />
            </div>

            {equipeMetrics.length ? (
              <div className={reportStyles.teamList}>
                {equipeMetrics.map((usuario, indice) => (
                  <div className={reportStyles.teamItem} key={usuario.id}>
                    <span className={reportStyles.avatar}>{usuario.nome.trim().charAt(0).toUpperCase() || "U"}</span>
                    <div className={reportStyles.teamMain}><strong>{usuario.nome}</strong><small>{usuario.protocolos} atendimentos · {usuario.mensagens} mensagens</small></div>
                    <div className={reportStyles.teamStats}>
                      <span><b>{usuario.qualificados}</b> qualif.</span>
                      <span><b>{formatarDuracao(usuario.tempoMedioResposta)}</b> resposta</span>
                    </div>
                    <span className={reportStyles.rank}>#{indice + 1}</span>
                  </div>
                ))}
              </div>
            ) : <div className={reportStyles.emptyState}>Nenhuma mensagem humana registrada no período.</div>}
          </article>
        </section>

        <section className={reportStyles.methodNote}>
          <div className={reportStyles.methodIcon}><Zap size={18} /></div>
          <div>
            <strong>Como o painel calcula os KPIs</strong>
            <p>
              O painel cruza protocolos, mensagens, execuções de fluxo, campanhas e usuários já existentes no CRM.
              Não cria dados paralelos nem altera o banco. Conversão e receita dependem do resultado e valor convertido registrados no protocolo.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
