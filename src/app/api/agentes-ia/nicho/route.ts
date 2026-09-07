import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { carregarNichoEmpresa } from "@/lib/agentes-ia/nicho-empresa";

export async function GET() {
  try {
    const contexto = await getUsuarioContexto();
    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const empresaId = String(contexto.usuario.empresa_id || "").trim();
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      nicho: await carregarNichoEmpresa(empresaId),
    });
  } catch (error) {
    console.error("[AGENTES_IA_NICHO_API] GET:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao carregar nicho da empresa.",
      },
      { status: 500 }
    );
  }
}
