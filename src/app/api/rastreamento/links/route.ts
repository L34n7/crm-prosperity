import { NextResponse } from "next/server";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import {
  gerarSlugLink,
  getPublicAppUrl,
  slugifyRastreamento,
} from "@/lib/rastreamento/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const acesso = await obterAcessoRastreamento("rastreamento.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("rastreamento_links")
    .select(`
      *,
      rastreamento_campanhas (
        id,
        nome,
        codigo,
        rastreamento_origens ( id, nome )
      )
    `)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (data || []).map((link) => link.id);
  const cliquesPorLink = new Map<string, number>();

  if (ids.length > 0) {
    const { data: cliques, error: cliquesError } = await supabase
      .from("rastreamento_cliques")
      .select("link_id")
      .in("link_id", ids);

    if (cliquesError) {
      return NextResponse.json(
        { ok: false, error: cliquesError.message },
        { status: 500 }
      );
    }

    for (const clique of cliques || []) {
      if (!clique.link_id) continue;
      cliquesPorLink.set(clique.link_id, (cliquesPorLink.get(clique.link_id) || 0) + 1);
    }
  }

  const appUrl = getPublicAppUrl(request);
  const links = (data || []).map((link) => ({
    ...link,
    public_url: `${appUrl}/r/${link.slug}`,
    total_cliques: cliquesPorLink.get(link.id) || 0,
  }));

  return NextResponse.json({ ok: true, links });
}

export async function POST(request: Request) {
  const acesso = await obterAcessoRastreamento("rastreamento.gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const body = await request.json();
  const campanhaId = String(body?.campanha_id || "").trim();
  const nome = String(body?.nome || "").trim();
  const slugInformado = String(body?.slug || "").trim();
  const slug = slugInformado
    ? slugifyRastreamento(slugInformado)
    : gerarSlugLink(nome);

  if (!campanhaId) {
    return NextResponse.json(
      { ok: false, error: "Selecione uma campanha." },
      { status: 400 }
    );
  }

  if (nome.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome do link." },
      { status: 400 }
    );
  }

  if (slug.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Informe um identificador de link valido." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: campanha } = await supabase
    .from("rastreamento_campanhas")
    .select("id")
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("id", campanhaId)
    .eq("status", "ativo")
    .maybeSingle();

  if (!campanha) {
    return NextResponse.json(
      { ok: false, error: "Campanha ativa nao encontrada." },
      { status: 404 }
    );
  }

  const { data, error } = await supabase
    .from("rastreamento_links")
    .insert({
      empresa_id: acesso.usuario.empresa_id,
      campanha_id: campanhaId,
      nome,
      slug,
      created_by: acesso.usuario.id,
      updated_by: acesso.usuario.id,
    })
    .select("*")
    .single();

  if (error) {
    const mensagem =
      error.code === "23505"
        ? "Esse identificador de link ja esta em uso."
        : error.message;

    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      link: {
        ...data,
        public_url: `${getPublicAppUrl(request)}/r/${data.slug}`,
      },
    },
    { status: 201 }
  );
}
