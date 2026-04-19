import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").toLowerCase().trim();
    const telefone = String(body?.telefone ?? "").trim();
    const empresa = String(body?.empresa ?? "").trim();

    if (!nome) {
      throw new Error("Nome é obrigatório.");
    }

    if (!email) {
      throw new Error("Email é obrigatório.");
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
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("Erro ao criar lead.");
    }

    return NextResponse.json({
      ok: true,
      lead_id: data.id,
    });
  } catch (error) {
    console.error("Erro ao criar lead:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 400 }
    );
  }
}