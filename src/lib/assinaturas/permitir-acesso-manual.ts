import { randomUUID } from "crypto";
import { calcularJanelaAssinatura } from "@/lib/assinaturas/status";
import { enviarPrimeiroAcesso } from "@/lib/auth/enviar-primeiro-acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const NICHO_PADRAO_ID = "10000000-0000-4000-8000-000000000001";

type Operador = {
  id: string;
  nome: string | null;
  email: string | null;
};

type LiberarAcessoManualInput = {
  identificadorLead: string;
  planoId: string;
  operador: Operador;
};

export class ErroLiberacaoAcessoManual extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErroLiberacaoAcessoManual";
    this.status = status;
  }
}

function normalizarEmail(valor: string | null | undefined) {
  return String(valor || "").trim().toLowerCase();
}

function limparTelefone(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "") || null;
}

function ehUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor
  );
}

function objetoJson(valor: unknown) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

async function buscarLead(identificador: string) {
  const valor = identificador.trim();

  if (!valor) {
    throw new ErroLiberacaoAcessoManual(
      "Informe o ID do lead ou o e-mail do cliente."
    );
  }

  let query = supabaseAdmin.from("leads_cadastro").select("*");

  if (ehUuid(valor)) {
    query = query.eq("id", valor);
  } else if (valor.includes("@")) {
    query = query.ilike("email", normalizarEmail(valor));
  } else {
    throw new ErroLiberacaoAcessoManual(
      "Informe um ID de lead válido ou um e-mail válido."
    );
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar lead: ${error.message}`);
  }

  if (!data) {
    throw new ErroLiberacaoAcessoManual("Lead não encontrado.", 404);
  }

  if (data.pago === true) {
    throw new ErroLiberacaoAcessoManual(
      "Este lead já possui pagamento confirmado e não pode receber outro pagamento manual.",
      409
    );
  }

  if (!normalizarEmail(data.email)) {
    throw new ErroLiberacaoAcessoManual(
      "O lead não possui e-mail válido para gerar o primeiro acesso."
    );
  }

  return data;
}

async function buscarPlano(planoId: string) {
  if (!planoId) {
    throw new ErroLiberacaoAcessoManual("Selecione um plano.");
  }

  const { data, error } = await supabaseAdmin
    .from("planos")
    .select(
      "id, nome, slug, preco_mensal_centavos, limite_tokens_ia, limite_usuarios, limite_integracoes_whatsapp, status"
    )
    .eq("id", planoId)
    .eq("status", "ativo")
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao buscar plano: ${error.message}`);
  }

  if (!data) {
    throw new ErroLiberacaoAcessoManual("Plano não encontrado ou inativo.", 404);
  }

  return data;
}

async function obterOuCriarEmpresa(params: { lead: any; planoId: string }) {
  const { lead, planoId } = params;

  if (lead.empresa_id) {
    const existente = await supabaseAdmin
      .from("empresas")
      .select("*")
      .eq("id", lead.empresa_id)
      .maybeSingle();

    if (existente.error) {
      throw new Error(`Erro ao buscar empresa do lead: ${existente.error.message}`);
    }

    if (existente.data) return existente.data;
  }

  const email = normalizarEmail(lead.email);
  const porEmail = await supabaseAdmin
    .from("empresas")
    .select("*")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (porEmail.error) {
    throw new Error(`Erro ao buscar empresa por e-mail: ${porEmail.error.message}`);
  }

  if (porEmail.data) return porEmail.data;

  const nomeEmpresa = String(lead.empresa || lead.nome || "Empresa Cliente").trim();
  const telefone = limparTelefone(lead.telefone);

  const criada = await supabaseAdmin
    .from("empresas")
    .insert({
      plano_id: planoId,
      nicho_id: lead.nicho_id ?? NICHO_PADRAO_ID,
      nome_fantasia: nomeEmpresa,
      razao_social: nomeEmpresa,
      email,
      telefone,
      nome_responsavel: lead.nome ?? null,
      status: "ativa",
      timezone: "America/Sao_Paulo",
      observacoes: "Criada automaticamente por liberação manual no módulo Empresas.",
      termo_aceite: lead.termo_aceite ?? false,
      termo_aceite_em: lead.termo_aceite_em ?? null,
      termo_aceite_ip: lead.termo_aceite_ip ?? null,
      termo_aceite_user_agent: lead.termo_aceite_user_agent ?? null,
      termo_aceite_versao: lead.termo_aceite_versao ?? null,
      politica_privacidade_versao: lead.politica_privacidade_versao ?? null,
      contrato_responsabilidades_versao:
        lead.contrato_responsabilidades_versao ?? null,
      termo_aceite_texto: lead.termo_aceite_texto ?? null,
    })
    .select("*")
    .single();

  if (criada.error || !criada.data) {
    throw new Error(
      `Erro ao criar empresa: ${criada.error?.message || "empresa não retornada"}`
    );
  }

  return criada.data;
}

export async function liberarAcessoManual(input: LiberarAcessoManualInput) {
  const [lead, plano] = await Promise.all([
    buscarLead(input.identificadorLead),
    buscarPlano(input.planoId),
  ]);

  const agora = new Date().toISOString();
  const referencia = `manual_${randomUUID()}`;
  const email = normalizarEmail(lead.email);
  const telefone = limparTelefone(lead.telefone);
  const empresa = await obterOuCriarEmpresa({ lead, planoId: plano.id });
  const janela = calcularJanelaAssinatura(agora);

  const metadataManual = {
    origem: "liberacao_manual_empresas",
    referencia,
    liberado_em: agora,
    operador_usuario_id: input.operador.id,
    operador_nome: input.operador.nome,
    operador_email: input.operador.email,
    lead_id: lead.id,
    plano_id: plano.id,
    plano_slug: plano.slug,
    plano_nome: plano.nome,
  };

  const pagamento = await supabaseAdmin
    .from("pagamentos")
    .insert({
      gateway: "manual",
      evento: "access.manual",
      transaction_id: referencia,
      status: "paid",
      metodo: "manual",
      valor: plano.preco_mensal_centavos ?? null,
      valor_liquido: plano.preco_mensal_centavos ?? null,
      customer_nome: lead.nome ?? null,
      customer_email: email,
      customer_telefone: telefone,
      offer_hash: `manual:${plano.slug}`,
      offer_titulo: `Plano ${plano.nome} - liberação manual`,
      offer_preco: plano.preco_mensal_centavos ?? null,
      paid_at: agora,
      lead_id: lead.id,
      empresa_id: empresa.id,
      payload: metadataManual,
      created_at: agora,
      updated_at: agora,
    })
    .select("id")
    .single();

  if (pagamento.error || !pagamento.data) {
    throw new Error(
      `Erro ao registrar pagamento manual: ${pagamento.error?.message || "pagamento não retornado"}`
    );
  }

  const atualizacaoEmpresa = await supabaseAdmin
    .from("empresas")
    .update({
      plano_id: plano.id,
      status: "ativa",
      assinatura_status: "ativa",
      assinatura_inicio_em: janela.inicioEm,
      assinatura_vencimento_em: janela.vencimentoEm,
      assinatura_bloqueio_em: janela.bloqueioEm,
      assinatura_renovada_em: janela.inicioEm,
      assinatura_gateway: "manual",
      assinatura_referencia: referencia,
      assinatura_metadata_json: metadataManual,
      assinatura_fluxos_pausados_em: null,
      updated_at: agora,
    })
    .eq("id", empresa.id);

  if (atualizacaoEmpresa.error) {
    throw new Error(
      `Erro ao ativar assinatura manual: ${atualizacaoEmpresa.error.message}`
    );
  }

  const tokens = await supabaseAdmin.rpc("renovar_tokens_assinatura_plano", {
    p_empresa_id: empresa.id,
    p_referencia: referencia,
    p_pago_em: agora,
    p_metadata_json: metadataManual,
  });

  if (tokens.error) {
    throw new Error(`Erro ao liberar tokens do plano: ${tokens.error.message}`);
  }

  const metadataLead = {
    ...objetoJson(lead.metadata_json),
    liberacao_manual: metadataManual,
  };

  const atualizacaoLead = await supabaseAdmin
    .from("leads_cadastro")
    .update({
      status: "pago",
      pago: true,
      pago_em: agora,
      empresa_id: empresa.id,
      plano_slug: plano.slug,
      tipo_oferta: "normal",
      metadata_json: metadataLead,
      updated_at: agora,
    })
    .eq("id", lead.id);

  if (atualizacaoLead.error) {
    throw new Error(`Erro ao atualizar lead: ${atualizacaoLead.error.message}`);
  }

  let emailEnviado = true;
  let avisoEmail: string | null = null;

  try {
    await enviarPrimeiroAcesso({
      email,
      nome: lead.nome || "Cliente",
      empresaId: empresa.id,
      telefone,
    });
  } catch (error) {
    emailEnviado = false;
    avisoEmail =
      error instanceof Error
        ? error.message
        : "Não foi possível enviar o e-mail de primeiro acesso.";
    console.error("[ACESSO MANUAL] Acesso liberado, mas o email falhou:", error);
  }

  return {
    lead: {
      id: lead.id,
      nome: lead.nome,
      email,
    },
    empresa: {
      id: empresa.id,
      nome: empresa.nome_fantasia,
    },
    plano: {
      id: plano.id,
      nome: plano.nome,
      slug: plano.slug,
    },
    pagamentoId: pagamento.data.id,
    referencia,
    emailEnviado,
    avisoEmail,
  };
}
