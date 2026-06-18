import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();
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

    const { data, error } = await supabaseAdmin.rpc(
      "contar_conversas_nao_lidas",
      {
        p_empresa_id: usuario.empresa_id,
        p_usuario_id: usuario.id,
        p_is_admin: usuario.is_admin,
        p_setores_ids: usuario.setores_ids ?? [],
        p_usuario_pode_atribuir: usuarioPodeAtribuir,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(
      {
        ok: true,
        quantidade: Number(data || 0),
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
