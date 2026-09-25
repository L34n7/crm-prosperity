import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { podeVisualizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";
import {
  WHATSAPP_TEMPLATE_PRICING,
  USD_BRL_EXCHANGE_RATE,
  type CategoriaTemplateCobranca,
} from "@/lib/whatsapp/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin = getSupabaseAdmin();

type LinhaRelatorio = {
  numero?: string | null;
  nome_contato?: string | null;
  status_disparo?: string | null;
  situacao?: string | null;
  primeira_resposta?: string | null;
  enviado_em?: string | null;
  lido_em?: string | null;
  resposta_em?: string | null;
  status_mensagem?: string | null;
  erro?: string | null;
};

type TotaisRelatorio = {
  total: number;
  enviado: number;
  entregue: number;
  lido: number;
  falha: number;
  cancelado: number;
  pendente: number;
  respondido: number;
};

function formatarDataHora(valor?: string | null) {
  if (!valor) return "";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

function formatarDataHoraCurta(valor?: string | null) {
  if (!valor) return "";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(data)
    .replace(",", "");
}

function nomeCampanhaRelatorio(campanha: {
  nome?: string | null;
  total_itens?: number | null;
  created_at?: string | null;
}) {
  const nome = String(campanha.nome || "").trim();
  if (nome) return nome;

  const total = Math.max(0, Number(campanha.total_itens || 0));
  const unidade = total === 1 ? "contato" : "contatos";
  const data =
    formatarDataHoraCurta(campanha.created_at) || "data nao informada";

  return `Disparo em massa - ${data} - ${total} ${unidade}`;
}

function normalizarCategoria(
  valor?: string | null
): CategoriaTemplateCobranca | null {
  const categoria = String(valor || "").trim().toLowerCase();
  return categoria === "marketing" || categoria === "utility"
    ? categoria
    : null;
}

function statusDetalhado(linha: LinhaRelatorio) {
  const statusMensagem = String(linha.status_mensagem || "")
    .trim()
    .toLowerCase();
  const statusDisparo = String(linha.status_disparo || "")
    .trim()
    .toLowerCase();

  if (statusMensagem === "lida") return "lido";
  if (statusMensagem === "entregue") return "entregue";
  if (statusMensagem === "enviada") return "enviado";
  if (statusMensagem === "falha") return "falha";

  if (statusDisparo === "falha") return "falha";
  if (statusDisparo === "cancelado") return "cancelado";
  if (statusDisparo === "processando") return "pendente";
  if (statusDisparo === "pendente") return "pendente";
  if (statusDisparo === "enviado" || statusDisparo === "sucesso") {
    return "enviado";
  }

  return "pendente";
}

function statusDetalhadoLabel(linha: LinhaRelatorio) {
  switch (statusDetalhado(linha)) {
    case "lido":
      return "Lido";
    case "entregue":
      return "Entregue";
    case "enviado":
      return "Enviado";
    case "falha":
      return "Falha";
    case "cancelado":
      return "Cancelado";
    default:
      return "Pendente";
  }
}

function calcularTotais(linhas: LinhaRelatorio[]): TotaisRelatorio {
  const totais: TotaisRelatorio = {
    total: linhas.length,
    enviado: 0,
    entregue: 0,
    lido: 0,
    falha: 0,
    cancelado: 0,
    pendente: 0,
    respondido: 0,
  };

  for (const linha of linhas) {
    const status = statusDetalhado(linha);
    totais[status] += 1;

    if (
      String(linha.situacao || "").trim().toLowerCase() === "respondido" ||
      Boolean(String(linha.primeira_resposta || "").trim())
    ) {
      totais.respondido += 1;
    }
  }

  return totais;
}

function limparNomeArquivo(valor: string) {
  return String(valor || "campanha")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campanha";
}

function aplicarEstiloCelula(
  sheet: XLSX.WorkSheet,
  endereco: string,
  estilo: Record<string, unknown>
) {
  const celula = sheet[endereco] as (XLSX.CellObject & {
    s?: Record<string, unknown>;
  }) | undefined;

  if (!celula) return;
  celula.s = estilo;
}

function aplicarEstiloIntervalo(
  sheet: XLSX.WorkSheet,
  intervalo: string,
  estilo: Record<string, unknown>
) {
  const range = XLSX.utils.decode_range(intervalo);

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      aplicarEstiloCelula(
        sheet,
        XLSX.utils.encode_cell({ r: row, c: col }),
        estilo
      );
    }
  }
}

function aplicarLarguras(sheet: XLSX.WorkSheet) {
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 36 },
    { wch: 21 },
    { wch: 21 },
    { wch: 21 },
    { wch: 16 },
    { wch: 34 },
  ];
}

const ESTILO_TITULO = {
  font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "173E3A" } },
  alignment: { vertical: "center", horizontal: "left" },
};

const ESTILO_SUBTITULO = {
  font: { bold: true, sz: 11, color: { rgb: "173E3A" } },
  fill: { patternType: "solid", fgColor: { rgb: "E8F2F0" } },
  alignment: { vertical: "center", horizontal: "left" },
};

const ESTILO_LABEL = {
  font: { bold: true, color: { rgb: "304B49" } },
  alignment: { vertical: "center" },
};

const ESTILO_CABECALHO_TABELA = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { patternType: "solid", fgColor: { rgb: "245B55" } },
  alignment: { vertical: "center", horizontal: "left", wrapText: true },
};

const ESTILO_TEXTO_WRAP = {
  alignment: { vertical: "top", wrapText: true },
};

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
      headers: { Accept: "application/json" },
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

async function calcularCustoEstimado(params: {
  categoria?: string | null;
  quantidade: number;
}) {
  const categoria = normalizarCategoria(params.categoria);
  const quantidade = Math.max(0, Number(params.quantidade || 0));
  const cotacao = await obterCotacaoUsdBrlAtual();

  if (!categoria) {
    return {
      disponivel: false,
      categoria: String(params.categoria || "").trim().toLowerCase() || null,
      quantidadeCobravelEstimada: quantidade,
      valorUnitarioUsd: 0,
      valorTotalUsd: 0,
      cotacaoUsdBrl: cotacao.cotacao,
      valorTotalBrlEstimado: 0,
      fonteCotacao: cotacao.fonte,
      cotacaoDataHora: cotacao.dataHora,
      cotacaoFallback: cotacao.fallback,
      criterio:
        "Categoria da campanha sem preço configurado para estimativa automática.",
    };
  }

  const valorUnitarioUsd = WHATSAPP_TEMPLATE_PRICING[categoria].usd;
  const valorTotalUsd = Number((quantidade * valorUnitarioUsd).toFixed(4));
  const valorTotalBrlEstimado = Number(
    (valorTotalUsd * cotacao.cotacao).toFixed(2)
  );

  return {
    disponivel: true,
    categoria,
    quantidadeCobravelEstimada: quantidade,
    valorUnitarioUsd,
    valorTotalUsd,
    cotacaoUsdBrl: cotacao.cotacao,
    valorTotalBrlEstimado,
    fonteCotacao: cotacao.fonte,
    cotacaoDataHora: cotacao.dataHora,
    cotacaoFallback: cotacao.fallback,
    criterio:
      "Estimativa calculada pela categoria do template e pela quantidade de disparos enviados. A cobrança final da Meta pode variar por regras de gratuidade, janela e precificação vigente.",
  };
}

export async function GET(req: NextRequest) {
  try {
    const contexto = await getUsuarioContexto();

    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const { usuario } = contexto;
    const empresaId = usuario?.empresa_id;

    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (!podeVisualizarDisparos(usuario)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não tem permissão para visualizar disparos.",
        },
        { status: 403 }
      );
    }

    const campanhaId = req.nextUrl.searchParams.get("campanha_id")?.trim();
    const formato =
      req.nextUrl.searchParams.get("formato")?.trim().toLowerCase() || "xlsx";

    if (!campanhaId) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma campanha para gerar o relatório." },
        { status: 400 }
      );
    }

    const { data: campanha, error: campanhaError } = await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .select(
        "id,nome,integracao_whatsapp_id,template_nome,template_categoria,status,total_itens,total_enviados,total_falhas,total_cancelados,created_at,finished_at"
      )
      .eq("id", campanhaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (campanhaError) {
      throw new Error(`Erro ao buscar a campanha: ${campanhaError.message}`);
    }

    if (!campanha) {
      return NextResponse.json(
        { ok: false, error: "Campanha não encontrada." },
        { status: 404 }
      );
    }

    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario,
      empresaId,
    });

    if (
      !acessoIntegracoes.idsPermitidos.includes(
        String(campanha.integracao_whatsapp_id || "")
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "Sem acesso a esta integração WhatsApp." },
        { status: 403 }
      );
    }

    const { data: linhasData, error: linhasError } = await supabaseAdmin.rpc(
      "relatorio_whatsapp_disparo_campanha",
      {
        p_empresa_id: empresaId,
        p_campanha_id: campanhaId,
      }
    );

    if (linhasError) {
      throw new Error(`Erro ao montar o relatório: ${linhasError.message}`);
    }

    const linhas = Array.isArray(linhasData)
      ? (linhasData as LinhaRelatorio[])
      : [];
    const totais = calcularTotais(linhas);
    const quantidadeBaseCusto = Math.max(
      0,
      Number(campanha.total_enviados || 0),
      totais.enviado + totais.entregue + totais.lido
    );
    const custoEstimado = await calcularCustoEstimado({
      categoria: campanha.template_categoria,
      quantidade: quantidadeBaseCusto,
    });
    const nomeCampanha = nomeCampanhaRelatorio(campanha);

    const linhasDetalhadas = linhas.map((linha) => ({
      ...linha,
      status_final: statusDetalhado(linha),
      status_label: statusDetalhadoLabel(linha),
    }));

    if (formato === "json") {
      return NextResponse.json(
        {
          ok: true,
          campanha: {
            id: campanha.id,
            nome: nomeCampanha,
            template_nome: campanha.template_nome || null,
            template_categoria: campanha.template_categoria || null,
            status: campanha.status || null,
            total_itens: Number(campanha.total_itens || linhas.length || 0),
            total_enviados: Number(campanha.total_enviados || 0),
            total_falhas: Number(campanha.total_falhas || 0),
            total_cancelados: Number(campanha.total_cancelados || 0),
            created_at: campanha.created_at || null,
            finished_at: campanha.finished_at || null,
          },
          totais,
          custo_estimado: custoEstimado,
          linhas: linhasDetalhadas,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    }

    const workbook = XLSX.utils.book_new();
    const categoriaLabel = String(campanha.template_categoria || "-");
    const statusCampanhaLabel =
      String(campanha.status || "-")
        .replace(/_/g, " ")
        .replace(/^./, (letra) => letra.toUpperCase());

    const resumo = XLSX.utils.aoa_to_sheet([
      ["Relatório detalhado de campanha WhatsApp", "", "", "", "", ""],
      [nomeCampanha, "", "", "", "", ""],
      [],
      ["DADOS DA CAMPANHA", "", "", "RESULTADOS", "", ""],
      ["Template", campanha.template_nome || "-", "", "Total de contatos", totais.total, ""],
      ["Categoria", categoriaLabel, "", "Enviados", totais.enviado, ""],
      ["Status", statusCampanhaLabel, "", "Entregues", totais.entregue, ""],
      ["Criada em", formatarDataHora(campanha.created_at), "", "Lidos", totais.lido, ""],
      ["Finalizada em", formatarDataHora(campanha.finished_at), "", "Respondidos", totais.respondido, ""],
      ["", "", "", "Falhas", totais.falha, ""],
      ["", "", "", "Cancelados", totais.cancelado, ""],
      ["", "", "", "Pendentes", totais.pendente, ""],
      [],
      ["ESTIMATIVA DE CUSTO", "", "", "", "", ""],
      ["Custo estimado (R$)", custoEstimado.valorTotalBrlEstimado, "", "", "", ""],
      ["Custo estimado (USD)", custoEstimado.valorTotalUsd, "", "", "", ""],
      ["Mensagens consideradas", custoEstimado.quantidadeCobravelEstimada, "", "", "", ""],
      ["Cotação USD/BRL", custoEstimado.cotacaoUsdBrl, "", "", "", ""],
      ["Fonte da cotação", custoEstimado.fonteCotacao, "", "", "", ""],
      [],
      ["OBSERVAÇÃO", "", "", "", "", ""],
      [custoEstimado.criterio || "", "", "", "", "", ""],
    ]);

    resumo["!merges"] = [
      XLSX.utils.decode_range("A1:F1"),
      XLSX.utils.decode_range("A2:F2"),
      XLSX.utils.decode_range("A4:B4"),
      XLSX.utils.decode_range("D4:E4"),
      XLSX.utils.decode_range("A14:B14"),
      XLSX.utils.decode_range("A21:F21"),
      XLSX.utils.decode_range("A22:F23"),
    ];
    resumo["!cols"] = [
      { wch: 24 },
      { wch: 34 },
      { wch: 4 },
      { wch: 22 },
      { wch: 14 },
      { wch: 4 },
    ];
    resumo["!rows"] = [
      { hpt: 26 },
      { hpt: 22 },
      { hpt: 8 },
      { hpt: 22 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 8 },
      { hpt: 22 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 8 },
      { hpt: 22 },
      { hpt: 38 },
      { hpt: 20 },
    ];

    aplicarEstiloIntervalo(resumo, "A1:F1", ESTILO_TITULO);
    aplicarEstiloIntervalo(resumo, "A2:F2", {
      font: { bold: true, sz: 12, color: { rgb: "173E3A" } },
      alignment: { vertical: "center", horizontal: "left" },
    });
    aplicarEstiloIntervalo(resumo, "A4:B4", ESTILO_SUBTITULO);
    aplicarEstiloIntervalo(resumo, "D4:E4", ESTILO_SUBTITULO);
    aplicarEstiloIntervalo(resumo, "A14:B14", ESTILO_SUBTITULO);
    aplicarEstiloIntervalo(resumo, "A21:F21", ESTILO_SUBTITULO);
    aplicarEstiloIntervalo(resumo, "A5:A9", ESTILO_LABEL);
    aplicarEstiloIntervalo(resumo, "D5:D12", ESTILO_LABEL);
    aplicarEstiloIntervalo(resumo, "A15:A19", ESTILO_LABEL);
    aplicarEstiloIntervalo(resumo, "A22:F23", ESTILO_TEXTO_WRAP);

    if (resumo.B15) resumo.B15.z = '"R$" #,##0.00';
    if (resumo.B16) resumo.B16.z = '"US$" #,##0.0000';
    if (resumo.B18) resumo.B18.z = "0.0000";

    resumo["!margins"] = {
      left: 0.35,
      right: 0.35,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    };

    XLSX.utils.book_append_sheet(workbook, resumo, "Resumo");

    const dadosContatos = [
      [
        nomeCampanha,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        `${totais.total} contatos • ${categoriaLabel} • ${statusCampanhaLabel}`,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [],
      [
        "Número",
        "Nome",
        "Status",
        "1ª mensagem respondida",
        "Enviado em",
        "Lido em",
        "Respondido em",
        "Situação",
        "Motivo da falha/recusa",
      ],
      ...linhasDetalhadas.map((linha) => [
        linha.numero || "",
        linha.nome_contato || "Sem nome",
        linha.status_label,
        linha.primeira_resposta || "",
        formatarDataHora(linha.enviado_em),
        formatarDataHora(linha.lido_em),
        formatarDataHora(linha.resposta_em),
        linha.situacao || "",
        linha.erro || "",
      ]),
    ];

    const contatos = XLSX.utils.aoa_to_sheet(dadosContatos);
    aplicarLarguras(contatos);
    contatos["!merges"] = [
      XLSX.utils.decode_range("A1:I1"),
      XLSX.utils.decode_range("A2:I2"),
    ];
    contatos["!rows"] = [
      { hpt: 26 },
      { hpt: 20 },
      { hpt: 8 },
      { hpt: 24 },
      ...linhasDetalhadas.map(() => ({ hpt: 30 })),
    ];

    aplicarEstiloIntervalo(contatos, "A1:I1", ESTILO_TITULO);
    aplicarEstiloIntervalo(contatos, "A2:I2", {
      font: { bold: true, color: { rgb: "476A66" } },
      alignment: { vertical: "center", horizontal: "left" },
    });
    aplicarEstiloIntervalo(contatos, "A4:I4", ESTILO_CABECALHO_TABELA);

    if (linhasDetalhadas.length > 0) {
      aplicarEstiloIntervalo(
        contatos,
        `A5:I${linhasDetalhadas.length + 4}`,
        ESTILO_TEXTO_WRAP
      );
      contatos["!autofilter"] = {
        ref: `A4:I${linhasDetalhadas.length + 4}`,
      };
    }

    contatos["!margins"] = {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    };

    XLSX.utils.book_append_sheet(workbook, contatos, "Contatos");

    const arquivo = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
      compression: true,
      cellStyles: true,
    }) as Buffer;

    const baseNome = limparNomeArquivo(nomeCampanha);
    const nomeArquivo = `${baseNome}.xlsx`;

    return new NextResponse(new Uint8Array(arquivo), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"; filename*=UTF-8''${encodeURIComponent(
          nomeArquivo
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[RELATORIO DISPARO CAMPANHA] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao gerar relatório.",
      },
      { status: 500 }
    );
  }
}
