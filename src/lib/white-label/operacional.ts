import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function objeto(valor: unknown) {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function listaStrings(valor: unknown) {
  return Array.isArray(valor)
    ? valor.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

export async function sincronizarEstadoOperacionalClientesWhiteLabel(
  whiteLabelId: string,
  options: { renovarTokens?: boolean } = {},
) {
  const { data: whiteLabel, error: whiteLabelError } = await supabase
    .from("white_labels")
    .select("id,empresa_gestora_id")
    .eq("id", whiteLabelId)
    .maybeSingle<{ id: string; empresa_gestora_id: string | null }>();

  if (whiteLabelError) throw new Error(whiteLabelError.message);
  if (!whiteLabel?.empresa_gestora_id) {
    return { clientes: 0, atualizados: 0 };
  }

  const { data: gestora, error: gestoraError } = await supabase
    .from("empresas")
    .select(
      "id,assinatura_status,assinatura_inicio_em,assinatura_vencimento_em,assinatura_bloqueio_em",
    )
    .eq("id", whiteLabel.empresa_gestora_id)
    .maybeSingle();

  if (gestoraError) throw new Error(gestoraError.message);
  if (!gestora) return { clientes: 0, atualizados: 0 };

  const statusGestora = String(gestora.assinatura_status || "ativa");
  const { data: clientes, error: clientesError } = await supabase
    .from("empresas")
    .select(
      "id,assinatura_status,assinatura_metadata_json,assinatura_fluxos_pausados_em",
    )
    .eq("white_label_id", whiteLabelId)
    .eq("white_label_tipo", "cliente");

  if (clientesError) throw new Error(clientesError.message);

  let atualizados = 0;

  for (const cliente of clientes || []) {
    const statusAnterior = String(cliente.assinatura_status || "ativa");
    const metadataAtual = objeto(cliente.assinatura_metadata_json);
    let metadataNovo = { ...metadataAtual };

    if (statusGestora === "bloqueada") {
      const { data: fluxosAtivos, error: fluxosError } = await supabase
        .from("automacao_fluxos")
        .select("id")
        .eq("empresa_id", cliente.id)
        .eq("status", "ativo");

      if (fluxosError) throw new Error(fluxosError.message);

      const idsExistentes = new Set(
        listaStrings(metadataAtual.white_label_fluxos_pausados_ids),
      );
      for (const fluxo of fluxosAtivos || []) {
        idsExistentes.add(String(fluxo.id));
      }

      if ((fluxosAtivos || []).length > 0) {
        const { error: pausaError } = await supabase
          .from("automacao_fluxos")
          .update({
            status: "pausado",
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", cliente.id)
          .eq("status", "ativo");

        if (pausaError) throw new Error(pausaError.message);
      }

      metadataNovo = {
        ...metadataNovo,
        white_label_fluxos_pausados_ids: Array.from(idsExistentes),
        white_label_bloqueio_operacional_em:
          metadataAtual.white_label_bloqueio_operacional_em ||
          new Date().toISOString(),
      };
    }

    if (
      statusGestora === "vencida" ||
      statusGestora === "bloqueada"
    ) {
      const { error: tokensError } = await supabase
        .from("empresa_tokens_ia")
        .update({
          saldo_mensal_restante: 0,
          tokens_restantes: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", cliente.id);

      if (tokensError) throw new Error(tokensError.message);
    }

    if (statusGestora === "ativa" && statusAnterior !== "ativa") {
      const idsFluxos = listaStrings(
        metadataAtual.white_label_fluxos_pausados_ids,
      );

      if (idsFluxos.length > 0) {
        const { error: reativarError } = await supabase
          .from("automacao_fluxos")
          .update({
            status: "ativo",
            updated_at: new Date().toISOString(),
          })
          .eq("empresa_id", cliente.id)
          .in("id", idsFluxos)
          .eq("status", "pausado");

        if (reativarError) throw new Error(reativarError.message);
      }

      delete metadataNovo.white_label_fluxos_pausados_ids;
      delete metadataNovo.white_label_bloqueio_operacional_em;
    }

    if (
      statusGestora === "ativa" &&
      (statusAnterior !== "ativa" || options.renovarTokens === true)
    ) {
      const referencia =
        "white-label:" +
        whiteLabelId +
        ":" +
        String(gestora.assinatura_inicio_em || new Date().toISOString());

      const { error: renovarTokensError } = await supabase.rpc(
        "renovar_tokens_assinatura_plano",
        {
          p_empresa_id: cliente.id,
          p_referencia: referencia,
          p_pago_em:
            gestora.assinatura_inicio_em || new Date().toISOString(),
          p_metadata_json: {
            origem: "white_label_gestora_renovada",
            white_label_id: whiteLabelId,
            empresa_gestora_id: whiteLabel.empresa_gestora_id,
          },
        },
      );

      if (renovarTokensError) {
        throw new Error(renovarTokensError.message);
      }
    }

    const { error: updateError } = await supabase
      .from("empresas")
      .update({
        assinatura_status: statusGestora,
        assinatura_inicio_em: gestora.assinatura_inicio_em,
        assinatura_vencimento_em: gestora.assinatura_vencimento_em,
        assinatura_bloqueio_em: gestora.assinatura_bloqueio_em,
        assinatura_fluxos_pausados_em:
          statusGestora === "bloqueada"
            ? cliente.assinatura_fluxos_pausados_em ||
              new Date().toISOString()
            : statusGestora === "ativa"
              ? null
              : cliente.assinatura_fluxos_pausados_em,
        assinatura_metadata_json: {
          ...metadataNovo,
          white_label_status_herdado: statusGestora,
          white_label_status_sincronizado_em: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", cliente.id);

    if (updateError) throw new Error(updateError.message);
    atualizados += 1;
  }

  return {
    clientes: clientes?.length || 0,
    atualizados,
    status: statusGestora,
  };
}

export async function sincronizarEstadoOperacionalPorEmpresaGestora(
  empresaGestoraId: string,
  options: { renovarTokens?: boolean } = {},
) {
  const { data, error } = await supabase
    .from("white_labels")
    .select("id")
    .eq("empresa_gestora_id", empresaGestoraId)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (!data?.id) return null;

  return sincronizarEstadoOperacionalClientesWhiteLabel(data.id, options);
}
