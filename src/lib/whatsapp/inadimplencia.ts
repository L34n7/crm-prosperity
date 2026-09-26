import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsAppWebhookBody } from "@/lib/whatsapp/meta";

const supabaseAdmin = getSupabaseAdmin();
const DIAS_ATE_PARAR_RECEBIMENTO = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

type EmpresaAssinatura = {
  id: string;
  assinatura_status: string | null;
  assinatura_bloqueio_em: string | null;
};

type IntegracaoResumo = {
  empresa_id: string;
  phone_number_id: string | null;
  status: string;
};

function bloqueadaHaPeloMenos(
  empresa: EmpresaAssinatura | undefined,
  dias: number,
  agora = Date.now()
) {
  if (
    !empresa ||
    empresa.assinatura_status !== "bloqueada" ||
    !empresa.assinatura_bloqueio_em
  ) {
    return false;
  }

  const bloqueioMs = new Date(empresa.assinatura_bloqueio_em).getTime();

  if (!Number.isFinite(bloqueioMs)) return false;

  return agora >= bloqueioMs + dias * DIA_MS;
}

export async function buscarPhoneNumberIdsComRecebimentoSuspenso(
  phoneNumberIds: string[]
) {
  const ids = Array.from(
    new Set(phoneNumberIds.map((id) => String(id || "").trim()).filter(Boolean))
  );

  const resultado = new Set<string>();

  if (ids.length === 0) return resultado;

  const { data: integracoes, error: integracoesError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("empresa_id, phone_number_id, status")
    .in("phone_number_id", ids);

  if (integracoesError) {
    throw new Error(
      `Erro ao verificar inadimplência das integrações: ${integracoesError.message}`
    );
  }

  const integracoesNormalizadas = (integracoes || []) as IntegracaoResumo[];
  const empresaIds = Array.from(
    new Set(integracoesNormalizadas.map((item) => item.empresa_id).filter(Boolean))
  );

  if (empresaIds.length === 0) return resultado;

  const { data: empresas, error: empresasError } = await supabaseAdmin
    .from("empresas")
    .select("id, assinatura_status, assinatura_bloqueio_em")
    .in("id", empresaIds);

  if (empresasError) {
    throw new Error(
      `Erro ao verificar assinatura das integrações: ${empresasError.message}`
    );
  }

  const empresasPorId = new Map(
    ((empresas || []) as EmpresaAssinatura[]).map((empresa) => [
      empresa.id,
      empresa,
    ])
  );

  const agora = Date.now();

  for (const integracao of integracoesNormalizadas) {
    const phoneNumberId = String(integracao.phone_number_id || "").trim();

    if (!phoneNumberId) continue;

    if (integracao.status === "suspensa_inadimplencia") {
      resultado.add(phoneNumberId);
      continue;
    }

    const empresa = empresasPorId.get(integracao.empresa_id);

    if (
      bloqueadaHaPeloMenos(
        empresa,
        DIAS_ATE_PARAR_RECEBIMENTO,
        agora
      )
    ) {
      resultado.add(phoneNumberId);
    }
  }

  return resultado;
}

export async function empresaComRecebimentoWhatsappSuspenso(
  empresaId: string
) {
  if (!empresaId) return false;

  const { data: empresa, error } = await supabaseAdmin
    .from("empresas")
    .select("id, assinatura_status, assinatura_bloqueio_em")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao verificar inadimplência da empresa: ${error.message}`
    );
  }

  return bloqueadaHaPeloMenos(
    empresa as EmpresaAssinatura | undefined,
    DIAS_ATE_PARAR_RECEBIMENTO
  );
}

export function removerMensagensWhatsappPorPhoneNumberIds(
  body: WhatsAppWebhookBody,
  phoneNumberIds: Set<string>
): WhatsAppWebhookBody {
  if (phoneNumberIds.size === 0) return body;

  const filtrado = structuredClone(body);

  for (const entry of filtrado.entry || []) {
    for (const change of entry.changes || []) {
      const phoneNumberId = String(
        change.value?.metadata?.phone_number_id || ""
      ).trim();

      if (!phoneNumberIds.has(phoneNumberId)) continue;

      if (change.field === "messages" && change.value) {
        change.value.messages = [];
      }

      if (change.field === "smb_message_echoes" && change.value) {
        change.value.message_echoes = [];
      }

      if (change.field === "history" && change.value) {
        change.value.history = [];
      }
    }
  }

  return filtrado;
}
