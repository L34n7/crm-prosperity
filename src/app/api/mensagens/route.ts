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
import { canSendFreeformWhatsAppMessage } from "@/lib/whatsapp/can-send-message";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";

const supabaseAdmin = getSupabaseAdmin();

type ConversaAcesso = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status?: string | null;
  contato_id?: string | null;
  integracao_whatsapp_id?: string | null;
};

type ProtocoloAtivo = {
  id: string;
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
    const conversaProtocoloId = searchParams.get("conversa_protocolo_id");

    if (!conversaId) {
      return NextResponse.json(
        { ok: false, error: "conversa_id é obrigatório" },
        { status: 400 }
      );
    }

    const { data: conversa, error: conversaError } = await supabaseAdmin
      .from("conversas")
      .select(
        "id, empresa_id, setor_id, responsavel_id, status, contato_id, integracao_whatsapp_id"
      )
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

    let queryMensagens = supabaseAdmin
      .from("mensagens")
      .select("*")
      .eq("conversa_id", conversaId);

    if (conversaProtocoloId) {
      queryMensagens = queryMensagens.eq(
        "conversa_protocolo_id",
        conversaProtocoloId
      );
    }

    const { data, error } = await queryMensagens.order("created_at", {
      ascending: true,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const mensagens = data ?? [];

    const { data: favoritas, error: favoritasError } = await supabaseAdmin
      .from("mensagens_favoritas")
      .select("mensagem_id")
      .in(
        "mensagem_id",
        mensagens.length > 0
          ? mensagens.map((m) => m.id)
          : ["00000000-0000-0000-0000-000000000000"]
      );

    if (favoritasError) {
      return NextResponse.json(
        { ok: false, error: favoritasError.message },
        { status: 500 }
      );
    }

    const favoritasSet = new Set(
      (favoritas ?? []).map((item) => item.mensagem_id)
    );

    const mensagensComFavorita = mensagens.map((msg) => ({
      ...msg,
      favorita: favoritasSet.has(msg.id),
    }));

    return NextResponse.json({
      ok: true,
      mensagens: mensagensComFavorita,
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
  const metadata_json = body?.metadata_json || null;

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
      "contato",
      "localizacao",
      "template",
      "botao",
      "lista",
      "unsupported",
    ].includes(tipo_mensagem)
  ) {
    return NextResponse.json(
      { ok: false, error: "tipo_mensagem inválido" },
      { status: 400 }
    );
  }

  if (tipo_mensagem !== "texto") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Neste primeiro passo, o envio manual está liberado apenas para mensagens de texto.",
      },
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
    .select(
      "id, empresa_id, setor_id, responsavel_id, status, contato_id, integracao_whatsapp_id"
    )
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

  console.log("[POST /api/mensagens] conversa carregada:", conversa);

  if (!(await usuarioPodeAcessarConversa(usuario, conversa))) {
    return NextResponse.json(
      { ok: false, error: "Você não pode enviar mensagem nesta conversa" },
      { status: 403 }
    );
  }

  if (!conversa.contato_id) {
    return NextResponse.json(
      { ok: false, error: "A conversa não possui contato vinculado" },
      { status: 400 }
    );
  }

  if (!conversa.integracao_whatsapp_id) {
    return NextResponse.json(
      { ok: false, error: "A conversa não possui integração WhatsApp vinculada" },
      { status: 400 }
    );
  }

  const { data: protocoloAtivo, error: protocoloAtivoError } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("conversa_id", conversa_id)
    .eq("ativo", true)
    .maybeSingle<ProtocoloAtivo>();

  if (protocoloAtivoError) {
    return NextResponse.json(
      { ok: false, error: protocoloAtivoError.message },
      { status: 500 }
    );
  }

  if (!protocoloAtivo) {
    return NextResponse.json(
      { ok: false, error: "Nenhum protocolo ativo encontrado para esta conversa" },
      { status: 400 }
    );
  }

  const { data: contato, error: contatoError } = await supabaseAdmin
    .from("contatos")
    .select("id, telefone")
    .eq("id", conversa.contato_id)
    .maybeSingle();

  if (contatoError) {
    return NextResponse.json(
      { ok: false, error: contatoError.message },
      { status: 500 }
    );
  }

  if (!contato?.telefone) {
    return NextResponse.json(
      { ok: false, error: "Contato sem telefone válido" },
      { status: 400 }
    );
  }

  console.log("[POST /api/mensagens] contato carregado:", contato);

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, status, phone_number_id")
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();

  if (integracaoError) {
    return NextResponse.json(
      { ok: false, error: integracaoError.message },
      { status: 500 }
    );
  }

  if (!integracao) {
    return NextResponse.json(
      { ok: false, error: "Integração WhatsApp não encontrada" },
      { status: 404 }
    );
  }

  console.log("[POST /api/mensagens] integração carregada:", integracao);

  if (integracao.status !== "ativa") {
    return NextResponse.json(
      { ok: false, error: "A integração WhatsApp está inativa" },
      { status: 400 }
    );
  }

  const phoneNumberId =
    integracao.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || "";

  if (!phoneNumberId) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID não configurado" },
      { status: 500 }
    );
  }

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_ACCESS_TOKEN não configurado" },
      { status: 500 }
    );
  }

  const janela24h = await canSendFreeformWhatsAppMessage({
    conversaId: conversa_id,
  });

  if (!janela24h.podeEnviarMensagemLivre) {
    return NextResponse.json(
      {
        ok: false,
        error: janela24h.motivoBloqueio,
        janela_24h: janela24h,
      },
      { status: 400 }
    );
  }

  const envioWhatsApp = await sendWhatsAppTextMessage({
    phoneNumberId,
    accessToken,
    to: contato.telefone,
    body: conteudo,
  });

  if (!envioWhatsApp.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao enviar mensagem ao WhatsApp",
        detalhes: envioWhatsApp.error,
        retorno_meta: envioWhatsApp.raw,
      },
      { status: 502 }
    );
  }

  const metadataFinal = {
    ...(metadata_json ?? {}),
    whatsapp: {
      phone_number_id: phoneNumberId,
      destino: contato.telefone,
      janela_24h: {
        ultima_mensagem_recebida_em: janela24h.ultimaMensagemRecebidaEm,
        expira_em: janela24h.janelaExpiraEm,
      },
      envio_meta: envioWhatsApp.raw,
    },
  };

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .insert([
      {
        empresa_id: conversa.empresa_id,
        conversa_id,
        conversa_protocolo_id: protocoloAtivo.id,
        remetente_tipo,
        remetente_id,
        conteudo,
        tipo_mensagem,
        origem: "enviada",
        status_envio: "enviada",
        mensagem_externa_id: envioWhatsApp.messageId,
        metadata_json: metadataFinal,
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