import type { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export async function buscarContatosComOptInWhatsapp(params: {
  supabase: SupabaseAdmin;
  empresaId: string;
  contatoIds: string[];
}) {
  const contatoIds = Array.from(
    new Set(params.contatoIds.map((id) => String(id || "").trim()).filter(Boolean))
  );

  if (contatoIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await params.supabase
    .from("conversas")
    .select("contato_id")
    .eq("empresa_id", params.empresaId)
    .in("contato_id", contatoIds)
    .not("last_inbound_message_at", "is", null);

  if (error) {
    throw new Error(
      `Erro ao verificar opt-in dos contatos: ${error.message}`
    );
  }

  return new Set(
    (data || [])
      .map((conversa) => String(conversa.contato_id || "").trim())
      .filter(Boolean)
  );
}

function somenteDigitos(valor: unknown) {
  return String(valor || "").replace(/\D/g, "");
}

export async function classificarDestinatariosPorOptIn(params: {
  supabase: SupabaseAdmin;
  empresaId: string;
  destinatarios: Array<{
    contatoId?: string | null;
    telefone?: string | null;
  }>;
}) {
  const contatoIds = Array.from(
    new Set(
      params.destinatarios
        .map((destinatario) => String(destinatario.contatoId || "").trim())
        .filter(Boolean)
    )
  );

  const contatosValidos = new Set<string>();

  if (contatoIds.length > 0) {
    const { data, error } = await params.supabase
      .from("contatos")
      .select("id, telefone")
      .eq("empresa_id", params.empresaId)
      .in("id", contatoIds);

    if (error) {
      throw new Error(
        `Erro ao validar os contatos selecionados: ${error.message}`
      );
    }

    const telefonesPorContato = new Map(
      (data || []).map((contato) => [
        String(contato.id),
        somenteDigitos(contato.telefone),
      ])
    );

    for (const destinatario of params.destinatarios) {
      const contatoId = String(destinatario.contatoId || "").trim();
      const telefone = somenteDigitos(destinatario.telefone);

      if (
        contatoId &&
        telefone &&
        telefonesPorContato.get(contatoId) === telefone
      ) {
        contatosValidos.add(contatoId);
      }
    }
  }

  const contatosComOptIn = await buscarContatosComOptInWhatsapp({
    supabase: params.supabase,
    empresaId: params.empresaId,
    contatoIds: Array.from(contatosValidos),
  });

  const contatosFrios = params.destinatarios.filter((destinatario) => {
    const contatoId = String(destinatario.contatoId || "").trim();
    return !contatoId || !contatosComOptIn.has(contatoId);
  });

  return {
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
