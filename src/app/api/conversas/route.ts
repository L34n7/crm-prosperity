import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";
import { encerrarConversasExpiradas } from "@/lib/whatsapp/verificar-expiracao-conversas";

const supabaseAdmin = getSupabaseAdmin();

type ConversaComRelacionamentos = {
  id: string;
  empresa_id: string;
  contato_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  integracao_whatsapp_id: string | null;
  status: string;
  canal: string | null;
  prioridade: string | null;
  assunto: string | null;
  last_message_at: string | null;
  created_at: string;
  etiqueta_id?: string | null;
  etiqueta_cor?: string | null;
  favorita?: boolean;
  protocolo?: string | null;
  ultima_mensagem?: string | null;
  unread_count?: number | null;
  listas?: {
    id: string;
    nome: string;
  }[];
  etiquetas?: {
    id: string;
    nome: string;
    descricao: string | null;
    cor: string;
  } | null;
  contatos?: {
    id: string;
    nome: string | null;
    telefone: string | null;
    email: string | null;
    empresa?: string | null;
    observacoes?: string | null;
  } | null;
  setores?: {
    id: string;
    nome: string;
  } | null;
  responsavel?: {
    id: string;
    nome: string;
    email: string;
  } | null;
  integracoes_whatsapp?: {
    id: string;
    nome_conexao: string;
    numero: string;
  } | null;
};

type ConversaFavoritaRow = {
  conversa_id: string;
};

type ProtocoloAtivoRow = {
  conversa_id: string;
  protocolo: string;
};

type MensagemListaRow = {
  id: string;
  conversa_id: string;
  conteudo: string | null;
  tipo_mensagem: string | null;
  created_at: string;
  remetente_tipo?: string | null;
  origem?: string | null;
  status_envio?: string | null;
  metadata_json?: {
    caption?: string | null;
    filename?: string | null;
  } | null;
};

type ConversaLeituraRow = {
  conversa_id: string;
  ultima_mensagem_lida_at: string | null;
};

function isStatusValido(status: string | null) {
  if (!status) return false;

  return [
    "aberta",
    "bot",
    "fila",
    "em_atendimento",
    "aguardando_cliente",
    "encerrado_manual",
    "encerrado_24h",
    "encerrado_aut",
  ].includes(status);
}

function isPrioridadeValida(prioridade: string | null) {
  if (!prioridade) return false;

  return ["baixa", "media", "alta", "urgente"].includes(prioridade);
}

function getPreviewUltimaMensagem(mensagem?: MensagemListaRow | null) {
  if (!mensagem) return null;

  const conteudo = mensagem.conteudo?.trim();
  if (conteudo) return conteudo;

  const caption = mensagem.metadata_json?.caption?.trim();
  if (caption) return caption;

  switch (mensagem.tipo_mensagem) {
    case "imagem":
      return "📷 Imagem";
    case "audio":
      return "🎤 Áudio";
    case "video":
      return "🎬 Vídeo";
    case "documento":
      return mensagem.metadata_json?.filename?.trim()
        ? `📄 ${mensagem.metadata_json.filename.trim()}`
        : "📄 Documento";
    case "contato":
      return "👤 Contato compartilhado";
    case "localizacao":
      return "📍 Localização";
    case "template":
      return "📢 Template enviado";
    case "botao":
      return "🔘 Resposta por botão";
    case "lista":
      return "📋 Resposta por lista";
    case "unsupported":
      return "⚠️ Mensagem não suportada";
    default:
      return "Mensagem";
  }
}

export async function GET(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeVisualizarConversas(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar conversas" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const prioridade = searchParams.get("prioridade");
  const contatoId = searchParams.get("contato_id");
  const setorId = searchParams.get("setor_id");
  const responsavelId = searchParams.get("responsavel_id");

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  await encerrarConversasExpiradas(usuario.empresa_id);

  let query = supabaseAdmin
    .from("conversas")
    .select(`
      *,
      contatos (
        id,
        nome,
        telefone,
        email,
        empresa,
        observacoes
      ),
      setores (
        id,
        nome
      ),
      responsavel:usuarios (
        id,
        nome,
        email
      ),
      integracoes_whatsapp (
        id,
        nome_conexao,
        numero
      ),
      etiquetas (
        id,
        nome,
        descricao,
        cor
      )
    `)
    .eq("empresa_id", usuario.empresa_id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (status) {
    if (!isStatusValido(status)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido" },
        { status: 400 }
      );
    }

    query = query.eq("status", status);
  }

  if (prioridade) {
    if (!isPrioridadeValida(prioridade)) {
      return NextResponse.json(
        { ok: false, error: "Prioridade inválida" },
        { status: 400 }
      );
    }

    query = query.eq("prioridade", prioridade);
  }

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (setorId) {
    query = query.eq("setor_id", setorId);
  }

  if (responsavelId) {
    query = query.eq("responsavel_id", responsavelId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  let conversas = (data ?? []) as ConversaComRelacionamentos[];

  const { data: favoritos, error: favoritosError } = await supabaseAdmin
    .from("conversas_favoritas")
    .select("conversa_id")
    .eq("usuario_id", usuario.id)
    .eq("empresa_id", usuario.empresa_id);

  if (favoritosError) {
    return NextResponse.json(
      { ok: false, error: favoritosError.message },
      { status: 500 }
    );
  }

  const favoritosSet = new Set(
    ((favoritos ?? []) as ConversaFavoritaRow[]).map((item) => item.conversa_id)
  );

  const conversaIds = conversas.map((conversa) => conversa.id);

  let listasPorConversa = new Map<string, { id: string; nome: string }[]>();
  let protocolosAtivosPorConversa = new Map<string, string>();
  let ultimaMensagemPorConversa = new Map<string, MensagemListaRow>();
  let unreadCountPorConversa = new Map<string, number>();
  let leituraPorConversa = new Map<string, string | null>();

  if (conversaIds.length > 0) {
    const { data: itensListas, error: itensListasError } = await supabaseAdmin
      .from("conversas_listas_itens")
      .select(`
        conversa_id,
        lista_id,
        conversas_listas (
          id,
          nome
        )
      `)
      .in("conversa_id", conversaIds)
      .eq("empresa_id", usuario.empresa_id);

    if (itensListasError) {
      return NextResponse.json(
        { ok: false, error: itensListasError.message },
        { status: 500 }
      );
    }

    for (const item of itensListas ?? []) {
      const conversaId = item.conversa_id as string;
      const lista = Array.isArray(item.conversas_listas)
        ? item.conversas_listas[0]
        : item.conversas_listas;

      if (!lista?.id) continue;

      const atuais = listasPorConversa.get(conversaId) ?? [];
      atuais.push({
        id: lista.id,
        nome: lista.nome,
      });
      listasPorConversa.set(conversaId, atuais);
    }

    const { data: protocolosAtivos, error: protocolosError } = await supabaseAdmin
      .from("conversa_protocolos")
      .select("conversa_id, protocolo")
      .in("conversa_id", conversaIds)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true);

    if (protocolosError) {
      return NextResponse.json(
        { ok: false, error: protocolosError.message },
        { status: 500 }
      );
    }

    for (const item of (protocolosAtivos ?? []) as ProtocoloAtivoRow[]) {
      protocolosAtivosPorConversa.set(item.conversa_id, item.protocolo);
    }

    const { data: leituras, error: leiturasError } = await supabaseAdmin
      .from("conversa_leituras")
      .select("conversa_id, ultima_mensagem_lida_at")
      .in("conversa_id", conversaIds)
      .eq("empresa_id", usuario.empresa_id)
      .eq("usuario_id", usuario.id);

    if (leiturasError) {
      return NextResponse.json(
        { ok: false, error: leiturasError.message },
        { status: 500 }
      );
    }

    for (const leitura of (leituras ?? []) as ConversaLeituraRow[]) {
      leituraPorConversa.set(
        leitura.conversa_id,
        leitura.ultima_mensagem_lida_at ?? null
      );
    }

    const { data: mensagensLista, error: mensagensListaError } = await supabaseAdmin
      .from("mensagens")
      .select(`
        id,
        conversa_id,
        conteudo,
        tipo_mensagem,
        created_at,
        remetente_tipo,
        origem,
        status_envio,
        metadata_json
      `)
      .in("conversa_id", conversaIds)
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (mensagensListaError) {
      return NextResponse.json(
        { ok: false, error: mensagensListaError.message },
        { status: 500 }
      );
    }

    for (const mensagem of (mensagensLista ?? []) as MensagemListaRow[]) {
      if (!ultimaMensagemPorConversa.has(mensagem.conversa_id)) {
        ultimaMensagemPorConversa.set(mensagem.conversa_id, mensagem);
      }

      const ehRecebida =
        mensagem.origem === "recebida" ||
        mensagem.remetente_tipo === "contato";

      if (!ehRecebida) continue;

      const ultimaLeitura = leituraPorConversa.get(mensagem.conversa_id) ?? null;

      if (!ultimaLeitura) {
        const atual = unreadCountPorConversa.get(mensagem.conversa_id) ?? 0;
        unreadCountPorConversa.set(mensagem.conversa_id, atual + 1);
        continue;
      }

      const mensagemTime = new Date(mensagem.created_at).getTime();
      const leituraTime = new Date(ultimaLeitura).getTime();

      if (Number.isNaN(mensagemTime) || Number.isNaN(leituraTime)) {
        continue;
      }

      if (mensagemTime >= leituraTime + 1) {
        const atual = unreadCountPorConversa.get(mensagem.conversa_id) ?? 0;
        unreadCountPorConversa.set(mensagem.conversa_id, atual + 1);
      }
    }
  }

  conversas = conversas.map((conversa) => ({
    ...conversa,
    favorita: favoritosSet.has(conversa.id),
    listas: listasPorConversa.get(conversa.id) ?? [],
    protocolo: protocolosAtivosPorConversa.get(conversa.id) ?? null,
    ultima_mensagem: getPreviewUltimaMensagem(
      ultimaMensagemPorConversa.get(conversa.id) ?? null
    ),
    unread_count: unreadCountPorConversa.get(conversa.id) ?? 0,
  }));

  if (isAdministrador(usuario)) {
    return NextResponse.json({
      ok: true,
      conversas,
    });
  }

  const setoresDoUsuario = usuario.setores_ids ?? [];
  const usuarioPodeAtribuir = await podeAtribuirConversas(usuario);

  if (usuarioPodeAtribuir) {
    if (setoresDoUsuario.length === 0) {
      return NextResponse.json({
        ok: true,
        conversas: [],
      });
    }

    conversas = conversas.filter((conversa) => {
      if (!conversa.setor_id) return false;
      return setoresDoUsuario.includes(conversa.setor_id);
    });

    return NextResponse.json({
      ok: true,
      conversas,
    });
  }

  conversas = conversas.filter((conversa) => {
    const conversaEhMinha = conversa.responsavel_id === usuario.id;

    const conversaEstaNaFilaDoMeuSetor =
      !!conversa.setor_id &&
      setoresDoUsuario.includes(conversa.setor_id) &&
      conversa.responsavel_id === null &&
      conversa.status === "fila";

    return conversaEhMinha || conversaEstaNaFilaDoMeuSetor;
  });

  return NextResponse.json({
    ok: true,
    conversas,
  });
}