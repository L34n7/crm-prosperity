import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
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
    origem?: string | null;
    status_lead?: string | null;
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

type MensagemNaoLidaRow = {
  conversa_id: string;
  created_at: string;
};

type ConversaContagemRow = {
  id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status: string | null;
  bot_ativo?: boolean | null;
};

type TotaisChipsRapidos = {
  Todas: number;
  minhas: number;
  favoritos: number;
  sem_responsavel: number;
  nao_lidas: number;
  robo: number;
};

type DisparoPendenteRow = {
  id: string;
  conversa_id: string | null;
  executar_em: string;
  payload_json?: {
    template_nome?: string | null;
  } | null;
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

function getNumeroParam(
  searchParams: URLSearchParams,
  nome: string,
  padrao: number,
  minimo: number,
  maximo: number
) {
  const valor = Number(searchParams.get(nome));

  if (!Number.isFinite(valor)) return padrao;

  return Math.min(Math.max(Math.floor(valor), minimo), maximo);
}

function limparTermoBusca(valor: string) {
  return valor
    .trim()
    .replace(/[%_]/g, "")
    .replace(/[()]/g, "")
    .slice(0, 80);
}

function isUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor
  );
}

async function buscarConversaIdsNaoLidas({
  empresaId,
  usuarioId,
}: {
  empresaId: string;
  usuarioId: string;
}) {
  const { data: leituras, error: leiturasError } = await supabaseAdmin
    .from("conversa_leituras")
    .select("conversa_id, ultima_mensagem_lida_at")
    .eq("empresa_id", empresaId)
    .eq("usuario_id", usuarioId);

  if (leiturasError) {
    throw new Error(leiturasError.message);
  }

  const leituraPorConversa = new Map<string, string | null>();

  for (const leitura of (leituras ?? []) as ConversaLeituraRow[]) {
    leituraPorConversa.set(
      leitura.conversa_id,
      leitura.ultima_mensagem_lida_at ?? null
    );
  }

  const { data: mensagens, error: mensagensError } = await supabaseAdmin
    .from("mensagens")
    .select("conversa_id, created_at")
    .eq("empresa_id", empresaId)
    .or("origem.eq.recebida,remetente_tipo.eq.contato")
    .order("created_at", { ascending: false })
    .limit(10000);

  if (mensagensError) {
    throw new Error(mensagensError.message);
  }

  const conversaIdsNaoLidas = new Set<string>();

  for (const mensagem of (mensagens ?? []) as MensagemNaoLidaRow[]) {
    if (!mensagem.conversa_id || conversaIdsNaoLidas.has(mensagem.conversa_id)) {
      continue;
    }

    const ultimaLeitura = leituraPorConversa.get(mensagem.conversa_id) ?? null;

    if (!ultimaLeitura) {
      conversaIdsNaoLidas.add(mensagem.conversa_id);
      continue;
    }

    const mensagemTime = new Date(mensagem.created_at).getTime();
    const leituraTime = new Date(ultimaLeitura).getTime();

    if (Number.isNaN(mensagemTime) || Number.isNaN(leituraTime)) {
      continue;
    }

    if (mensagemTime >= leituraTime + 1) {
      conversaIdsNaoLidas.add(mensagem.conversa_id);
    }
  }

  return Array.from(conversaIdsNaoLidas);
}

function filtrarConversasPorPermissao<T extends ConversaContagemRow>({
  conversas,
  usuario,
  usuarioPodeAtribuir,
}: {
  conversas: T[];
  usuario: UsuarioContexto;
  usuarioPodeAtribuir: boolean;
}) {
  if (isAdministrador(usuario)) {
    return conversas;
  }

  const setoresDoUsuario = usuario.setores_ids ?? [];

  if (usuarioPodeAtribuir) {
    if (setoresDoUsuario.length === 0) return [];

    return conversas.filter((conversa) => {
      if (!conversa.setor_id) return false;
      return setoresDoUsuario.includes(conversa.setor_id);
    });
  }

  return conversas.filter((conversa) => {
    const conversaEhMinha = conversa.responsavel_id === usuario.id;

    const conversaEstaNaFilaDoMeuSetor =
      !!conversa.setor_id &&
      setoresDoUsuario.includes(conversa.setor_id) &&
      conversa.responsavel_id === null &&
      conversa.status === "fila";

    return conversaEhMinha || conversaEstaNaFilaDoMeuSetor;
  });
}

async function buscarTotaisChipsRapidos({
  usuario,
  usuarioPodeAtribuir,
  status,
  prioridade,
  contatoId,
  setorId,
  responsavelId,
  busca,
  canal,
}: {
  usuario: UsuarioContexto;
  usuarioPodeAtribuir: boolean;
  status: string | null;
  prioridade: string | null;
  contatoId: string | null;
  setorId: string | null;
  responsavelId: string | null;
  busca: string;
  canal: string;
}): Promise<TotaisChipsRapidos> {
  if (!usuario.empresa_id) {
    return {
      Todas: 0,
      minhas: 0,
      favoritos: 0,
      sem_responsavel: 0,
      nao_lidas: 0,
      robo: 0,
    };
  }

  let query = supabaseAdmin
    .from("conversas")
    .select("id, setor_id, responsavel_id, status, bot_ativo")
    .eq("empresa_id", usuario.empresa_id)
    .limit(10000);

  if (status) {
    query = query.eq("status", status);
  }

  if (prioridade) {
    query = query.eq("prioridade", prioridade);
  }

  if (canal && canal !== "todos") {
    query = query.eq("canal", canal);
  }

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (setorId && setorId !== "todos") {
    query = query.eq("setor_id", setorId);
  }

  if (responsavelId && responsavelId !== "todos") {
    query = query.eq("responsavel_id", responsavelId);
  }

  if (busca) {
    const termo = limparTermoBusca(busca);

    if (termo) {
      const { data: contatosEncontrados, error: contatosBuscaError } =
        await supabaseAdmin
          .from("contatos")
          .select("id")
          .eq("empresa_id", usuario.empresa_id)
          .or(
            [
              `nome.ilike.%${termo}%`,
              `telefone.ilike.%${termo}%`,
              `email.ilike.%${termo}%`,
              `empresa.ilike.%${termo}%`,
            ].join(",")
          )
          .limit(500);

      if (contatosBuscaError) {
        throw new Error(contatosBuscaError.message);
      }

      const contatoIdsBusca = (contatosEncontrados ?? [])
        .map((item) => item.id)
        .filter(Boolean);

      const filtrosOr: string[] = [`assunto.ilike.%${termo}%`];

      if (isUuid(termo)) {
        filtrosOr.push(`id.eq.${termo}`);
      }

      if (contatoIdsBusca.length > 0) {
        filtrosOr.push(`contato_id.in.(${contatoIdsBusca.join(",")})`);
      }

      query = query.or(filtrosOr.join(","));
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const conversasPermitidas = filtrarConversasPorPermissao({
    conversas: (data ?? []) as ConversaContagemRow[],
    usuario,
    usuarioPodeAtribuir,
  });

  if (conversasPermitidas.length === 0) {
    return {
      Todas: 0,
      minhas: 0,
      favoritos: 0,
      sem_responsavel: 0,
      nao_lidas: 0,
      robo: 0,
    };
  }

  const conversaIdsPermitidas = new Set(
    conversasPermitidas.map((conversa) => conversa.id)
  );

  const [{ data: favoritos, error: favoritosError }, idsNaoLidas] =
    await Promise.all([
      supabaseAdmin
        .from("conversas_favoritas")
        .select("conversa_id")
        .eq("usuario_id", usuario.id)
        .eq("empresa_id", usuario.empresa_id),
      buscarConversaIdsNaoLidas({
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      }),
    ]);

  if (favoritosError) {
    throw new Error(favoritosError.message);
  }

  const favoritosSet = new Set(
    ((favoritos ?? []) as ConversaFavoritaRow[]).map((item) => item.conversa_id)
  );
  const naoLidasSet = new Set(idsNaoLidas);

  return {
    Todas: conversasPermitidas.length,
    minhas: conversasPermitidas.filter(
      (conversa) => conversa.responsavel_id === usuario.id
    ).length,
    favoritos: conversasPermitidas.filter((conversa) =>
      favoritosSet.has(conversa.id)
    ).length,
    sem_responsavel: conversasPermitidas.filter(
      (conversa) => !conversa.responsavel_id && conversa.bot_ativo === false
    ).length,
    nao_lidas: conversasPermitidas.filter(
      (conversa) =>
        conversaIdsPermitidas.has(conversa.id) && naoLidasSet.has(conversa.id)
    ).length,
    robo: conversasPermitidas.filter((conversa) => conversa.bot_ativo === true)
      .length,
  };
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

  const busca = searchParams.get("busca")?.trim() || "";
  const canal = searchParams.get("canal")?.trim() || "";
  const chip = searchParams.get("chip")?.trim() || "";
  const listaId = searchParams.get("lista_id")?.trim() || "";

  const limit = getNumeroParam(searchParams, "limit", 20, 1, 50);
  const offset = getNumeroParam(searchParams, "offset", 0, 0, 100000);

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  await encerrarConversasExpiradas(usuario.empresa_id);

  if (status && !isStatusValido(status)) {
    return NextResponse.json(
      { ok: false, error: "Status invÃ¡lido" },
      { status: 400 }
    );
  }

  if (prioridade && !isPrioridadeValida(prioridade)) {
    return NextResponse.json(
      { ok: false, error: "Prioridade invÃ¡lida" },
      { status: 400 }
    );
  }

  const usuarioPodeAtribuir = await podeAtribuirConversas(usuario);

  let totaisChipsRapidos: TotaisChipsRapidos;

  try {
    totaisChipsRapidos = await buscarTotaisChipsRapidos({
      usuario,
      usuarioPodeAtribuir,
      status,
      prioridade,
      contatoId,
      setorId,
      responsavelId,
      busca,
      canal,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar totais dos filtros",
      },
      { status: 500 }
    );
  }

  let query = supabaseAdmin
    .from("conversas")
    .select(`
      *,
      contatos (
        id,
        nome,
        telefone,
        email,
        origem,
        status_lead,
        empresa,
        observacoes,
        campanha,
        rastreamento_campanha_id,
        rastreamento_campanhas (
          id,
          nome,
          status,
          rastreamento_origens (
            id,
            nome
          )
        )
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
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

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

  if (canal && canal !== "todos") {
    query = query.eq("canal", canal);
  }

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (setorId && setorId !== "todos") {
    query = query.eq("setor_id", setorId);
  }

  if (responsavelId && responsavelId !== "todos") {
    query = query.eq("responsavel_id", responsavelId);
  }

  if (chip === "fila") {
    query = query.is("responsavel_id", null);
  }

  if (chip === "robo") {
    query = query.eq("bot_ativo", true);
  }

  if (chip === "sem_responsavel") {
    query = query.is("responsavel_id", null).eq("bot_ativo", false);
  }

  if (chip === "urgentes") {
    query = query.in("prioridade", ["alta", "urgente"]);
  }

  if (chip === "minhas") {
    query = query.eq("responsavel_id", usuario.id);
  }

  if (chip === "nao_lidas") {
    let idsNaoLidas: string[] = [];

    try {
      idsNaoLidas = await buscarConversaIdsNaoLidas({
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      });
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

    if (idsNaoLidas.length === 0) {
      return NextResponse.json({
        ok: true,
        conversas: [],
        totais_chips: totaisChipsRapidos,
        pagination: {
          limit,
          offset,
          returned: 0,
          hasMore: false,
        },
      });
    }

    query = query.in("id", idsNaoLidas);
  }

  if (busca) {
    const termo = limparTermoBusca(busca);

    if (termo) {
      const { data: contatosEncontrados, error: contatosBuscaError } =
        await supabaseAdmin
          .from("contatos")
          .select("id")
          .eq("empresa_id", usuario.empresa_id)
          .or(
            [
              `nome.ilike.%${termo}%`,
              `telefone.ilike.%${termo}%`,
              `email.ilike.%${termo}%`,
              `empresa.ilike.%${termo}%`,
            ].join(",")
          )
          .limit(500);

      if (contatosBuscaError) {
        return NextResponse.json(
          { ok: false, error: contatosBuscaError.message },
          { status: 500 }
        );
      }

      const contatoIdsBusca = (contatosEncontrados ?? [])
        .map((item) => item.id)
        .filter(Boolean);

      const filtrosOr: string[] = [
        `assunto.ilike.%${termo}%`,
      ];

      if (isUuid(termo)) {
        filtrosOr.push(`id.eq.${termo}`);
      }

      if (contatoIdsBusca.length > 0) {
        filtrosOr.push(`contato_id.in.(${contatoIdsBusca.join(",")})`);
      }

      query = query.or(filtrosOr.join(","));
    }
  }

  if (chip === "favoritos") {
    const { data: favoritosFiltro, error: favoritosFiltroError } =
      await supabaseAdmin
        .from("conversas_favoritas")
        .select("conversa_id")
        .eq("usuario_id", usuario.id)
        .eq("empresa_id", usuario.empresa_id);

    if (favoritosFiltroError) {
      return NextResponse.json(
        { ok: false, error: favoritosFiltroError.message },
        { status: 500 }
      );
    }

    const idsFavoritos = (favoritosFiltro ?? []).map((item) => item.conversa_id);

    if (idsFavoritos.length === 0) {
      return NextResponse.json({
        ok: true,
        conversas: [],
        totais_chips: totaisChipsRapidos,
        pagination: {
          limit,
          offset,
          returned: 0,
          hasMore: false,
        },
      });
    }

    query = query.in("id", idsFavoritos);
  }

  if (listaId) {
    const { data: itensListaFiltro, error: itensListaFiltroError } =
      await supabaseAdmin
        .from("conversas_listas_itens")
        .select("conversa_id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("lista_id", listaId);

    if (itensListaFiltroError) {
      return NextResponse.json(
        { ok: false, error: itensListaFiltroError.message },
        { status: 500 }
      );
    }

    const idsLista = (itensListaFiltro ?? []).map((item) => item.conversa_id);

    if (idsLista.length === 0) {
      return NextResponse.json({
        ok: true,
        conversas: [],
        totais_chips: totaisChipsRapidos,
        pagination: {
          limit,
          offset,
          returned: 0,
          hasMore: false,
        },
      });
    }

    query = query.in("id", idsLista);
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

  const listasPorConversa = new Map<string, { id: string; nome: string }[]>();
  const protocolosAtivosPorConversa = new Map<string, string>();
  const disparosPendentesPorConversa = new Map<
    string,
    {
      id: string;
      executar_em: string;
      template_nome: string | null;
    }
  >();
  const ultimaMensagemPorConversa = new Map<string, MensagemListaRow>();
  const unreadCountPorConversa = new Map<string, number>();
  const leituraPorConversa = new Map<string, string | null>();

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

    const limiteMensagensPorConversaParaLista = 30;
    const limiteMensagensLista = Math.min(
      conversaIds.length * limiteMensagensPorConversaParaLista,
      1200
    );

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
      .order("created_at", { ascending: false })
      .limit(limiteMensagensLista);

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

  if (conversaIds.length > 0) {
    const { data: disparosPendentes, error: disparosPendentesError } =
      await supabaseAdmin
        .from("automacao_agendamentos")
        .select("id, conversa_id:payload_json->>conversa_id, executar_em, payload_json")
        .eq("empresa_id", usuario.empresa_id)
        .eq("tipo_agendamento", "disparo_template")
        .eq("status", "pendente")
        .in("payload_json->>conversa_id", conversaIds)
        .order("executar_em", { ascending: true });

    if (disparosPendentesError) {
      return NextResponse.json(
        { ok: false, error: disparosPendentesError.message },
        { status: 500 }
      );
    }

    for (const disparo of (disparosPendentes || []) as DisparoPendenteRow[]) {
      const conversaId = String(disparo.conversa_id || "");

      if (!conversaId) continue;

      if (!disparosPendentesPorConversa.has(conversaId)) {
        disparosPendentesPorConversa.set(conversaId, {
          id: disparo.id,
          executar_em: disparo.executar_em,
          template_nome: disparo.payload_json?.template_nome || null,
        });
      }
    }
  }

  conversas = conversas.map((conversa) => {
    const disparoPendente = disparosPendentesPorConversa.get(conversa.id) || null;

    return {
      ...conversa,
      favorita: favoritosSet.has(conversa.id),
      listas: listasPorConversa.get(conversa.id) ?? [],
      protocolo: protocolosAtivosPorConversa.get(conversa.id) ?? null,
      ultima_mensagem: getPreviewUltimaMensagem(
        ultimaMensagemPorConversa.get(conversa.id) ?? null
      ),
      unread_count: unreadCountPorConversa.get(conversa.id) ?? 0,
      tem_disparo_agendado_pendente: !!disparoPendente,
      disparo_agendado_pendente: disparoPendente,
    };
  });

  if (isAdministrador(usuario)) {
    return NextResponse.json({
      ok: true,
      conversas,
      totais_chips: totaisChipsRapidos,
      pagination: {
        limit,
        offset,
        returned: conversas.length,
        hasMore: conversas.length === limit,
      },
    });
  }

  const setoresDoUsuario = usuario.setores_ids ?? [];

  if (usuarioPodeAtribuir) {
    if (setoresDoUsuario.length === 0) {
      return NextResponse.json({
        ok: true,
        conversas: [],
        totais_chips: totaisChipsRapidos,
        pagination: {
          limit,
          offset,
          returned: 0,
          hasMore: false,
        },
      });
    }

    conversas = conversas.filter((conversa) => {
      if (!conversa.setor_id) return false;
      return setoresDoUsuario.includes(conversa.setor_id);
    });

    return NextResponse.json({
      ok: true,
      conversas,
      totais_chips: totaisChipsRapidos,
      pagination: {
        limit,
        offset,
        returned: conversas.length,
        hasMore: conversas.length === limit,
      },
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
    totais_chips: totaisChipsRapidos,
    pagination: {
      limit,
      offset,
      returned: conversas.length,
      hasMore: conversas.length === limit,
    },
  });
}
