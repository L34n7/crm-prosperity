import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Token não enviado." },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json(
        { ok: false, error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const authUser = userData.user;
    const email = authUser.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem email." },
        { status: 400 }
      );
    }

    const empresaId = authUser.user_metadata?.empresa_id ?? null;
    const telefone = authUser.user_metadata?.telefone ?? null;
    const nome =
      authUser.user_metadata?.nome ||
      authUser.email?.split("@")[0] ||
      "Usuário";

    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "empresa_id ausente no user_metadata." },
        { status: 400 }
      );
    }

    const { data: usuarioExistente, error: erroBuscaUsuario } = await supabaseAdmin
      .from("usuarios")
      .select("*")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (erroBuscaUsuario) {
      return NextResponse.json(
        { ok: false, error: erroBuscaUsuario.message },
        { status: 500 }
      );
    }

    let usuario = usuarioExistente;

    if (!usuario) {
      const { data: novoUsuario, error: erroNovoUsuario } = await supabaseAdmin
        .from("usuarios")
        .insert({
          empresa_id: empresaId,
          auth_user_id: authUser.id,
          nome,
          email,
          senha_hash: null,
          nivel: "avancado",
          status: "ativo",
          telefone,
          avatar_url: null,
          ultimo_acesso: null,
          documento: null,
          cpf: null,
          rg: null,
          rg_uf: null,
          cidade: null,
          estado: null,
          data_nascimento: null,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (erroNovoUsuario) {
        return NextResponse.json(
          { ok: false, error: erroNovoUsuario.message },
          { status: 500 }
        );
      }

      usuario = novoUsuario;
    }

    const { data: lead, error: erroLead } = await supabaseAdmin
      .from("leads_cadastro")
      .select("*")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroLead) {
      return NextResponse.json(
        { ok: false, error: erroLead.message },
        { status: 500 }
      );
    }

    if (lead) {
      const { error: erroAtualizacaoLead } = await supabaseAdmin
        .from("leads_cadastro")
        .update({
          status: "convertido",
          usuario_id: usuario.id,
          empresa_id: empresaId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);

      if (erroAtualizacaoLead) {
        return NextResponse.json(
          { ok: false, error: erroAtualizacaoLead.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      usuario_id: usuario.id,
      empresa_id: empresaId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      { status: 500 }
    );
  }
}