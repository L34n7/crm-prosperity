import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import { getPoliticaAtendimentoDoUsuario } from "@/lib/configuracoes/politicas-atendimento";
import {
  isAdministrador,
  podeTransferirConversas,
} from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

type ConversaRow = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status: string | null;
};

type SetorRow = {
  id: string;
  empresa_id: string;
};

type TransferirPayload = {
  setor_id?: string | null;
};

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

    if (!(await podeTransferirConversas(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para transferir conversas" },
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

    if (!politica.pode_transferir) {
      return NextResponse.json(
        {
          ok: false,
          error: "A política atual não permite que este usuário transfira conversas",
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as TransferirPayload;
    const novoSetorId = body?.setor_id?.trim() || null;

    if (!novoSetorId) {
      return NextResponse.json(
        { ok: false, error: "setor_id é obrigatório" },
        { status: 400 }
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
        { ok: false, error: "Você não pode transferir esta conversa" },
        { status: 403 }
      );
    }

    const { data: setorDestino, error: setorDestinoError } = await supabaseAdmin
      .from("setores")
      .select("id, empresa_id")
      .eq("id", novoSetorId)
      .maybeSingle<SetorRow>();

    if (setorDestinoError) {
      return NextResponse.json(
        { ok: false, error: setorDestinoError.message },
        { status: 500 }
      );
    }

    if (!setorDestino) {
      return NextResponse.json(
        { ok: false, error: "Setor de destino não encontrado" },
        { status: 404 }
      );
    }

    if (setorDestino.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "O setor de destino não pertence à empresa" },
        { status: 400 }
      );
    }

    if (!isAdministrador(usuario)) {
      const pertenceAoSetorAtual = await usuarioPertenceAoSetor(
        usuario.id,
        conversa.setor_id
      );

      if (!pertenceAoSetorAtual) {
        return NextResponse.json(
          {
            ok: false,
            error: "Você não pertence ao setor atual desta conversa",
          },
          { status: 403 }
        );
      }
    }

    if (
      !politica.permitir_transferir_sem_assumir &&
      conversa.responsavel_id !== usuario.id
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você precisa assumir a conversa antes de transferir",
        },
        { status: 403 }
      );
    }

    if (
      !politica.permitir_transferir_para_mesmo_setor &&
      conversa.setor_id === novoSetorId
    ) {
      return NextResponse.json(
        { ok: false, error: "A conversa já está neste setor" },
        { status: 400 }
      );
    }

    if (conversa.setor_id !== novoSetorId && !isAdministrador(usuario)) {
      const podeTransferirParaNovoSetor = await usuarioPertenceAoSetor(
        usuario.id,
        novoSetorId
      );

      if (!podeTransferirParaNovoSetor) {
        return NextResponse.json(
          {
            ok: false,
            error: "Você só pode transferir para setores aos quais pertence",
          },
          { status: 403 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      setor_id: novoSetorId,
      updated_at: new Date().toISOString(),
    };

    if (politica.limpar_responsavel_ao_transferir) {
      updateData.responsavel_id = null;

      if (politica.voltar_fila_ao_transferir) {
        updateData.status = "fila";
      }
    } else {
      updateData.responsavel_id = conversa.responsavel_id;

      if (conversa.responsavel_id) {
        updateData.status = "em_atendimento";
      } else if (politica.voltar_fila_ao_transferir) {
        updateData.status = "fila";
      }
    }

    const { data: conversaAtualizada, error: updateError } = await supabaseAdmin
      .from("conversas")
      .update(updateData)
      .eq("id", conversa.id)
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
      message: "Conversa transferida com sucesso",
      conversa: conversaAtualizada,
      politica_aplicada: politica,
    });
  } catch (error) {
    console.error("Erro ao transferir conversa:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao transferir conversa" },
      { status: 500 }
    );
  }
}