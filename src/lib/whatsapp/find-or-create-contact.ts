import {
  aplicarClassificacaoLeadContato,
  normalizarClassificacaoLead,
} from "@/lib/leads/classificacao";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { normalizeContactName } from "@/lib/whatsapp/normalize";

export type WhatsAppContact = {
  id: string;
  empresa_id: string;
  nome: string | null;
  whatsapp_profile_name?: string | null;
  telefone: string;
  email?: string | null;
  origem?: string | null;
  campanha?: string | null;
  status_lead?: string | null;
  classificacao?: string | null;
  observacoes?: string | null;
};

type FindOrCreateContactParams = {
  empresaId: string;
  phone: string;
  profileName?: string | null;
  salvarProfileNameWhatsapp?: boolean;
};

function contatoPrecisaSerQualificado(contato: WhatsAppContact) {
  const classificacao = normalizarClassificacaoLead(
    contato.classificacao || contato.status_lead,
    "novo"
  );

  return classificacao === "novo";
}

async function qualificarContatoPorEntradaWhatsapp(
  contato: WhatsAppContact
): Promise<WhatsAppContact> {
  if (!contatoPrecisaSerQualificado(contato)) {
    return contato;
  }

  await aplicarClassificacaoLeadContato({
    empresaId: contato.empresa_id,
    contatoId: contato.id,
    classificacao: "qualificado",
    origem: "entrada_whatsapp",
  });

  return {
    ...contato,
    classificacao: "qualificado",
    status_lead: "qualificado",
  };
}

export async function findOrCreateWhatsAppContact({
  empresaId,
  phone,
  profileName,
  salvarProfileNameWhatsapp = true,
}: FindOrCreateContactParams): Promise<WhatsAppContact> {
  const supabaseAdmin = getSupabaseAdmin();

  const telefone = normalizarTelefoneBrasilParaWhatsApp(phone);
  const nome = normalizeContactName(profileName);
  const whatsappProfileName = salvarProfileNameWhatsapp ? nome : "";

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
    if (
      whatsappProfileName &&
      String(existingContact.whatsapp_profile_name || "").trim() !==
        whatsappProfileName
    ) {
      const { data: contatoAtualizado, error: updateError } = await supabaseAdmin
        .from("contatos")
        .update({
          whatsapp_profile_name: whatsappProfileName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingContact.id)
        .eq("empresa_id", empresaId)
        .select("*")
        .maybeSingle();

      if (updateError) {
        console.error(
          "[WHATSAPP_CONTACT] Erro ao atualizar nome de perfil do WhatsApp:",
          updateError
        );
      } else if (contatoAtualizado) {
        return await qualificarContatoPorEntradaWhatsapp(
          contatoAtualizado as WhatsAppContact
        );
      }
    }

    return await qualificarContatoPorEntradaWhatsapp(
      existingContact as WhatsAppContact
    );
  }

  const agora = new Date().toISOString();
  const { data: newContact, error: insertError } = await supabaseAdmin
    .from("contatos")
    .insert({
      empresa_id: empresaId,
      nome: nome || telefone,
      whatsapp_profile_name: whatsappProfileName || null,
      telefone,
      origem: "Direto / Nao identificado",
      status_lead: "qualificado",
      classificacao: "qualificado",
      classificacao_atualizada_em: agora,
      observacoes: "Contato criado automaticamente via webhook do WhatsApp.",
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: contatoExistenteAposConflito, error: buscarAposConflitoError } =
        await supabaseAdmin
          .from("contatos")
          .select("*")
          .eq("empresa_id", empresaId)
          .eq("telefone", telefone)
          .limit(1)
          .maybeSingle();

      if (buscarAposConflitoError || !contatoExistenteAposConflito) {
        throw new Error(
          `Contato já existia, mas não foi possível buscar após conflito: ${
            buscarAposConflitoError?.message ?? "sem retorno do banco"
          }`
        );
      }

      if (
        whatsappProfileName &&
        String(contatoExistenteAposConflito.whatsapp_profile_name || "").trim() !==
          whatsappProfileName
      ) {
        const { data: contatoAtualizado, error: updateError } = await supabaseAdmin
          .from("contatos")
          .update({
            whatsapp_profile_name: whatsappProfileName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contatoExistenteAposConflito.id)
          .eq("empresa_id", empresaId)
          .select("*")
          .maybeSingle();

        if (updateError) {
          console.error(
            "[WHATSAPP_CONTACT] Erro ao atualizar nome de perfil do WhatsApp apos conflito:",
            updateError
          );
        }

        return await qualificarContatoPorEntradaWhatsapp(
          (contatoAtualizado || contatoExistenteAposConflito) as WhatsAppContact
        );
      }

      return await qualificarContatoPorEntradaWhatsapp(
        contatoExistenteAposConflito as WhatsAppContact
      );
    }

    throw new Error(`Erro ao criar contato automaticamente: ${insertError.message}`);
  }

  if (!newContact) {
    throw new Error("Erro ao criar contato automaticamente: sem retorno do banco");
  }

  return newContact as WhatsAppContact;
}
