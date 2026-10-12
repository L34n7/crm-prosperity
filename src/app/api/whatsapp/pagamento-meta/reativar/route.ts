import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

export async function POST() {
  const contexto = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const { usuario } = contexto;

  if (!usuario.empresa_id || !usuario.is_admin) {
    return NextResponse.json(
      { ok: false, error: "Apenas administradores podem consultar este aviso." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    reativadas: 0,
    automatico: true,
    aviso:
      "Não há reativação manual. O CRM mantém os envios liberados e remove o aviso automaticamente quando a Meta confirmar um novo envio criado depois da falha financeira.",
  });
}
