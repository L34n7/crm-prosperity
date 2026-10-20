import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calcularJanelaAssinatura } from "@/lib/assinaturas/status";
import { garantirAssinaturaProsperityPay } from "@/lib/prosperity-pay/subscriptions";

const supabase = getSupabaseAdmin();

export const WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE = 2;
export const WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE = 1;
export const WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE = 5;
export const WHITE_LABEL_PRECO_NUMERO_ADICIONAL_CENTAVOS = 6000;
export const WHITE_LABEL_PRECO_USUARIO_ADICIONAL_CENTAVOS = 2000;

type WhiteLabelBillingRow = {
  id: string;
  nome: string;
  valor_mensal_centavos: number;
  empresa_gestora_id: string | null;
  status: string;
};

type ClienteBillingRow = {
  id: string;
  nome_fantasia: string;
  status: string;
  limite_integracoes_whatsapp: number | null;
  limite_usuarios: number | null;
};

function numeroInteiro(valor: unknown, fallback = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.floor(numero) : fallback;
}

export async function calcularResumoCobrancaWhiteLabel(whiteLabelId: string) {
  const [{ data: whiteLabel, error: whiteLabelError }, { data: clientes, error: clientesError }] =
    await Promise.all([
      supabase
        .from("white_labels")
        .select("id,nome,valor_mensal_centavos,empresa_gestora_id,status")
        .eq("id", whiteLabelId)
        .maybeSingle<WhiteLabelBillingRow>(),
      supabase
        .from("empresas")
        .select("id,nome_fantasia,status,limite_integracoes_whatsapp,limite_usuarios")
        .eq("white_label_id", whiteLabelId)
        .eq("white_label_tipo", "cliente")
        .order("created_at", { ascending: true }),
    ]);

  if (whiteLabelError) throw new Error(whiteLabelError.message);
  if (!whiteLabel) throw new Error("White Label não encontrado.");
  if (clientesError) throw new Error(clientesError.message);

  const clientesDetalhes = ((clientes || []) as ClienteBillingRow[]).map((cliente) => {
    const limiteWhatsapp = Math.max(
      WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      numeroInteiro(
        cliente.limite_integracoes_whatsapp,
        WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      ),
    );
    const numerosAdicionais = Math.min(
      WHITE_LABEL_MAX_NUMEROS_ADICIONAIS_POR_CLIENTE,
      Math.max(
        0,
        limiteWhatsapp - WHITE_LABEL_NUMEROS_INCLUSOS_POR_CLIENTE,
      ),
    );

    const limiteUsuarios = Math.max(
      WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
      numeroInteiro(
        cliente.limite_usuarios,
        WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
      ),
    );
    const usuariosAdicionais = Math.max(
      0,
      limiteUsuarios - WHITE_LABEL_USUARIOS_INCLUSOS_POR_CLIENTE,
    );

    return {
      id: cliente.id,
      nome: cliente.nome_fantasia,
      status: cliente.status,
      limite_whatsapp: limiteWhatsapp,
      numeros_adicionais: numerosAdicionais,
      limite_usuarios: limiteUsuarios,
      usuarios_adicionais: usuariosAdicionais,
    };
  });

  const numerosAdicionais = clientesDetalhes.reduce(
    (total, cliente) => total + cliente.numeros_adicionais,
    0,
  );
  const usuariosAdicionais = clientesDetalhes.reduce(
    (total, cliente) => total + cliente.usuarios_adicionais,
    0,
  );
  const valorBaseCentavos = Math.max(
    0,
    numeroInteiro(whiteLabel.valor_mensal_centavos),
  );
  const valorNumerosCentavos =
    numerosAdicionais * WHITE_LABEL_PRECO_NUMERO_ADICIONAL_CENTAVOS;
  const valorUsuariosCentavos =
    usuariosAdicionais * WHITE_LABEL_PRECO_USUARIO_ADICIONAL_CENTAVOS;
  const valorTotalCentavos =
    valorBaseCentavos + valorNumerosCentavos + valorUsuariosCentavos;

  return {
    white_label_id: whiteLabel.id,
    nome: whiteLabel.nome,
    status: whiteLabel.status,
    empresa_gestora_id: whiteLabel.empresa_gestora_id,
    valor_base_centavos: valorBaseCentavos,
    numeros_adicionais: numerosAdicionais,
    preco_numero_adicional_centavos:
      WHITE_LABEL_PRECO_NUMERO_ADICIONAL_CENTAVOS,
    valor_numeros_adicionais_centavos: valorNumerosCentavos,
    usuarios_adicionais: usuariosAdicionais,
    preco_usuario_adicional_centavos:
      WHITE_LABEL_PRECO_USUARIO_ADICIONAL_CENTAVOS,
    valor_usuarios_adicionais_centavos: valorUsuariosCentavos,
    valor_total_centavos: valorTotalCentavos,
    clientes: clientesDetalhes,
  };
}

function cicloPrecisaNormalizar(vencimento: unknown) {
  const vencimentoMs = vencimento
    ? new Date(String(vencimento)).getTime()
    : Number.NaN;

  if (!Number.isFinite(vencimentoMs)) return true;

  const limiteFuturo = Date.now() + 370 * 24 * 60 * 60 * 1000;
  return vencimentoMs > limiteFuturo;
}

export async function sincronizarCobrancaWhiteLabel(whiteLabelId: string) {
  const resumo = await calcularResumoCobrancaWhiteLabel(whiteLabelId);

  if (!resumo.empresa_gestora_id) {
    throw new Error("White Label sem empresa gestora vinculada.");
  }

  const { data: gestora, error: gestoraError } = await supabase
    .from("empresas")
    .select(
      "id,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em,assinatura_gateway,assinatura_metadata_json",
    )
    .eq("id", resumo.empresa_gestora_id)
    .maybeSingle();

  if (gestoraError) throw new Error(gestoraError.message);
  if (!gestora) throw new Error("Empresa gestora do White Label não encontrada.");

  const metadataAtual =
    gestora.assinatura_metadata_json &&
    typeof gestora.assinatura_metadata_json === "object" &&
    !Array.isArray(gestora.assinatura_metadata_json)
      ? (gestora.assinatura_metadata_json as Record<string, unknown>)
      : {};

  const temCobranca = resumo.valor_total_centavos > 0;
  const normalizarCiclo =
    temCobranca &&
    cicloPrecisaNormalizar(gestora.assinatura_vencimento_em);
  const janela = normalizarCiclo ? calcularJanelaAssinatura(new Date()) : null;

  const agora = new Date().toISOString();
  const update: Record<string, unknown> = {
    assinatura_gateway: temCobranca ? "prosperity_pay" : "white_label",
    assinatura_metadata_json: {
      ...metadataAtual,
      origem: "white_label",
      white_label_id: resumo.white_label_id,
      tipo: "gestora",
      billing_components_v2: true,
      valor_contratado_centavos: resumo.valor_total_centavos,
      white_label_base_centavos: resumo.valor_base_centavos,
      white_label_numeros_adicionais: resumo.numeros_adicionais,
      white_label_numero_adicional_unitario_centavos:
        resumo.preco_numero_adicional_centavos,
      white_label_usuarios_adicionais: resumo.usuarios_adicionais,
      white_label_usuario_adicional_unitario_centavos:
        resumo.preco_usuario_adicional_centavos,
      white_label_total_centavos: resumo.valor_total_centavos,
      white_label_billing_synced_at: agora,
    },
    updated_at: agora,
  };

  if (!temCobranca) {
    update.assinatura_status = "ativa";
    update.assinatura_inicio_em = null;
    update.assinatura_vencimento_em = null;
    update.assinatura_bloqueio_em = null;
  } else if (janela) {
    update.assinatura_status = "ativa";
    update.assinatura_inicio_em = janela.inicioEm;
    update.assinatura_vencimento_em = janela.vencimentoEm;
    update.assinatura_bloqueio_em = janela.bloqueioEm;
  }

  const { error: updateError } = await supabase
    .from("empresas")
    .update(update)
    .eq("id", resumo.empresa_gestora_id);

  if (updateError) throw new Error(updateError.message);

  let assinaturaProsperityPay: Record<string, unknown> | null = null;
  let warning: string | null = null;

  if (temCobranca) {
    try {
      assinaturaProsperityPay =
        (await garantirAssinaturaProsperityPay(
          resumo.empresa_gestora_id,
        )) as Record<string, unknown>;
    } catch (error) {
      warning =
        error instanceof Error
          ? error.message
          : "Não foi possível reconciliar a assinatura na Prosperity Pay.";
      console.error("[WHITE LABEL BILLING] Falha ao reconciliar assinatura:", {
        whiteLabelId,
        empresaGestoraId: resumo.empresa_gestora_id,
        error: warning,
      });
    }
  }

  return {
    ...resumo,
    assinatura_prosperity_pay: assinaturaProsperityPay,
    warning,
  };
}

export async function sincronizarCobrancasWhiteLabelAtivas() {
  const { data, error } = await supabase
    .from("white_labels")
    .select("id")
    .eq("status", "ativo")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  let sincronizadas = 0;
  let erros = 0;

  for (const item of data || []) {
    try {
      await sincronizarCobrancaWhiteLabel(String(item.id));
      sincronizadas += 1;
    } catch (error) {
      erros += 1;
      console.error("[WHITE LABEL BILLING] Falha na sincronização periódica:", {
        whiteLabelId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    encontradas: data?.length || 0,
    sincronizadas,
    erros,
  };
}
