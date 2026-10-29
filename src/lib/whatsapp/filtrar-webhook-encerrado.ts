import type { WhatsAppWebhookBody } from "@/lib/whatsapp/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Integracao = {
  phone_number_id: string | null;
  waba_id: string | null;
  status: string;
  empresas: { status: string } | { status: string }[] | null;
};

function empresaStatus(integracao: Integracao) {
  const empresa = Array.isArray(integracao.empresas)
    ? integracao.empresas[0] : integracao.empresas;
  return empresa?.status || "";
}

/** Descarta mensagens e eventos de clientes encerrados ANTES de persistir o webhook. */
export async function filtrarWebhookEmpresasEncerradas(body: WhatsAppWebhookBody) {
  const phones = new Set<string>();
  const wabas = new Set<string>();
  for (const entry of body.entry || []) {
    if (entry.id) wabas.add(String(entry.id));
    for (const change of entry.changes || []) {
      const phone = String(change.value?.metadata?.phone_number_id || "").trim();
      if (phone) phones.add(phone);
    }
  }
  if (phones.size === 0 && wabas.size === 0) return body;

  const supabase = getSupabaseAdmin();
  const [porTelefone, porWaba] = await Promise.all([
    phones.size
      ? supabase.from("integracoes_whatsapp")
        .select("phone_number_id,waba_id,status,empresas(status)")
        .in("phone_number_id",Array.from(phones))
      : Promise.resolve({data:[],error:null}),
    wabas.size
      ? supabase.from("integracoes_whatsapp")
        .select("phone_number_id,waba_id,status,empresas(status)")
        .in("waba_id",Array.from(wabas))
      : Promise.resolve({data:[],error:null}),
  ]);
  if (porTelefone.error || porWaba.error) throw new Error("Erro ao verificar empresas dos webhooks.");

  const integracoes = [...(porTelefone.data || []),...(porWaba.data || [])] as unknown as Integracao[];
  const phonesCancelados = new Set(integracoes
    .filter((i) => empresaStatus(i) === "cancelada")
    .map((i) => i.phone_number_id).filter((p): p is string => !!p));
  const wabasCanceladas = new Set<string>();
  for (const waba of wabas) {
    const integracoesWaba = integracoes.filter((i) => i.waba_id === waba);
    if (integracoesWaba.length && integracoesWaba.every((i) => empresaStatus(i) === "cancelada"))
      wabasCanceladas.add(waba);
  }
  if (!phonesCancelados.size && !wabasCanceladas.size) return body;

  const filtrado = structuredClone(body);
  filtrado.entry = (filtrado.entry || []).map((entry) => ({
    ...entry,
    changes: (entry.changes || []).filter((change) => {
      const phone = String(change.value?.metadata?.phone_number_id || "").trim();
      if (phone) return !phonesCancelados.has(phone);
      return !wabasCanceladas.has(String(entry.id || ""));
    }),
  })).filter((entry) => (entry.changes || []).length > 0);
  return filtrado;
}
