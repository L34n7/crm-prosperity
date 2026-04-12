import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import {
  isAdministrador,
  podeAssumirConversas,
} from "@/lib/auth/authorization";
import { getPoliticaAtendimentoDoUsuario } from "@/lib/configuracoes/politicas-atendimento";

const supabaseAdmin = getSupabaseAdmin();

type ConversaRow = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status: string | null;
};

export async function POST(
  _request: Request,
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

    if (!(await podeAssumirConversas(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para assumir conversa" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const politica = await getPoliticaAtendimentoDoUsuario(usuario);

    if (!politica.pode_assumir) {
      return NextResponse.json(
        {
          ok: false,
          error: "A política atual não permite que este usuário assuma conversas",
        },
        { status: 403 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("id, empresa_id, setor_id, responsavel_id, status")
      .eq("id", id)
      .maybeSingle<ConversaRow>();

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
        { ok: false, error: "Você não pode assumir esta conversa" },
        { status: 403 }
      );
    }

    if (!isAdministrador(usuario)) {
      const pertenceAoSetor = await usuarioPertenceAoSetor(
        usuario.id,
        conversa.setor_id
      );

      if (!pertenceAoSetor) {
        return NextResponse.json(
          { ok: false, error: "Você não pertence ao setor desta conversa" },
          { status: 403 }
        );
      }
    }

    const conversaEstaEmFila = conversa.status === "fila";
    const conversaSemResponsavel = !conversa.responsavel_id;
    const conversaJaEhMinha = conversa.responsavel_id === usuario.id;
    const conversaJaTemOutroResponsavel =
      !!conversa.responsavel_id && conversa.responsavel_id !== usuario.id;

    if (
      !politica.permitir_assumir_conversa_em_fila &&
      conversaEstaEmFila
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "A política atual não permite assumir conversas em fila",
        },
        { status: 403 }
      );
    }

    if (
      !politica.permitir_assumir_conversa_sem_responsavel &&
      conversaSemResponsavel
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "A política atual não permite assumir conversa sem responsável",
        },
        { status: 403 }
      );
    }

    if (
      !politica.permitir_assumir_conversa_ja_atribuida &&
      conversaJaTemOutroResponsavel
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "A política atual não permite assumir conversa já atribuída",
        },
        { status: 403 }
      );
    }

    if (conversaJaEhMinha) {
      return NextResponse.json({
        ok: true,
        message: "A conversa já está sob sua responsabilidade",
        conversa,
        politica_aplicada: politica,
      });
    }

    const { data: conversaAtualizada, error: updateError } = await supabaseAdmin
      .from("conversas")
      .update({
        responsavel_id: usuario.id,
        status: "em_atendimento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(`
        *,
        contatos (
          id,
          nome,
          telefone,
          email
        ),
        setores (
          id,
          nome
        ),
        responsavel:usuarios (
          id,
          nome,
          email
        )
      `)
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Conversa assumida com sucesso",
      conversa: conversaAtualizada,
      politica_aplicada: politica,
    });
  } catch (error) {
    console.error("Erro ao assumir conversa:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao assumir conversa" },
      { status: 500 }
    );
  }
}