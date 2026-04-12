import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { upsertConfiguracaoUsuario } from "@/lib/configuracoes/configuracoes-usuario";

const supabaseAdmin = getSupabaseAdmin();

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!isAdministrador(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Apenas administradores podem alterar exceções" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: usuarioAlvo, error: usuarioAlvoError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("id", id)
      .maybeSingle();

    if (usuarioAlvoError) {
      return NextResponse.json(
        { ok: false, error: usuarioAlvoError.message },
        { status: 500 }
      );
    }

    if (!usuarioAlvo) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (usuarioAlvo.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode alterar usuários de outra empresa" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const data = await upsertConfiguracaoUsuario({
      empresa_id: usuario.empresa_id,
      usuario_id: id,
      pode_transferir:
        typeof body.pode_transferir === "boolean" ? body.pode_transferir : null,
      pode_atribuir:
        typeof body.pode_atribuir === "boolean" ? body.pode_atribuir : null,
      pode_assumir:
        typeof body.pode_assumir === "boolean" ? body.pode_assumir : null,
      permitir_transferir_sem_assumir:
        typeof body.permitir_transferir_sem_assumir === "boolean"
          ? body.permitir_transferir_sem_assumir
          : null,
      permitir_assumir_conversa_em_fila:
        typeof body.permitir_assumir_conversa_em_fila === "boolean"
          ? body.permitir_assumir_conversa_em_fila
          : null,
      permitir_assumir_conversa_sem_responsavel:
        typeof body.permitir_assumir_conversa_sem_responsavel === "boolean"
          ? body.permitir_assumir_conversa_sem_responsavel
          : null,
      permitir_assumir_conversa_ja_atribuida:
        typeof body.permitir_assumir_conversa_ja_atribuida === "boolean"
          ? body.permitir_assumir_conversa_ja_atribuida
          : null,
    });

    return NextResponse.json({
      ok: true,
      message: "Exceções do usuário salvas com sucesso",
      configuracao_usuario: data,
    });
  } catch (error) {
    console.error("Erro ao salvar exceções do usuário:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao salvar exceções do usuário" },
      { status: 500 }
    );
  }
}