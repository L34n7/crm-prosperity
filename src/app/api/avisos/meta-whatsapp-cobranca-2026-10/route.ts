import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { confirmarAvisoMetaWhatsapp } from "@/lib/avisos/meta-whatsapp-cobranca";

export async function POST() {
  const resultado = await getUsuarioContexto({
    ignorarAcessoTemporario: true,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const usuario = resultado.usuario;

  if (!usuario.is_admin) {
    return NextResponse.json(
      {
        ok: false,
        error: "Somente administradores podem confirmar este aviso.",
      },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuario sem empresa vinculada." },
      { status: 400 }
    );
  }

  try {
    const confirmadoEm = await confirmarAvisoMetaWhatsapp({
      usuarioId: usuario.id,
      empresaId: usuario.empresa_id,
    });

    return NextResponse.json({
      ok: true,
      confirmado_em: confirmadoEm,
    });
  } catch (error) {
    console.error("[AVISO_META_WHATSAPP] Falha ao confirmar aviso:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Nao foi possivel registrar sua confirmacao. Tente novamente.",
      },
      { status: 500 }
    );
  }
}
