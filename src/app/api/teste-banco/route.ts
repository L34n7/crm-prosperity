import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const { count, error } = await supabase
      .from("planos")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Erro Supabase:", error);

      return NextResponse.json(
        {
          ok: false,
          message: "Erro ao consultar a tabela planos",
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Conexão com Supabase funcionando",
      totalPlanos: count ?? 0,
    });
  } catch (error) {
    console.error("Erro geral:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Erro geral ao conectar com o banco",
      },
      { status: 500 }
    );
  }
}