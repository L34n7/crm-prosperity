import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarSaldoTokensIa } from "@/lib/ia/tokens";
import { can } from "@/lib/permissoes/frontend";

const POLLING_HEADERS = {
  "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
};

export async function GET() {
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

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

  const podeVisualizarSaldo =
    can(usuario.permissoes, "ia.tokens.exibir_header") ||
    can(usuario.permissoes, "ia.tokens.visualizar_extrato");

  if (!podeVisualizarSaldo) {
    return NextResponse.json(
      { ok: false, error: "Sem permissao para visualizar tokens de IA." },
      { status: 403 }
    );
  }

  try {
    const saldo = await buscarSaldoTokensIa(usuario.empresa_id);

    return NextResponse.json(
      {
        ok: true,
        saldo,
      },
      { headers: POLLING_HEADERS }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar saldo de tokens de IA.",
      },
      { status: 500 }
    );
  }
}
