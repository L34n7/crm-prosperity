import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { contarGruposDisparosPendentes } from "@/lib/disparos-agendados/pendentes";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";

const POLLING_HEADERS = {
  "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
};

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

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para visualizar disparos.",
        },
        { status: 403, headers: POLLING_HEADERS }
      );
    }

    const quantidade = await contarGruposDisparosPendentes(usuario.empresa_id);

    return NextResponse.json(
      {
        ok: true,
        quantidade,
      },
      { headers: POLLING_HEADERS }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao contar disparos pendentes.",
      },
      { status: 500 }
    );
  }
}
