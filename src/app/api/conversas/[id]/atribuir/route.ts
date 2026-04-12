import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import {
  podeAtribuirConversas,
  isAdministrador,
} from "@/lib/auth/authorization";
import { getPoliticaAtendimentoDoUsuario } from "@/lib/configuracoes/politicas-atendimento";

const supabaseAdmin = getSupabaseAdmin();

export async function POST(
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

    if (!(await podeAtribuirConversas(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para atribuir" },
        { status: 403 }
      );
    }

    const politica = await getPoliticaAtendimentoDoUsuario(usuario);

    if (!politica.pode_atribuir) {
      return NextResponse.json(
        {
          ok: false,
          error: "A política atual não permite que este usuário atribua conversas",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const novoResponsavelId =
      typeof body?.responsavel_id === "string"
        ? body.responsavel_id.trim()
        : null;

    if (!novoResponsavelId) {
      return NextResponse.json(
        { ok: false, error: "responsavel_id é obrigatório" },
        { status: 400 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (conversaError) {
      return NextResponse.json(
        { ok: false, error: conversaError.message },
        { status: 500 }
      );
    }

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa não encontrada" },
        { status: 404 }
      );
    }

    if (conversa.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a essa conversa" },
        { status: 403 }
      );
    }

    const setorId = conversa.setor_id;

    if (!setorId) {
      return NextResponse.json(
        { ok: false, error: "Conversa sem setor definido" },
        { status: 400 }
      );
    }

    if (!isAdministrador(usuario)) {
      const pertence = await usuarioPertenceAoSetor(usuario.id, setorId);

      if (!pertence) {
        return NextResponse.json(
          {
            ok: false,
            error: "Você só pode atribuir conversas do seu setor",
          },
          { status: 403 }
        );
      }
    }

    const { data: novoResponsavel, error: respError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id, status")
      .eq("id", novoResponsavelId)
      .maybeSingle();

    if (respError) {
      return NextResponse.json(
        { ok: false, error: respError.message },
        { status: 500 }
      );
    }

    if (!novoResponsavel) {
      return NextResponse.json(
        { ok: false, error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    if (novoResponsavel.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário não pertence à empresa" },
        { status: 400 }
      );
    }

    if (novoResponsavel.status !== "ativo") {
      return NextResponse.json(
        { ok: false, error: "Usuário está inativo" },
        { status: 400 }
      );
    }

    const pertenceAoSetor = await usuarioPertenceAoSetor(
      novoResponsavelId,
      setorId
    );

    if (!pertenceAoSetor) {
      return NextResponse.json(
        {
          ok: false,
          error: "Usuário não pertence ao setor da conversa",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("conversas")
      .update({
        responsavel_id: novoResponsavelId,
        status: "em_atendimento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(`
        *,
        responsavel:usuarios (
          id,
          nome,
          email
        )
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Conversa atribuída com sucesso",
      conversa: data,
      politica_aplicada: politica,
    });
  } catch (error) {
    console.error("Erro ao atribuir conversa:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao atribuir conversa" },
      { status: 500 }
    );
  }
}