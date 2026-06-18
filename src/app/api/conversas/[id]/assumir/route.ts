import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import {
  isAdministrador,
  podeAssumirConversas,
} from "@/lib/auth/authorization";
import { getPoliticaAtendimentoDoUsuario } from "@/lib/configuracoes/politicas-atendimento";
import { verificarEEncerrarConversaSe24hExpirada } from "@/lib/whatsapp/verificar-expiracao-conversas";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

async function reabrirUltimoProtocoloEncerrado(
  empresaId: string,
  conversaId: string,
  dataReabertura: string
) {
  const { data: protocoloAtivo, error: protocoloAtivoError } =
    await supabaseAdmin
      .from("conversa_protocolos")
      .select("id, protocolo, tipo, ativo, started_at, closed_at")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

  if (protocoloAtivoError) {
    throw new Error(
      `Erro ao verificar protocolo ativo: ${protocoloAtivoError.message}`
    );
  }

  // Evita alterar ou duplicar caso já exista protocolo ativo.
  if (protocoloAtivo) {
    return protocoloAtivo;
  }

  const { data: ultimoProtocolo, error: ultimoProtocoloError } =
    await supabaseAdmin
      .from("conversa_protocolos")
      .select("id, protocolo, tipo, ativo, started_at, closed_at")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("ativo", false)
      .order("closed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (ultimoProtocoloError) {
    throw new Error(
      `Erro ao localizar último protocolo encerrado: ${ultimoProtocoloError.message}`
    );
  }

  if (!ultimoProtocolo) {
    throw new Error(
      "Nenhum protocolo encerrado foi encontrado para reabrir."
    );
  }

  const { data: protocoloReaberto, error: reabrirError } =
    await supabaseAdmin
      .from("conversa_protocolos")
      .update({
        ativo: true,
        closed_at: null,
        updated_at: dataReabertura,
      })
      .eq("id", ultimoProtocolo.id)
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .select("id, protocolo, tipo, ativo, started_at, closed_at")
      .single();

  if (reabrirError) {
    throw new Error(
      `Erro ao reabrir protocolo anterior: ${reabrirError.message}`
    );
  }

  return protocoloReaberto;
}

function formatarDataProtocolo(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}${mes}${dia}`;
}

function gerarNovoNumeroProtocolo() {
  const agora = new Date();

  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  const dataBase = `${ano}${mes}${dia}`;
  const identificadorUnico = crypto.randomUUID();

  return `ATD-${dataBase}-${identificadorUnico}`;
}

async function criarNovoProtocoloAtendimento(
  empresaId: string,
  conversaId: string,
  iniciadoEm: string
) {
  const MAX_TENTATIVAS = 3;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const protocolo = gerarNovoNumeroProtocolo();

    const { data, error } = await supabaseAdmin
      .from("conversa_protocolos")
      .insert({
        empresa_id: empresaId,
        conversa_id: conversaId,
        protocolo,
        tipo: "reabertura",
        ativo: true,
        started_at: iniciadoEm,
        closed_at: null,
        created_at: iniciadoEm,
        updated_at: iniciadoEm,
      })
      .select(
        "id, protocolo, tipo, ativo, started_at, closed_at"
      )
      .single();

    if (!error) {
      return data;
    }

    const protocoloDuplicado = error.code === "23505";

    if (!protocoloDuplicado) {
      throw new Error(
        `Erro ao criar novo protocolo: ${error.message}`
      );
    }

    console.warn(
      `[PROTOCOLO] Número duplicado detectado. Tentativa ${tentativa} de ${MAX_TENTATIVAS}.`
    );
  }

  throw new Error(
    "Não foi possível gerar um protocolo único após várias tentativas."
  );
}

type ConversaRow = {
  id: string;
  empresa_id: string;
  setor_id: string | null;
  responsavel_id: string | null;
  status: string | null;
  closed_at?: string | null;
  bot_ativo?: boolean | null;
  last_inbound_message_at?: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  console.log("[ASSUMIR] rota carregada");
  try {
    const { id } = await context.params;
    const auditMeta = getRequestAuditMetadata(request);

    const body = await request.json().catch(() => ({}));

    const modoProtocolo =
      body?.modo_protocolo === "novo" ? "novo" : "reabrir";
      
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
      .select("id, empresa_id, setor_id, responsavel_id, status, closed_at, bot_ativo, last_inbound_message_at")
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

    const STATUS_REABRIVEIS = ["encerrado_manual", "encerrado_aut"];
    const STATUS_NAO_REABRIR_MANUALMENTE = ["encerrado_24h"];

    const statusAtual = String(conversa.status || "");
    const conversaEncerradaReabrivel = STATUS_REABRIVEIS.includes(statusAtual);
    const conversaEncerrada24h =
      STATUS_NAO_REABRIR_MANUALMENTE.includes(statusAtual);

    if (conversaEncerrada24h) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta conversa foi encerrada por 24h. Para voltar a falar com o contato, envie um template aprovado.",
        },
        { status: 400 }
      );
    }

    if (conversaEncerradaReabrivel) {
      const expiracao = await verificarEEncerrarConversaSe24hExpirada({
        empresaId: conversa.empresa_id,
        conversaId: conversa.id,
        lastInboundMessageAt: conversa.last_inbound_message_at ?? null,
      });

      if (expiracao.expirada) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Esta conversa ultrapassou a janela de 24 horas desde a ultima mensagem do contato. Ela foi encerrada automaticamente; para voltar a falar com o contato, envie um template aprovado.",
          },
          { status: 400 }
        );
      }
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

    if (!conversaEncerradaReabrivel) {
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
    }

    if (
      conversaJaEhMinha &&
      !conversaEncerradaReabrivel &&
      conversa.bot_ativo !== true
    ) {
      return NextResponse.json({
        ok: true,
        message: "A conversa já está sob sua responsabilidade",
        conversa,
        politica_aplicada: politica,
      });
    }
    
    const agora = new Date().toISOString();
    
    const { data: conversaAtualizada, error: updateError } = await supabaseAdmin
      .from("conversas")
      .update({
        responsavel_id: usuario.id,
        status: "em_atendimento",
        bot_ativo: false,
        closed_at: null,
        origem_atendimento: "manual",
        updated_at: agora,
      })
      .eq("id", id)
      .select(`
        *,
        contatos (
          id,
          nome,
          telefone,
          email,
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
        )
      `)
      .single();

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    let protocoloAtual:
      | {
          id: string;
          protocolo: string;
          tipo: string;
          ativo: boolean;
          started_at: string | null;
          closed_at: string | null;
        }
      | null = null;

    if (conversaEncerradaReabrivel) {
      try {
        if (modoProtocolo === "novo") {
          protocoloAtual = await criarNovoProtocoloAtendimento(
            usuario.empresa_id,
            conversa.id,
            agora
          );
        } else {
          protocoloAtual = await reabrirUltimoProtocoloEncerrado(
            usuario.empresa_id,
            conversa.id,
            agora
          );
        }
      } catch (protocoloError) {
        console.error(
          "[ASSUMIR] Erro ao preparar protocolo:",
          protocoloError
        );

        const { error: rollbackError } = await supabaseAdmin
          .from("conversas")
          .update({
            responsavel_id: conversa.responsavel_id,
            status: conversa.status,
            bot_ativo: conversa.bot_ativo ?? false,
            closed_at: conversa.closed_at,
            updated_at: agora,
          })
          .eq("id", conversa.id)
          .eq("empresa_id", usuario.empresa_id);

        if (rollbackError) {
          console.error(
            "[ASSUMIR] Erro ao desfazer reabertura da conversa:",
            rollbackError
          );
        }

        return NextResponse.json(
          {
            ok: false,
            error:
              protocoloError instanceof Error
                ? protocoloError.message
                : "Não foi possível preparar o protocolo do atendimento.",
          },
          { status: 500 }
        );
      }
    }

      const { data: execucoesAtivas } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("id, metadata_json")
      .eq("empresa_id", usuario.empresa_id)
      .eq("conversa_id", id)
      .in("status", ["rodando", "aguardando"]);

    const execucaoIds = (execucoesAtivas || []).map((execucao) => execucao.id);

    if (execucaoIds.length > 0) {
      await Promise.all(
        (execucoesAtivas || []).map((execucao) =>
          supabaseAdmin
            .from("automacao_execucoes")
            .update({
              status: "cancelado",
              finished_at: agora,
              updated_at: agora,
              metadata_json: {
                ...(execucao.metadata_json || {}),
                motivo_cancelamento: "atendente_assumiu_conversa",
                cancelado_em: agora,
                usuario_responsavel_id: usuario.id,
              },
            })
            .eq("empresa_id", usuario.empresa_id)
            .eq("id", execucao.id)
            .in("status", ["rodando", "aguardando"])
        )
      );

      await supabaseAdmin
        .from("automacao_agendamentos")
        .update({
          status: "cancelado",
        })
        .eq("empresa_id", usuario.empresa_id)
        .in("execucao_id", execucaoIds)
        .eq("status", "pendente");
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "conversas",
      entidade: "conversa",
      entidade_id: id,
      acao: conversaEncerradaReabrivel
        ? modoProtocolo === "novo"
          ? "conversa_reaberta_novo_protocolo"
          : "conversa_reaberta_assumida"
        : "conversa_assumida",
      descricao: conversaEncerradaReabrivel
        ? modoProtocolo === "novo"
          ? "Conversa reaberta com novo protocolo de atendimento"
          : "Conversa reaberta com o protocolo anterior"
        : "Conversa assumida",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        responsavel_id: conversa.responsavel_id,
        status: conversa.status,
        closed_at: conversa.closed_at ?? null,
        bot_ativo: conversa.bot_ativo ?? null,
      },
      depois: {
        responsavel_id: usuario.id,
        status: "em_atendimento",
        closed_at: null,
        bot_ativo: false,
        execucoes_canceladas: execucaoIds.length,

        protocolo_id: protocoloAtual?.id || null,
        protocolo: protocoloAtual?.protocolo || null,
        protocolo_tipo: protocoloAtual?.tipo || null,

        modo_protocolo: conversaEncerradaReabrivel
          ? modoProtocolo
          : null,

        protocolo_reaberto:
          conversaEncerradaReabrivel &&
          modoProtocolo === "reabrir",

        protocolo_novo:
          conversaEncerradaReabrivel &&
          modoProtocolo === "novo",
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: conversaEncerradaReabrivel
        ? modoProtocolo === "novo"
          ? "Conversa reaberta com um novo protocolo de atendimento."
          : "Conversa reaberta com o protocolo anterior."
        : "Conversa assumida com sucesso.",
      conversa: conversaAtualizada,
      protocolo: protocoloAtual,
      modo_protocolo: modoProtocolo,
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
