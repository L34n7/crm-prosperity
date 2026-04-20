import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

function normalizarTipoOferta(valor: unknown): "normal" | "vip" | "jv" {
  if (typeof valor !== "string") {
    return "normal";
  }

  const valorNormalizado = valor.trim().toLowerCase();

  if (valorNormalizado === "vip") {
    return "vip";
  }

  if (valorNormalizado === "jv") {
    return "jv";
  }

  return "normal";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").toLowerCase().trim();
    const telefone = String(body?.telefone ?? "").trim();
    const empresa = String(body?.empresa ?? "").trim();
    const tipoOferta = normalizarTipoOferta(body?.tipo_oferta);

    if (!nome) {
      throw new Error("Nome é obrigatório.");
    }

    if (!email) {
      throw new Error("Email é obrigatório.");
    }

    // 🔍 verificar se já existe usuário com esse email
    const { data: usuarioExistente } = await supabase
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (usuarioExistente) {
      throw new Error(
        "Já existe uma conta com este email. Faça login ou recupere sua senha."
      );
    }

    const { data, error } = await supabase
      .from("leads_cadastro")
      .insert({
        nome,
        email,
        telefone: telefone || null,
        empresa: empresa || null,
        status: "novo",
        plano_slug: "basico",
        tipo_oferta: tipoOferta,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Erro Supabase ao criar lead:", error);
      throw new Error("Erro ao criar lead.");
    }

    return NextResponse.json({
      ok: true,
      lead_id: data.id,
      tipo_oferta: tipoOferta,
    });
  } catch (error) {
    console.error("Erro ao criar lead:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 400 }
    );
  }
}