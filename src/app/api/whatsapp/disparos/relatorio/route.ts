import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import path from "node:path";
import { existsSync } from "node:fs";
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

const COR = {
  verdeEscuro: "173E3A",
  verde: "245B55",
  verdeClaro: "E8F2F0",
  fundo: "F7FAF9",
  borda: "D7E2E0",
  texto: "18302D",
  textoSuave: "667B78",
  azulClaro: "EAF3FB",
  azulTexto: "22577A",
  verdeStatus: "E7F6EC",
  verdeStatusTexto: "227A43",
  tealStatus: "E8F6F4",
  tealStatusTexto: "246B63",
  vermelhoClaro: "FDECEC",
  vermelhoTexto: "A83B3B",
  amareloClaro: "FFF7DF",
  amareloTexto: "8A6500",
  cinzaClaro: "F1F4F4",
  cinzaTexto: "5C6D6A",
  roxoClaro: "F2ECFB",
  roxoTexto: "6A45A1",
};

const BORDA_CARD = {
  top: { style: "thin" as const, color: { argb: COR.borda } },
  left: { style: "thin" as const, color: { argb: COR.borda } },
  bottom: { style: "thin" as const, color: { argb: COR.borda } },
  right: { style: "thin" as const, color: { argb: COR.borda } },
};

function estiloStatusExcel(status: string) {
  switch (status) {
    case "lido":
      return { fill: COR.verdeStatus, font: COR.verdeStatusTexto };
    case "entregue":
      return { fill: COR.tealStatus, font: COR.tealStatusTexto };
    case "falha":
      return { fill: COR.vermelhoClaro, font: COR.vermelhoTexto };
    case "cancelado":
      return { fill: COR.cinzaClaro, font: COR.vermelhoTexto };
    case "enviado":
      return { fill: COR.azulClaro, font: COR.azulTexto };
    default:
      return { fill: COR.amareloClaro, font: COR.amareloTexto };
  }
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CRM Prosperity";
    workbook.company = "CRM Prosperity";
    workbook.subject = "Resultados dos disparos WhatsApp";
    workbook.title = nomeCampanha;
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Resultados dos disparos", {
      properties: {
        defaultRowHeight: 20,
      },
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.4,
          bottom: 0.4,
          header: 0.2,
          footer: 0.2,
        },
      },
      views: [{ state: "frozen", ySplit: 13 }],
    });

    worksheet.columns = [
      { key: "numero", width: 19 },
      { key: "nome", width: 24 },
      { key: "status", width: 15 },
      { key: "resposta", width: 38 },
      { key: "enviado", width: 22 },
      { key: "lido", width: 22 },
      { key: "respondido", width: 22 },
      { key: "apoio", width: 18 },
    ];

    worksheet.pageSetup.horizontalCentered = true;
    worksheet.headerFooter.oddFooter =
      '&LCRM Prosperity&CResultados dos disparos&R&P / &N';

    // Header com logo e nome
    worksheet.mergeCells("B1:H1");
    worksheet.mergeCells("B2:H2");
    worksheet.mergeCells("B3:H3");
    worksheet.getRow(1).height = 24;
    worksheet.getRow(2).height = 24;
    worksheet.getRow(3).height = 26;

    worksheet.getCell("B1").value = "CRM Prosperity";
    worksheet.getCell("B1").font = {
      name: "Aptos Display",
      size: 18,
      bold: true,
      color: { argb: COR.verdeEscuro },
    };
    worksheet.getCell("B1").alignment = { vertical: "middle" };

    worksheet.getCell("B2").value = "Resultados dos disparos";
    worksheet.getCell("B2").font = {
      name: "Aptos",
      size: 14,
      bold: true,
      color: { argb: COR.texto },
    };
    worksheet.getCell("B2").alignment = { vertical: "middle" };

    worksheet.getCell("B3").value = nomeCampanha;
    worksheet.getCell("B3").font = {
      name: "Aptos",
      size: 11,
      color: { argb: COR.textoSuave },
    };
    worksheet.getCell("B3").alignment = { vertical: "middle" };

    worksheet.mergeCells("A4:H4");
    worksheet.getCell("A4").value =
      `Template: ${campanha.template_nome || "-"}   •   Categoria: ${String(
        campanha.template_categoria || "-"
      ).toUpperCase()}   •   Criada em: ${formatarDataHora(
        campanha.created_at
      ) || "-"}`;
    worksheet.getCell("A4").font = {
      name: "Aptos",
      size: 10,
      color: { argb: COR.textoSuave },
    };
    worksheet.getCell("A4").alignment = {
      vertical: "middle",
      horizontal: "left",
    };
    worksheet.getRow(4).height = 22;

    const logoPath = path.join(
      process.cwd(),
      "public",
      "android-chrome-192x192.png"
    );

    if (existsSync(logoPath)) {
      const logoId = workbook.addImage({
        filename: logoPath,
        extension: "png",
      });
      worksheet.addImage(logoId, {
        tl: { col: 0.08, row: 0.15 },
        ext: { width: 58, height: 58 },
        editAs: "oneCell",
      });
    } else {
      worksheet.getCell("A1").value = "CRM";
      worksheet.getCell("A1").font = {
        bold: true,
        size: 14,
        color: { argb: COR.verdeEscuro },
      };
      worksheet.getCell("A1").alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }

    // Cards de totais como na tela
    const cards = [
      { col: 1, label: "TOTAL", value: totais.total, fill: COR.cinzaClaro, color: COR.texto },
      { col: 2, label: "ENVIADOS", value: totais.enviado, fill: COR.azulClaro, color: COR.azulTexto },
      { col: 3, label: "ENTREGUES", value: totais.entregue, fill: COR.tealStatus, color: COR.tealStatusTexto },
      { col: 4, label: "LIDOS", value: totais.lido, fill: COR.verdeStatus, color: COR.verdeStatusTexto },
      { col: 5, label: "RESPONDIDOS", value: totais.respondido, fill: COR.roxoClaro, color: COR.roxoTexto },
      { col: 6, label: "FALHAS", value: totais.falha, fill: COR.vermelhoClaro, color: COR.vermelhoTexto },
      { col: 7, label: "PENDENTES", value: totais.pendente, fill: COR.amareloClaro, color: COR.amareloTexto },
      { col: 8, label: "CANCELADOS", value: totais.cancelado, fill: COR.cinzaClaro, color: COR.cinzaTexto },
    ];

    worksheet.getRow(6).height = 20;
    worksheet.getRow(7).height = 28;

    for (const card of cards) {
      const labelCell = worksheet.getCell(6, card.col);
      const valueCell = worksheet.getCell(7, card.col);

      labelCell.value = card.label;
      labelCell.font = {
        name: "Aptos",
        size: 9,
        bold: true,
        color: { argb: card.color },
      };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: card.fill },
      };
      labelCell.border = BORDA_CARD;
      labelCell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      valueCell.value = card.value;
      valueCell.font = {
        name: "Aptos Display",
        size: 16,
        bold: true,
        color: { argb: card.color },
      };
      valueCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: card.fill },
      };
      valueCell.border = BORDA_CARD;
      valueCell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };
    }

    // Custo estimado
    worksheet.mergeCells("A9:C9");
    worksheet.mergeCells("A10:C11");
    worksheet.mergeCells("D9:H9");
    worksheet.mergeCells("D10:H11");

    worksheet.getCell("A9").value = "CUSTO ESTIMADO";
    worksheet.getCell("A9").font = {
      size: 9,
      bold: true,
      color: { argb: COR.verdeEscuro },
    };
    worksheet.getCell("A9").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR.verdeClaro },
    };
    worksheet.getCell("A9").border = BORDA_CARD;
    worksheet.getCell("A9").alignment = { vertical: "middle" };

    worksheet.getCell("A10").value =
      custoEstimado.disponivel
        ? custoEstimado.valorTotalBrlEstimado
        : "Não disponível";
    worksheet.getCell("A10").numFmt =
      custoEstimado.disponivel ? '"R$" #,##0.00' : "@";
    worksheet.getCell("A10").font = {
      size: 18,
      bold: true,
      color: { argb: COR.texto },
    };
    worksheet.getCell("A10").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" },
    };
    worksheet.getCell("A10").border = BORDA_CARD;
    worksheet.getCell("A10").alignment = {
      vertical: "middle",
      horizontal: "left",
    };

    worksheet.getCell("D9").value = "CRITÉRIO DA ESTIMATIVA";
    worksheet.getCell("D9").font = {
      size: 9,
      bold: true,
      color: { argb: COR.textoSuave },
    };
    worksheet.getCell("D9").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COR.fundo },
    };
    worksheet.getCell("D9").border = BORDA_CARD;

    worksheet.getCell("D10").value =
      custoEstimado.criterio ||
      "Estimativa calculada pela categoria do template.";
    worksheet.getCell("D10").font = {
      size: 9,
      color: { argb: COR.textoSuave },
    };
    worksheet.getCell("D10").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF" },
    };
    worksheet.getCell("D10").border = BORDA_CARD;
    worksheet.getCell("D10").alignment = {
      vertical: "middle",
      wrapText: true,
    };
    worksheet.getRow(10).height = 24;
    worksheet.getRow(11).height = 24;

    // Tabela detalhada
    const cabecalhos = [
      "NÚMERO",
      "NOME",
      "STATUS",
      "1ª MENSAGEM RESPONDIDA",
      "ENVIADO EM",
      "LIDO EM",
      "RESPONDIDO EM",
    ];

    cabecalhos.forEach((titulo, index) => {
      const cell = worksheet.getCell(13, index + 1);
      cell.value = titulo;
      cell.font = {
        name: "Aptos",
        size: 9,
        bold: true,
        color: { argb: COR.textoSuave },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COR.fundo },
      };
      cell.border = BORDA_CARD;
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
    });
    worksheet.getRow(13).height = 26;

    linhasDetalhadas.forEach((linha, index) => {
      const rowNumber = 14 + index;
      const row = worksheet.getRow(rowNumber);
      const status = String(linha.status_final || "pendente").toLowerCase();
      const statusStyle = estiloStatusExcel(status);

      row.values = [
        linha.numero || "",
        linha.nome_contato || "Sem nome",
        linha.status_label || "Pendente",
        linha.primeira_resposta || "—",
        formatarDataHora(linha.enviado_em) || "—",
        formatarDataHora(linha.lido_em) || "—",
        formatarDataHora(linha.resposta_em) || "—",
      ];
      row.height = 28;

      for (let col = 1; col <= 7; col += 1) {
        const cell = row.getCell(col);
        cell.font = {
          name: "Aptos",
          size: 10,
          color: { argb: COR.texto },
          bold: col === 1 || col === 2,
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: col === 4,
        };
        cell.border = {
          bottom: { style: "thin", color: { argb: COR.borda } },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: index % 2 === 0 ? "FFFFFF" : "FBFCFC" },
        };
      }

      const statusCell = row.getCell(3);
      statusCell.font = {
        name: "Aptos",
        size: 10,
        bold: true,
        color: { argb: statusStyle.font },
      };
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: statusStyle.fill },
      };
      statusCell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      if (linha.erro && status === "falha") {
        statusCell.note = linha.erro;
      }
    });

    worksheet.autoFilter = {
      from: "A13",
      to: "G13",
    };

    worksheet.pageSetup.printArea = `A1:H${Math.max(14, 13 + linhasDetalhadas.length)}`;

    const buffer = await workbook.xlsx.writeBuffer();
    const arquivo = Buffer.from(buffer);

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
