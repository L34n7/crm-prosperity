import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: resultado.error,
      },
      { status: resultado.status }
    );
  }

  return NextResponse.json({
    ok: true,
    usuario: resultado.usuario,
  });
}