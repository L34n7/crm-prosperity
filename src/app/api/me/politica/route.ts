import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getPoliticaAtendimentoDoUsuario } from "@/lib/configuracoes/politicas-atendimento";

export async function GET() {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;
    const politica = await getPoliticaAtendimentoDoUsuario(usuario);

    return NextResponse.json({
      ok: true,
      politica,
    });
  } catch (error) {
    console.error("Erro ao carregar política do usuário:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar política do usuário" },
      { status: 500 }
    );
  }
}