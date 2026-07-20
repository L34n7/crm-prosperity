import Header from "@/components/Header";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import GrowthKpiCards, { type GrowthCardData, type GrowthDetailRow } from "./GrowthKpiCards";
import styles from "./growth.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type GrowthPageProps = { searchParams?: Promise<SearchParams> };
type AtalhoPeriodo = "7d" | "15d" | "mes_atual" | "mes_passado" | "30d" | "3m" | "personalizado";
type PlanoRelacao = { id?: string | null; nome?: string | null; slug?: string | null } | Array<{ id?: string | null; nome?: string | null; slug?: string | null }> | null;

type EmpresaRow = {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  created_at: string;
  plano_id: string | null;
  assinatura_status: string | null;
  assinatura_gateway: string | null;
  assinatura_referencia: string | null;
  planos: PlanoRelacao;
};

type PagamentoRow = {
  id: string;
  empresa_id: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string;
  valor: number | null;
  offer_hash: string | null;
  offer_titulo: string | null;
  metodo: string | null;
};

type OfertaRow = { plano_id: string | null; empresa_id: string | null; referencia: string | null; nome: string | null };
type UsuarioRow = { empresa_id: string | null; nome: string | null; email: string | null; created_at: string };
type ClienteGrowth = {
  id: string;
  empresa: string;
  responsavel: string;
  email: string;
  plano: string;
  status: string;
  primeiroPagamentoEm: string;
  gateway: string;
  valorMensal: number;
  diasConversao: number;
};

const STATUS_PAGAMENTO_CONFIRMADO = ["paid", "approved", "completed", "succeeded"];
const STATUS_RENOVACAO = ["ativa", "ativo", "regular", "vencida", "vencido", "bloqueada", "bloqueado"];
const TIME_ZONE = "America/Sao_Paulo";
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = new Intl.NumberFormat("pt-BR");
const data = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });

function parametro(params: SearchParams, chave: string) {
  const valor = params[chave];
  return Array.isArray(valor) ? valor[0] ?? "" : valor ?? "";
}

function dataSaoPaulo(ano: number, mes: number, dia: number, fimDoDia = false) {
  const texto = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return new Date(`${texto}T${fimDoDia ? "23:59:59.999" : "00:00:00"}-03:00`);
}

function partesData(valor = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(valor);
  const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));
  return { ano: Number(mapa.get("year")), mes: Number(mapa.get("month")), dia: Number(mapa.get("day")) };
}

function inputData(valor: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(valor);
}

function normalizarAtalho(valor: string): AtalhoPeriodo {
  const validos: AtalhoPeriodo[] = ["7d", "15d", "mes_atual", "mes_passado", "30d", "3m", "personalizado"];
  return validos.includes(valor as AtalhoPeriodo) ? (valor as AtalhoPeriodo) : "mes_atual";
}

function resolverPeriodo(params: SearchParams) {
  const atalho = normalizarAtalho(parametro(params, "atalho"));
  const agora = new Date();
  const { ano, mes, dia } = partesData(agora);
  let inicio: Date;
  let fim: Date;

  if (atalho === "personalizado") {
    const inicioTexto = parametro(params, "inicio");
    const fimTexto = parametro(params, "fim");
    inicio = /^\d{4}-\d{2}-\d{2}$/.test(inicioTexto) ? new Date(`${inicioTexto}T00:00:00-03:00`) : dataSaoPaulo(ano, mes, 1);
    const fimInformado = /^\d{4}-\d{2}-\d{2}$/.test(fimTexto) ? new Date(`${fimTexto}T23:59:59.999-03:00`) : agora;
    fim = inicio <= fimInformado ? fimInformado : agora;
  } else if (atalho === "mes_passado") {
    const primeiroAtual = dataSaoPaulo(ano, mes, 1);
    fim = new Date(primeiroAtual.getTime() - 1);
    const anterior = partesData(fim);
    inicio = dataSaoPaulo(anterior.ano, anterior.mes, 1);
  } else if (atalho === "mes_atual") {
    inicio = dataSaoPaulo(ano, mes, 1);
    fim = agora;
  } else {
    fim = dataSaoPaulo(ano, mes, dia, true);
    const dias = atalho === "7d" ? 7 : atalho === "15d" ? 15 : atalho === "30d" ? 30 : 90;
    inicio = new Date(fim.getTime() - (dias - 1) * 86400000);
  }

  const duracao = Math.max(1, fim.getTime() - inicio.getTime());
  const anteriorFim = new Date(inicio.getTime() - 1);
  const anteriorInicio = new Date(anteriorFim.getTime() - duracao);
  return { atalho, inicio, fim, anteriorInicio, anteriorFim, inicioInput: inputData(inicio), fimInput: inputData(fim) };
}

function primeiroPlano(planos: PlanoRelacao) {
  return Array.isArray(planos) ? planos[0] ?? null : planos;
}

function nomeEmpresa(empresa: EmpresaRow) {
  return empresa.nome_fantasia?.trim() || empresa.razao_social?.trim() || "Empresa sem nome";
}

function dataPagamento(pagamento: PagamentoRow) {
  return pagamento.paid_at || pagamento.created_at;
}

function valorPagamento(pagamento: PagamentoRow | undefined) {
  return pagamento?.valor == null ? 0 : pagamento.valor / 100;
}

function formatarStatus(status: string | null) {
  const texto = String(status || "").replace(/_/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Não informado";
}

function noPeriodo(valor: string, inicio: Date, fim: Date) {
  const instante = new Date(valor).getTime();
  return instante >= inicio.getTime() && instante <= fim.getTime();
}

function diferencaDias(inicio: string, fim: string) {
  return Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000));
}

function rotuloPlano(empresa: EmpresaRow, pagamento: PagamentoRow, oferta: OfertaRow | undefined) {
  const planoBase = primeiroPlano(empresa.planos)?.nome?.trim() || "Plano não informado";
  const valor = valorPagamento(pagamento);
  const titulo = pagamento.offer_titulo?.trim() || oferta?.nome?.trim() || "";
  if (valor === 0) return `${planoBase} — Gratuito`;
  if (valor > 0) return `${planoBase} — ${moeda.format(valor)}`;
  return titulo && titulo.toLowerCase() !== planoBase.toLowerCase() ? `${planoBase} — ${titulo}` : planoBase;
}

export default async function GrowthAnalyticsPage({ searchParams }: GrowthPageProps) {
  const params = (await searchParams) ?? {};
  const periodo = resolverPeriodo(params);
  const supabase = getSupabaseAdmin();

  const [{ data: empresasData }, { data: pagamentosData }, { data: ofertasData }, { data: usuariosData }] = await Promise.all([
    supabase.from("empresas").select(`id, nome_fantasia, razao_social, created_at, plano_id, assinatura_status, assinatura_gateway, assinatura_referencia, planos (id, nome, slug)`),
    supabase.from("pagamentos").select("id, empresa_id, status, paid_at, created_at, valor, offer_hash, offer_titulo, metodo").not("empresa_id", "is", null).in("status", STATUS_PAGAMENTO_CONFIRMADO).order("paid_at", { ascending: true }).limit(20000),
    supabase.from("ia_token_ofertas").select("plano_id, empresa_id, referencia, nome").eq("tipo", "mensalidade").eq("ativa", true),
    supabase.from("usuarios").select("empresa_id, nome, email, created_at").order("created_at", { ascending: true }),
  ]);

  const empresas = (empresasData ?? []) as EmpresaRow[];
  const pagamentos = (pagamentosData ?? []) as PagamentoRow[];
  const ofertas = (ofertasData ?? []) as OfertaRow[];
  const usuarios = (usuariosData ?? []) as UsuarioRow[];
  const empresaPorId = new Map(empresas.map((empresa) => [empresa.id, empresa]));
  const usuarioPorEmpresa = new Map<string, UsuarioRow>();
  for (const usuario of usuarios) if (usuario.empresa_id && !usuarioPorEmpresa.has(usuario.empresa_id)) usuarioPorEmpresa.set(usuario.empresa_id, usuario);

  const pagamentosPorEmpresa = new Map<string, PagamentoRow[]>();
  for (const pagamento of pagamentos) {
    if (!pagamento.empresa_id) continue;
    const lista = pagamentosPorEmpresa.get(pagamento.empresa_id) ?? [];
    lista.push(pagamento);
    pagamentosPorEmpresa.set(pagamento.empresa_id, lista);
  }

  const encontrarOferta = (empresa: EmpresaRow, pagamento: PagamentoRow) => ofertas.find((oferta) =>
    (pagamento.offer_hash && oferta.referencia === pagamento.offer_hash) ||
    (empresa.assinatura_referencia && oferta.referencia === empresa.assinatura_referencia) ||
    (oferta.empresa_id && oferta.empresa_id === empresa.id)
  );

  const clientes: ClienteGrowth[] = [];
  for (const [empresaId, pagamentosEmpresa] of pagamentosPorEmpresa) {
    const empresa = empresaPorId.get(empresaId);
    if (!empresa || pagamentosEmpresa.length === 0) continue;
    const primeiroPagamento = pagamentosEmpresa[0];
    const primeiroPagamentoEm = dataPagamento(primeiroPagamento);
    const usuario = usuarioPorEmpresa.get(empresa.id);
    clientes.push({
      id: empresa.id,
      empresa: nomeEmpresa(empresa),
      responsavel: usuario?.nome?.trim() || "Não informado",
      email: usuario?.email?.trim() || "Não informado",
      plano: rotuloPlano(empresa, primeiroPagamento, encontrarOferta(empresa, primeiroPagamento)),
      status: formatarStatus(empresa.assinatura_status),
      primeiroPagamentoEm,
      gateway: empresa.assinatura_gateway?.trim() || "Não informado",
      valorMensal: valorPagamento(primeiroPagamento),
      diasConversao: diferencaDias(empresa.created_at, primeiroPagamentoEm),
    });
  }

  const atuais = clientes.filter((cliente) => noPeriodo(cliente.primeiroPagamentoEm, periodo.inicio, periodo.fim));
  const anteriores = clientes.filter((cliente) => noPeriodo(cliente.primeiroPagamentoEm, periodo.anteriorInicio, periodo.anteriorFim));
  const pagamentosPeriodo = pagamentos.filter((pagamento) => noPeriodo(dataPagamento(pagamento), periodo.inicio, periodo.fim));
  const renovacoes = pagamentosPeriodo.filter((pagamento) => pagamento.empresa_id && pagamentosPorEmpresa.get(pagamento.empresa_id)?.[0] !== pagamento);

  const agoraPartes = partesData();
  const inicioMesAtual = dataSaoPaulo(agoraPartes.ano, agoraPartes.mes, 1);
  const fimMesAtual = new Date();
  const fimMesPassado = new Date(inicioMesAtual.getTime() - 1);
  const anteriorPartes = partesData(fimMesPassado);
  const inicioMesPassado = dataSaoPaulo(anteriorPartes.ano, anteriorPartes.mes, 1);

  const pagadoresMesAtual = new Set(
    pagamentos.filter((p) => p.empresa_id && noPeriodo(dataPagamento(p), inicioMesAtual, fimMesAtual)).map((p) => p.empresa_id as string)
  );

  const aguardandoRenovacao = empresas.flatMap((empresa) => {
    const status = String(empresa.assinatura_status || "").trim().toLowerCase();
    if (!STATUS_RENOVACAO.includes(status) || pagadoresMesAtual.has(empresa.id)) return [];
    const pagamentosEmpresa = pagamentosPorEmpresa.get(empresa.id) ?? [];
    const ultimoMesPassado = [...pagamentosEmpresa].reverse().find((p) => noPeriodo(dataPagamento(p), inicioMesPassado, fimMesPassado));
    if (!ultimoMesPassado || valorPagamento(ultimoMesPassado) <= 0) return [];
    return [{ empresa, pagamento: ultimoMesPassado }];
  });

  const novoMrr = atuais.reduce((total, cliente) => total + cliente.valorMensal, 0);
  const receitaPeriodo = pagamentosPeriodo.reduce((total, pagamento) => total + valorPagamento(pagamento), 0);
  const totalHistorico = pagamentos.reduce((total, pagamento) => total + valorPagamento(pagamento), 0);
  const ticketMedio = atuais.length ? novoMrr / atuais.length : 0;
  const crescimento = anteriores.length ? ((atuais.length - anteriores.length) / anteriores.length) * 100 : atuais.length ? 100 : 0;
  const tempoMedio = atuais.length ? atuais.reduce((total, cliente) => total + cliente.diasConversao, 0) / atuais.length : 0;

  const detalheCliente = (cliente: ClienteGrowth): GrowthDetailRow => ({
    id: cliente.id,
    empresa: cliente.empresa,
    responsavel: cliente.responsavel,
    email: cliente.email,
    plano: cliente.plano,
    data: data.format(new Date(cliente.primeiroPagamentoEm)),
    valor: moeda.format(cliente.valorMensal),
    status: cliente.status,
  });

  const detalhePagamento = (pagamento: PagamentoRow): GrowthDetailRow => {
    const empresa = pagamento.empresa_id ? empresaPorId.get(pagamento.empresa_id) : undefined;
    const usuario = pagamento.empresa_id ? usuarioPorEmpresa.get(pagamento.empresa_id) : undefined;
    return {
      id: pagamento.id,
      empresa: empresa ? nomeEmpresa(empresa) : "Empresa não localizada",
      responsavel: usuario?.nome || "Não informado",
      email: usuario?.email || "",
      plano: empresa ? rotuloPlano(empresa, pagamento, encontrarOferta(empresa, pagamento)) : pagamento.offer_titulo || "Não informado",
      data: data.format(new Date(dataPagamento(pagamento))),
      valor: moeda.format(valorPagamento(pagamento)),
      status: formatarStatus(pagamento.status),
    };
  };

  const renovacaoDetalhes: GrowthDetailRow[] = aguardandoRenovacao.map(({ empresa, pagamento }) => {
    const usuario = usuarioPorEmpresa.get(empresa.id);
    return {
      id: empresa.id,
      empresa: nomeEmpresa(empresa),
      responsavel: usuario?.nome || "Não informado",
      email: usuario?.email || "",
      plano: rotuloPlano(empresa, pagamento, encontrarOferta(empresa, pagamento)),
      data: data.format(new Date(dataPagamento(pagamento))),
      valor: moeda.format(valorPagamento(pagamento)),
      status: formatarStatus(empresa.assinatura_status),
    };
  });

  const cards: GrowthCardData[] = [
    { id: "novos", label: "Novos pagantes", value: numero.format(atuais.length), detail: `${crescimento >= 0 ? "+" : ""}${crescimento.toFixed(1)}% vs. período anterior`, icon: "users", modalTitle: "Novos pagantes", modalDescription: "Empresas cujo primeiro pagamento confirmado ocorreu no período selecionado.", rows: atuais.map(detalheCliente) },
    { id: "renovacoes", label: "Renovações", value: numero.format(renovacoes.length), detail: "Pagamentos posteriores ao primeiro", icon: "refresh", modalTitle: "Renovações do período", modalDescription: "Pagamentos confirmados posteriores ao primeiro pagamento da empresa.", rows: renovacoes.map(detalhePagamento) },
    { id: "novo-mrr", label: "Novo MRR", value: moeda.format(novoMrr), detail: "Primeiros pagamentos no período", icon: "money", modalTitle: "Novo MRR", modalDescription: "Valor mensal adicionado pelos novos clientes do período.", rows: atuais.map(detalheCliente) },
    { id: "receita", label: "Receita do período", value: moeda.format(receitaPeriodo), detail: `${numero.format(pagamentosPeriodo.length)} pagamentos confirmados`, icon: "card", modalTitle: "Receita do período", modalDescription: "Todos os pagamentos confirmados dentro do filtro selecionado.", rows: pagamentosPeriodo.map(detalhePagamento) },
    { id: "historico", label: "Total geral recebido", value: moeda.format(totalHistorico), detail: "Todos os pagamentos, independente do filtro", icon: "wallet", modalTitle: "Total geral recebido", modalDescription: "Histórico completo de pagamentos confirmados.", rows: pagamentos.map(detalhePagamento).reverse() },
    { id: "ticket", label: "Ticket médio inicial", value: moeda.format(ticketMedio), detail: `Conversão média: ${tempoMedio.toFixed(1)} dias`, icon: "trend", modalTitle: "Ticket médio inicial", modalDescription: "Novos clientes usados no cálculo do ticket médio do período.", rows: atuais.map(detalheCliente) },
    { id: "aguardando-renovacao", label: "Aguardando renovação", value: numero.format(renovacaoDetalhes.length), detail: "Pagaram no mês passado e ainda não renovaram", icon: "alert", modalTitle: "Aguardando renovação", modalDescription: "Clientes pagos no mês passado, com cobrança maior que zero e sem pagamento confirmado no mês atual. Inclui assinaturas ativas, vencidas e bloqueadas.", rows: renovacaoDetalhes },
  ];

  const porPlano = Array.from(atuais.reduce((mapa, cliente) => {
    const resumo = mapa.get(cliente.plano) ?? { clientes: 0, receita: 0 };
    resumo.clientes += 1;
    resumo.receita += cliente.valorMensal;
    mapa.set(cliente.plano, resumo);
    return mapa;
  }, new Map<string, { clientes: number; receita: number }>())).sort((a, b) => b[1].receita - a[1].receita);

  return (
    <>
      <Header title="Growth Analytics" subtitle="Acompanhe novos clientes, renovações pendentes e pagamentos confirmados." />
      <main className={styles.page}>
        <section className={styles.filterPanel}>
          <div className={styles.filterIntro}>
            <span className={styles.eyebrow}>Período analisado</span>
            <h2>Novos clientes e receita</h2>
            <p>{data.format(periodo.inicio)} até {data.format(periodo.fim)}</p>
          </div>
          <form className={styles.filters} action="/relatorios-internos/growth">
            <label className={styles.shortcutField}>Atalho<span><select name="atalho" defaultValue={periodo.atalho}><option value="7d">Últimos 7 dias</option><option value="15d">Últimos 15 dias</option><option value="mes_atual">Mês atual</option><option value="mes_passado">Mês passado</option><option value="30d">Últimos 30 dias</option><option value="3m">Últimos 3 meses</option><option value="personalizado">Período personalizado</option></select></span></label>
            <label>Início<span><input type="date" name="inicio" defaultValue={periodo.inicioInput} /></span></label>
            <label>Fim<span><input type="date" name="fim" defaultValue={periodo.fimInput} /></span></label>
            <button type="submit">Aplicar período</button>
          </form>
        </section>

        <GrowthKpiCards cards={cards} />

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Distribuição</span><h2>Novos clientes por plano e valor</h2></div></div>
            {porPlano.length === 0 ? <p className={styles.empty}>Nenhum novo cliente pagante no período.</p> : <div className={styles.planList}>{porPlano.map(([plano, resumo]) => <div key={plano} className={styles.planRow}><div><strong>{plano}</strong><small>{numero.format(resumo.clientes)} cliente(s)</small></div><strong>{moeda.format(resumo.receita)}</strong></div>)}</div>}
          </article>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Leitura rápida</span><h2>Comparativo do período</h2></div></div>
            <div className={styles.comparison}><div><span>Novos atuais</span><strong>{atuais.length}</strong></div><div><span>Novos anteriores</span><strong>{anteriores.length}</strong></div><div><span>Aguardando renovação</span><strong>{renovacaoDetalhes.length}</strong></div></div>
            <p className={styles.note}>Clique em qualquer card para consultar a lista detalhada que compõe o indicador.</p>
          </article>
        </section>
      </main>
    </>
  );
}
