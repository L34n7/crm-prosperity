import { NextResponse } from "next/server";
import {
  isAdministrador,
  podeAtribuirConversas,
  podeVisualizarConversas,
} from "@/lib/auth/authorization";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { obterContadoresConversas } from "@/lib/conversas/contadores";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_VALIDOS = new Set([
  "aberta",
  "bot",
  "fila",
  "em_atendimento",
  "aguardando_cliente",
  "encerrado_manual",
  "encerrado_24h",
  "encerrado_aut",
]);

const PRIORIDADES_VALIDAS = new Set([
  "baixa",
  "media",
  "alta",
  "urgente",
]);

const CHIPS_VALIDOS = new Set([
  "",
  "Todas",
  "fila",
  "robo",
  "sem_responsavel",
  "urgentes",
  "minhas",
  "favoritos",
  "nao_lidas",
]);

type CursorConversas = {
  lastMessageAt: string | null;
  createdAt: string;
  id: string;
};

type ConversaResumo = {
  id: string;
  last_message_at: string | null;
  created_at: string;
  [key: string]: unknown;
};

function isUuid(valor: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    valor
  );
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
  return valor.trim().replace(/[%_]/g, "").slice(0, 80);
}

function getUuidParam(
  searchParams: URLSearchParams,
  nome: string,
  aceitarTodos = false
) {
  const valor = searchParams.get(nome)?.trim() || "";

  if (!valor || (aceitarTodos && valor === "todos")) {
    return null;
  }

  if (!isUuid(valor)) {
    throw new Error(`Parametro ${nome} invalido`);
  }

  return valor;
}

function parseCursor(valor: string | null): CursorConversas | null {
  if (!valor) return null;

  try {
    const cursor = JSON.parse(
      Buffer.from(valor, "base64url").toString("utf8")
    ) as Partial<CursorConversas>;

    if (
      !cursor.id ||
      !isUuid(cursor.id) ||
      !cursor.createdAt ||
      Number.isNaN(new Date(cursor.createdAt).getTime()) ||
      (cursor.lastMessageAt !== null &&
        cursor.lastMessageAt !== undefined &&
        Number.isNaN(new Date(cursor.lastMessageAt).getTime()))
    ) {
      return null;
    }

    return {
      id: cursor.id,
      createdAt: new Date(cursor.createdAt).toISOString(),
      lastMessageAt: cursor.lastMessageAt
        ? new Date(cursor.lastMessageAt).toISOString()
        : null,
    };
  } catch {
    return null;
  }
}

function criarCursor(conversa: ConversaResumo) {
  return Buffer.from(
    JSON.stringify({
      lastMessageAt: conversa.last_message_at || null,
      createdAt: conversa.created_at,
      id: conversa.id,
    } satisfies CursorConversas),
    "utf8"
  ).toString("base64url");
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() || null;
  const prioridade = searchParams.get("prioridade")?.trim() || null;
  const canal = searchParams.get("canal")?.trim() || "";
  const chip = searchParams.get("chip")?.trim() || "";
  const busca = limparTermoBusca(searchParams.get("busca") || "");
  const limite = getNumeroParam(searchParams, "limit", 20, 1, 50);
  const incluirTotais = searchParams.get("incluir_totais") === "true";
  const cursorRaw = searchParams.get("cursor");
  const cursor = parseCursor(cursorRaw);

  if (cursorRaw && !cursor) {
    return NextResponse.json(
      { ok: false, error: "Cursor de paginacao invalido" },
      { status: 400 }
    );
  }

  if (status && !STATUS_VALIDOS.has(status)) {
    return NextResponse.json(
      { ok: false, error: "Status invalido" },
      { status: 400 }
    );
  }

  if (prioridade && !PRIORIDADES_VALIDAS.has(prioridade)) {
    return NextResponse.json(
      { ok: false, error: "Prioridade invalida" },
      { status: 400 }
    );
  }

  if (!CHIPS_VALIDOS.has(chip)) {
    return NextResponse.json(
      { ok: false, error: "Filtro rapido invalido" },
      { status: 400 }
    );
  }

  let contatoId: string | null;
  let setorId: string | null;
  let responsavelId: string | null;
  let listaId: string | null;
  let integracaoWhatsappId: string | null;

  try {
    contatoId = getUuidParam(searchParams, "contato_id");
    setorId = getUuidParam(searchParams, "setor_id", true);
    responsavelId = getUuidParam(searchParams, "responsavel_id", true);
    listaId = getUuidParam(searchParams, "lista_id");
    integracaoWhatsappId = getUuidParam(
      searchParams,
      "integracao_whatsapp_id",
      true
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Filtro UUID invalido",
      },
      { status: 400 }
    );
  }

  const usuarioPodeAtribuir = await podeAtribuirConversas(usuario);
  const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
    usuario,
    empresaId: usuario.empresa_id,
  });

  if (
    integracaoWhatsappId &&
    !acessoIntegracoes.idsPermitidos.includes(integracaoWhatsappId)
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem acesso a esta integraÃ§Ã£o WhatsApp" },
      { status: 403 }
    );
  }

  const idsIntegracoesPermitidas = new Set(acessoIntegracoes.idsPermitidos);
  const precisaFiltrarIntegracao =
    Boolean(integracaoWhatsappId) || acessoIntegracoes.acessoRestrito;
  const limiteConsulta = precisaFiltrarIntegracao
    ? Math.min(limite * 5 + 1, 250)
    : limite + 1;
  const filtrosComuns = {
    status,
    prioridade,
    contatoId,
    setorId,
    responsavelId,
    busca,
    canal,
    listaId,
    integracaoWhatsappId,
    integracoesWhatsappIdsPermitidos: acessoIntegracoes.acessoRestrito
      ? acessoIntegracoes.idsPermitidos
      : [],
  };

  try {
    const listaPromise = supabaseAdmin.rpc("listar_conversas_resumo", {
      p_empresa_id: usuario.empresa_id,
      p_usuario_id: usuario.id,
      p_is_admin: isAdministrador(usuario),
      p_setores_ids: usuario.setores_ids ?? [],
      p_usuario_pode_atribuir: usuarioPodeAtribuir,
      p_status: status,
      p_prioridade: prioridade,
      p_contato_id: contatoId,
      p_setor_id: setorId,
      p_responsavel_id: responsavelId,
      p_busca: busca || null,
      p_canal: canal || null,
      p_chip: chip || null,
      p_lista_id: listaId,
      p_cursor_last_message_at: cursor?.lastMessageAt || null,
      p_cursor_created_at: cursor?.createdAt || null,
      p_cursor_id: cursor?.id || null,
      p_limite: limiteConsulta,
    });

    const totaisPromise = incluirTotais
      ? obterContadoresConversas({
          usuario,
          usuarioPodeAtribuir,
          filtros: filtrosComuns,
        })
      : Promise.resolve(null);

    const [listaResult, totaisChips] = await Promise.all([
      listaPromise,
      totaisPromise,
    ]);

    if (listaResult.error) {
      throw new Error(listaResult.error.message);
    }

    const recebidasRaw = (
      Array.isArray(listaResult.data) ? listaResult.data : []
    ) as ConversaResumo[];
    const recebidas = recebidasRaw.filter((conversa) => {
      const integracaoConversa = String(
        conversa.integracao_whatsapp_id || ""
      );

      if (integracaoWhatsappId && integracaoConversa !== integracaoWhatsappId) {
        return false;
      }

      if (!integracaoConversa) return true;

      return idsIntegracoesPermitidas.has(integracaoConversa);
    });
    const hasMore = recebidas.length > limite;
    const conversas = hasMore ? recebidas.slice(0, limite) : recebidas;
    const ultimaConversa = conversas[conversas.length - 1] || null;

    return NextResponse.json({
      ok: true,
      conversas,
      ...(totaisChips ? { totais_chips: totaisChips } : {}),
      pagination: {
        limit: limite,
        returned: conversas.length,
        hasMore,
        nextCursor:
          hasMore && ultimaConversa ? criarCursor(ultimaConversa) : null,
      },
    });
  } catch (error) {
    console.error("[CONVERSAS] Erro ao listar:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar conversas",
      },
      { status: 500 }
    );
  }
}
