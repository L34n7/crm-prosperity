import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";
import { contarConversasNaoLidas } from "@/lib/conversas/nao-lidas";

const POLLING_HEADERS = {
  "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
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

  if (!(await podeVisualizarConversas(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissao para visualizar conversas" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuario sem empresa vinculada" },
      { status: 400 }
    );
  }

  try {
    const usuarioPodeAtribuir = await podeAtribuirConversas(usuario);

    const quantidade = await contarConversasNaoLidas({
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      isAdmin: usuario.is_admin,
      setoresIds: usuario.setores_ids ?? [],
      usuarioPodeAtribuir,
    });

    return NextResponse.json(
      {
        ok: true,
        quantidade,
      },
      { headers: POLLING_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar conversas nao lidas",
      },
      { status: 500 }
    );
  }
}
