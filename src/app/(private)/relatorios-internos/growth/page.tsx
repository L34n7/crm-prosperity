import { Building2, CircleDollarSign, RefreshCw, TrendingUp, Users } from "lucide-react";
import Header from "@/components/Header";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import styles from "./growth.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

type GrowthPageProps = {
  searchParams?: Promise<SearchParams>;
};

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
  assinatura_inicio_em: string | null;
  assinatura_gateway: string | null;
  assinatura_referencia: string | null;
  assinatura_metadata_json: unknown | null;
  planos: PlanoRelacao;
};

type PagamentoRow = {
  empresa_id: string | null;
  status: string | null;
  paid_at: string | null;
  created_at: string;
  valor: number | null;
};

type OfertaRow = {
  id: string;
  plano_id: string | null;
  empresa_id: string | null;
  referencia: string | null;
  nome: string | null;
  metadata_json: unknown | null;
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
  cadastroEm: string;
  gateway: string;
  valorMensal: number | null;
  diasConversao: number;
};

const STATUS_PAGAMENTO_CONFIRMADO = ["paid", "approved", "completed", "succeeded"];

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const numero = new Intl.NumberFormat("pt-BR");
const data = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function parametro(params: SearchParams, chave: string) {
  const valor = params[chave];
  return Array.isArray(valor) ? valor[0] ?? "" : valor ?? "";
}

function inicioDoMes() {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));
  return new Date(`${mapa.get("year")}-${mapa.get("month")}-01T00:00:00-03:00`);
}

function inputData(valor: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(valor);
}

function resolverPeriodo(params: SearchParams) {
  const inicioPadrao = inicioDoMes();
  const fimPadrao = new Date();
  const inicioTexto = parametro(params, "inicio");
  const fimTexto = parametro(params, "fim");
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(inicioTexto)
    ? new Date(`${inicioTexto}T00:00:00-03:00`)
    : inicioPadrao;
  const fimBase = /^\d{4}-\d{2}-\d{2}$/.test(fimTexto)
    ? new Date(`${fimTexto}T23:59:59.999-03:00`)
    : fimPadrao;
  const fim = inicio <= fimBase ? fimBase : fimPadrao;
  const duracao = Math.max(1, fim.getTime() - inicio.getTime());
  const anteriorFim = new Date(inicio.getTime() - 1);
  const anteriorInicio = new Date(anteriorFim.getTime() - duracao);

  return {
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

function numeroMetadata(valor: unknown, profundidade = 0): number | null {
  if (profundidade > 3 || valor == null) return null;
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor === "string") {
    const limpo = valor.replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    const convertido = Number(limpo);
    return Number.isFinite(convertido) ? convertido : null;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const encontrado = numeroMetadata(item, profundidade + 1);
      if (encontrado != null) return encontrado;
    }
    return null;
  }
  if (typeof valor === "object") {
    const registro = valor as Record<string, unknown>;
    const chaves = ["valor_mensal", "preco_mensal", "valor", "preco", "amount", "unit_amount", "price"];
    for (const chave of chaves) {
      if (chave in registro) {
        const encontrado = numeroMetadata(registro[chave], profundidade + 1);
        if (encontrado != null) return chave.includes("amount") && encontrado > 1000 ? encontrado / 100 : encontrado;
      }
    }
  }
  return null;
}

function formatarStatus(status: string | null) {
  const texto = String(status || "").replace(/_/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Não informado";
}

function diferencaDias(inicio: string, fim: string) {
  const valor = new Date(fim).getTime() - new Date(inicio).getTime();
  return Math.max(0, Math.round(valor / 86400000));
}

function dataPagamento(pagamento: PagamentoRow) {
  return pagamento.paid_at || pagamento.created_at;
}

function valorPagamento(pagamento: PagamentoRow | undefined) {
  if (!pagamento || pagamento.valor == null) return null;
  return pagamento.valor / 100;
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
        assinatura_status, assinatura_inicio_em, assinatura_gateway,
        assinatura_referencia, assinatura_metadata_json,
        planos (id, nome, slug)
      `),
    supabase
      .from("pagamentos")
      .select("empresa_id, status, paid_at, created_at, valor")
      .not("empresa_id", "is", null)
      .in("status", STATUS_PAGAMENTO_CONFIRMADO)
      .lte("paid_at", periodo.fim.toISOString())
      .order("paid_at", { ascending: true })
      .limit(10000),
    supabase
      .from("ia_token_ofertas")
      .select("id, plano_id, empresa_id, referencia, nome, metadata_json")
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

  const clientes: ClienteGrowth[] = [];
  for (const [empresaId, pagamentosEmpresa] of pagamentosPorEmpresa) {
    const empresa = empresaPorId.get(empresaId);
    if (!empresa || pagamentosEmpresa.length === 0) continue;

    const primeiroPagamento = pagamentosEmpresa[0];
    const primeiroPagamentoEm = dataPagamento(primeiroPagamento);
    const plano = primeiroPlano(empresa.planos);
    const oferta = ofertas.find(
      (item) =>
        (empresa.assinatura_referencia && item.referencia === empresa.assinatura_referencia) ||
        (item.empresa_id && item.empresa_id === empresa.id) ||
        (item.plano_id && item.plano_id === empresa.plano_id)
    );
    const usuario = usuarioPorEmpresa.get(empresa.id);
    const valorMensal =
      valorPagamento(primeiroPagamento) ??
      numeroMetadata(empresa.assinatura_metadata_json) ??
      numeroMetadata(oferta?.metadata_json);

    clientes.push({
      id: empresa.id,
      empresa: nomeEmpresa(empresa),
      responsavel: usuario?.nome?.trim() || "Não informado",
      email: usuario?.email?.trim() || "Não informado",
      plano: plano?.nome?.trim() || oferta?.nome?.trim() || "Não informado",
      status: formatarStatus(empresa.assinatura_status),
      primeiroPagamentoEm,
      cadastroEm: empresa.created_at,
      gateway: empresa.assinatura_gateway?.trim() || primeiroPagamento.status || "Não informado",
      valorMensal,
      diasConversao: diferencaDias(empresa.created_at, primeiroPagamentoEm),
    });
  }

  clientes.sort(
    (a, b) => new Date(b.primeiroPagamentoEm).getTime() - new Date(a.primeiroPagamentoEm).getTime()
  );

  const noPeriodo = (valor: string, inicio: Date, fim: Date) => {
    const instante = new Date(valor).getTime();
    return instante >= inicio.getTime() && instante <= fim.getTime();
  };

  const atuais = clientes.filter((item) =>
    noPeriodo(item.primeiroPagamentoEm, periodo.inicio, periodo.fim)
  );
  const anteriores = clientes.filter((item) =>
    noPeriodo(item.primeiroPagamentoEm, periodo.anteriorInicio, periodo.anteriorFim)
  );

  const renovacoes = pagamentos.filter((pagamento) => {
    if (!pagamento.empresa_id) return false;
    const lista = pagamentosPorEmpresa.get(pagamento.empresa_id) ?? [];
    const primeiro = lista[0];
    if (!primeiro || primeiro === pagamento) return false;
    return noPeriodo(dataPagamento(pagamento), periodo.inicio, periodo.fim);
  });

  const receita = atuais.reduce((total, item) => total + (item.valorMensal ?? 0), 0);
  const clientesComValor = atuais.filter((item) => item.valorMensal != null);
  const ticketMedio = clientesComValor.length ? receita / clientesComValor.length : 0;
  const crescimento = anteriores.length
    ? ((atuais.length - anteriores.length) / anteriores.length) * 100
    : atuais.length
      ? 100
      : 0;
  const tempoMedio = atuais.length
    ? atuais.reduce((total, item) => total + item.diasConversao, 0) / atuais.length
    : 0;

  const porPlano = Array.from(
    atuais.reduce((mapa, item) => {
      const atual = mapa.get(item.plano) ?? { clientes: 0, receita: 0 };
      atual.clientes += 1;
      atual.receita += item.valorMensal ?? 0;
      mapa.set(item.plano, atual);
      return mapa;
    }, new Map<string, { clientes: number; receita: number }>())
  ).sort((a, b) => b[1].clientes - a[1].clientes);

  return (
    <>
      <Header
        title="Growth Analytics"
        subtitle="Acompanhe novos clientes pagantes, renovações e receita adicionada."
      />

      <main className={styles.page}>
        <section className={styles.filterPanel}>
          <div>
            <span className={styles.eyebrow}>Período analisado</span>
            <h2>Novos clientes e renovações</h2>
            <p>{data.format(periodo.inicio)} até {data.format(periodo.fim)}</p>
          </div>
          <form className={styles.filters} action="/relatorios-internos/growth">
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
          <article><Users size={21} /><span>Novos pagantes</span><strong>{numero.format(atuais.length)}</strong><small>{crescimento >= 0 ? "+" : ""}{crescimento.toFixed(1)}% vs. período anterior</small></article>
          <article><RefreshCw size={21} /><span>Renovações</span><strong>{numero.format(renovacoes.length)}</strong><small>Pagamentos posteriores ao primeiro</small></article>
          <article><CircleDollarSign size={21} /><span>Novo MRR identificado</span><strong>{moeda.format(receita)}</strong><small>{clientesComValor.length} clientes com valor localizado</small></article>
          <article><TrendingUp size={21} /><span>Ticket médio inicial</span><strong>{moeda.format(ticketMedio)}</strong><small>Tempo médio de conversão: {tempoMedio.toFixed(1)} dias</small></article>
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Distribuição</span><h2>Novos clientes por plano</h2></div></div>
            {porPlano.length === 0 ? <p className={styles.empty}>Nenhum novo cliente pagante no período.</p> : (
              <div className={styles.planList}>{porPlano.map(([plano, resumo]) => (
                <div key={plano} className={styles.planRow}>
                  <div><strong>{plano}</strong><small>{numero.format(resumo.clientes)} cliente(s)</small></div>
                  <strong>{moeda.format(resumo.receita)}</strong>
                </div>
              ))}</div>
            )}
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Leitura rápida</span><h2>Comparativo do período</h2></div><Building2 size={20} /></div>
            <div className={styles.comparison}>
              <div><span>Novos atuais</span><strong>{atuais.length}</strong></div>
              <div><span>Novos anteriores</span><strong>{anteriores.length}</strong></div>
              <div><span>Renovações atuais</span><strong>{renovacoes.length}</strong></div>
            </div>
            <p className={styles.note}>Novo cliente é definido pelo primeiro pagamento confirmado da empresa. Qualquer pagamento confirmado posterior é classificado como renovação.</p>
          </article>
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Detalhamento</span><h2>Clientes com primeiro pagamento no período</h2></div><span className={styles.badge}>{atuais.length} registros</span></div>
          {atuais.length === 0 ? <p className={styles.empty}>Nenhum cliente novo encontrado para o período selecionado.</p> : (
            <div className={styles.tableWrapper}>
              <table>
                <thead><tr><th>Primeiro pagamento</th><th>Empresa</th><th>Responsável</th><th>Plano</th><th>MRR</th><th>Conversão</th><th>Status</th></tr></thead>
                <tbody>{atuais.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>{data.format(new Date(cliente.primeiroPagamentoEm))}</td>
                    <td><strong>{cliente.empresa}</strong><small>{cliente.gateway}</small></td>
                    <td>{cliente.responsavel}<small>{cliente.email}</small></td>
                    <td>{cliente.plano}</td>
                    <td>{cliente.valorMensal == null ? "Não identificado" : moeda.format(cliente.valorMensal)}</td>
                    <td>{cliente.diasConversao} dias</td>
                    <td><span className={styles.status}>{cliente.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
