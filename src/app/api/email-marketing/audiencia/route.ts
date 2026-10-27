import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function limparBusca(valor: string) {
  return valor.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function GET(request: Request) {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const empresaId = acesso.usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const busca = limparBusca(searchParams.get("busca") || "");
  const limite = Math.max(
    1,
    Math.min(50, Number(searchParams.get("limite") || "30"))
  );

  let contatosQuery = supabaseAdmin
    .from("contatos")
    .select("id, nome, email, telefone, empresa, origem, campanha, interesse")
    .eq("empresa_id", empresaId)
    .not("email", "is", null)
    .neq("email", "")
    .order("nome", { ascending: true })
    .limit(limite);

  if (busca) {
    contatosQuery = contatosQuery.or(
      "nome.ilike.%" +
        busca +
        "%,email.ilike.%" +
        busca +
        "%,telefone.ilike.%" +
        busca +
        "%"
    );
  }

  const [listasResult, totalResult, contatosResult] = await Promise.all([
    supabaseAdmin.rpc("email_marketing_listar_listas_audiencia", {
      p_empresa_id: empresaId,
    }),
    supabaseAdmin
      .from("contatos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .not("email", "is", null)
      .neq("email", ""),
    contatosQuery,
  ]);

  if (listasResult.error || totalResult.error || contatosResult.error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          listasResult.error?.message ||
          totalResult.error?.message ||
          contatosResult.error?.message ||
          "Não foi possível carregar a audiência.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    total_contatos_com_email: Number(totalResult.count || 0),
    listas: (listasResult.data || []).map((lista: Record<string, unknown>) => ({
      id: String(lista.id || ""),
      nome: String(lista.nome || ""),
      total_contatos: Number(lista.total_contatos || 0),
      total_emails: Number(lista.total_emails || 0),
      created_at: lista.created_at || null,
    })),
    contatos: contatosResult.data || [],
  });
}
