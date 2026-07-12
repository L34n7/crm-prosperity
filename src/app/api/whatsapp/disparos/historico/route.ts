import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_HISTORICO = new Set([
  "todos",
  "sucesso",
  "falha",
  "processando",
]);

type CursorHistorico = {
  data: string;
  chave: string;
};

type RegistroHistoricoBanco = {
  cursor_data?: string | null;
  cursor_chave?: string | null;
  registro_id?: string | null;
  campanha_id?: string | null;
  campanha_nome?: string | null;
  numero?: string | null;
  nome_contato?: string | null;
  template_nome?: string | null;
  template_idioma?: string | null;
  template_categoria?: string | null;
  mensagem_template?: string | null;
  status_disparo?: string | null;
  status_label?: string | null;
  status_http?: number | null;
  message_id?: string | null;
  conversa_id?: string | null;
  conversa_protocolo_id?: string | null;
  contato_id?: string | null;
  integracao_whatsapp_id?: string | null;
  erro?: string | null;
  erro_codigo_meta?: string | number | null;
  metadata_json?: unknown;
  origem_historico?: string | null;
  ok?: boolean | null;
  status_campanha?: string | null;
  total_itens?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_cancelados?: number | null;
  pausa_motivo?: string | null;
};

function codificarCursor(cursor: CursorHistorico) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodificarCursor(valor: string | null): CursorHistorico | null {
  if (!valor) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(valor, "base64url").toString("utf8")
    ) as Partial<CursorHistorico>;

    if (
      !parsed.data ||
      !parsed.chave ||
      Number.isNaN(new Date(parsed.data).getTime())
    ) {
      return null;
    }

    return {
      data: parsed.data,
      chave: parsed.chave,
    };
  } catch {
    return null;
  }
}

function traduzirPausaCampanhaDisparo(
  status?: string | null,
  motivo?: string | null,
  erro?: string | null
) {
  const detalhe = motivo || erro;

  if (detalhe) return detalhe;

  switch (status) {
    case "pausada_por_conta_bloqueada":
      return "O disparo em massa foi cancelado porque a Meta sinalizou bloqueio ou desativacao da conta WhatsApp Business.";

    case "pausada_por_lista_invalida":
      return "O disparo em massa foi cancelado porque a lista apresentou muitos numeros invalidos ou indisponiveis.";

    case "pausada_por_erro_meta":
      return "O disparo em massa foi cancelado porque a Meta retornou erros que exigem pausa operacional.";

    case "pausada_por_falhas":
      return "O disparo em massa foi cancelado automaticamente porque muitas mensagens falharam no lote processado.";

    case "cancelada":
      return "O disparo em massa foi cancelado antes de concluir todos os envios.";

    default:
      return "O disparo em massa foi interrompido para proteger a conta WhatsApp e a estabilidade do sistema.";
  }
}

function traduzirErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
) {
  const code = Number(codigo || 0);

  switch (code) {
    case 131031:
      return "A conta WhatsApp Business foi bloqueada ou desativada pela Meta. Enquanto o numero estiver bloqueado, nao e possivel enviar mensagens por essa integracao.";

    case 131042:
      return "A conta WhatsApp Business possui pendencias financeiras na Meta. Regularize o pagamento no Gerenciador de Negocios antes de tentar novamente.";

    case 131026:
      return "O numero do destinatario esta invalido, indisponivel ou nao pode receber mensagens pelo WhatsApp.";

    case 470:
      return "A janela de atendimento de 24 horas foi encerrada. Envie um template aprovado para iniciar uma nova conversa.";

    case 368:
      return "A conta WhatsApp esta temporariamente bloqueada pela Meta.";

    default:
      return erroTecnico || "Falha ao enviar mensagem pelo WhatsApp.";
  }
}

async function buscarCampanhasFiltroHistorico(
  empresaId: string,
  integracaoIds: string[]
) {
  if (integracaoIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("whatsapp_disparo_campanhas")
    .select(
      `
        id,
        nome,
        template_nome,
        total_itens,
        total_enviados,
        created_at,
        status
      `
    )
    .eq("empresa_id", empresaId)
    .in("integracao_whatsapp_id", integracaoIds)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error(
      "[HISTORICO DISPAROS] Erro ao buscar campanhas para filtro:",
      error
    );
    return [];
  }

  return data || [];
}

export async function GET(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Voce nao tem permissao para visualizar disparos.",
        },
        { status: 403 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const limiteParam = Number(searchParams.get("limit") || "7");
    const limite = Number.isFinite(limiteParam)
      ? Math.min(Math.max(Math.trunc(limiteParam), 1), 25)
      : 7;
    const cursorParam = searchParams.get("cursor");
    const cursor = decodificarCursor(cursorParam);

    if (cursorParam && !cursor) {
      return NextResponse.json(
        { ok: false, error: "Cursor de historico invalido." },
        { status: 400 }
      );
    }

    const statusParam = searchParams.get("status")?.trim().toLowerCase() || "";
    const status = STATUS_HISTORICO.has(statusParam) ? statusParam : "todos";
    const campanhaId =
      searchParams.get("campanha_id")?.trim() ||
      searchParams.get("campanha_disparo_id")?.trim() ||
      "";
    const busca = (searchParams.get("busca") || "").trim().slice(0, 120);
    const incluirTotais = searchParams.get("incluir_totais") === "true";
    const incluirCampanhas =
      searchParams.get("incluir_campanhas") === "true";
    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario,
      empresaId: usuario.empresa_id,
    });

    if (acessoIntegracoes.idsPermitidos.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          resultados: [],
          tem_mais: false,
          proximo_cursor: null,
          totais: incluirTotais
            ? { total: 0, sucesso: 0, processando: 0, falha: 0 }
            : null,
          ...(incluirCampanhas ? { campanhas: [] } : {}),
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    if (campanhaId) {
      const { data: campanhaFiltro } = await supabaseAdmin
        .from("whatsapp_disparo_campanhas")
        .select("id, integracao_whatsapp_id")
        .eq("id", campanhaId)
        .eq("empresa_id", usuario.empresa_id)
        .maybeSingle();

      if (
        campanhaFiltro?.integracao_whatsapp_id &&
        !acessoIntegracoes.idsPermitidos.includes(
          campanhaFiltro.integracao_whatsapp_id
        )
      ) {
        return NextResponse.json(
          { ok: false, error: "Sem acesso a esta integracao WhatsApp." },
          { status: 403 }
        );
      }
    }

    const consultaPagina = supabaseAdmin.rpc(
      "buscar_whatsapp_disparo_historico_paginado",
      {
        p_empresa_id: usuario.empresa_id,
        p_limite: limite + 1,
        p_cursor_data: cursor?.data || null,
        p_cursor_chave: cursor?.chave || null,
        p_status: status,
        p_campanha_id: campanhaId || null,
        p_busca: busca || null,
      }
    );

    const consultaTotais = incluirTotais
      ? supabaseAdmin.rpc("contar_whatsapp_disparo_historico", {
          p_empresa_id: usuario.empresa_id,
          p_campanha_id: campanhaId || null,
          p_busca: busca || null,
        })
      : Promise.resolve({ data: null, error: null });

    const consultaCampanhas = incluirCampanhas
      ? buscarCampanhasFiltroHistorico(
          usuario.empresa_id,
          acessoIntegracoes.idsPermitidos
        )
      : Promise.resolve(null);

    const [
      { data: paginaData, error: paginaError },
      { data: totaisData, error: totaisError },
      campanhas,
    ] = await Promise.all([
      consultaPagina,
      consultaTotais,
      consultaCampanhas,
    ]);

    if (paginaError) {
      const funcaoHistoricoAusente =
        paginaError.code === "PGRST202" ||
        paginaError.message.includes(
          "buscar_whatsapp_disparo_historico_paginado"
        );

      return NextResponse.json(
        {
          ok: false,
          error: funcaoHistoricoAusente
            ? "A migration do histórico paginado ainda não foi aplicada neste banco de dados."
            : `Erro ao buscar historico paginado: ${paginaError.message}`,
        },
        { status: 500 }
      );
    }

    if (totaisError) {
      console.error(
        "[HISTORICO DISPAROS] Erro ao calcular totais:",
        totaisError
      );
    }

    const registrosBanco = Array.isArray(paginaData)
      ? (paginaData as RegistroHistoricoBanco[])
      : [];
    const temMais = registrosBanco.length > limite;
    const pagina = temMais ? registrosBanco.slice(0, limite) : registrosBanco;

    const resultados = pagina.map((item) => {
      const campanhaPausada =
        item.origem_historico === "campanha_pausada";
      const motivoCampanha = campanhaPausada
        ? traduzirPausaCampanhaDisparo(
            item.status_campanha,
            item.pausa_motivo,
            item.erro
          )
        : null;

      return {
        id: item.registro_id || null,
        campanha_id: item.campanha_id || null,
        campanha_nome: item.campanha_nome || null,
        created_at: item.cursor_data || null,
        conversa_id: item.conversa_id || null,
        conversa_protocolo_id: item.conversa_protocolo_id || null,
        contato_id: item.contato_id || null,
        integracao_whatsapp_id: item.integracao_whatsapp_id || null,
        numero: item.numero || "-",
        nome_contato: item.nome_contato || "Sem nome",
        template_nome: item.template_nome || "-",
        template_idioma: item.template_idioma || null,
        template_categoria: item.template_categoria || null,
        mensagem_template:
          motivoCampanha || item.mensagem_template || "Sem conteudo",
        status_disparo: item.status_disparo || "pendente",
        status_label: item.status_label || "Pendente",
        status_http: item.status_http || null,
        message_id: item.message_id || null,
        erro: item.erro || null,
        erro_amigavel: campanhaPausada
          ? motivoCampanha
          : traduzirErroMetaWhatsApp(item.erro_codigo_meta, item.erro),
        erro_codigo_meta: item.erro_codigo_meta || null,
        metadata_json: item.metadata_json || {},
        origem_historico: item.origem_historico || "manual",
        ok: item.ok === true,
        status_campanha: item.status_campanha || null,
        total_itens: item.total_itens || 0,
        total_enviados: item.total_enviados || 0,
        total_falhas: item.total_falhas || 0,
        total_cancelados: item.total_cancelados || 0,
        pausa_motivo: motivoCampanha || item.pausa_motivo || null,
      };
    }).filter((item) =>
      item.integracao_whatsapp_id
        ? acessoIntegracoes.idsPermitidos.includes(item.integracao_whatsapp_id)
        : true
    );

    const ultimo = pagina[pagina.length - 1];
    const proximoCursor =
      temMais && ultimo?.cursor_data && ultimo?.cursor_chave
        ? codificarCursor({
            data: ultimo.cursor_data,
            chave: ultimo.cursor_chave,
          })
        : null;
    const totaisRaw = Array.isArray(totaisData) ? totaisData[0] : null;
    const totais = totaisRaw
      ? {
          total: Number(totaisRaw.total || 0),
          sucesso: Number(totaisRaw.sucesso || 0),
          processando: Number(totaisRaw.processando || 0),
          falha: Number(totaisRaw.falha || 0),
        }
      : null;

    return NextResponse.json(
      {
        ok: true,
        resultados,
        tem_mais: temMais,
        proximo_cursor: proximoCursor,
        totais,
        ...(campanhas ? { campanhas } : {}),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar historico.",
      },
      { status: 500 }
    );
  }
}
