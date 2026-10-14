import { randomUUID } from "crypto";
import { calcularJanelaAssinatura } from "@/lib/assinaturas/status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

type OperadorRenovacaoManual = {
  id: string;
  nome: string | null;
  email: string | null;
};

type RenovarAssinaturaManualInput = {
  empresaId: string;
  valorCentavos: number;
  operador: OperadorRenovacaoManual;
};

export class ErroRenovacaoAssinaturaManual extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErroRenovacaoAssinaturaManual";
    this.status = status;
  }
}

function objetoJson(valor: unknown) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function telefoneLimpo(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "") || null;
}

export async function renovarAssinaturaManual(
  input: RenovarAssinaturaManualInput
) {
  if (
    !Number.isSafeInteger(input.valorCentavos) ||
    input.valorCentavos <= 0 ||
    input.valorCentavos > 100_000_000
  ) {
    throw new ErroRenovacaoAssinaturaManual(
      "Informe um valor pago válido para a renovação."
    );
  }

  const { data: empresa, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .select(
      `
        id,
        nome_fantasia,
        email,
        telefone,
        nome_responsavel,
        plano_id,
        assinatura_status,
        assinatura_inicio_em,
        assinatura_vencimento_em,
        assinatura_bloqueio_em,
        assinatura_renovada_em,
        assinatura_gateway,
        assinatura_referencia,
        assinatura_metadata_json,
        planos (
          id,
          nome,
          slug,
          preco_mensal_centavos
        )
      `
    )
    .eq("id", input.empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new Error(
      `Erro ao buscar empresa para renovação: ${empresaError.message}`
    );
  }

  if (!empresa) {
    throw new ErroRenovacaoAssinaturaManual("Empresa não encontrada.", 404);
  }

  const plano = Array.isArray(empresa.planos)
    ? empresa.planos[0]
    : empresa.planos;

  if (!plano?.id) {
    throw new ErroRenovacaoAssinaturaManual(
      "A empresa não possui um plano válido para renovar.",
      409
    );
  }

  const agora = new Date().toISOString();
  const referencia = `manual_renewal_${randomUUID()}`;
  const janela = calcularJanelaAssinatura(agora);
  const metadataAnterior = objetoJson(empresa.assinatura_metadata_json);

  const metadataRenovacao = {
    origem: "renovacao_manual_empresas",
    tipo: "renovacao_manual",
    referencia,
    renovado_em: agora,
    valor_pago_centavos: input.valorCentavos,
    operador_usuario_id: input.operador.id,
    operador_nome: input.operador.nome,
    operador_email: input.operador.email,
    plano_id: plano.id,
    plano_slug: plano.slug ?? null,
    plano_nome: plano.nome ?? null,
    vencimento_anterior: empresa.assinatura_vencimento_em,
    novo_vencimento: janela.vencimentoEm,
    novo_bloqueio_em: janela.bloqueioEm,
  };

  const pagamento = await supabaseAdmin
    .from("pagamentos")
    .insert({
      empresa_id: empresa.id,
      gateway: "manual",
      evento: "subscription.manual_renewal",
      transaction_id: referencia,
      status: "paid",
      metodo: "manual",
      valor: input.valorCentavos,
      valor_liquido: input.valorCentavos,
      customer_nome:
        empresa.nome_responsavel || empresa.nome_fantasia || null,
      customer_email: empresa.email,
      customer_telefone: telefoneLimpo(empresa.telefone),
      offer_hash: `manual-renewal:${plano.slug || plano.id}`,
      offer_titulo: `Renovação manual · Plano ${plano.nome || "atual"}`,
      offer_preco: input.valorCentavos,
      paid_at: agora,
      payload: metadataRenovacao,
      created_at: agora,
      updated_at: agora,
    })
    .select("id")
    .single();

  if (pagamento.error || !pagamento.data) {
    throw new Error(
      `Erro ao registrar renovação manual: ${
        pagamento.error?.message || "pagamento não retornado"
      }`
    );
  }

  const atualizacaoEmpresa = await supabaseAdmin
    .from("empresas")
    .update({
      assinatura_status: "ativa",
      assinatura_inicio_em: janela.inicioEm,
      assinatura_vencimento_em: janela.vencimentoEm,
      assinatura_bloqueio_em: janela.bloqueioEm,
      assinatura_renovada_em: janela.inicioEm,
      assinatura_gateway: "manual",
      assinatura_referencia: referencia,
      assinatura_metadata_json: {
        ...metadataAnterior,
        free_trial_4d: false,
        ultima_renovacao_manual: metadataRenovacao,
      },
      assinatura_fluxos_pausados_em: null,
      updated_at: agora,
    })
    .eq("id", empresa.id);

  if (atualizacaoEmpresa.error) {
    await supabaseAdmin
      .from("pagamentos")
      .delete()
      .eq("id", pagamento.data.id)
      .eq("gateway", "manual")
      .eq("transaction_id", referencia);

    throw new Error(
      `Erro ao renovar assinatura da empresa: ${atualizacaoEmpresa.error.message}`
    );
  }

  const tokens = await supabaseAdmin.rpc("renovar_tokens_assinatura_plano", {
    p_empresa_id: empresa.id,
    p_referencia: referencia,
    p_pago_em: agora,
    p_metadata_json: metadataRenovacao,
  });

  if (tokens.error) {
    const rollbackEmpresa = await supabaseAdmin
      .from("empresas")
      .update({
        assinatura_status: empresa.assinatura_status,
        assinatura_inicio_em: empresa.assinatura_inicio_em,
        assinatura_vencimento_em: empresa.assinatura_vencimento_em,
        assinatura_bloqueio_em: empresa.assinatura_bloqueio_em,
        assinatura_renovada_em: empresa.assinatura_renovada_em,
        assinatura_gateway: empresa.assinatura_gateway,
        assinatura_referencia: empresa.assinatura_referencia,
        assinatura_metadata_json: metadataAnterior,
        updated_at: new Date().toISOString(),
      })
      .eq("id", empresa.id);

    const rollbackPagamento = await supabaseAdmin
      .from("pagamentos")
      .delete()
      .eq("id", pagamento.data.id)
      .eq("gateway", "manual")
      .eq("transaction_id", referencia);

    if (rollbackEmpresa.error || rollbackPagamento.error) {
      console.error(
        "[RENOVAÇÃO MANUAL] Falha ao reverter operação após erro nos tokens:",
        {
          empresa: rollbackEmpresa.error,
          pagamento: rollbackPagamento.error,
        }
      );
    }

    throw new Error(
      `Erro ao renovar tokens do plano: ${tokens.error.message}`
    );
  }

  const sincronizacao = await supabaseAdmin.rpc(
    "sincronizar_assinatura_empresa",
    {
      p_empresa_id: empresa.id,
    }
  );

  if (sincronizacao.error) {
    console.error(
      "[RENOVAÇÃO MANUAL] Assinatura renovada, mas falhou a sincronização final:",
      sincronizacao.error
    );
  }

  return {
    empresa: {
      id: empresa.id,
      nome: empresa.nome_fantasia,
      email: empresa.email,
    },
    plano: {
      id: plano.id,
      nome: plano.nome,
      slug: plano.slug,
    },
    pagamentoId: pagamento.data.id,
    referencia,
    valorCentavos: input.valorCentavos,
    renovadoEm: agora,
    vencimentoAnterior: empresa.assinatura_vencimento_em,
    vencimentoEm: janela.vencimentoEm,
    bloqueioEm: janela.bloqueioEm,
    statusAnterior: empresa.assinatura_status,
    gatewayAnterior: empresa.assinatura_gateway,
  };
}
