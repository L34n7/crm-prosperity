import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { validarCaptura } from "@/lib/automacoes/captura-normalizacao";
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

export async function GET() {
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
      "agendas.visualizar",
      "Você não tem permissão para visualizar os feedbacks da agenda.",
    );
    if (bloqueio) return bloqueio;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc(
      "agenda_etapa1_feedback_pendentes",
      { p_limite: 15 },
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, pendencias: data || [] });
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
        { ok: false, error: "Selecione uma classificação válida para o atendimento." },
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
      .select("id, empresa_id, contato_id, status")
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

    const agora = new Date().toISOString();
    let data: unknown = null;

    if (resposta === "cancelado") {
      const { data: cancelado, error: cancelamentoError } = await supabase
        .from("agenda_agendamentos")
        .update({
          status: "cancelado",
          feedback_resultado: "cancelado",
          feedback_respondido_em: agora,
          feedback_respondido_por: resultado.usuario.id,
          updated_at: agora,
          updated_by: resultado.usuario.id,
        })
        .eq("id", agendamentoId)
        .eq("empresa_id", empresaId)
        .select("*")
        .single();

      if (cancelamentoError) throw cancelamentoError;
      data = cancelado;
    } else {
      const { data: feedbackData, error } = await supabase.rpc(
        "agenda_etapa1_registrar_feedback",
        {
          p_agendamento_id: agendamentoId,
          p_resposta: resposta,
        },
      );
      if (error) throw error;
      data = feedbackData;
    }

    const { error: detalhesError } = await supabase
      .from("agenda_agendamentos")
      .update({
        resultado: resumoResultado || null,
        observacoes_internas: observacoesInternas || null,
        updated_at: agora,
        updated_by: resultado.usuario.id,
      })
      .eq("id", agendamentoId)
      .eq("empresa_id", empresaId);
    if (detalhesError) throw detalhesError;

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
