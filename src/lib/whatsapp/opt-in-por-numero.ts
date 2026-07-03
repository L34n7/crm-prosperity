import { normalizarTelefoneBrasilParaWhatsApp } from "../contatos/normalizar-telefone.ts";
import type { getSupabaseAdmin } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type DestinatarioOptInPorNumero = {
  contatoId?: string | null;
  telefone?: string | null;
};

export function normalizarTelefoneOptIn(valor: unknown) {
  const digitos = String(valor || "").replace(/\D/g, "");
  if (!digitos) return "";

  return String(
    normalizarTelefoneBrasilParaWhatsApp(digitos) || digitos
  ).replace(/\D/g, "");
}

export function criarChaveDestinatarioOptIn(
  contatoId: unknown,
  telefone: unknown
) {
  return `${String(contatoId || "").trim()}|${normalizarTelefoneOptIn(
    telefone
  )}`;
}

export async function buscarPhoneNumberIdIntegracao(params: {
  supabase: SupabaseAdmin;
  empresaId: string;
  integracaoWhatsappId: string;
}) {
  const { data, error } = await params.supabase
    .from("integracoes_whatsapp")
    .select("phone_number_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.integracaoWhatsappId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Erro ao buscar o numero da integracao: ${error.message}`
    );
  }

  const phoneNumberId = String(data?.phone_number_id || "").trim();

  if (!phoneNumberId) {
    throw new Error(
      "A integracao selecionada nao possui phone_number_id configurado."
    );
  }

  return phoneNumberId;
}

export async function buscarContatosComOptInPorNumero(params: {
  supabase: SupabaseAdmin;
  empresaId: string;
  phoneNumberId: string;
  destinatarios: DestinatarioOptInPorNumero[];
  validarTelefonesAtuais?: boolean;
}) {
  const contatoIds = Array.from(
    new Set(
      params.destinatarios
        .map((destinatario) => String(destinatario.contatoId || "").trim())
        .filter(Boolean)
    )
  );

  const destinatariosComOptIn = new Set<string>();

  if (contatoIds.length === 0 || !params.phoneNumberId.trim()) {
    return destinatariosComOptIn;
  }

  const contatosAtuais = new Map<string, string>();
  const chavesComOptIn = new Set<string>();
  const tamanhoLote = 500;
  const validarTelefonesAtuais = params.validarTelefonesAtuais !== false;

  if (!validarTelefonesAtuais) {
    for (const destinatario of params.destinatarios) {
      const contatoId = String(destinatario.contatoId || "").trim();
      if (!contatoId) continue;

      contatosAtuais.set(
        contatoId,
        normalizarTelefoneOptIn(destinatario.telefone)
      );
    }
  }

  for (let inicio = 0; inicio < contatoIds.length; inicio += tamanhoLote) {
    const ids = contatoIds.slice(inicio, inicio + tamanhoLote);
    const [
      { data: contatos, error: contatosError },
      { data: optIns, error: optInsError },
    ] = await Promise.all([
      validarTelefonesAtuais
        ? params.supabase
            .from("contatos")
            .select("id, telefone")
            .eq("empresa_id", params.empresaId)
            .in("id", ids)
        : Promise.resolve({ data: [], error: null }),
      params.supabase
        .from("whatsapp_contatos_opt_in_numeros")
        .select("contato_id, telefone_normalizado")
        .eq("empresa_id", params.empresaId)
        .eq("phone_number_id", params.phoneNumberId)
        .eq("ativo", true)
        .in("contato_id", ids),
    ]);

    if (contatosError) {
      throw new Error(
        `Erro ao validar os contatos selecionados: ${contatosError.message}`
      );
    }

    if (optInsError) {
      throw new Error(
        `Erro ao validar o opt-in por numero: ${optInsError.message}`
      );
    }

    for (const contato of contatos || []) {
      contatosAtuais.set(
        String(contato.id),
        normalizarTelefoneOptIn(contato.telefone)
      );
    }

    for (const optIn of optIns || []) {
      chavesComOptIn.add(
        criarChaveDestinatarioOptIn(
          optIn.contato_id,
          optIn.telefone_normalizado
        )
      );
    }
  }

  for (const destinatario of params.destinatarios) {
    const contatoId = String(destinatario.contatoId || "").trim();
    const telefone = normalizarTelefoneOptIn(destinatario.telefone);

    if (
      contatoId &&
      telefone &&
      contatosAtuais.get(contatoId) === telefone &&
      chavesComOptIn.has(criarChaveDestinatarioOptIn(contatoId, telefone))
    ) {
      destinatariosComOptIn.add(
        criarChaveDestinatarioOptIn(contatoId, telefone)
      );
    }
  }

  return destinatariosComOptIn;
}
