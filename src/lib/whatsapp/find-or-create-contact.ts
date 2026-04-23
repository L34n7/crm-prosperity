import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeContactName } from "@/lib/whatsapp/normalize";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";

export type WhatsAppContact = {
  id: string;
  empresa_id: string;
  nome: string | null;
  telefone: string;
  email?: string | null;
  origem?: string | null;
  campanha?: string | null;
  status_lead?: string | null;
  observacoes?: string | null;
};

type FindOrCreateContactParams = {
  empresaId: string;
  phone: string;
  profileName?: string | null;
};

export async function findOrCreateWhatsAppContact({
  empresaId,
  phone,
  profileName,
}: FindOrCreateContactParams): Promise<WhatsAppContact> {
  const supabaseAdmin = getSupabaseAdmin();

  const telefone = normalizarTelefoneBrasilParaWhatsApp(phone);
  const nome = normalizeContactName(profileName);

  if (!empresaId) {
    throw new Error("empresaId é obrigatório para localizar/criar contato");
  }

  if (!telefone) {
    throw new Error("Telefone inválido para localizar/criar contato");
  }

  const { data: existingContact, error: findError } = await supabaseAdmin
    .from("contatos")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("telefone", telefone)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `Erro ao buscar contato existente: ${findError.message}`
    );
  }

  if (existingContact) {
    return existingContact as WhatsAppContact;
  }

  const { data: newContact, error: insertError } = await supabaseAdmin
    .from("contatos")
    .insert({
      empresa_id: empresaId,
      nome: nome || telefone,
      telefone,
      origem: "whatsapp",
      status_lead: "novo",
      observacoes: "Contato criado automaticamente via webhook do WhatsApp.",
    })
    .select("*")
    .single();

  if (insertError || !newContact) {
    throw new Error(
      `Erro ao criar contato automaticamente: ${
        insertError?.message ?? "sem retorno do banco"
      }`
    );
  }

  return newContact as WhatsAppContact;
}