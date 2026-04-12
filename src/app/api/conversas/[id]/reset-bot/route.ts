import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

function usuarioPodeResetarConversa(
  usuario: UsuarioContexto,
  conversa: {
    empresa_id: string;
    setor_id: string | null;
    responsavel_id: string | null;
  }
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) {
    return true;
  }

  const setoresDoUsuario = Array.isArray(usuario.setores_ids)
    ? usuario.setores_ids
    : [];

  const pertenceAoSetor =
    conversa.setor_id !== null && setoresDoUsuario.includes(conversa.setor_id);

  const ehResponsavel = conversa.responsavel_id === usuario.id;

  return ehResponsavel || pertenceAoSetor;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, setor_id, responsavel_id")
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

  if (!usuarioPodeResetarConversa(usuario, conversa)) {
    return NextResponse.json(
      { ok: false, error: "Você não pode resetar esta conversa" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .update({
      setor_id: null,
      responsavel_id: null,
      status: "aberta",
      origem_atendimento: "entrada_cliente",
      bot_ativo: false,
      fluxo_etapa: null,
      menu_aguardando_resposta: false,
      ultima_opcao_escolhida: null,
      tentativas_invalidas: 0,
      ultima_interacao_bot_em: null,
      automacao_id: null,
      closed_at: null,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "Conversa resetada com sucesso. A próxima mensagem entrará como novo fluxo.",
    conversa: data,
  });
}