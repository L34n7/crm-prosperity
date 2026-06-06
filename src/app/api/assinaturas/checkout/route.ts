import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type PlanoSlug = "basico" | "essencial";

const supabase = getSupabaseAdmin();

function normalizarPlanoSlug(valor: unknown): PlanoSlug | null {
  if (valor === "basico" || valor === "essencial") {
    return valor;
  }

  return null;
}

function obterCheckoutUrlPorPlano(planoSlug: PlanoSlug) {
  if (planoSlug === "basico") {
    return (
      process.env.ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_BASICO ||
      process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
      process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
      ""
    );
  }

  return (
    process.env.ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL_ESSENCIAL ||
    process.env.ATOMOPAY_CHECKOUT_URL_PADRAO ||
    process.env.NEXT_PUBLIC_ATOMOPAY_CHECKOUT_URL ||
    ""
  );
}

function normalizarEmail(valor: string | null | undefined) {
  return String(valor || "").trim().toLowerCase();
}

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "").trim();
}

async function buscarOuCriarLeadCheckout(params: {
  planoSlug: PlanoSlug;
  empresaId: string;
  usuarioId: string;
  usuarioNome: string | null;
  usuarioEmail: string | null;
}) {
  const { planoSlug, empresaId, usuarioId, usuarioNome, usuarioEmail } = params;

  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select("id, nome_fantasia, razao_social, email, telefone, nome_responsavel")
    .eq("id", empresaId)
    .maybeSingle();

  if (empresaError) {
    throw new Error("Erro ao buscar empresa para checkout.");
  }

  if (!empresa) {
    throw new Error("Empresa nao encontrada para checkout.");
  }

  const email = normalizarEmail(empresa.email || usuarioEmail);
  const telefone = normalizarTexto(empresa.telefone);
  const nome =
    normalizarTexto(empresa.nome_responsavel) ||
    normalizarTexto(usuarioNome) ||
    normalizarTexto(empresa.nome_fantasia) ||
    "Cliente";
  const empresaNome =
    normalizarTexto(empresa.nome_fantasia) ||
    normalizarTexto(empresa.razao_social) ||
    nome;

  if (!email) {
    throw new Error("Empresa sem email para preparar checkout.");
  }

  const { data: leadEmpresa, error: leadEmpresaError } = await supabase
    .from("leads_cadastro")
    .select("id")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadEmpresaError) {
    throw new Error("Erro ao buscar lead da empresa.");
  }

  if (leadEmpresa?.id) {
    const { error: updateError } = await supabase
      .from("leads_cadastro")
      .update({
        nome,
        email,
        telefone: telefone || null,
        empresa: empresaNome,
        usuario_id: usuarioId,
        empresa_id: empresaId,
        plano_slug: planoSlug,
        tipo_oferta: "normal",
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId);

    if (updateError) {
      throw new Error("Erro ao atualizar plano escolhido.");
    }

    return leadEmpresa.id as string;
  }

  const { data: leadEmail, error: leadEmailError } = await supabase
    .from("leads_cadastro")
    .select("id")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadEmailError) {
    throw new Error("Erro ao buscar lead pelo email.");
  }

  if (leadEmail?.id) {
    const { error: updateError } = await supabase
      .from("leads_cadastro")
      .update({
        nome,
        email,
        telefone: telefone || null,
        empresa: empresaNome,
        usuario_id: usuarioId,
        empresa_id: empresaId,
        plano_slug: planoSlug,
        tipo_oferta: "normal",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadEmail.id);

    if (updateError) {
      throw new Error("Erro ao atualizar plano escolhido.");
    }

    return leadEmail.id as string;
  }

  const { data: leadNovo, error: insertError } = await supabase
    .from("leads_cadastro")
    .insert({
      nome,
      email,
      telefone: telefone || null,
      empresa: empresaNome,
      status: "convertido",
      pago: true,
      usuario_id: usuarioId,
      empresa_id: empresaId,
      plano_slug: planoSlug,
      tipo_oferta: "normal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !leadNovo) {
    throw new Error("Erro ao criar lead para checkout.");
  }

  return leadNovo.id as string;
}

export async function POST(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const planoSlug = normalizarPlanoSlug(body?.plano_slug);

    if (!planoSlug) {
      return NextResponse.json(
        { ok: false, error: "Plano invalido para checkout." },
        { status: 400 }
      );
    }

    const checkoutUrl = obterCheckoutUrlPorPlano(planoSlug);

    if (!checkoutUrl) {
      return NextResponse.json(
        { ok: false, error: "Checkout do plano nao configurado." },
        { status: 400 }
      );
    }

    const leadId = await buscarOuCriarLeadCheckout({
      planoSlug,
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      usuarioEmail: usuario.email,
    });

    return NextResponse.json({
      ok: true,
      lead_id: leadId,
      checkout_url: checkoutUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao preparar checkout.",
      },
      { status: 500 }
    );
  }
}
