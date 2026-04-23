import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import {
  WHATSAPP_TEMPLATE_PRICING,
  USD_BRL_EXCHANGE_RATE,
  type CategoriaTemplateCobranca,
} from "@/lib/whatsapp/pricing";

type BodyRequest = {
  categoria?: string | null;
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

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as BodyRequest;
    const categoria = String(body?.categoria || "").toLowerCase();

    if (!categoriaValida(categoria)) {
      return NextResponse.json(
        { ok: false, error: "Categoria inválida. Use marketing ou utility." },
        { status: 400 }
      );
    }

    const contatosRecebidos = Array.isArray(body?.contatos) ? body.contatos : [];

    const { cotacao, fonte, dataHora, fallback } = await obterCotacaoUsdBrlAtual();

    if (contatosRecebidos.length === 0) {
      return NextResponse.json({
        ok: true,
        categoria,
        totalSelecionados: 0,
        totalIsentos: 0,
        totalCobrados: 0,
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

    const { data: conversasData, error: conversasError } = await supabaseAdmin
      .from("conversas")
      .select(`
        id,
        empresa_id,
        contato_id,
        status,
        contatos:contato_id (
          id,
          telefone
        ),
        conversa_protocolos (
          id,
          ativo,
          closed_at
        )
      `)
      .eq("empresa_id", usuario.empresa_id);

    if (conversasError) {
      return NextResponse.json(
        { ok: false, error: conversasError.message },
        { status: 500 }
      );
    }

    const STATUS_NAO_ISENTO = [
      "encerrado_manual",
      "encerrado_24h",
      "encerrado_aut",
    ];

    const telefonesComProtocoloAtivo = new Set<string>();

    for (const conversa of conversasData || []) {
      const telefoneContato = (conversa as any)?.contatos?.telefone || "";
      const telefoneNormalizado = normalizarNumeroComparacao(telefoneContato);
      const statusConversa = String((conversa as any)?.status || "").trim();

      if (!telefoneNormalizado) continue;
      if (!telefonesSelecionados.includes(telefoneNormalizado)) continue;
      if (STATUS_NAO_ISENTO.includes(statusConversa)) continue;

      const protocolos = Array.isArray((conversa as any)?.conversa_protocolos)
        ? (conversa as any).conversa_protocolos
        : [];

      const temProtocoloAtivo = protocolos.some(
        (protocolo: any) => protocolo?.ativo === true
      );

      if (temProtocoloAtivo) {
        telefonesComProtocoloAtivo.add(telefoneNormalizado);
      }
    }

    const totalSelecionados = contatosNormalizados.length;

    const totalIsentos =
      categoria === "utility"
        ? contatosNormalizados.filter((item) =>
            telefonesComProtocoloAtivo.has(item.telefoneNormalizado)
          ).length
        : 0;

    const totalCobrados =
      categoria === "marketing"
        ? totalSelecionados
        : Math.max(0, totalSelecionados - totalIsentos);

    const valorUnitarioUsd = WHATSAPP_TEMPLATE_PRICING[categoria].usd;
    const valorTotalUsd = Number((totalCobrados * valorUnitarioUsd).toFixed(4));

    const valorTotalBrlEstimado = valorTotalUsd * cotacao;

    let valorTotalBrlMin = valorTotalBrlEstimado * 0.98;
    let valorTotalBrlMax = valorTotalBrlEstimado * 1.04;

    // 🔥 GARANTIR DIFERENÇA MÍNIMA
    if ((valorTotalBrlMax - valorTotalBrlMin) < 0.02) {
      valorTotalBrlMin = valorTotalBrlEstimado - 0.01;
      valorTotalBrlMax = valorTotalBrlEstimado + 0.01;
    }

    // agora sim arredonda
    valorTotalBrlMin = Number(valorTotalBrlMin.toFixed(2));
    valorTotalBrlMax = Number(valorTotalBrlMax.toFixed(2));

    return NextResponse.json({
      ok: true,
      categoria,
      totalSelecionados,
      totalIsentos,
      totalCobrados,
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