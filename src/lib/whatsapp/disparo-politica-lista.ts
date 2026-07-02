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

  const contatosComOptIn = new Set<string>();
  const contatosPorId = new Map<
    string,
    { telefone: string; optIn: boolean }
  >();

  if (contatoIds.length > 0) {
    const { data, error } = await params.supabase
      .from("contatos_visao_operacional")
      .select("id, telefone, opt_in_whatsapp")
      .eq("empresa_id", params.empresaId)
      .in("id", contatoIds);

    if (error) {
      throw new Error(
        `Erro ao validar os contatos selecionados: ${error.message}`
      );
    }

    for (const contato of data || []) {
      contatosPorId.set(String(contato.id), {
        telefone: somenteDigitos(contato.telefone),
        optIn: contato.opt_in_whatsapp === true,
      });
    }

    for (const destinatario of params.destinatarios) {
      const contatoId = String(destinatario.contatoId || "").trim();
      const telefone = somenteDigitos(destinatario.telefone);
      const contato = contatosPorId.get(contatoId);

      if (
        contatoId &&
        telefone &&
        contato?.telefone === telefone &&
        contato.optIn
      ) {
        contatosComOptIn.add(contatoId);
      }
    }
  }

  const contatosFrios = params.destinatarios.filter((destinatario) => {
    const contatoId = String(destinatario.contatoId || "").trim();
    const telefone = somenteDigitos(destinatario.telefone);
    const contato = contatosPorId.get(contatoId);

    return (
      !contatoId ||
      !telefone ||
      contato?.telefone !== telefone ||
      contato?.optIn !== true
    );
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
