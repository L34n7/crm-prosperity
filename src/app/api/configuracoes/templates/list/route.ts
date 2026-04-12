import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const { data: usuario } = await supabase
      .from("usuarios")
      .select("empresa_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Erro interno." },
      { status: 500 }
    );
  }
}