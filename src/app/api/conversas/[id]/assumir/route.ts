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

    const { data: conversaAtualizada, error: updateError } = await supabaseAdmin
      .from("conversas")
      .update({
        responsavel_id: usuario.id,
        status: "em_atendimento",
        bot_ativo: false,
        closed_at: null,
        origem_atendimento: "manual",
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

    const agora = new Date().toISOString();

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
        ? "conversa_reaberta_assumida"
        : "conversa_assumida",
      descricao: conversaEncerradaReabrivel
        ? "Conversa reaberta e assumida"
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
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: conversaEncerradaReabrivel
        ? "Conversa reaberta e assumida com sucesso"
        : "Conversa assumida com sucesso",
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
