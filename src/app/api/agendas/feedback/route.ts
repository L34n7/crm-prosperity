import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { validarCaptura } from "@/lib/automacoes/captura-normalizacao";
import { existeConflitoAgenda } from "@/lib/agendas/agenda-service";
import { sincronizarAgendamentoGoogleCalendar } from "@/lib/agendas/google-calendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  aplicarClassificacaoLeadContato,
  type ClassificacaoLead,
} from "@/lib/leads/classificacao";

const CLASSIFICACOES_ATENDIMENTO = new Set<ClassificacaoLead>([
  "qualificado",
  "convertido",
  "perdido",
]);

const VARIAVEL_RESULTADO_COMERCIAL = "agenda_resultado_comercial";
const LIMITE_CARACTERES_NOTA = 600;

export async function GET() {
  try {
    const resultado = await getUsuarioContexto({
      sincronizarAssinatura: false,
    });

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status },
      );
    }

    const { usuario } = resultado;
    const bloqueio = bloquearSemPermissao(
      usuario,
      "agendas.visualizar",
      "Você não tem permissão para visualizar os feedbacks da agenda.",
    );
    if (bloqueio) return bloqueio;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const [
      { data, error },
      { data: listas, error: listasError },
      { data: tipos, error: tiposError },
      { data: responsaveis, error: responsaveisError },
    ] = await Promise.all([
      supabase
        .from("agenda_agendamentos")
        .select(
          `
            id,
            empresa_id,
            agenda_id,
            contato_id,
            conversa_id,
            titulo,
            tipo_id,
            responsavel_id,
            prioridade,
            origem,
            local,
            link_reuniao,
            observacoes,
            nome_cliente,
            telefone_cliente,
            email_cliente,
            inicio_at,
            fim_at,
            status,
            feedback_solicitado_em,
            agenda_calendarios (
              id,
              nome
            ),
            contatos (
              id,
              nome,
              telefone,
              email,
              classificacao
            )
          `,
        )
        .eq("empresa_id", usuario.empresa_id)
        .in("status", ["agendado", "confirmado"])
        .not("feedback_solicitado_em", "is", null)
        .is("feedback_respondido_em", null)
        .order("fim_at", { ascending: true })
        .limit(100),
      supabase
        .from("conversas_listas")
        .select("id, nome")
        .eq("empresa_id", usuario.empresa_id)
        .order("nome", { ascending: true }),
      supabase
        .from("agenda_tipos")
        .select("id, nome, cor, padrao")
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true)
        .order("padrao", { ascending: false })
        .order("nome", { ascending: true }),
      supabase
        .from("usuarios")
        .select("id, nome, email")
        .eq("empresa_id", usuario.empresa_id)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
    ]);

    if (error) throw error;
    if (listasError) throw listasError;
    if (tiposError) throw tiposError;
    if (responsaveisError) throw responsaveisError;

    return NextResponse.json({
      ok: true,
      pendencias: data || [],
      quantidade: data?.length || 0,
      listas: listas || [],
      tipos: tipos || [],
      responsaveis: responsaveis || [],
      usuario_atual_id: usuario.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar feedbacks da agenda.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  let proximoCriadoId: string | null = null;
  let notaCriadaId: string | null = null;

  try {
    const resultado = await getUsuarioContexto();
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status },
      );
    }

    const bloqueio = bloquearSemPermissao(
      resultado.usuario,
      "agendas.gerenciar_agendamentos",
      "Você não tem permissão para registrar o resultado do agendamento.",
    );
    if (bloqueio) return bloqueio;

    const body = await request.json();
    const agendamentoId = String(body?.agendamento_id || "").trim();
    const resposta = String(body?.resposta || "").trim().toLowerCase();
    const resumoResultado = String(body?.resultado || "").trim();
    const observacoesInternas = String(body?.observacoes_internas || "").trim();
    const classificacao = String(body?.classificacao_atendimento || "")
      .trim()
      .toLowerCase() as ClassificacaoLead;
    const listaId = String(body?.lista_id || "").trim() || null;
    const proximoAtendimento =
      body?.proximo_atendimento && typeof body.proximo_atendimento === "object"
        ? body.proximo_atendimento
        : null;
    const valorVendaBruto = body?.valor_venda;
    const valorVenda =
      valorVendaBruto === null ||
      valorVendaBruto === undefined ||
      valorVendaBruto === ""
        ? null
        : Number(valorVendaBruto);

    if (
      !agendamentoId ||
      !["realizado", "faltou", "cancelado"].includes(resposta)
    ) {
      return NextResponse.json(
        { ok: false, error: "Informe um agendamento e um status final válido." },
        { status: 400 },
      );
    }

    if (!CLASSIFICACOES_ATENDIMENTO.has(classificacao)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Selecione uma classificação válida para o atendimento.",
        },
        { status: 400 },
      );
    }

    if (
      classificacao === "convertido" &&
      (valorVenda === null || !Number.isFinite(valorVenda) || valorVenda <= 0)
    ) {
      return NextResponse.json(
        { ok: false, error: "Informe um valor de venda maior que zero." },
        { status: 400 },
      );
    }

    if (observacoesInternas.length > LIMITE_CARACTERES_NOTA) {
      return NextResponse.json(
        {
          ok: false,
          error: `As observações internas podem ter no máximo ${LIMITE_CARACTERES_NOTA} caracteres.`,
        },
        { status: 400 },
      );
    }

    const empresaId = resultado.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: agendamento, error: agendamentoError } = await supabase
      .from("agenda_agendamentos")
      .select(
        "id, empresa_id, agenda_id, contato_id, conversa_id, titulo, tipo_id, responsavel_id, nome_cliente, telefone_cliente, email_cliente, status, resultado, observacoes_internas",
      )
      .eq("id", agendamentoId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (agendamentoError) throw agendamentoError;
    if (!agendamento) {
      return NextResponse.json(
        { ok: false, error: "Agendamento não encontrado." },
        { status: 404 },
      );
    }

    let conversaVinculadaId: string | null = agendamento.conversa_id || null;
    if ((listaId || observacoesInternas) && !conversaVinculadaId && agendamento.contato_id) {
      const { data: conversa, error: conversaError } = await supabase
        .from("conversas")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("contato_id", agendamento.contato_id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conversaError) throw conversaError;
      conversaVinculadaId = conversa?.id || null;
    }

    if (listaId) {
      const { data: lista, error: listaError } = await supabase
        .from("conversas_listas")
        .select("id")
        .eq("id", listaId)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (listaError) throw listaError;
      if (!lista) {
        return NextResponse.json(
          { ok: false, error: "A lista selecionada não foi encontrada." },
          { status: 404 },
        );
      }

      if (!conversaVinculadaId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Este contato ainda não possui uma conversa para ser adicionado à lista.",
          },
          { status: 400 },
        );
      }
    }

    let proximoAgendamento: Record<string, unknown> | null = null;
    if (proximoAtendimento) {
      if (!agendamento.contato_id) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Este agendamento não possui contato vinculado para marcar o próximo atendimento.",
          },
          { status: 400 },
        );
      }

      const titulo = String(proximoAtendimento.titulo || "").trim();
      const tipoId = String(proximoAtendimento.tipo_id || "").trim() || null;
      const responsavelId =
        String(proximoAtendimento.responsavel_id || "").trim() || null;
      const descricao = String(proximoAtendimento.descricao || "").trim();
      const inicioAt = String(proximoAtendimento.inicio_at || "").trim();
      const inicioDate = new Date(inicioAt);

      if (!titulo) {
        return NextResponse.json(
          { ok: false, error: "Informe o título do próximo atendimento." },
          { status: 400 },
        );
      }

      if (!inicioAt || Number.isNaN(inicioDate.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Informe a data e hora do próximo atendimento." },
          { status: 400 },
        );
      }

      if (inicioDate.getTime() <= Date.now()) {
        return NextResponse.json(
          { ok: false, error: "O próximo atendimento precisa estar no futuro." },
          { status: 400 },
        );
      }

      const { data: agenda, error: agendaError } = await supabase
        .from("calendarios")
        .select("id, duracao_minutos")
        .eq("id", agendamento.agenda_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (agendaError) throw agendaError;
      if (!agenda) {
        return NextResponse.json(
          { ok: false, error: "O calendário deste atendimento não foi encontrado." },
          { status: 404 },
        );
      }

      if (tipoId) {
        const { data: tipo, error: tipoError } = await supabase
          .from("agenda_tipos")
          .select("id")
          .eq("id", tipoId)
          .eq("empresa_id", empresaId)
          .eq("ativo", true)
          .maybeSingle();
        if (tipoError) throw tipoError;
        if (!tipo) {
          return NextResponse.json(
            { ok: false, error: "O tipo do próximo atendimento não é válido." },
            { status: 400 },
          );
        }
      }

      if (responsavelId) {
        const { data: responsavel, error: responsavelError } = await supabase
          .from("usuarios")
          .select("id")
          .eq("id", responsavelId)
          .eq("empresa_id", empresaId)
          .eq("status", "ativo")
          .maybeSingle();
        if (responsavelError) throw responsavelError;
        if (!responsavel) {
          return NextResponse.json(
            { ok: false, error: "O responsável selecionado não é válido." },
            { status: 400 },
          );
        }
      }

      const { data: existente, error: existenteError } = await supabase
        .from("agenda_agendamentos")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("agenda_id", agendamento.agenda_id)
        .eq("metadata_json->>feedback_origem_agendamento_id", agendamentoId)
        .maybeSingle();

      if (existenteError) throw existenteError;

      if (existente) {
        proximoAgendamento = existente as Record<string, unknown>;
      } else {
        const fimAt = new Date(
          inicioDate.getTime() + Number(agenda.duracao_minutos || 60) * 60_000,
        ).toISOString();
        const inicioIso = inicioDate.toISOString();

        const conflito = await existeConflitoAgenda({
          supabase,
          empresaId,
          agendaId: agendamento.agenda_id,
          inicioAt: inicioIso,
          fimAt,
        });

        if (conflito) {
          return NextResponse.json(
            {
              ok: false,
              error: "Já existe um agendamento nesse horário para este calendário.",
            },
            { status: 409 },
          );
        }

        const { data: criado, error: proximoError } = await supabase
          .from("agenda_agendamentos")
          .insert({
            empresa_id: empresaId,
            agenda_id: agendamento.agenda_id,
            contato_id: agendamento.contato_id,
            conversa_id: conversaVinculadaId || agendamento.conversa_id || null,
            titulo,
            tipo_id: tipoId,
            responsavel_id: responsavelId,
            nome_cliente: agendamento.nome_cliente || null,
            telefone_cliente: agendamento.telefone_cliente || null,
            email_cliente: agendamento.email_cliente || null,
            inicio_at: inicioIso,
            fim_at: fimAt,
            status: "agendado",
            origem: "manual",
            observacoes: descricao || null,
            created_by: resultado.usuario.id,
            updated_by: resultado.usuario.id,
            metadata_json: {
              criado_pelo_feedback: true,
              feedback_origem_agendamento_id: agendamentoId,
            },
          })
          .select("*")
          .single();

        if (proximoError) throw proximoError;
        proximoCriadoId = criado.id;
        proximoAgendamento = criado as Record<string, unknown>;
      }
    }

    const agora = new Date().toISOString();
    const statusAnterior = agendamento.status;
    const resultadoAnterior = agendamento.resultado || null;
    const observacoesAnteriores = agendamento.observacoes_internas || null;

    const { data, error: feedbackError } = await supabase
      .from("agenda_agendamentos")
      .update({
        status: resposta,
        feedback_resultado: resposta,
        feedback_respondido_em: agora,
        feedback_respondido_por: resultado.usuario.id,
        resultado: resumoResultado || null,
        observacoes_internas: observacoesInternas || null,
        updated_at: agora,
        updated_by: resultado.usuario.id,
      })
      .eq("id", agendamentoId)
      .eq("empresa_id", empresaId)
      .in("status", ["agendado", "confirmado"])
      .not("feedback_solicitado_em", "is", null)
      .is("feedback_respondido_em", null)
      .select("*")
      .maybeSingle();

    if (feedbackError) throw feedbackError;

    if (!data) {
      if (proximoCriadoId) {
        await supabase
          .from("agenda_agendamentos")
          .delete()
          .eq("id", proximoCriadoId)
          .eq("empresa_id", empresaId);
      }
      return NextResponse.json(
        {
          ok: false,
          error: "Esta confirmação já foi respondida ou não está mais pendente.",
        },
        { status: 409 },
      );
    }

    if (observacoesInternas && conversaVinculadaId) {
      const { data: nota, error: notaError } = await supabase
        .from("conversas_notas")
        .insert({
          empresa_id: empresaId,
          conversa_id: conversaVinculadaId,
          autor_id: resultado.usuario.id,
          conteudo: observacoesInternas,
        })
        .select("id")
        .single();

      if (notaError) {
        await supabase
          .from("agenda_agendamentos")
          .update({
            status: statusAnterior,
            feedback_resultado: null,
            feedback_respondido_em: null,
            feedback_respondido_por: null,
            resultado: resultadoAnterior,
            observacoes_internas: observacoesAnteriores,
            updated_at: agora,
            updated_by: resultado.usuario.id,
          })
          .eq("id", agendamentoId)
          .eq("empresa_id", empresaId);
        if (proximoCriadoId) {
          await supabase
            .from("agenda_agendamentos")
            .delete()
            .eq("id", proximoCriadoId)
            .eq("empresa_id", empresaId);
        }
        throw notaError;
      }
      notaCriadaId = nota.id;
    }

    if (listaId && conversaVinculadaId) {
      const { error: listaItemError } = await supabase
        .from("conversas_listas_itens")
        .upsert(
          {
            empresa_id: empresaId,
            lista_id: listaId,
            conversa_id: conversaVinculadaId,
            criado_por: resultado.usuario.id,
          },
          { onConflict: "lista_id,conversa_id" },
        );

      if (listaItemError) throw listaItemError;
    }

    if (agendamento.contato_id) {
      await aplicarClassificacaoLeadContato({
        empresaId,
        contatoId: agendamento.contato_id,
        classificacao,
        origem: "agenda_feedback",
      });

      const { data: detalheExistente, error: detalheBuscaError } = await supabase
        .from("contato_informacoes_captura")
        .select("id, ativo")
        .eq("empresa_id", empresaId)
        .eq("contato_id", agendamento.contato_id)
        .eq("variavel_origem", VARIAVEL_RESULTADO_COMERCIAL)
        .limit(1)
        .maybeSingle();
      if (detalheBuscaError) throw detalheBuscaError;

      if (classificacao === "convertido" && valorVenda !== null) {
        const valorFormatado = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(valorVenda);
        const valorExibicao = `Convertido · ${valorFormatado}`;
        const validacao = validarCaptura("texto", valorExibicao);

        if (!validacao.valido) {
          throw new Error("Não foi possível normalizar o resultado comercial.");
        }

        const metadata = {
          origem: "agenda_feedback",
          tipo_registro: "resultado_comercial",
          classificacao: "convertido",
          valor_venda: valorVenda,
          valor_formatado: valorFormatado,
          agendamento_id: agendamentoId,
          status_final: resposta,
          resultado: resumoResultado || null,
          observacoes_internas: observacoesInternas || null,
          registrado_em: agora,
        };
        const detalhePayload = {
          valor: validacao.valorLimpo,
          valor_normalizado: `${VARIAVEL_RESULTADO_COMERCIAL}:${validacao.valorNormalizado}`,
          precisao_data: null,
          ativo: true,
          atualizado_por: resultado.usuario.id,
          metadata_json: metadata,
        };

        if (detalheExistente?.id) {
          const { error: detalheAtualizacaoError } = await supabase
            .from("contato_informacoes_captura")
            .update(detalhePayload)
            .eq("id", detalheExistente.id)
            .eq("empresa_id", empresaId)
            .eq("contato_id", agendamento.contato_id);
          if (detalheAtualizacaoError) throw detalheAtualizacaoError;
        } else {
          const { error: detalheCriacaoError } = await supabase
            .from("contato_informacoes_captura")
            .insert({
              empresa_id: empresaId,
              contato_id: agendamento.contato_id,
              tipo: "texto",
              nome_campo: "pendente",
              sequencia: null,
              variavel_origem: VARIAVEL_RESULTADO_COMERCIAL,
              criado_por: resultado.usuario.id,
              ...detalhePayload,
            });
          if (detalheCriacaoError) throw detalheCriacaoError;
        }
      } else if (detalheExistente?.id && detalheExistente.ativo) {
        const { error: detalheRemocaoError } = await supabase
          .from("contato_informacoes_captura")
          .update({
            ativo: false,
            atualizado_por: resultado.usuario.id,
          })
          .eq("id", detalheExistente.id)
          .eq("empresa_id", empresaId)
          .eq("contato_id", agendamento.contato_id);
        if (detalheRemocaoError) throw detalheRemocaoError;
      }
    }

    await supabase
      .from("notificacoes")
      .update({ lida: true, read_at: agora })
      .eq("empresa_id", empresaId)
      .eq("metadata_json->>tipo_notificacao", "feedback_agendamento")
      .eq("metadata_json->>agenda_agendamento_id", agendamentoId);

    if (proximoAgendamento?.id) {
      await sincronizarAgendamentoGoogleCalendar({
        empresaId,
        agendamentoId: String(proximoAgendamento.id),
      }).catch((syncError) =>
        console.error(
          "[GOOGLE_CALENDAR] Erro ao sincronizar próximo atendimento criado pelo feedback:",
          syncError,
        ),
      );
    }

    const message =
      resposta === "realizado"
        ? "Agendamento marcado como realizado."
        : resposta === "cancelado"
          ? "Agendamento cancelado."
          : "Agendamento marcado como não realizado.";

    return NextResponse.json({
      ok: true,
      agendamento: data,
      classificacao,
      valor_venda: classificacao === "convertido" ? valorVenda : null,
      lista_id: listaId,
      nota_id: notaCriadaId,
      proximo_agendamento: proximoAgendamento,
      message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao registrar o resultado do agendamento.",
      },
      { status: 500 },
    );
  }
}
