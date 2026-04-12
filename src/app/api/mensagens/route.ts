import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeEnviarMensagens,
  podeVisualizarMensagens,
} from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

type ConversaAcesso = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status?: string | null;
};

async function usuarioPodeAcessarConversa(
  usuario: UsuarioContexto,
  conversa: ConversaAcesso
) {
  if (!usuario.empresa_id || conversa.empresa_id !== usuario.empresa_id) {
    return false;
  }

  if (isAdministrador(usuario)) return true;

  const podeAtribuir = await podeAtribuirConversas(usuario);

  if (podeAtribuir) {
    return await usuarioPertenceAoSetor(usuario.id, conversa.setor_id);
  }

  if (conversa.responsavel_id === usuario.id) {
    return true;
  }

  const pertenceAoSetorDaConversa = await usuarioPertenceAoSetor(
    usuario.id,
    conversa.setor_id
  );

  if (
    pertenceAoSetorDaConversa &&
    conversa.responsavel_id === null &&
    conversa.status === "fila"
  ) {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    const { searchParams } = new URL(request.url);
    const conversaId = searchParams.get("conversa_id");

    if (!conversaId) {
      return NextResponse.json(
        { ok: false, error: "conversa_id é obrigatório" },
        { status: 400 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select("id, empresa_id, setor_id, responsavel_id, status")
      .eq("id", conversaId)
      .maybeSingle<ConversaAcesso>();

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

    if (!(await podeVisualizarMensagens(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para visualizar mensagens" },
        { status: 403 }
      );
    }

    if (!(await usuarioPodeAcessarConversa(usuario, conversa))) {
      return NextResponse.json(
        { ok: false, error: "Você não pode acessar as mensagens desta conversa" },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("mensagens")
      .select("*")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mensagens: data ?? [],
    });
  } catch (error) {
    console.error("Erro ao carregar mensagens:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar mensagens" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeEnviarMensagens(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para enviar mensagens" },
      { status: 403 }
    );
  }

  const body = await request.json();

  const conversa_id = body?.conversa_id || null;
  const remetente_tipo = body?.remetente_tipo || "usuario";
  const remetente_id = body?.remetente_id || usuario.id;
  const conteudo = body?.conteudo?.trim();
  const tipo_mensagem = body?.tipo_mensagem || "texto";
  const origem = body?.origem || "enviada";
  const status_envio = body?.status_envio || "enviada";

  if (!conversa_id) {
    return NextResponse.json(
      { ok: false, error: "Conversa é obrigatória" },
      { status: 400 }
    );
  }

  if (!conteudo) {
    return NextResponse.json(
      { ok: false, error: "Conteúdo da mensagem é obrigatório" },
      { status: 400 }
    );
  }

  if (!["contato", "bot", "ia", "usuario", "sistema"].includes(remetente_tipo)) {
    return NextResponse.json(
      { ok: false, error: "remetente_tipo inválido" },
      { status: 400 }
    );
  }

  if (
    ![
      "texto",
      "imagem",
      "audio",
      "video",
      "documento",
      "template",
      "botao",
      "lista",
    ].includes(tipo_mensagem)
  ) {
    return NextResponse.json(
      { ok: false, error: "tipo_mensagem inválido" },
      { status: 400 }
    );
  }

  if (!["recebida", "enviada", "automatica"].includes(origem)) {
    return NextResponse.json(
      { ok: false, error: "origem inválida" },
      { status: 400 }
    );
  }

  if (!["pendente", "enviada", "entregue", "lida", "falha"].includes(status_envio)) {
    return NextResponse.json(
      { ok: false, error: "status_envio inválido" },
      { status: 400 }
    );
  }

  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("id, empresa_id, setor_id, responsavel_id, status")
    .eq("id", conversa_id)
    .maybeSingle<ConversaAcesso>();

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

  if (!(await usuarioPodeAcessarConversa(usuario, conversa))) {
    return NextResponse.json(
      { ok: false, error: "Você não pode enviar mensagem nesta conversa" },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .insert([
      {
        empresa_id: conversa.empresa_id,
        conversa_id,
        remetente_tipo,
        remetente_id,
        conteudo,
        tipo_mensagem,
        origem,
        status_envio,
      },
    ])
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("conversas")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversa_id);

  return NextResponse.json({
    ok: true,
    message: "Mensagem criada com sucesso",
    mensagem: data,
  });
}