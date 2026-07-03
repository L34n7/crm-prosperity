import type { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buscarContatosComOptInPorNumero,
  buscarPhoneNumberIdIntegracao,
  criarChaveDestinatarioOptIn,
} from "./opt-in-por-numero.ts";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

export type CategoriaDisparoPolitica =
  | "marketing"
  | "utility"
  | "authentication"
  | "outra";

export const CODIGO_MARKETING_LISTA_FRIA_BLOQUEADO =
  "MARKETING_LISTA_FRIA_BLOQUEADO";
export const CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA =
  "CONFIRMACAO_RESPONSABILIDADE_LISTA_FRIA_OBRIGATORIA";

export function normalizarCategoriaDisparo(
  categoria: unknown
): CategoriaDisparoPolitica {
  const valor = String(categoria || "").trim().toLowerCase();

  if (valor === "marketing") return "marketing";
  if (valor === "utility") return "utility";
  if (valor === "authentication") return "authentication";

  return "outra";
}

export async function classificarDestinatariosPorOptIn(params: {
  supabase: SupabaseAdmin;
  empresaId: string;
  integracaoWhatsappId: string;
  phoneNumberId?: string | null;
  destinatariosJaCarregadosDoBanco?: boolean;
  destinatarios: Array<{
    contatoId?: string | null;
    telefone?: string | null;
  }>;
}) {
  const phoneNumberId =
    String(params.phoneNumberId || "").trim() ||
    (await buscarPhoneNumberIdIntegracao({
      supabase: params.supabase,
      empresaId: params.empresaId,
      integracaoWhatsappId: params.integracaoWhatsappId,
    }));

  const destinatariosComOptIn = await buscarContatosComOptInPorNumero({
    supabase: params.supabase,
    empresaId: params.empresaId,
    phoneNumberId,
    destinatarios: params.destinatarios,
    validarTelefonesAtuais: !params.destinatariosJaCarregadosDoBanco,
  });
  const contatosComOptIn = new Set<string>();

  const contatosFrios = params.destinatarios.filter((destinatario) => {
    const contatoId = String(destinatario.contatoId || "").trim();
    const possuiOptIn =
      contatoId &&
      destinatariosComOptIn.has(
        criarChaveDestinatarioOptIn(contatoId, destinatario.telefone)
      );

    if (possuiOptIn) contatosComOptIn.add(contatoId);

    return !possuiOptIn;
  });

  return {
    phoneNumberId,
    total: params.destinatarios.length,
    totalOptIn: params.destinatarios.length - contatosFrios.length,
    totalFrios: contatosFrios.length,
    contatosComOptIn,
  };
}

export function validarPoliticaListaDisparo(params: {
  categoria: unknown;
  totalContatosFrios: number;
  responsabilidadeListaFriaConfirmada: boolean;
}) {
  const categoria = normalizarCategoriaDisparo(params.categoria);
  const totalContatosFrios = Math.max(
    0,
    Math.trunc(Number(params.totalContatosFrios || 0))
  );

  if (totalContatosFrios === 0) {
    return { ok: true as const, categoria, totalContatosFrios };
  }

  if (categoria === "marketing") {
    return {
      ok: false as const,
      categoria,
      totalContatosFrios,
      status: 422,
      code: CODIGO_MARKETING_LISTA_FRIA_BLOQUEADO,
      error:
        "Templates de marketing nao podem ser enviados para contatos de lista fria. Remova os contatos sem opt-in para continuar.",
    };
  }

  if (
    categoria === "utility" &&
    !params.responsabilidadeListaFriaConfirmada
  ) {
    return {
      ok: false as const,
      categoria,
      totalContatosFrios,
      status: 428,
      code: CODIGO_CONFIRMACAO_LISTA_FRIA_OBRIGATORIA,
      error:
        "Confirme a responsabilidade pelo envio de template utility para contatos de lista fria.",
    };
  }

  return { ok: true as const, categoria, totalContatosFrios };
}
