import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  MessageCircleMore,
  Radio,
  TimerReset,
  UserRoundCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import Header from "@/components/Header";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import reportStyles from "../../relatorios/page.module.css";
import LiveRefresh from "./LiveRefresh";
import styles from "./page.module.css";

type ConversaRow = {
  id: string;
  contato_id: string | null;
  setor_id: string | null;
  responsavel_id: string | null;
  status: string | null;
  bot_ativo: boolean | null;
  aguardando_atendente: boolean | null;
  started_at: string;
  last_message_at: string | null;
  last_inbound_message_at: string | null;
  updated_at: string;
};

type ProtocoloRow = {
  id: string;
  conversa_id: string;
  contato_id: string | null;
  started_at: string;
  closed_at: string | null;
  resultado: string | null;
  resultado_em: string | null;
  valor_convertido: number | string | null;
  contato_novo_no_inicio: boolean | null;
};

type MensagemRow = {
  conversa_id: string;
  conversa_protocolo_id: string | null;
  remetente_tipo: string;
  remetente_id: string | null;
  origem: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

type UsuarioRow = { id: string; nome: string | null };
type PerfilEmpresaRow = { id: string; nome: string };
type UsuarioPerfilRow = { usuario_id: string; perfil_empresa_id: string };
type ContatoRow = { id: string; nome: string | null; telefone: string | null };
type SetorRow = { id: string; nome: string };

type EquipeHoje = {
  id: string;
  nome: string;
  agora: number;
  protocolos: Set<string>;
  mensagens: number;
  temposResposta: number[];
};

const TIME_ZONE = "America/Sao_Paulo";
const SAO_PAULO_OFFSET = "-03:00";
const MINUTO_MS = 60_000;
const STATUS_ATIVOS = ["fila", "em_atendimento", "aberta", "bot"];

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
    hora: Number(mapa.get("hour") || 0),
    minuto: mapa.get("minute") || "00",
  };
}

function inicioDoDiaSaoPaulo(data: Date) {
  const p = partesData(data);
  return new Date(`${p.ano}-${p.mes}-${p.dia}T00:00:00${SAO_PAULO_OFFSET}`);
}

function horaLocal(data: Date) {
  return partesData(data).hora;
}

function formatarHora(data: Date | null) {
  if (!data) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(data);
}

function formatarAgora(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarInteiro(valor: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(valor);
}

function percentual(parte: number, total: number) {
  return total > 0 ? (parte / total) * 100 : 0;
}

function formatarPercentual(valor: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor)}%`;
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

function minutosDesde(data: string | null | undefined, agora: Date) {
  if (!data) return 0;
  const valor = new Date(data).getTime();
  if (!Number.isFinite(valor)) return 0;
  return Math.max(0, (agora.getTime() - valor) / MINUTO_MS);
}

function ehMensagemCoexDoBusinessApp(mensagem: MensagemRow) {
  const metadata = mensagem.metadata_json;
  return (
    mensagem.remetente_tipo === "usuario" &&
    !mensagem.remetente_id &&
    mensagem.origem === "enviada" &&
    metadata?.coex === true &&
    metadata?.coex_source === "business_app" &&
    metadata?.coex_direction === "outbound"
  );
}

function usuarioHumanoEfetivo(mensagem: MensagemRow, administradorId: string | null) {
  if (mensagem.remetente_tipo !== "usuario") return null;
  if (mensagem.remetente_id) return mensagem.remetente_id;
  if (administradorId && ehMensagemCoexDoBusinessApp(mensagem)) return administradorId;
  return null;
}

function agruparMensagensPorProtocolo(mensagens: MensagemRow[]) {
  const mapa = new Map<string, MensagemRow[]>();
  for (const mensagem of mensagens) {
    if (!mensagem.conversa_protocolo_id) continue;
    const atual = mapa.get(mensagem.conversa_protocolo_id) ?? [];
    atual.push(mensagem);
    mapa.set(mensagem.conversa_protocolo_id, atual);
  }
  return mapa;
}

export default async function PainelAoVivoPage() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) redirect("/login");
  if (!contexto.usuario.empresa_id) redirect("/configurar-ambiente");

  const empresaId = contexto.usuario.empresa_id;
  const supabase = getSupabaseAdmin();
  const agora = new Date();
  const inicioHoje = inicioDoDiaSaoPaulo(agora);
  const nicho = await buscarNichoEmpresa(empresaId);

  const [
    empresaResp,
    usuariosResp,
    conversasAtivasResp,
    protocolosIniciadosResp,
    protocolosEncerradosResp,
    protocolosResultadoResp,
    mensagensResp,
    setoresResp,
  ] = await Promise.all([
    supabase.from("empresas").select("id, nome_fantasia").eq("id", empresaId).maybeSingle(),
    supabase.from("usuarios").select("id, nome").eq("empresa_id", empresaId).eq("status", "ativo").limit(1000),
    supabase
      .from("conversas")
      .select("id, contato_id, setor_id, responsavel_id, status, bot_ativo, aguardando_atendente, started_at, last_message_at, last_inbound_message_at, updated_at")
      .eq("empresa_id", empresaId)
      .in("status", STATUS_ATIVOS)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(5000),
    supabase
      .from("conversa_protocolos")
      .select("id, conversa_id, contato_id, started_at, closed_at, resultado, resultado_em, valor_convertido, contato_novo_no_inicio")
      .eq("empresa_id", empresaId)
      .gte("started_at", inicioHoje.toISOString())
      .lte("started_at", agora.toISOString())
      .limit(5000),
    supabase
      .from("conversa_protocolos")
      .select("id, conversa_id, contato_id, started_at, closed_at, resultado, resultado_em, valor_convertido, contato_novo_no_inicio")
      .eq("empresa_id", empresaId)
      .gte("closed_at", inicioHoje.toISOString())
      .lte("closed_at", agora.toISOString())
      .limit(5000),
    supabase
      .from("conversa_protocolos")
      .select("id, conversa_id, contato_id, started_at, closed_at, resultado, resultado_em, valor_convertido, contato_novo_no_inicio")
      .eq("empresa_id", empresaId)
      .gte("resultado_em", inicioHoje.toISOString())
      .lte("resultado_em", agora.toISOString())
      .limit(5000),
    supabase
      .from("mensagens")
      .select("conversa_id, conversa_protocolo_id, remetente_tipo, remetente_id, origem, metadata_json, created_at")
      .eq("empresa_id", empresaId)
      .gte("created_at", inicioHoje.toISOString())
      .lte("created_at", agora.toISOString())
      .order("created_at", { ascending: true })
      .limit(25000),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).limit(1000),
  ]);

  for (const [nome, resposta] of [
    ["empresa", empresaResp],
    ["usuários", usuariosResp],
    ["conversas ativas", conversasAtivasResp],
    ["protocolos iniciados", protocolosIniciadosResp],
    ["protocolos encerrados", protocolosEncerradosResp],
    ["resultados", protocolosResultadoResp],
    ["mensagens", mensagensResp],
    ["setores", setoresResp],
  ] as const) {
    if (resposta.error) console.error(`Erro ao carregar ${nome} do painel ao vivo:`, resposta.error);
  }

  const empresa = empresaResp.data;
  const usuarios = (usuariosResp.data ?? []) as UsuarioRow[];
  const conversasAtivas = (conversasAtivasResp.data ?? []) as ConversaRow[];
  const protocolosIniciados = (protocolosIniciadosResp.data ?? []) as ProtocoloRow[];
  const protocolosEncerrados = (protocolosEncerradosResp.data ?? []) as ProtocoloRow[];
  const protocolosResultado = (protocolosResultadoResp.data ?? []) as ProtocoloRow[];
  const mensagens = (mensagensResp.data ?? []) as MensagemRow[];
  const setores = (setoresResp.data ?? []) as SetorRow[];
  const idsUsuarios = usuarios.map((usuario) => usuario.id);

  const [perfisResp, usuariosPerfisResp] = await Promise.all([
    supabase
      .from("perfis_empresa")
      .select("id, nome")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .is("archived_at", null)
      .limit(200),
    idsUsuarios.length
      ? supabase
          .from("usuarios_perfis")
          .select("usuario_id, perfil_empresa_id")
          .in("usuario_id", idsUsuarios)
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (perfisResp.error) console.error("Erro ao carregar perfis do painel ao vivo:", perfisResp.error);
  if (usuariosPerfisResp.error) console.error("Erro ao carregar vínculos de perfil do painel ao vivo:", usuariosPerfisResp.error);

  const perfis = (perfisResp.data ?? []) as PerfilEmpresaRow[];
  const usuariosPerfis = (usuariosPerfisResp.data ?? []) as UsuarioPerfilRow[];
  const perfisAdministrador = new Set(
    perfis
      .filter((perfil) => perfil.nome.trim().toLocaleLowerCase("pt-BR").includes("administrador"))
      .map((perfil) => perfil.id),
  );
  const administradorId =
    usuariosPerfis.find((vinculo) => perfisAdministrador.has(vinculo.perfil_empresa_id))?.usuario_id ??
    (usuarios.length === 1 ? usuarios[0].id : null);

  const idsContatosAtivos = Array.from(
    new Set(conversasAtivas.map((conversa) => conversa.contato_id).filter((id): id is string => Boolean(id))),
  );
  const contatosResp = idsContatosAtivos.length
    ? await supabase
        .from("contatos")
        .select("id, nome, telefone")
        .eq("empresa_id", empresaId)
        .in("id", idsContatosAtivos)
        .limit(5000)
    : { data: [], error: null };
  if (contatosResp.error) console.error("Erro ao carregar contatos da fila ao vivo:", contatosResp.error);

  const contatos = (contatosResp.data ?? []) as ContatoRow[];
  const contatosPorId = new Map(contatos.map((contato) => [contato.id, contato]));
  const setoresPorId = new Map(setores.map((setor) => [setor.id, setor.nome]));
  const usuariosPorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.nome || "Usuário"]));
  const mensagensPorProtocolo = agruparMensagensPorProtocolo(mensagens);

  const equipe = new Map<string, EquipeHoje>();
  const ultimoHumanoPorConversa = new Map<string, string>();
  const primeiroHumanoPorProtocolo = new Map<string, { usuarioId: string; created_at: string }>();
  const protocolosComHumano = new Set<string>();

  for (const mensagem of mensagens) {
    const usuarioId = usuarioHumanoEfetivo(mensagem, administradorId);
    if (!usuarioId) continue;

    ultimoHumanoPorConversa.set(mensagem.conversa_id, usuarioId);
    if (mensagem.conversa_protocolo_id) {
      protocolosComHumano.add(mensagem.conversa_protocolo_id);
      if (!primeiroHumanoPorProtocolo.has(mensagem.conversa_protocolo_id)) {
        primeiroHumanoPorProtocolo.set(mensagem.conversa_protocolo_id, {
          usuarioId,
          created_at: mensagem.created_at,
        });
      }
    }

    const atual = equipe.get(usuarioId) ?? {
      id: usuarioId,
      nome: usuariosPorId.get(usuarioId) ?? "Usuário",
      agora: 0,
      protocolos: new Set<string>(),
      mensagens: 0,
      temposResposta: [],
    };
    if (mensagem.conversa_protocolo_id) atual.protocolos.add(mensagem.conversa_protocolo_id);
    atual.mensagens += 1;
    equipe.set(usuarioId, atual);
  }

  const temposRespostaHumana: number[] = [];
  const protocolosComEntradaHoje = new Set<string>();
  const protocolosRespondidosHumano = new Set<string>();

  for (const [protocoloId, lista] of mensagensPorProtocolo.entries()) {
    const ordenadas = [...lista].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const primeiraEntrada = ordenadas.find((mensagem) => mensagem.remetente_tipo === "contato");
    if (!primeiraEntrada) continue;

    protocolosComEntradaHoje.add(protocoloId);
    const entradaMs = new Date(primeiraEntrada.created_at).getTime();
    const primeiroHumano = ordenadas
      .map((mensagem) => ({ mensagem, usuarioId: usuarioHumanoEfetivo(mensagem, administradorId) }))
      .find(
        (item) =>
          Boolean(item.usuarioId) &&
          new Date(item.mensagem.created_at).getTime() >= entradaMs,
      );

    if (!primeiroHumano?.usuarioId) continue;
    protocolosRespondidosHumano.add(protocoloId);
    const diferenca = (new Date(primeiroHumano.mensagem.created_at).getTime() - entradaMs) / MINUTO_MS;
    if (diferenca >= 0) {
      temposRespostaHumana.push(diferenca);
      const atual = equipe.get(primeiroHumano.usuarioId);
      atual?.temposResposta.push(diferenca);
    }
  }

  const estaNaFila = (conversa: ConversaRow) =>
    conversa.status === "fila" || conversa.aguardando_atendente === true;

  for (const conversa of conversasAtivas) {
    if (conversa.status !== "em_atendimento" || estaNaFila(conversa)) continue;
    const usuarioId = conversa.responsavel_id ?? ultimoHumanoPorConversa.get(conversa.id) ?? null;
    if (!usuarioId) continue;
    const atual = equipe.get(usuarioId) ?? {
      id: usuarioId,
      nome: usuariosPorId.get(usuarioId) ?? "Usuário",
      agora: 0,
      protocolos: new Set<string>(),
      mensagens: 0,
      temposResposta: [],
    };
    atual.agora += 1;
    equipe.set(usuarioId, atual);
  }

  const filaAgora = conversasAtivas
    .filter(estaNaFila)
    .map((conversa) => {
      const contato = conversa.contato_id ? contatosPorId.get(conversa.contato_id) : null;
      const referenciaEspera = conversa.last_inbound_message_at ?? conversa.started_at ?? conversa.updated_at;
      return {
        ...conversa,
        nome: contato?.nome || contato?.telefone || "Contato sem nome",
        telefone: contato?.telefone,
        setor: conversa.setor_id ? setoresPorId.get(conversa.setor_id) ?? "Setor" : "Sem setor",
        esperaMinutos: minutosDesde(referenciaEspera, agora),
        ultimaEntrada: conversa.last_inbound_message_at ? new Date(conversa.last_inbound_message_at) : null,
      };
    })
    .sort((a, b) => b.esperaMinutos - a.esperaMinutos);

  const emAtendimentoAgora = conversasAtivas.filter(
    (conversa) => conversa.status === "em_atendimento" && !estaNaFila(conversa),
  ).length;
  const emBotAgora = conversasAtivas.filter((conversa) => conversa.status === "bot" && !estaNaFila(conversa)).length;
  const filaAcima15 = filaAgora.filter((conversa) => conversa.esperaMinutos >= 15).length;
  const maiorEsperaFila = filaAgora.length ? filaAgora[0].esperaMinutos : null;
  const medianaFila = mediana(filaAgora.map((conversa) => conversa.esperaMinutos));
  const mensagensHumanasHoje = mensagens.filter((mensagem) => usuarioHumanoEfetivo(mensagem, administradorId));
  const semRespostaHumana = Math.max(0, protocolosComEntradaHoje.size - protocolosRespondidosHumano.size);
  const medianaRespostaHumana = mediana(temposRespostaHumana);
  const mediaRespostaHumana = media(temposRespostaHumana);

  const encerradosHoje = protocolosEncerrados.length;
  const encerradosSemConversao = protocolosEncerrados.filter((protocolo) => protocolo.resultado !== "convertido").length;
  const encerradosPerdidos = protocolosEncerrados.filter((protocolo) => protocolo.resultado === "perdido").length;
  const encerradosQualificados = protocolosEncerrados.filter((protocolo) => protocolo.resultado === "qualificado").length;
  const convertidosEncerrados = protocolosEncerrados.filter((protocolo) => protocolo.resultado === "convertido").length;
  const conversoesHoje = protocolosResultado.filter((protocolo) => protocolo.resultado === "convertido").length;
  const entradasHoje = protocolosIniciados.length;
  const novosHoje = protocolosIniciados.filter((protocolo) => protocolo.contato_novo_no_inicio).length;

  const equipeOrdenada = Array.from(equipe.values())
    .filter((usuario) => usuario.agora > 0 || usuario.protocolos.size > 0 || usuario.mensagens > 0)
    .sort((a, b) => b.agora - a.agora || b.protocolos.size - a.protocolos.size || b.mensagens - a.mensagens);
  const atendentesAtivosAgora = equipeOrdenada.filter((usuario) => usuario.agora > 0).length;

  const horaAtual = horaLocal(agora);
  const ritmo = Array.from({ length: horaAtual + 1 }, (_, hora) => ({
    hora,
    entradas: 0,
    atendidos: 0,
    encerrados: 0,
  }));

  for (const protocolo of protocolosIniciados) {
    const hora = horaLocal(new Date(protocolo.started_at));
    if (ritmo[hora]) ritmo[hora].entradas += 1;
  }
  for (const item of primeiroHumanoPorProtocolo.values()) {
    const hora = horaLocal(new Date(item.created_at));
    if (ritmo[hora]) ritmo[hora].atendidos += 1;
  }
  for (const protocolo of protocolosEncerrados) {
    if (!protocolo.closed_at) continue;
    const hora = horaLocal(new Date(protocolo.closed_at));
    if (ritmo[hora]) ritmo[hora].encerrados += 1;
  }
  const maiorRitmo = Math.max(1, ...ritmo.flatMap((item) => [item.entradas, item.atendidos, item.encerrados]));

  const slaAte5 = temposRespostaHumana.filter((tempo) => tempo <= 5).length;
  const slaAte15 = temposRespostaHumana.filter((tempo) => tempo > 5 && tempo <= 15).length;
  const slaAcima15 = temposRespostaHumana.filter((tempo) => tempo > 15).length;
  const totalSla = temposRespostaHumana.length;

  const rotuloEntrada =
    nicho.codigo === "imobiliaria"
      ? "Leads hoje"
      : nicho.codigo === "medicina" || nicho.codigo === "odontologia"
        ? "Pacientes hoje"
        : "Contatos hoje";

  return (
    <>
      <Header
        title="Painel ao vivo"
        subtitle="Acompanhe a operação de hoje, a fila e a carga da equipe em tempo quase real."
      />

      <main className={reportStyles.pageContent}>
        <section className={`${reportStyles.hero} ${styles.liveHero}`}>
          <div className={reportStyles.heroCopy}>
            <div className={reportStyles.heroEyebrow}>
              <Radio size={16} />
              <span>Operação ao vivo · Hoje</span>
            </div>
            <h2>{empresa?.nome_fantasia || "Sua empresa"}</h2>
            <p>
              Estoque atual de conversas e desempenho da equipe desde 00:00, separados para facilitar decisões durante o expediente.
            </p>
          </div>
          <div className={styles.liveHeroStatus}>
            <span>{formatarAgora(agora)}</span>
            <LiveRefresh />
          </div>
        </section>

        <section className={reportStyles.kpiGrid} aria-label="Indicadores ao vivo">
          <article className={`${reportStyles.kpiCard} ${filaAcima15 > 0 ? styles.kpiAttention : ""}`}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><Users size={18} /></span>
              <span className={styles.stateLabel}>AGORA</span>
            </div>
            <p>Na fila</p>
            <strong>{formatarInteiro(filaAgora.length)}</strong>
            <small>{filaAcima15} aguardando há 15 min ou mais · mediana {formatarDuracao(medianaFila)}</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><UserRoundCheck size={18} /></span>
              <span className={styles.stateLabel}>AGORA</span>
            </div>
            <p>Em atendimento</p>
            <strong>{formatarInteiro(emAtendimentoAgora)}</strong>
            <small>{atendentesAtivosAgora} atendentes com conversas ativas</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><MessageCircleMore size={18} /></span>
              <span className={styles.todayLabel}>HOJE</span>
            </div>
            <p>Atendidos pela equipe</p>
            <strong>{formatarInteiro(protocolosComHumano.size)}</strong>
            <small>{formatarInteiro(mensagensHumanasHoje.length)} mensagens humanas registradas</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><Clock3 size={18} /></span>
              <span className={styles.todayLabel}>HOJE</span>
            </div>
            <p>Resposta humana</p>
            <strong>{formatarDuracao(medianaRespostaHumana)}</strong>
            <small>Mediana · média {formatarDuracao(mediaRespostaHumana)}</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><Activity size={18} /></span>
              <span className={styles.todayLabel}>HOJE</span>
            </div>
            <p>{rotuloEntrada}</p>
            <strong>{formatarInteiro(entradasHoje)}</strong>
            <small>{formatarInteiro(novosHoje)} novos contatos no período</small>
          </article>

          <article className={`${reportStyles.kpiCard} ${semRespostaHumana > 0 ? styles.kpiWarning : ""}`}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><TimerReset size={18} /></span>
              <span className={styles.todayLabel}>HOJE</span>
            </div>
            <p>Sem resposta humana</p>
            <strong>{formatarInteiro(semRespostaHumana)}</strong>
            <small>{formatarPercentual(percentual(semRespostaHumana, protocolosComEntradaHoje.size))} dos protocolos com entrada hoje</small>
          </article>

          <article className={`${reportStyles.kpiCard} ${encerradosSemConversao > 0 ? styles.kpiWarning : ""}`}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><XCircle size={18} /></span>
              <span className={styles.todayLabel}>HOJE</span>
            </div>
            <p>Encerradas sem conversão</p>
            <strong>{formatarInteiro(encerradosSemConversao)}</strong>
            <small>{encerradosHoje} encerramentos registrados hoje</small>
          </article>

          <article className={reportStyles.kpiCard}>
            <div className={reportStyles.kpiTop}>
              <span className={reportStyles.kpiIcon}><CheckCircle2 size={18} /></span>
              <span className={styles.todayLabel}>HOJE</span>
            </div>
            <p>Conversões</p>
            <strong>{formatarInteiro(conversoesHoje)}</strong>
            <small>{formatarPercentual(percentual(convertidosEncerrados, encerradosHoje))} dos encerramentos do dia</small>
          </article>
        </section>

        <section className={styles.livePrimaryGrid}>
          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Ritmo do dia</span>
                <h3>Entradas, atendimentos e encerramentos por hora</h3>
              </div>
              <span className={reportStyles.panelBadge}>00h → {String(horaAtual).padStart(2, "0")}h</span>
            </div>

            <div className={styles.hourChartWrap}>
              <div className={styles.hourChart}>
                {ritmo.map((item) => (
                  <div className={styles.hourColumn} key={item.hora}>
                    <div className={styles.barGroup}>
                      <span
                        className={`${styles.hourBar} ${styles.barEntry}`}
                        style={{ height: `${item.entradas ? Math.max(4, (item.entradas / maiorRitmo) * 100) : 0}%` }}
                        title={`${item.entradas} entradas às ${item.hora}h`}
                      />
                      <span
                        className={`${styles.hourBar} ${styles.barHuman}`}
                        style={{ height: `${item.atendidos ? Math.max(4, (item.atendidos / maiorRitmo) * 100) : 0}%` }}
                        title={`${item.atendidos} atendimentos humanos às ${item.hora}h`}
                      />
                      <span
                        className={`${styles.hourBar} ${styles.barClosed}`}
                        style={{ height: `${item.encerrados ? Math.max(4, (item.encerrados / maiorRitmo) * 100) : 0}%` }}
                        title={`${item.encerrados} encerramentos às ${item.hora}h`}
                      />
                    </div>
                    <span className={styles.hourLabel}>{String(item.hora).padStart(2, "0")}h</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.chartLegend}>
              <span><i className={styles.legendEntry} /> Entradas</span>
              <span><i className={styles.legendHuman} /> Atendimento humano</span>
              <span><i className={styles.legendClosed} /> Encerramentos</span>
            </div>
          </article>

          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>SLA humano</span>
                <h3>Velocidade de resposta hoje</h3>
              </div>
              <span className={reportStyles.panelBadge}>{totalSla} respostas medidas</span>
            </div>

            <div className={styles.slaSummary}>
              <div><span>Mediana</span><strong>{formatarDuracao(medianaRespostaHumana)}</strong></div>
              <div><span>Média</span><strong>{formatarDuracao(mediaRespostaHumana)}</strong></div>
            </div>
            <div className={styles.slaList}>
              <div className={styles.slaRow}>
                <div><span>Até 5 min</span><b>{slaAte5}</b></div>
                <div className={styles.slaTrack}><span style={{ width: `${percentual(slaAte5, totalSla)}%` }} /></div>
              </div>
              <div className={styles.slaRow}>
                <div><span>5 a 15 min</span><b>{slaAte15}</b></div>
                <div className={styles.slaTrack}><span style={{ width: `${percentual(slaAte15, totalSla)}%` }} /></div>
              </div>
              <div className={`${styles.slaRow} ${styles.slaRisk}`}>
                <div><span>Acima de 15 min</span><b>{slaAcima15}</b></div>
                <div className={styles.slaTrack}><span style={{ width: `${percentual(slaAcima15, totalSla)}%` }} /></div>
              </div>
            </div>
          </article>
        </section>

        <section className={styles.liveSecondaryGrid}>
          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Fila agora</span>
                <h3>Quem está aguardando atendimento</h3>
              </div>
              <span className={filaAcima15 > 0 ? styles.warningBadge : reportStyles.panelBadge}>
                {filaAcima15 > 0 ? `${filaAcima15} acima de 15 min` : "Fila dentro do SLA"}
              </span>
            </div>

            {filaAgora.length ? (
              <div className={styles.queueList}>
                {filaAgora.slice(0, 8).map((conversa) => (
                  <div className={styles.queueItem} key={conversa.id}>
                    <span className={styles.queueAvatar}>{conversa.nome.trim().charAt(0).toUpperCase() || "C"}</span>
                    <div className={styles.queueMain}>
                      <strong>{conversa.nome}</strong>
                      <small>{conversa.setor} · última entrada {formatarHora(conversa.ultimaEntrada)}</small>
                    </div>
                    <div className={styles.queueTime}>
                      <span className={conversa.esperaMinutos >= 15 ? styles.timeRisk : undefined}>
                        {formatarDuracao(conversa.esperaMinutos)}
                      </span>
                      <small>aguardando</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportStyles.emptyState}>Nenhuma conversa aguardando atendimento neste momento.</div>
            )}
          </article>

          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Equipe</span>
                <h3>Carga por atendente</h3>
              </div>
              <span className={reportStyles.panelBadge}>{atendentesAtivosAgora} ativos agora</span>
            </div>

            {equipeOrdenada.length ? (
              <div className={styles.teamLiveList}>
                {equipeOrdenada.map((usuario) => (
                  <div className={styles.teamLiveItem} key={usuario.id}>
                    <span className={styles.teamAvatar}>{usuario.nome.trim().charAt(0).toUpperCase() || "U"}</span>
                    <div className={styles.teamIdentity}>
                      <strong>{usuario.nome}</strong>
                      <small>{usuario.protocolos.size} atendimentos hoje · {usuario.mensagens} mensagens</small>
                    </div>
                    <div className={styles.teamMetric}>
                      <b>{usuario.agora}</b>
                      <span>agora</span>
                    </div>
                    <div className={styles.teamMetric}>
                      <b>{formatarDuracao(mediana(usuario.temposResposta))}</b>
                      <span>resposta</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={reportStyles.emptyState}>Nenhum atendimento humano registrado hoje.</div>
            )}
          </article>
        </section>

        <section className={styles.outcomeGrid}>
          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Fechamentos do dia</span>
                <h3>Resultado dos atendimentos encerrados</h3>
              </div>
              <span className={reportStyles.panelBadge}>{encerradosHoje} encerrados</span>
            </div>
            <div className={styles.outcomeCards}>
              <div className={styles.outcomeCard}>
                <span>Convertidos</span>
                <strong>{convertidosEncerrados}</strong>
                <small>{formatarPercentual(percentual(convertidosEncerrados, encerradosHoje))}</small>
              </div>
              <div className={styles.outcomeCard}>
                <span>Qualificados</span>
                <strong>{encerradosQualificados}</strong>
                <small>{formatarPercentual(percentual(encerradosQualificados, encerradosHoje))}</small>
              </div>
              <div className={`${styles.outcomeCard} ${styles.outcomeDanger}`}>
                <span>Perdidos</span>
                <strong>{encerradosPerdidos}</strong>
                <small>{formatarPercentual(percentual(encerradosPerdidos, encerradosHoje))}</small>
              </div>
              <div className={`${styles.outcomeCard} ${styles.outcomeWarning}`}>
                <span>Sem conversão</span>
                <strong>{encerradosSemConversao}</strong>
                <small>{formatarPercentual(percentual(encerradosSemConversao, encerradosHoje))}</small>
              </div>
            </div>
          </article>

          <article className={reportStyles.panel}>
            <div className={reportStyles.panelHeader}>
              <div>
                <span className={reportStyles.sectionEyebrow}>Operação agora</span>
                <h3>Distribuição das conversas ativas</h3>
              </div>
              <Zap size={18} className={reportStyles.panelIcon} />
            </div>
            <div className={styles.liveStateList}>
              <div><span><i className={styles.stateQueue} /> Na fila</span><strong>{filaAgora.length}</strong></div>
              <div><span><i className={styles.stateHuman} /> Em atendimento humano</span><strong>{emAtendimentoAgora}</strong></div>
              <div><span><i className={styles.stateBot} /> Com bot</span><strong>{emBotAgora}</strong></div>
              <div><span><i className={styles.stateOther} /> Outras abertas</span><strong>{Math.max(0, conversasAtivas.length - filaAgora.length - emAtendimentoAgora - emBotAgora)}</strong></div>
            </div>
            {maiorEsperaFila !== null && maiorEsperaFila >= 15 ? (
              <div className={styles.operationalAlert}>
                <AlertTriangle size={18} />
                <div>
                  <strong>Maior espera atual: {formatarDuracao(maiorEsperaFila)}</strong>
                  <span>Priorize a fila para evitar deterioração do SLA de atendimento.</span>
                </div>
              </div>
            ) : (
              <div className={styles.operationalHealthy}>
                <CheckCircle2 size={18} />
                <div>
                  <strong>Fila operacional sob controle</strong>
                  <span>Nenhuma espera atual ultrapassou 15 minutos.</span>
                </div>
              </div>
            )}
          </article>
        </section>

        <section className={reportStyles.methodNote}>
          <div className={reportStyles.methodIcon}><Bot size={18} /></div>
          <div>
            <strong>Leitura operacional do dia</strong>
            <p>
              “Agora” usa o estado corrente das conversas. “Hoje” considera eventos desde 00:00 no horário de Brasília.
              Mensagens enviadas pelo WhatsApp Business em coexistência são contabilizadas como atendimento humano e atribuídas ao administrador da empresa quando não existe remetente do CRM identificado.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
