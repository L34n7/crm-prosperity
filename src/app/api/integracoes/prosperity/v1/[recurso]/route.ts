import { NextRequest, NextResponse } from "next/server";
import {
  autenticarProsperityApi,
  lerPaginacao,
  objetoSeguro,
  prosperityApiSupabase,
  respostaLista,
  respostaProsperityErro,
  textoOuNull,
  type ProsperityApiScope,
} from "@/lib/integracoes/prosperity-external-api";

type LeadRow = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  empresa: string | null;
  plano_slug: string | null;
  status: string | null;
  pago: boolean | null;
  pago_em: string | null;
  empresa_id: string | null;
  created_at: string;
  updated_at: string;
};

type PagamentoRow = {
  id: string;
  empresa_id: string | null;
  lead_id: string | null;
  gateway: string | null;
  evento: string | null;
  transaction_id: string | null;
  status: string | null;
  metodo: string | null;
  valor: number | null;
  valor_liquido: number | null;
  customer_id: string | null;
  customer_nome: string | null;
  customer_email: string | null;
  customer_telefone: string | null;
  offer_hash: string | null;
  offer_titulo: string | null;
  offer_preco: number | null;
  paid_at: string | null;
  refunded_at: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

type EmpresaRow = {
  id: string;
  plano_id: string | null;
  nome_fantasia: string | null;
  razao_social: string | null;
  email: string | null;
  telefone: string | null;
  nome_responsavel: string | null;
  status: string | null;
  timezone: string | null;
  assinatura_status: string | null;
  assinatura_inicio_em: string | null;
  assinatura_vencimento_em: string | null;
  assinatura_bloqueio_em: string | null;
  assinatura_renovada_em: string | null;
  assinatura_gateway: string | null;
  assinatura_referencia: string | null;
  created_at: string;
  updated_at: string;
};

type PlanoRow = {
  id: string;
  nome: string | null;
  slug: string | null;
};

type OnboardingRow = {
  id: string;
  empresa_id: string;
  nome_conexao: string | null;
  numero: string | null;
  status: string | null;
  phone_number_status: string | null;
  onboarding_etapa: string | null;
  onboarding_status: string | null;
  onboarding_erro: string | null;
  setup_completed_at: string | null;
  payment_method_added: boolean | null;
  phone_registered: boolean | null;
  app_assigned: boolean | null;
  webhook_verificado: boolean | null;
  modo_integracao: string | null;
  coex_status: string | null;
  created_at: string;
  updated_at: string;
};

const RECURSOS: Record<string, ProsperityApiScope> = {
  clientes: "leads:read",
  pagamentos: "pagamentos:read",
  "carrinhos-abandonados": "pagamentos:read",
  assinaturas: "assinaturas:read",
  onboardings: "onboarding:read",
};

function valorBooleano(valor: string | null) {
  if (valor == null || valor === "") return null;
  if (["1", "true", "sim", "yes"].includes(valor.toLowerCase())) return true;
  if (["0", "false", "nao", "não", "no"].includes(valor.toLowerCase())) return false;
  return null;
}

function contatoDoCliente(empresa: EmpresaRow, lead?: LeadRow | null) {
  return {
    nome: lead?.nome || empresa.nome_responsavel || empresa.nome_fantasia,
    email: lead?.email || empresa.email,
    telefone: lead?.telefone || empresa.telefone,
    origem: lead ? "lead_cadastro" : "empresa",
  };
}

async function buscarLeads(ids: string[]) {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const mapa = new Map<string, LeadRow>();
  if (!unicos.length) return mapa;

  const { data, error } = await prosperityApiSupabase
    .from("leads_cadastro")
    .select(
      "id,nome,email,telefone,empresa,plano_slug,status,pago,pago_em,empresa_id,created_at,updated_at",
    )
    .in("id", unicos);

  if (error) throw new Error(error.message);
  for (const item of (data || []) as LeadRow[]) mapa.set(item.id, item);
  return mapa;
}

async function buscarLeadMaisRecentePorEmpresa(empresaIds: string[]) {
  const unicos = Array.from(new Set(empresaIds.filter(Boolean)));
  const mapa = new Map<string, LeadRow>();
  if (!unicos.length) return mapa;

  const { data, error } = await prosperityApiSupabase
    .from("leads_cadastro")
    .select(
      "id,nome,email,telefone,empresa,plano_slug,status,pago,pago_em,empresa_id,created_at,updated_at",
    )
    .in("empresa_id", unicos)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  for (const item of (data || []) as LeadRow[]) {
    if (item.empresa_id && !mapa.has(item.empresa_id)) mapa.set(item.empresa_id, item);
  }
  return mapa;
}

async function buscarEmpresas(ids: string[]) {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const mapa = new Map<string, EmpresaRow>();
  if (!unicos.length) return mapa;

  const { data, error } = await prosperityApiSupabase
    .from("empresas")
    .select(
      "id,plano_id,nome_fantasia,razao_social,email,telefone,nome_responsavel,status,timezone,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em,assinatura_renovada_em,assinatura_gateway,assinatura_referencia,created_at,updated_at",
    )
    .in("id", unicos);

  if (error) throw new Error(error.message);
  for (const item of (data || []) as EmpresaRow[]) mapa.set(item.id, item);
  return mapa;
}

async function buscarPlanos(ids: string[]) {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const mapa = new Map<string, PlanoRow>();
  if (!unicos.length) return mapa;

  const { data, error } = await prosperityApiSupabase
    .from("planos")
    .select("id,nome,slug")
    .in("id", unicos);

  if (error) throw new Error(error.message);
  for (const item of (data || []) as PlanoRow[]) mapa.set(item.id, item);
  return mapa;
}

async function buscarLeadsComPagamentoPago(leadIds: string[]) {
  const unicos = Array.from(new Set(leadIds.filter(Boolean)));
  const pagos = new Set<string>();
  if (!unicos.length) return pagos;

  const { data, error } = await prosperityApiSupabase
    .from("pagamentos")
    .select("lead_id")
    .in("lead_id", unicos)
    .eq("status", "paid");

  if (error) throw new Error(error.message);
  for (const item of data || []) {
    if (item.lead_id) pagos.add(String(item.lead_id));
  }
  return pagos;
}

async function listarClientes(request: NextRequest) {
  const { limite, pagina, inicio, fim } = lerPaginacao(request);
  const params = request.nextUrl.searchParams;

  let query = prosperityApiSupabase
    .from("leads_cadastro")
    .select(
      "id,nome,email,telefone,empresa,plano_slug,status,pago,pago_em,empresa_id,created_at,updated_at",
      { count: "exact" },
    );

  const pago = valorBooleano(params.get("pago"));
  if (pago != null) query = query.eq("pago", pago);
  if (params.get("status")) query = query.eq("status", params.get("status")!);
  if (params.get("empresa_id")) query = query.eq("empresa_id", params.get("empresa_id")!);
  if (params.get("criado_desde")) query = query.gte("created_at", params.get("criado_desde")!);
  if (params.get("atualizado_desde")) query = query.gte("updated_at", params.get("atualizado_desde")!);

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(inicio, fim);
  if (error) throw new Error(error.message);

  return respostaLista(
    "clientes",
    (data || []) as LeadRow[],
    pagina,
    limite,
    count,
  );
}

async function listarPagamentos(request: NextRequest, somenteAbandonos = false) {
  const { limite, pagina, inicio, fim } = lerPaginacao(request);
  const params = request.nextUrl.searchParams;

  let query = prosperityApiSupabase
    .from("pagamentos")
    .select(
      "id,empresa_id,lead_id,gateway,evento,transaction_id,status,metodo,valor,valor_liquido,customer_id,customer_nome,customer_email,customer_telefone,offer_hash,offer_titulo,offer_preco,paid_at,refunded_at,payload,created_at,updated_at",
      { count: "exact" },
    );

  if (somenteAbandonos) query = query.contains("payload", { event: "cart.abandoned" });
  if (params.get("status")) query = query.eq("status", params.get("status")!);
  if (params.get("metodo")) query = query.eq("metodo", params.get("metodo")!);
  if (params.get("lead_id")) query = query.eq("lead_id", params.get("lead_id")!);
  if (params.get("empresa_id")) query = query.eq("empresa_id", params.get("empresa_id")!);
  if (params.get("criado_desde")) query = query.gte("created_at", params.get("criado_desde")!);
  if (params.get("atualizado_desde")) query = query.gte("updated_at", params.get("atualizado_desde")!);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(inicio, fim);
  if (error) throw new Error(error.message);

  const pagamentos = (data || []) as PagamentoRow[];
  const leadIds = pagamentos.map((item) => item.lead_id || "").filter(Boolean);
  const [leads, leadsComPagamentoPago] = await Promise.all([
    buscarLeads(leadIds),
    buscarLeadsComPagamentoPago(leadIds),
  ]);

  const itens = pagamentos.map((item) => {
    const payload = objetoSeguro(item.payload);
    const lead = item.lead_id ? leads.get(item.lead_id) || null : null;
    const pagoAtualmente = Boolean(
      item.status === "paid" ||
        lead?.pago === true ||
        (item.lead_id && leadsComPagamentoPago.has(item.lead_id)),
    );

    return {
      id: item.id,
      empresa_id: item.empresa_id,
      lead_id: item.lead_id,
      gateway: item.gateway,
      evento: item.evento || textoOuNull(payload.event),
      transaction_id: item.transaction_id,
      status: item.status,
      metodo: item.metodo,
      valor_centavos: item.valor,
      valor_liquido_centavos: item.valor_liquido,
      pago_atualmente: pagoAtualmente,
      pago_em: item.paid_at,
      reembolsado_em: item.refunded_at,
      cliente: {
        nome: lead?.nome || item.customer_nome,
        email: lead?.email || item.customer_email,
        telefone: lead?.telefone || item.customer_telefone,
        status: lead?.status || null,
        pago: lead?.pago ?? null,
      },
      oferta: {
        hash: item.offer_hash,
        titulo: item.offer_titulo,
        preco_centavos: item.offer_preco,
      },
      checkout_url: textoOuNull(payload.checkout_url),
      abandoned_id: textoOuNull(payload.abandoned_id),
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  });

  return respostaLista(
    somenteAbandonos ? "carrinhos_abandonados" : "pagamentos",
    itens,
    pagina,
    limite,
    count,
    somenteAbandonos
      ? {
          observacao:
            "Use pago_atualmente = false antes de realizar recuperação de carrinho. O evento histórico pode pertencer a um cliente que pagou posteriormente.",
        }
      : undefined,
  );
}

async function listarAssinaturas(request: NextRequest) {
  const { limite, pagina, inicio, fim } = lerPaginacao(request);
  const params = request.nextUrl.searchParams;

  let query = prosperityApiSupabase
    .from("empresas")
    .select(
      "id,plano_id,nome_fantasia,razao_social,email,telefone,nome_responsavel,status,timezone,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em,assinatura_renovada_em,assinatura_gateway,assinatura_referencia,created_at,updated_at",
      { count: "exact" },
    );

  if (params.get("status")) query = query.eq("assinatura_status", params.get("status")!);
  if (params.get("empresa_id")) query = query.eq("id", params.get("empresa_id")!);
  if (params.get("vencimento_desde")) query = query.gte("assinatura_vencimento_em", params.get("vencimento_desde")!);
  if (params.get("vencimento_ate")) query = query.lte("assinatura_vencimento_em", params.get("vencimento_ate")!);
  if (params.get("atualizado_desde")) query = query.gte("updated_at", params.get("atualizado_desde")!);

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(inicio, fim);
  if (error) throw new Error(error.message);

  const empresas = (data || []) as EmpresaRow[];
  const [leadsPorEmpresa, planos] = await Promise.all([
    buscarLeadMaisRecentePorEmpresa(empresas.map((item) => item.id)),
    buscarPlanos(empresas.map((item) => item.plano_id || "").filter(Boolean)),
  ]);

  const itens = empresas.map((empresa) => {
    const lead = leadsPorEmpresa.get(empresa.id) || null;
    const plano = empresa.plano_id ? planos.get(empresa.plano_id) || null : null;

    return {
      empresa_id: empresa.id,
      nome: empresa.nome_fantasia || empresa.razao_social,
      status_empresa: empresa.status,
      assinatura_status: empresa.assinatura_status,
      assinatura_inicio_em: empresa.assinatura_inicio_em,
      assinatura_vencimento_em: empresa.assinatura_vencimento_em,
      assinatura_bloqueio_em: empresa.assinatura_bloqueio_em,
      assinatura_renovada_em: empresa.assinatura_renovada_em,
      assinatura_gateway: empresa.assinatura_gateway,
      assinatura_referencia: empresa.assinatura_referencia,
      plano: plano ? { id: plano.id, nome: plano.nome, slug: plano.slug } : null,
      contato: contatoDoCliente(empresa, lead),
      created_at: empresa.created_at,
      updated_at: empresa.updated_at,
    };
  });

  return respostaLista("assinaturas", itens, pagina, limite, count);
}

async function listarOnboardings(request: NextRequest) {
  const { limite, pagina, inicio, fim } = lerPaginacao(request);
  const params = request.nextUrl.searchParams;

  let query = prosperityApiSupabase
    .from("integracoes_whatsapp")
    .select(
      "id,empresa_id,nome_conexao,numero,status,phone_number_status,onboarding_etapa,onboarding_status,onboarding_erro,setup_completed_at,payment_method_added,phone_registered,app_assigned,webhook_verificado,modo_integracao,coex_status,created_at,updated_at",
      { count: "exact" },
    );

  if (params.get("status")) query = query.eq("onboarding_status", params.get("status")!);
  if (params.get("etapa")) query = query.eq("onboarding_etapa", params.get("etapa")!);
  if (params.get("empresa_id")) query = query.eq("empresa_id", params.get("empresa_id")!);
  if (params.get("atualizado_desde")) query = query.gte("updated_at", params.get("atualizado_desde")!);

  const concluido = valorBooleano(params.get("concluido"));
  if (concluido === true) query = query.not("setup_completed_at", "is", null);
  if (concluido === false) query = query.is("setup_completed_at", null);

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(inicio, fim);
  if (error) throw new Error(error.message);

  const onboardings = (data || []) as OnboardingRow[];
  const empresaIds = onboardings.map((item) => item.empresa_id);
  const [empresas, leadsPorEmpresa] = await Promise.all([
    buscarEmpresas(empresaIds),
    buscarLeadMaisRecentePorEmpresa(empresaIds),
  ]);

  const itens = onboardings.map((item) => {
    const empresa = empresas.get(item.empresa_id) || null;
    const lead = leadsPorEmpresa.get(item.empresa_id) || null;

    return {
      integracao_id: item.id,
      empresa_id: item.empresa_id,
      empresa: empresa
        ? {
            nome: empresa.nome_fantasia || empresa.razao_social,
            status: empresa.status,
            assinatura_status: empresa.assinatura_status,
          }
        : null,
      contato: empresa
        ? contatoDoCliente(empresa, lead)
        : {
            nome: lead?.nome || null,
            email: lead?.email || null,
            telefone: lead?.telefone || null,
            origem: lead ? "lead_cadastro" : null,
          },
      nome_conexao: item.nome_conexao,
      numero: item.numero,
      status_integracao: item.status,
      phone_number_status: item.phone_number_status,
      onboarding_status: item.onboarding_status,
      onboarding_etapa: item.onboarding_etapa,
      onboarding_erro: item.onboarding_erro,
      concluido: Boolean(item.setup_completed_at),
      setup_completed_at: item.setup_completed_at,
      payment_method_added: item.payment_method_added,
      phone_registered: item.phone_registered,
      app_assigned: item.app_assigned,
      webhook_verificado: item.webhook_verificado,
      modo_integracao: item.modo_integracao,
      coex_status: item.coex_status,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  });

  return respostaLista("onboarding", itens, pagina, limite, count);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recurso: string }> },
) {
  const { recurso } = await params;
  const scope = RECURSOS[recurso];

  if (!scope) {
    return NextResponse.json(
      {
        ok: false,
        error: "Recurso não encontrado.",
        recursos_disponiveis: Object.keys(RECURSOS),
      },
      { status: 404 },
    );
  }

  const auth = await autenticarProsperityApi(request, scope);
  if (!auth.ok) return auth.response;

  try {
    if (recurso === "clientes") return await listarClientes(request);
    if (recurso === "pagamentos") return await listarPagamentos(request, false);
    if (recurso === "carrinhos-abandonados") return await listarPagamentos(request, true);
    if (recurso === "assinaturas") return await listarAssinaturas(request);
    if (recurso === "onboardings") return await listarOnboardings(request);

    return NextResponse.json({ ok: false, error: "Recurso não suportado." }, { status: 404 });
  } catch (error) {
    return respostaProsperityErro(error);
  }
}
