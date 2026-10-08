import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  WHATSAPP_TEMPLATE_PRICING,
  USD_BRL_EXCHANGE_RATE,
  type CategoriaTemplateCobranca,
} from "@/lib/whatsapp/pricing";
import { obterDisponibilidadeAgendamentoMeta } from "@/lib/whatsapp/meta-limites";

type BodyRequest = {
  categoria?: string | null;
  integracao_whatsapp_id?: string | null;
  executar_em?: string | null;
  contatos?: Array<{
    id?: string;
    telefone?: string | null;
  }>;
};

function limparNumero(valor?: string | null) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarNumeroComparacao(valor?: string | null) {
  const limpo = limparNumero(valor);

  if (!limpo) return "";

  const normalizado = normalizarTelefoneBrasilParaWhatsApp(limpo);
  return limparNumero(normalizado || limpo);
}

function categoriaValida(valor?: string | null): valor is CategoriaTemplateCobranca {
  return valor === "marketing" || valor === "utility";
}

const JANELA_24H_MS = 24 * 60 * 60 * 1000;
const JANELA_FREE_ENTRY_POINT_MS = 72 * 60 * 60 * 1000;
const TAMANHO_LOTE_CONVERSAS_FEP = 200;

function dividirEmLotes<T>(itens: T[], tamanho: number) {
  const lotes: T[][] = [];

  for (let indice = 0; indice < itens.length; indice += tamanho) {
    lotes.push(itens.slice(indice, indice + tamanho));
  }

  return lotes;
}

function referralEhFreeEntryPoint(valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;

  const referral = valor as Record<string, unknown>;
  const sourceType = String(referral.source_type || "").trim().toLowerCase();
  const ctwaClid = String(referral.ctwa_clid || "").trim();

  return sourceType === "ad" || Boolean(ctwaClid);
}

function formatarDataBCB(data: Date) {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${mes}-${dia}-${ano}`;
}

async function obterCotacaoUsdBrlAtual() {
  const hoje = new Date();
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(hoje.getDate() - 7);

  const dataInicial = formatarDataBCB(seteDiasAtras);
  const dataFinal = formatarDataBCB(hoje);

  const url =
    `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` +
    `CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?$top=100&$orderby=dataHoraCotacao desc&$format=json` +
    `&@dataInicial='${dataInicial}'&@dataFinalCotacao='${dataFinal}'`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Falha ao consultar PTAX: ${response.status}`);
    }

    const json = await response.json();
    const values = Array.isArray(json?.value) ? json.value : [];

    const ultimaCotacao = values.find(
      (item: any) =>
        typeof item?.cotacaoVenda === "number" &&
        !Number.isNaN(item.cotacaoVenda)
    );

    if (!ultimaCotacao) {
      throw new Error("Nenhuma cotação válida encontrada.");
    }

    return {
      cotacao: Number(ultimaCotacao.cotacaoVenda),
      fonte: "BCB/PTAX",
      dataHora: ultimaCotacao.dataHoraCotacao || null,
      fallback: false,
    };
  } catch {
    return {
      cotacao: Number(USD_BRL_EXCHANGE_RATE || 0),
      fonte: "fallback_interno",
      dataHora: null,
      fallback: true,
    };
  }
}

export async function POST(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    const bloqueio = bloquearSemPermissao(
      usuario,
      "whatsapp.disparos.visualizar",
      "Você não tem permissão para visualizar disparos.",
    );
    if (bloqueio) return bloqueio;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as BodyRequest;
    const categoria = String(body?.categoria || "").toLowerCase();
    const integracaoWhatsappId = String(
      body?.integracao_whatsapp_id || ""
    ).trim();
    const executarEmRecebido = String(body?.executar_em || "").trim();
    const executarEmData = executarEmRecebido
      ? new Date(executarEmRecebido)
      : null;
    const executarEmValido =
      executarEmData && Number.isFinite(executarEmData.getTime())
        ? executarEmData
        : null;
    const referenciaJanelaMs = executarEmValido
      ? executarEmValido.getTime()
      : Date.now();

    if (!categoriaValida(categoria)) {
      return NextResponse.json(
        { ok: false, error: "Categoria inválida. Use marketing ou utility." },
        { status: 400 }
      );
    }

    const contatosRecebidos = Array.isArray(body?.contatos)
      ? body.contatos
      : [];

    const { cotacao, fonte, dataHora, fallback } =
      await obterCotacaoUsdBrlAtual();

    if (contatosRecebidos.length === 0) {
      return NextResponse.json({
        ok: true,
        categoria,
        totalSelecionados: 0,
        totalIsentos: 0,
        totalCobrados: 0,
        totalTelefonesIsentosUnicos: 0,
        totalTelefonesCobradosUnicos: 0,
        telefonesIsentos: [],
        telefonesCobrados: [],
        totalTelefonesConsomemLimiteUnicos: 0,
        totalTelefonesIsentosLimiteUnicos: 0,
        telefonesConsomemLimite: [],
        telefonesIsentosLimite: [],
        valorUnitarioUsd: WHATSAPP_TEMPLATE_PRICING[categoria].usd,
        valorTotalUsd: 0,
        cotacaoUsdBrl: cotacao,
        valorTotalBrlEstimado: 0,
        valorTotalBrlMin: 0,
        valorTotalBrlMax: 0,
        margemMinPercent: -2,
        margemMaxPercent: 4,
        fonteCotacao: fonte,
        cotacaoDataHora: dataHora,
        cotacaoFallback: fallback,
      });
    }

    const contatosNormalizados = contatosRecebidos
      .map((contato) => ({
        id: contato.id || "",
        telefoneOriginal: contato.telefone || "",
        telefoneNormalizado: normalizarNumeroComparacao(contato.telefone),
      }))
      .filter((item) => item.telefoneNormalizado.length >= 10);

    const telefonesSelecionados = Array.from(
      new Set(contatosNormalizados.map((item) => item.telefoneNormalizado))
    );

    const supabaseAdmin = getSupabaseAdmin();

    let conversasQuery = supabaseAdmin
      .from("conversas")
      .select(`
        id,
        empresa_id,
        integracao_whatsapp_id,
        contato_id,
        status,
        last_inbound_message_at,
        contatos:contato_id (
          id,
          telefone
        )
      `)
      .eq("empresa_id", usuario.empresa_id);

    if (integracaoWhatsappId) {
      conversasQuery = conversasQuery.eq(
        "integracao_whatsapp_id",
        integracaoWhatsappId
      );
    }

    const { data: conversasData, error: conversasError } =
      await conversasQuery;

    if (conversasError) {
      return NextResponse.json(
        { ok: false, error: conversasError.message },
        { status: 500 }
      );
    }

    const telefonesSelecionadosSet = new Set(telefonesSelecionados);
    const telefonesDentroDaJanela24h = new Set<string>();
    const telefonePorConversaId = new Map<string, string>();

    for (const conversa of conversasData || []) {
      const telefoneContato = (conversa as any)?.contatos?.telefone || "";
      const telefoneNormalizado = normalizarNumeroComparacao(telefoneContato);
      const conversaId = String((conversa as any)?.id || "").trim();
      const lastInboundMessageAt =
        (conversa as any)?.last_inbound_message_at || null;

      if (!telefoneNormalizado) continue;
      if (!telefonesSelecionadosSet.has(telefoneNormalizado)) continue;

      if (conversaId) {
        telefonePorConversaId.set(conversaId, telefoneNormalizado);
      }

      if (!lastInboundMessageAt) continue;

      const dataUltimaMensagemContato = new Date(lastInboundMessageAt).getTime();

      if (Number.isNaN(dataUltimaMensagemContato)) continue;

      const diffMs = referenciaJanelaMs - dataUltimaMensagemContato;
      const dentroDaJanela24h =
        diffMs >= 0 && diffMs < JANELA_24H_MS;

      if (dentroDaJanela24h) {
        telefonesDentroDaJanela24h.add(telefoneNormalizado);
      }
    }

    // Desde 01/10/2026, Utility dentro da janela de 24h volta a ser cobrado.
    // A janela de 24h continua relevante para capacidade da Meta, mas nao
    // pode mais ser usada como isencao financeira.
    //
    // A isencao de entrega que permanece e o Free Entry Point (CTWA/CTA),
    // identificado pelo referral de anuncio dentro da janela valida de 72h.
    const telefonesFreeEntryPoint = new Set<string>();
    const conversaIdsSelecionadas = Array.from(telefonePorConversaId.keys());

    if (conversaIdsSelecionadas.length > 0) {
      const inicioFep = new Date(
        referenciaJanelaMs - JANELA_FREE_ENTRY_POINT_MS
      ).toISOString();
      const fimFep = new Date(referenciaJanelaMs).toISOString();

      for (const loteConversaIds of dividirEmLotes(
        conversaIdsSelecionadas,
        TAMANHO_LOTE_CONVERSAS_FEP
      )) {
        const { data: mensagensFep, error: mensagensFepError } =
          await supabaseAdmin
            .from("mensagens")
            .select("conversa_id, created_at, metadata_json")
            .eq("empresa_id", usuario.empresa_id)
            .eq("origem", "recebida")
            .in("conversa_id", loteConversaIds)
            .gte("created_at", inicioFep)
            .lte("created_at", fimFep);

        if (mensagensFepError) {
          return NextResponse.json(
            { ok: false, error: mensagensFepError.message },
            { status: 500 }
          );
        }

        for (const mensagem of mensagensFep || []) {
          const metadata =
            (mensagem as any)?.metadata_json &&
            typeof (mensagem as any).metadata_json === "object"
              ? (mensagem as any).metadata_json
              : null;

          if (!referralEhFreeEntryPoint(metadata?.referral)) continue;

          const conversaId = String((mensagem as any)?.conversa_id || "").trim();
          const telefone = telefonePorConversaId.get(conversaId);

          if (telefone) {
            telefonesFreeEntryPoint.add(telefone);
          }
        }
      }
    }

    const totalSelecionados = contatosNormalizados.length;
    const totalIsentos = contatosNormalizados.filter((item) =>
      telefonesFreeEntryPoint.has(item.telefoneNormalizado)
    ).length;
    const totalCobrados = Math.max(0, totalSelecionados - totalIsentos);

    const telefonesIsentos = telefonesSelecionados.filter((telefone) =>
      telefonesFreeEntryPoint.has(telefone)
    );
    const telefonesCobrados = telefonesSelecionados.filter(
      (telefone) => !telefonesFreeEntryPoint.has(telefone)
    );

    // Nao reutilizar cobranca para calcular capacidade. Marketing continua
    // consumindo limite conforme a regra existente. Utility com janela de
    // atendimento aberta permanece fora desse calculo de capacidade.
    const telefonesConsomemLimite =
      categoria === "utility"
        ? telefonesSelecionados.filter(
            (telefone) => !telefonesDentroDaJanela24h.has(telefone)
          )
        : telefonesSelecionados;
    const telefonesIsentosLimite = telefonesSelecionados.filter(
      (telefone) => !telefonesConsomemLimite.includes(telefone)
    );

    let disponibilidadeAgendamentoMeta = null;

    if (integracaoWhatsappId) {
      const { data: integracao, error: integracaoError } = await supabaseAdmin
        .from("integracoes_whatsapp")
        .select(
          "id, empresa_id, phone_number_id, business_portfolio_id, meta_messaging_limit, meta_messaging_limit_tier, meta_account_mode, quality_rating, config_json"
        )
        .eq("id", integracaoWhatsappId)
        .eq("empresa_id", usuario.empresa_id)
        .maybeSingle();

      if (integracaoError) {
        return NextResponse.json(
          { ok: false, error: integracaoError.message },
          { status: 500 }
        );
      }

      if (integracao) {
        disponibilidadeAgendamentoMeta =
          await obterDisponibilidadeAgendamentoMeta({
            empresaId: usuario.empresa_id,
            integracao,
            telefones: telefonesConsomemLimite,
            aPartirDe: executarEmValido,
          });
      }
    }

    const valorUnitarioUsd = WHATSAPP_TEMPLATE_PRICING[categoria].usd;
    const valorTotalUsd = Number((totalCobrados * valorUnitarioUsd).toFixed(4));

    const valorTotalBrlEstimado = valorTotalUsd * cotacao;

    let valorTotalBrlMin = valorTotalBrlEstimado * 0.98;
    let valorTotalBrlMax = valorTotalBrlEstimado * 1.04;

    if (valorTotalUsd === 0) {
      valorTotalBrlMin = 0;
      valorTotalBrlMax = 0;
    } else if (valorTotalBrlMax - valorTotalBrlMin < 0.02) {
      valorTotalBrlMin = valorTotalBrlEstimado - 0.01;
      valorTotalBrlMax = valorTotalBrlEstimado + 0.01;
    }

    valorTotalBrlMin = Number(valorTotalBrlMin.toFixed(2));
    valorTotalBrlMax = Number(valorTotalBrlMax.toFixed(2));

    return NextResponse.json({
      ok: true,
      categoria,
      totalSelecionados,
      totalIsentos,
      totalCobrados,
      totalTelefonesIsentosUnicos: telefonesIsentos.length,
      totalTelefonesCobradosUnicos: telefonesCobrados.length,
      telefonesIsentos,
      telefonesCobrados,
      totalTelefonesConsomemLimiteUnicos: telefonesConsomemLimite.length,
      totalTelefonesIsentosLimiteUnicos: telefonesIsentosLimite.length,
      telefonesConsomemLimite,
      telefonesIsentosLimite,
      criterioIsencaoCobranca: "free_entry_point_72h",
      utilityJanela24hIsento: false,
      valorUnitarioUsd,
      valorTotalUsd,
      cotacaoUsdBrl: cotacao,
      valorTotalBrlEstimado,
      valorTotalBrlMin,
      valorTotalBrlMax,
      margemMinPercent: -2,
      margemMaxPercent: 4,
      fonteCotacao: fonte,
      cotacaoDataHora: dataHora,
      cotacaoFallback: fallback,
      referenciaAgendamento: executarEmValido?.toISOString() || null,
      disponibilidadeAgendamentoMeta,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro interno ao calcular custo do disparo.",
      },
      { status: 500 }
    );
  }
}
