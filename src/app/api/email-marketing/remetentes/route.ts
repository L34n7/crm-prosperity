import { NextResponse } from "next/server";
import {
  buscarIntegracaoEmailMarketing,
  validarAcessoEmailMarketing,
} from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function dominioDoEmail(email: string) {
  return email.split("@").pop()?.trim().toLowerCase() || "";
}

export async function GET() {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  if (!acesso.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const integracao = await buscarIntegracaoEmailMarketing(acesso.usuario.empresa_id);
  const permitirLegado =
    acesso.usuario.empresa_id === "4fc69d8c-52e3-4756-aaa1-d86db217c376" &&
    !integracao?.api_key_criptografada;

  const { data, error } = await supabaseAdmin
    .from("email_remetentes")
    .select(
      "id, empresa_id, escopo, nome, email, dominio, provider, provider_domain_id, status, is_default, created_at, updated_at"
    )
    .or(
      "empresa_id.eq." +
        acesso.usuario.empresa_id +
        (permitirLegado
          ? ",and(empresa_id.is.null,escopo.eq.sistema)" : "")
    )
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    remetentes: data ?? [],
  });
}

export async function PATCH(request: Request) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.remetentes");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  if (!acesso.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const id = String(body?.id || "").trim();
  const nome = String(body?.nome || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();

  if (!id || !nome || !emailValido(email)) {
    return NextResponse.json(
      { ok: false, error: "Informe nome e e-mail remetente válidos." },
      { status: 400 }
    );
  }

  const { data: remetente, error: buscaError } = await supabaseAdmin
    .from("email_remetentes")
    .select("id, empresa_id, escopo, dominio, status")
    .eq("id", id)
    .maybeSingle();

  if (buscaError) {
    return NextResponse.json(
      { ok: false, error: buscaError.message },
      { status: 500 }
    );
  }

  if (!remetente) {
    return NextResponse.json(
      { ok: false, error: "Remetente não encontrado." },
      { status: 404 }
    );
  }

  const integracao = await buscarIntegracaoEmailMarketing(acesso.usuario.empresa_id);
  const permitirLegado =
    acesso.usuario.empresa_id === "4fc69d8c-52e3-4756-aaa1-d86db217c376" &&
    !integracao?.api_key_criptografada;
  const permitido =
    (remetente.empresa_id === acesso.usuario.empresa_id &&
      (!integracao?.api_key_criptografada ||
        remetente.dominio === integracao.dominio)) ||
    (permitirLegado && remetente.empresa_id === null && remetente.escopo === "sistema");

  if (!permitido) {
    return NextResponse.json(
      { ok: false, error: "Sem acesso a este remetente." },
      { status: 403 }
    );
  }

  if (dominioDoEmail(email) !== String(remetente.dominio).toLowerCase()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "O e-mail remetente precisa usar o domínio verificado " +
          remetente.dominio +
          ".",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("email_remetentes")
    .update({
      nome,
      email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(
      "id, empresa_id, escopo, nome, email, dominio, provider, provider_domain_id, status, is_default, created_at, updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.code === "23505"
            ? "Este e-mail remetente já está cadastrado."
            : error.message,
      },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    remetente: data,
    message: "Remetente atualizado com sucesso.",
  });
}
