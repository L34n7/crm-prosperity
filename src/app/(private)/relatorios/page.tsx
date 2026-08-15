import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Building2,
  CircleDollarSign,
  Clock3,
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
import styles from "./page.module.css";

type PageProps = {
  searchParams?: Promise<{
    periodo?: string | string[];
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

type CampanhaRow = {
  id: string;
  nome: string;
};

type FluxoRow = {
  id: string;
  nome: string;
};

type UsuarioRow = {
  id: string;
  nome: string | null;
};

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

const PERIODOS = [7, 30, 90] as const;
const TIME_ZONE = "America/Sao_Paulo";

function normalizarPeriodo(valor: string | string[] | undefined) {
  const recebido = Array.isArray(valor) ? valor[0] : valor;
  const numero = Number(recebido);
  return PERIODOS.includes(numero as (typeof PERIODOS)[number]) ? numero : 30;
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
  if (ordenados.length % 2 === 0) {
    return (ordenados[meio - 1] + ordenados[meio]) / 2;
  }
  return ordenados[meio];
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

function criarSerieDiaria(protocolos: ProtocoloRow[], periodo: number) {
  const agora = new Date();
  const porDia = new Map<string, number>();

  for (const protocolo of protocolos) {
    const chave = dataLocalKey(new Date(protocolo.started_at));
    porDia.set(chave, (porDia.get(chave) ?? 0) + 1);
  }

  const serie: Array<{ key: string; label: string; valor: number }> = [];
  for (let indice = periodo - 1; indice >= 0; indice -= 1) {
    const data = new Date(agora);
    data.setDate(data.getDate() - indice);
    const key = dataLocalKey(data);
    serie.push({ key, label: dataCurta(data), valor: porDia.get(key) ?? 0 });
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
      const x = paddingX + (indice / divisor) * (largura - paddingX * 2);
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
      (mensagem) =>
        mensagem.remetente_tipo === "bot" || mensagem.remetente_tipo === "usuario",
    );

    if (saida) atendidos += 1;
    else semResposta += 1;

    if (entrada && saida) {
      const diferenca =
        (new Date(saida.created_at).getTime() - new Date(entrada.created_at).getTime()) /
        60_000;
      if (diferenca >= 0) temposResposta.push(diferenca);

      const respondeuDepois = mensagens.some(
        (mensagem) =>
          mensagem.remetente_tipo === "contato" &&
          new Date(mensagem.created_at).getTime() > new Date(saida.created_at).getTime(),
      );
      if (respondeuDepois) engajados += 1;
    }

    if (
      protocolo.iniciado_com_bot ||
      (execucoesPorProtocolo.get(protocolo.id)?.length ?? 0) > 0
    ) {
      automacao += 1;
    }
  }

  const entradas = protocolos.length;
  const qualificados = protocolos.filter((protocolo) => protocolo.resultado === "qualificado").length;
  const convertidos = protocolos.filter((protocolo) => protocolo.resultado === "convertido").length;
  const perdidos = protocolos.filter((protocolo) => protocolo.resultado === "perdido").length;
  const novosContatos = protocolos.filter((protocolo) => protocolo.contato_novo_no_inicio).length;
  const receita = protocolos.reduce(
    (soma, protocolo) => soma + numero(protocolo.valor_convertido),
    0,
  );

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
    <span className={positivo ? styles.trendPositive : styles.trendNegative}>
      <Icone size={14} />
      {Math.abs(valor).toFixed(0)}% vs. período anterior
    </span>
  );
}

export default async function RelatoriosPage({ searchParams }: PageProps) {
  const parametros = (await searchParams) ?? {};
  const periodo = normalizarPeriodo(parametros.periodo);
  const contexto = await getUsuarioContexto();

  if (!contexto.ok) redirect("/login");
  if (!contexto.usuario.empresa_id) redirect("/painel");

  const empresaId = contexto.usuario.empresa_id;
  const supabase = getSupabaseAdmin();
  const nicho = await buscarNichoEmpresa(empresaId);
  const agora = new Date();
  const inicioAtual = new Date(agora);
  inicioAtual.setDate(inicioAtual.getDate() - periodo + 1);
  inicioAtual.setHours(0, 0, 0, 0);

  const inicioAnterior = new Date(inicioAtual);
  inicioAnterior.setDate(inicioAnterior.getDate() - periodo);

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
      .gte("started_at", inicioAnterior.toISOString())
      .order("started_at", { ascending: true })
      .limit(5000),
  ]);

  if (protocolosResp.error) {
    console.error("Erro ao carregar protocolos para relatórios:", protocolosResp.error);
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
      supabase
        .from("rastreamento_campanhas")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .limit(2000),
      supabase
        .from("automacao_fluxos")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .limit(2000),
      supabase
        .from("usuarios")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .limit(2000),
    ]);

  for (const [nome, resposta] of [
    ["mensagens", mensagensResp],
    ["execuções", execucoesResp],
    ["conversas", conversasResp],
    ["campanhas", campanhasResp],
    ["fluxos", fluxosResp],
    ["usuários", usuariosResp],
  ] as const) {
    if (resposta.error) console.error(`Erro ao carregar ${nome} dos relatórios:`, resposta.error);
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

  const inicioAtualMs = inicioAtual.getTime();
  const protocolosAtuais = protocolos.filter(
    (protocolo) => new Date(protocolo.started_at).getTime() >= inicioAtualMs,
  );
  const protocolosAnteriores = protocolos.filter(
    (protocolo) => new Date(protocolo.started_at).getTime() < inicioAtualMs,
  );

  const metricas = calcularMetricas(protocolosAtuais, mensagensPorProtocolo, execucoesPorProtocolo);
  const metricasAnteriores = calcularMetricas(
    protocolosAnteriores,
    mensagensPorProtocolo,
    execucoesPorProtocolo,
  );

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

  const execucoesAtuais = execucoes.filter(
    (execucao) => new Date(execucao.started_at).getTime() >= inicioAtualMs,
  );
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

  const equipeMap = new Map<string, {
    protocolos: Set<string>;
    mensagens: number;
    qualificados: Set<string>;
    convertidos: Set<string>;
    tempos: number[];
  }>();

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
        (new Date(primeiroHumano.created_at).getTime() - new Date(primeiraEntrada.created_at).getTime()) /
        60_000;
      if (diferenca >= 0) {
        equipeMap.get(primeiroHumano.remetente_id)?.tempos.push(diferenca);
      }
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

  const serieDiaria = criarSerieDiaria(protocolosAtuais, periodo);
  const caminhoSerie = criarPathSerie(serieDiaria.map((ponto) => ponto.valor));
  const maiorDia = Math.max(...serieDiaria.map((ponto) => ponto.valor), 0);
  const diaPico = serieDiaria.find((ponto) => ponto.valor === maiorDia);

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

  return (
    <>
      <Header
        title="Relatórios"
        subtitle="Indicadores operacionais e comerciais para acompanhar o que acontece do primeiro contato à conversão."
      />

      <main className={styles.pageContent}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.heroEyebrow}>
              <Sparkles size={16} />
              <span>Prévia funcional · Analytics por nicho</span>
            </div>
            <h2>{empresa?.nome_fantasia || "Sua empresa"}</h2>
            <p>
              Visão gerencial com dados reais da operação. Os indicadores abaixo acompanham atendimento,
              automação, campanhas, equipe e resultado comercial em uma única leitura.
            </p>
          </div>

          <div className={styles.periodSelector} aria-label="Período do relatório">
            <span>Período</span>
            <div>
              {PERIODOS.map((opcao) => (
                <Link
                  key={opcao}
                  href={`/relatorios?periodo=${opcao}`}
                  className={periodo === opcao ? styles.periodActive : styles.periodLink}
                >
                  {opcao} dias
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.kpiGrid} aria-label="Indicadores principais">
          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><Users size={18} /></span><Trend atual={metricas.entradas} anterior={metricasAnteriores.entradas} /></div>
            <p>{rotulos.entrada}</p>
            <strong>{formatarInteiro(metricas.entradas)}</strong>
            <small>{formatarInteiro(metricas.novosContatos)} novos no período</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><MessageSquareReply size={18} /></span><Trend atual={metricas.taxaResposta} anterior={metricasAnteriores.taxaResposta} /></div>
            <p>Taxa de resposta</p>
            <strong>{formatarPercentual(metricas.taxaResposta)}</strong>
            <small>{formatarInteiro(metricas.semResposta)} sem resposta registrada</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><Clock3 size={18} /></span><Trend atual={metricas.medianaPrimeiraResposta ?? 0} anterior={metricasAnteriores.medianaPrimeiraResposta ?? 0} inverter /></div>
            <p>Mediana da 1ª resposta</p>
            <strong>{formatarDuracao(metricas.medianaPrimeiraResposta)}</strong>
            <small>Média: {formatarDuracao(metricas.tempoMedioPrimeiraResposta)}</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><Bot size={18} /></span><Trend atual={metricas.coberturaAutomacao} anterior={metricasAnteriores.coberturaAutomacao} /></div>
            <p>Cobertura da automação</p>
            <strong>{formatarPercentual(metricas.coberturaAutomacao)}</strong>
            <small>{formatarInteiro(metricas.automacao)} protocolos com fluxo/bot</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><BadgeCheck size={18} /></span><Trend atual={metricas.qualificados} anterior={metricasAnteriores.qualificados} /></div>
            <p>{rotulos.qualificado}</p>
            <strong>{formatarInteiro(metricas.qualificados)}</strong>
            <small>{formatarPercentual(metricas.taxaQualificacao)} das entradas</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><Target size={18} /></span><Trend atual={metricas.convertidos} anterior={metricasAnteriores.convertidos} /></div>
            <p>{rotulos.convertido}</p>
            <strong>{formatarInteiro(metricas.convertidos)}</strong>
            <small>{formatarPercentual(metricas.taxaConversao)} de conversão</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><CircleDollarSign size={18} /></span><Trend atual={metricas.receita} anterior={metricasAnteriores.receita} /></div>
            <p>{rotulos.receita}</p>
            <strong>{formatarMoeda(metricas.receita)}</strong>
            <small>Com base no valor convertido registrado</small>
          </article>

          <article className={styles.kpiCard}>
            <div className={styles.kpiTop}><span className={styles.kpiIcon}><TrendingUp size={18} /></span><Trend atual={metricas.engajados} anterior={metricasAnteriores.engajados} /></div>
            <p>Engajamento após resposta</p>
            <strong>{formatarPercentual(percentual(metricas.engajados, metricas.atendidos))}</strong>
            <small>{formatarInteiro(metricas.engajados)} contatos responderam após o atendimento</small>
          </article>
        </section>

        <section className={styles.primaryGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Volume</span>
                <h3>Entradas ao longo do período</h3>
              </div>
              <span className={styles.panelBadge}>{diaPico ? `Pico: ${maiorDia} em ${diaPico.label}` : "Sem entradas"}</span>
            </div>

            <div className={styles.lineChart} role="img" aria-label={`Evolução de entradas nos últimos ${periodo} dias`}>
              <div className={styles.chartGrid} aria-hidden="true" />
              <svg viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true">
                <path className={styles.chartArea} d={`${caminhoSerie} L982 200 L18 200 Z`} />
                <path className={styles.chartLine} d={caminhoSerie} />
              </svg>
              <div className={styles.chartLabels}>
                <span>{serieDiaria[0]?.label}</span>
                <span>{serieDiaria[Math.floor(serieDiaria.length / 2)]?.label}</span>
                <span>{serieDiaria.at(-1)?.label}</span>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Jornada</span>
                <h3>Funil de atendimento</h3>
              </div>
              <span className={styles.panelBadge}>{formatarPercentual(metricas.taxaConversao)} conversão</span>
            </div>

            <div className={styles.funnelList}>
              {funil.map((etapa, indice) => {
                const largura = metricas.entradas ? Math.max(8, percentual(etapa.valor, metricas.entradas)) : 0;
                return (
                  <div className={styles.funnelItem} key={etapa.label}>
                    <div className={styles.funnelMeta}>
                      <span><b>{indice + 1}</b>{etapa.label}</span>
                      <strong>{formatarInteiro(etapa.valor)}</strong>
                    </div>
                    <div className={styles.funnelTrack}>
                      <span style={{ width: `${largura}%` }} />
                    </div>
                    <small>{formatarPercentual(percentual(etapa.valor, metricas.entradas))} das entradas</small>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className={styles.alertGrid} aria-label="Alertas gerenciais">
          {alertas.map((alerta) => (
            <article className={`${styles.alertCard} ${styles[`alert_${alerta.tom}`]}`} key={alerta.titulo}>
              <span className={styles.alertIcon}>{alerta.tom === "positive" ? <Zap size={18} /> : <AlertTriangle size={18} />}</span>
              <div>
                <strong>{alerta.titulo}</strong>
                <p>{alerta.texto}</p>
              </div>
            </article>
          ))}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Aquisição</span>
              <h3>Performance por campanha</h3>
            </div>
            <span className={styles.panelBadge}><Building2 size={14} /> {campanhaMetrics.length} origens analisadas</span>
          </div>

          {campanhaMetrics.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th>Entradas</th>
                    <th>Automação</th>
                    <th>Resposta</th>
                    <th>Mediana</th>
                    <th>Qualificados</th>
                    <th>Conversões</th>
                  </tr>
                </thead>
                <tbody>
                  {campanhaMetrics.map((campanha) => (
                    <tr key={campanha.id}>
                      <td><strong>{campanha.nome}</strong><small>{campanha.semResposta} sem resposta</small></td>
                      <td>{campanha.entradas}</td>
                      <td><span className={styles.metricPill}>{formatarPercentual(campanha.coberturaAutomacao)}</span></td>
                      <td>{formatarPercentual(campanha.taxaResposta)}</td>
                      <td>{formatarDuracao(campanha.medianaResposta)}</td>
                      <td>{campanha.qualificados}</td>
                      <td>{campanha.convertidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>Nenhuma campanha com protocolos no período selecionado.</div>
          )}
        </section>

        <section className={styles.secondaryGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Automação</span>
                <h3>Performance dos fluxos</h3>
              </div>
              <Workflow size={18} className={styles.panelIcon} />
            </div>

            {fluxoMetrics.length ? (
              <div className={styles.rankingList}>
                {fluxoMetrics.map((fluxo) => {
                  const finalizacao = percentual(fluxo.finalizadas, fluxo.execucoes);
                  return (
                    <div className={styles.rankingItem} key={fluxo.id}>
                      <div className={styles.rankingTop}>
                        <div><strong>{fluxo.nome}</strong><small>{fluxo.protocolos} protocolos · {fluxo.canceladas} canceladas</small></div>
                        <b>{formatarPercentual(finalizacao)}</b>
                      </div>
                      <div className={styles.progressTrack}><span style={{ width: `${Math.min(100, finalizacao)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>Nenhuma execução de fluxo no período.</div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.sectionEyebrow}>Equipe</span>
                <h3>Atendimento humano</h3>
              </div>
              <UserRoundCheck size={18} className={styles.panelIcon} />
            </div>

            {equipeMetrics.length ? (
              <div className={styles.teamList}>
                {equipeMetrics.map((usuario, indice) => (
                  <div className={styles.teamItem} key={usuario.id}>
                    <span className={styles.avatar}>{usuario.nome.trim().charAt(0).toUpperCase() || "U"}</span>
                    <div className={styles.teamMain}>
                      <strong>{usuario.nome}</strong>
                      <small>{usuario.protocolos} atendimentos · {usuario.mensagens} mensagens</small>
                    </div>
                    <div className={styles.teamStats}>
                      <span><b>{usuario.qualificados}</b> qualif.</span>
                      <span><b>{formatarDuracao(usuario.tempoMedioResposta)}</b> resposta</span>
                    </div>
                    <span className={styles.rank}>#{indice + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Nenhuma mensagem humana registrada no período.</div>
            )}
          </article>
        </section>

        <section className={styles.methodNote}>
          <div className={styles.methodIcon}><Zap size={18} /></div>
          <div>
            <strong>Como esta prévia calcula os KPIs</strong>
            <p>
              A página cruza protocolos, mensagens, execuções de fluxo, campanhas e usuários já existentes no CRM.
              Não cria dados paralelos nem altera o banco. Conversão e receita dependem do resultado e valor convertido
              registrados no protocolo.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
