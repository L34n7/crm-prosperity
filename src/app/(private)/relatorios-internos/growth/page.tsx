import {
  Building2,
  CircleDollarSign,
  CreditCard,
  RefreshCw,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import Header from "@/components/Header";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import styles from "./growth.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

type GrowthPageProps = {
  searchParams?: Promise<SearchParams>;
};

type AtalhoPeriodo =
  | "7d"
  | "15d"
  | "mes_atual"
  | "mes_passado"
  | "30d"
  | "3m"
  | "personalizado";

type PlanoRelacao =
  | { id?: string | null; nome?: string | null; slug?: string | null }
  | Array<{ id?: string | null; nome?: string | null; slug?: string | null }>
  | null;

type EmpresaGrowthRow = {
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
  empresa_id: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string;
  valor: number | null;
  offer_hash: string | null;
  offer_titulo: string | null;
};

type OfertaRow = {
  plano_id: string | null;
  empresa_id: string | null;
  referencia: string | null;
  nome: string | null;
};

type UsuarioRow = {
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  created_at: string;
};

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
const TIME_ZONE = "America/Sao_Paulo";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const numero = new Intl.NumberFormat("pt-BR");
const data = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function parametro(params: SearchParams, chave: string) {
  const valor = params[chave];
  return Array.isArray(valor) ? valor[0] ?? "" : valor ?? "";
}

function dataSaoPaulo(ano: number, mes: number, dia: number, fimDoDia = false) {
  const texto = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return new Date(`${texto}T${fimDoDia ? "23:59:59.999" : "00:00:00"}-03:00`);
}

function partesAgora() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));
  return {
    ano: Number(mapa.get("year")),
    mes: Number(mapa.get("month")),
    dia: Number(mapa.get("day")),
  };
}

function inputData(valor: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(valor);
}

function normalizarAtalho(valor: string): AtalhoPeriodo {
  const validos: AtalhoPeriodo[] = [
    "7d",
    "15d",
    "mes_atual",
    "mes_passado",
    "30d",
    "3m",
    "personalizado",
  ];
  return validos.includes(valor as AtalhoPeriodo)
    ? (valor as AtalhoPeriodo)
    : "mes_atual";
}

function resolverPeriodo(params: SearchParams) {
  const atalho = normalizarAtalho(parametro(params, "atalho"));
  const agora = new Date();
  const { ano, mes, dia } = partesAgora();
  let inicio: Date;
  let fim: Date;

  if (atalho === "personalizado") {
    const inicioTexto = parametro(params, "inicio");
    const fimTexto = parametro(params, "fim");
    inicio = /^\d{4}-\d{2}-\d{2}$/.test(inicioTexto)
      ? new Date(`${inicioTexto}T00:00:00-03:00`)
      : dataSaoPaulo(ano, mes, 1);
    const fimInformado = /^\d{4}-\d{2}-\d{2}$/.test(fimTexto)
      ? new Date(`${fimTexto}T23:59:59.999-03:00`)
      : agora;
    fim = inicio <= fimInformado ? fimInformado : agora;
  } else if (atalho === "mes_passado") {
    const primeiroMesAtual = dataSaoPaulo(ano, mes, 1);
    fim = new Date(primeiroMesAtual.getTime() - 1);
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(fim);
    const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));
    inicio = dataSaoPaulo(Number(mapa.get("year")), Number(mapa.get("month")), 1);
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

  return {
    atalho,
    inicio,
    fim,
    anteriorInicio,
    anteriorFim,
    inicioInput: inputData(inicio),
    fimInput: inputData(fim),
  };
}

function primeiroPlano(planos: PlanoRelacao) {
  return Array.isArray(planos) ? planos[0] ?? null : planos;
}

function nomeEmpresa(empresa: EmpresaGrowthRow) {
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

function rotuloPlano(
  empresa: EmpresaGrowthRow,
  pagamento: PagamentoRow,
  oferta: OfertaRow | undefined
) {
  const planoBase = primeiroPlano(empresa.planos)?.nome?.trim() || "Plano não informado";
  const valor = valorPagamento(pagamento);
  const titulo = pagamento.offer_titulo?.trim() || oferta?.nome?.trim() || "";

  if (valor === 0) return `${planoBase} — Gratuito`;
  if (valor > 0) return `${planoBase} — ${moeda.format(valor)}`;
  return titulo && titulo.toLowerCase() !== planoBase.toLowerCase()
    ? `${planoBase} — ${titulo}`
    : planoBase;
}

export default async function GrowthAnalyticsPage({ searchParams }: GrowthPageProps) {
  const params = (await searchParams) ?? {};
  const periodo = resolverPeriodo(params);
  const supabase = getSupabaseAdmin();

  const [
    { data: empresasData, error: empresasError },
    { data: pagamentosData, error: pagamentosError },
    { data: ofertasData },
    { data: usuariosData },
  ] = await Promise.all([
    supabase
      .from("empresas")
      .select(`
        id, nome_fantasia, razao_social, created_at, plano_id,
        assinatura_status, assinatura_gateway, assinatura_referencia,
        planos (id, nome, slug)
      `),
    supabase
      .from("pagamentos")
      .select("empresa_id, status, paid_at, created_at, valor, offer_hash, offer_titulo")
      .not("empresa_id", "is", null)
      .in("status", STATUS_PAGAMENTO_CONFIRMADO)
      .order("paid_at", { ascending: true })
      .limit(20000),
    supabase
      .from("ia_token_ofertas")
      .select("plano_id, empresa_id, referencia, nome")
      .eq("tipo", "mensalidade")
      .eq("ativa", true),
    supabase
      .from("usuarios")
      .select("empresa_id, nome, email, created_at")
      .order("created_at", { ascending: true }),
  ]);

  if (empresasError) console.error("[growth-analytics] Erro ao carregar empresas", empresasError);
  if (pagamentosError) console.error("[growth-analytics] Erro ao carregar pagamentos", pagamentosError);

  const empresas = (empresasData ?? []) as EmpresaGrowthRow[];
  const pagamentos = (pagamentosData ?? []) as PagamentoRow[];
  const ofertas = (ofertasData ?? []) as OfertaRow[];
  const usuarios = (usuariosData ?? []) as UsuarioRow[];

  const empresaPorId = new Map(empresas.map((empresa) => [empresa.id, empresa]));
  const usuarioPorEmpresa = new Map<string, UsuarioRow>();
  for (const usuario of usuarios) {
    if (usuario.empresa_id && !usuarioPorEmpresa.has(usuario.empresa_id)) {
      usuarioPorEmpresa.set(usuario.empresa_id, usuario);
    }
  }

  const pagamentosPorEmpresa = new Map<string, PagamentoRow[]>();
  for (const pagamento of pagamentos) {
    if (!pagamento.empresa_id) continue;
    const lista = pagamentosPorEmpresa.get(pagamento.empresa_id) ?? [];
    lista.push(pagamento);
    pagamentosPorEmpresa.set(pagamento.empresa_id, lista);
  }

  const encontrarOferta = (empresa: EmpresaGrowthRow, pagamento: PagamentoRow) =>
    ofertas.find(
      (oferta) =>
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
    const oferta = encontrarOferta(empresa, primeiroPagamento);

    clientes.push({
      id: empresa.id,
      empresa: nomeEmpresa(empresa),
      responsavel: usuario?.nome?.trim() || "Não informado",
      email: usuario?.email?.trim() || "Não informado",
      plano: rotuloPlano(empresa, primeiroPagamento, oferta),
      status: formatarStatus(empresa.assinatura_status),
      primeiroPagamentoEm,
      gateway: empresa.assinatura_gateway?.trim() || "Não informado",
      valorMensal: valorPagamento(primeiroPagamento),
      diasConversao: diferencaDias(empresa.created_at, primeiroPagamentoEm),
    });
  }

  clientes.sort(
    (a, b) =>
      new Date(b.primeiroPagamentoEm).getTime() -
      new Date(a.primeiroPagamentoEm).getTime()
  );

  const atuais = clientes.filter((cliente) =>
    noPeriodo(cliente.primeiroPagamentoEm, periodo.inicio, periodo.fim)
  );
  const anteriores = clientes.filter((cliente) =>
    noPeriodo(cliente.primeiroPagamentoEm, periodo.anteriorInicio, periodo.anteriorFim)
  );
  const pagamentosPeriodo = pagamentos.filter((pagamento) =>
    noPeriodo(dataPagamento(pagamento), periodo.inicio, periodo.fim)
  );
  const renovacoes = pagamentosPeriodo.filter((pagamento) => {
    if (!pagamento.empresa_id) return false;
    const primeiro = pagamentosPorEmpresa.get(pagamento.empresa_id)?.[0];
    return Boolean(primeiro && primeiro !== pagamento);
  });

  const novoMrr = atuais.reduce((total, cliente) => total + cliente.valorMensal, 0);
  const receitaPeriodo = pagamentosPeriodo.reduce(
    (total, pagamento) => total + valorPagamento(pagamento),
    0
  );
  const totalHistorico = pagamentos.reduce(
    (total, pagamento) => total + valorPagamento(pagamento),
    0
  );
  const ticketMedio = atuais.length ? novoMrr / atuais.length : 0;
  const crescimento = anteriores.length
    ? ((atuais.length - anteriores.length) / anteriores.length) * 100
    : atuais.length
      ? 100
      : 0;
  const tempoMedio = atuais.length
    ? atuais.reduce((total, cliente) => total + cliente.diasConversao, 0) / atuais.length
    : 0;

  const porPlano = Array.from(
    atuais.reduce((mapa, cliente) => {
      const resumo = mapa.get(cliente.plano) ?? { clientes: 0, receita: 0 };
      resumo.clientes += 1;
      resumo.receita += cliente.valorMensal;
      mapa.set(cliente.plano, resumo);
      return mapa;
    }, new Map<string, { clientes: number; receita: number }>())
  ).sort((a, b) => b[1].receita - a[1].receita);

  return (
    <>
      <Header
        title="Growth Analytics"
        subtitle="Acompanhe novos clientes, renovações e pagamentos confirmados."
      />

      <main className={styles.page}>
        <section className={styles.filterPanel}>
          <div className={styles.filterIntro}>
            <span className={styles.eyebrow}>Período analisado</span>
            <h2>Novos clientes e receita</h2>
            <p>{data.format(periodo.inicio)} até {data.format(periodo.fim)}</p>
          </div>

          <form className={styles.filters} action="/relatorios-internos/growth">
            <label className={styles.shortcutField}>
              Atalho
              <span>
                <select name="atalho" defaultValue={periodo.atalho}>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="15d">Últimos 15 dias</option>
                  <option value="mes_atual">Mês atual</option>
                  <option value="mes_passado">Mês passado</option>
                  <option value="30d">Últimos 30 dias</option>
                  <option value="3m">Últimos 3 meses</option>
                  <option value="personalizado">Período personalizado</option>
                </select>
              </span>
            </label>
            <label>
              Início
              <span><input type="date" name="inicio" defaultValue={periodo.inicioInput} /></span>
            </label>
            <label>
              Fim
              <span><input type="date" name="fim" defaultValue={periodo.fimInput} /></span>
            </label>
            <button type="submit">Aplicar período</button>
          </form>
        </section>

        <section className={styles.kpis}>
          <article>
            <Users size={21} />
            <span>Novos pagantes</span>
            <strong>{numero.format(atuais.length)}</strong>
            <small>{crescimento >= 0 ? "+" : ""}{crescimento.toFixed(1)}% vs. período anterior</small>
          </article>
          <article>
            <RefreshCw size={21} />
            <span>Renovações</span>
            <strong>{numero.format(renovacoes.length)}</strong>
            <small>Pagamentos posteriores ao primeiro</small>
          </article>
          <article>
            <CircleDollarSign size={21} />
            <span>Novo MRR</span>
            <strong>{moeda.format(novoMrr)}</strong>
            <small>Primeiros pagamentos no período</small>
          </article>
          <article>
            <CreditCard size={21} />
            <span>Receita do período</span>
            <strong>{moeda.format(receitaPeriodo)}</strong>
            <small>{numero.format(pagamentosPeriodo.length)} pagamentos confirmados</small>
          </article>
          <article>
            <WalletCards size={21} />
            <span>Total geral recebido</span>
            <strong>{moeda.format(totalHistorico)}</strong>
            <small>Todos os pagamentos, independente do filtro</small>
          </article>
          <article>
            <TrendingUp size={21} />
            <span>Ticket médio inicial</span>
            <strong>{moeda.format(ticketMedio)}</strong>
            <small>Conversão média: {tempoMedio.toFixed(1)} dias</small>
          </article>
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Distribuição</span>
                <h2>Novos clientes por plano e valor</h2>
              </div>
            </div>
            {porPlano.length === 0 ? (
              <p className={styles.empty}>Nenhum novo cliente pagante no período.</p>
            ) : (
              <div className={styles.planList}>
                {porPlano.map(([plano, resumo]) => (
                  <div key={plano} className={styles.planRow}>
                    <div>
                      <strong>{plano}</strong>
                      <small>{numero.format(resumo.clientes)} cliente(s)</small>
                    </div>
                    <strong>{moeda.format(resumo.receita)}</strong>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>Leitura rápida</span>
                <h2>Comparativo do período</h2>
              </div>
              <Building2 size={20} />
            </div>
            <div className={styles.comparison}>
              <div><span>Novos atuais</span><strong>{atuais.length}</strong></div>
              <div><span>Novos anteriores</span><strong>{anteriores.length}</strong></div>
              <div><span>Renovações atuais</span><strong>{renovacoes.length}</strong></div>
            </div>
            <p className={styles.note}>
              “Receita do período” respeita o filtro. “Total geral recebido” soma todo o histórico
              de pagamentos confirmados e não muda quando o período é alterado.
            </p>
          </article>
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Detalhamento</span>
              <h2>Clientes com primeiro pagamento no período</h2>
            </div>
            <span className={styles.badge}>{atuais.length} registros</span>
          </div>
          {atuais.length === 0 ? (
            <p className={styles.empty}>Nenhum cliente novo encontrado para o período selecionado.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table>
                <thead>
                  <tr>
                    <th>Primeiro pagamento</th>
                    <th>Empresa</th>
                    <th>Responsável</th>
                    <th>Plano / valor</th>
                    <th>MRR</th>
                    <th>Conversão</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {atuais.map((cliente) => (
                    <tr key={cliente.id}>
                      <td>{data.format(new Date(cliente.primeiroPagamentoEm))}</td>
                      <td><strong>{cliente.empresa}</strong><small>{cliente.gateway}</small></td>
                      <td>{cliente.responsavel}<small>{cliente.email}</small></td>
                      <td>{cliente.plano}</td>
                      <td>{moeda.format(cliente.valorMensal)}</td>
                      <td>{cliente.diasConversao} dias</td>
                      <td><span className={styles.status}>{cliente.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
