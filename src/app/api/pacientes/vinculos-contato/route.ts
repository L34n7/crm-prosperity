import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;
  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  if (!can(usuario.permissoes, "prontuarios.visualizar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar pacientes." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const pessoaIds = Array.from(
      new Set(
        (Array.isArray(body?.pessoa_ids) ? body.pessoa_ids : [])
          .map((id: unknown) => String(id ?? "").trim())
          .filter((id: string) => UUID_REGEX.test(id)),
      ),
    ).slice(0, 200);

    if (pessoaIds.length === 0) {
      return NextResponse.json({ ok: true, vinculos: {} });
    }

    const { data, error } = await supabase
      .from("contatos")
      .select("id, pessoa_id, nome, telefone, email, origem, ultima_interacao_at, updated_at")
      .eq("empresa_id", usuario.empresa_id)
      .in("pessoa_id", pessoaIds)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Erro ao carregar vínculos de contato: ${error.message}`);
    }

    const vinculos: Record<string, unknown[]> = {};
    for (const contato of data ?? []) {
      const pessoaId = String(contato.pessoa_id ?? "").trim();
      if (!pessoaId) continue;
      if (!vinculos[pessoaId]) vinculos[pessoaId] = [];
      vinculos[pessoaId].push(contato);
    }

    return NextResponse.json({ ok: true, vinculos });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar vínculos de contato.",
      },
      { status: 500 },
    );
  }
}
