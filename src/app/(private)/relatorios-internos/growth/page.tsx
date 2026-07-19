import { Building2, CircleDollarSign, TrendingUp, Users } from "lucide-react";
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
  assinatura_vencimento_em: string | null;
  assinatura_gateway: string | null;
  assinatura_referencia: string | null;
  assinatura_metadata_json: unknown | null;
  planos: PlanoRelacao;
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
  inicioEm: string;
  cadastroEm: string;
  gateway: string;
  valorMensal: number | null;
  diasConversao: number;
};

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
  return new Date(agora.getFullYear(), agora.getMonth(), 1);
}

function inputData(valor: Date) {
  const ano = valor.getFullYear();
  const mes = String(valor.getMonth() + 1).padStart(2, "0");
  const dia = String(valor.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
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

function statusPagante(status: string | null) {
  const valor = String(status || "").trim().toLowerCase();
  return ["ativa", "ativo", "regular", "vencida", "inadimplente", "bloqueada"].includes(valor);
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

function formatarStatus(status: string) {
  const texto = status.replace(/_/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Não informado";
}

function diferencaDias(inicio: string, fim: string) {
  const valor = new Date(fim).getTime() - new Date(inicio).getTime();
  return Math.max(0, Math.round(valor / 86400000));
}

function montarClientes(
  empresas: EmpresaGrowthRow[],
  ofertas: OfertaRow[],
  usuarios: UsuarioRow[]
): ClienteGrowth[] {
  const usuarioPorEmpresa = new Map<string, UsuarioRow>();
  for (const usuario of usuarios) {
    if (usuario.empresa_id && !usuarioPorEmpresa.has(usuario.empresa_id)) {
      usuarioPorEmpresa.set(usuario.empresa_id, usuario);
    }
  }

  return empresas
    .filter((empresa) => empresa.assinatura_inicio_em && statusPagante(empresa.assinatura_status))
    .map((empresa) => {
      const plano = primeiroPlano(empresa.planos);
      const oferta = ofertas.find(
        (item) =>
          (empresa.assinatura_referencia && item.referencia === empresa.assinatura_referencia) ||
          (item.empresa_id && item.empresa_id === empresa.id) ||
          (item.plano_id && item.plano_id === empresa.plano_id)
      );
      const usuario = usuarioPorEmpresa.get(empresa.id);
      const valorMensal =
        numeroMetadata(empresa.assinatura_metadata_json) ?? numeroMetadata(oferta?.metadata_json);

      return {
        id: empresa.id,
        empresa: nomeEmpresa(empresa),
        responsavel: usuario?.nome?.trim() || "Não informado",
        email: usuario?.email?.trim() || "Não informado",
        plano: plano?.nome?.trim() || oferta?.nome?.trim() || "Não informado",
        status: formatarStatus(empresa.assinatura_status || ""),
        inicioEm: empresa.assinatura_inicio_em as string,
        cadastroEm: empresa.created_at,
        gateway: empresa.assinatura_gateway?.trim() || "Não informado",
        valorMensal,
        diasConversao: diferencaDias(empresa.created_at, empresa.assinatura_inicio_em as string),
      };
    })
    .sort((a, b) => new Date(b.inicioEm).getTime() - new Date(a.inicioEm).getTime());
}

export default async function GrowthAnalyticsPage({ searchParams }: GrowthPageProps) {
  const params = (await searchParams) ?? {};
  const periodo = resolverPeriodo(params);
  const supabase = getSupabaseAdmin();

  const [{ data: empresasData, error: empresasError }, { data: ofertasData }, { data: usuariosData }] =
    await Promise.all([
      supabase
        .from("empresas")
        .select(`
          id, nome_fantasia, razao_social, created_at, plano_id,
          assinatura_status, assinatura_inicio_em, assinatura_vencimento_em,
          assinatura_gateway, assinatura_referencia, assinatura_metadata_json,
          planos (id, nome, slug)
        `)
        .not("assinatura_inicio_em", "is", null)
        .gte("assinatura_inicio_em", periodo.anteriorInicio.toISOString())
        .lte("assinatura_inicio_em", periodo.fim.toISOString())
        .order("assinatura_inicio_em", { ascending: false }),
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

  if (empresasError) {
    console.error("[growth-analytics] Erro ao carregar empresas", empresasError);
  }

  const clientes = montarClientes(
    (empresasData ?? []) as EmpresaGrowthRow[],
    (ofertasData ?? []) as OfertaRow[],
    (usuariosData ?? []) as UsuarioRow[]
  );
  const atuais = clientes.filter((item) => {
    const instante = new Date(item.inicioEm).getTime();
    return instante >= periodo.inicio.getTime() && instante <= periodo.fim.getTime();
  });
  const anteriores = clientes.filter((item) => {
    const instante = new Date(item.inicioEm).getTime();
    return instante >= periodo.anteriorInicio.getTime() && instante <= periodo.anteriorFim.getTime();
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
        subtitle="Acompanhe novos clientes pagantes, receita adicionada e velocidade de conversão."
      />

      <main className={styles.page}>
        <section className={styles.filterPanel}>
          <div>
            <span className={styles.eyebrow}>Período analisado</span>
            <h2>Novos clientes pagantes</h2>
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
          <article><CircleDollarSign size={21} /><span>Novo MRR identificado</span><strong>{moeda.format(receita)}</strong><small>{clientesComValor.length} clientes com valor localizado</small></article>
          <article><TrendingUp size={21} /><span>Ticket médio inicial</span><strong>{moeda.format(ticketMedio)}</strong><small>Baseado nos valores identificados</small></article>
          <article><Building2 size={21} /><span>Tempo para conversão</span><strong>{tempoMedio.toFixed(1)} dias</strong><small>Do cadastro ao início da assinatura</small></article>
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
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Leitura rápida</span><h2>Comparativo do período</h2></div></div>
            <div className={styles.comparison}>
              <div><span>Período atual</span><strong>{atuais.length}</strong></div>
              <div><span>Período anterior</span><strong>{anteriores.length}</strong></div>
              <div><span>Variação líquida</span><strong>{atuais.length - anteriores.length >= 0 ? "+" : ""}{atuais.length - anteriores.length}</strong></div>
            </div>
            <p className={styles.note}>O relatório usa o primeiro início de assinatura registrado na empresa. Renovações não são contadas como novos clientes.</p>
          </article>
        </section>

        <section className={styles.tablePanel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>Detalhamento</span><h2>Clientes que começaram a pagar</h2></div><span className={styles.badge}>{atuais.length} registros</span></div>
          {atuais.length === 0 ? <p className={styles.empty}>Nenhum cliente encontrado para o período selecionado.</p> : (
            <div className={styles.tableWrapper}>
              <table>
                <thead><tr><th>Início</th><th>Empresa</th><th>Responsável</th><th>Plano</th><th>MRR</th><th>Conversão</th><th>Status</th></tr></thead>
                <tbody>{atuais.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>{data.format(new Date(cliente.inicioEm))}</td>
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
