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
  erro_codigo_meta?: number | string | null;
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

type CampanhaRelatorioRow = {
  id: string;
  nome?: string | null;
  integracao_whatsapp_id?: string | null;
  template_nome?: string | null;
  template_categoria?: string | null;
  status?: string | null;
  total_itens?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_cancelados?: number | null;
  created_at?: string | null;
  finished_at?: string | null;
};

type LinhaRelatorioAcumulado = LinhaRelatorio & {
  campanha_id: string;
  campanha_nome: string;
};

type CampanhaAcumulada = {
  campanha: CampanhaRelatorioRow;
  nome: string;
  linhas: LinhaRelatorioAcumulado[];
  totais: TotaisRelatorio;
  quantidadeBaseCusto: number;
  categoriaCusto: CategoriaTemplateCobranca | null;
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

function timestampLinhaRelatorio(valor?: string | null) {
  const timestamp = Date.parse(String(valor || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function ordenarLinhasRelatorio(linhas: LinhaRelatorio[]) {
  return [...linhas].sort((a, b) => {
    // Prioridade visual:
    // 1) contatos respondidos, resposta mais recente primeiro;
    // 2) contatos lidos sem resposta, leitura mais recente primeiro;
    // 3) demais contatos, envio mais recente primeiro.
    const grupoA = a.resposta_em ? 0 : a.lido_em ? 1 : 2;
    const grupoB = b.resposta_em ? 0 : b.lido_em ? 1 : 2;

    if (grupoA !== grupoB) return grupoA - grupoB;

    const dataA =
      grupoA === 0
        ? timestampLinhaRelatorio(a.resposta_em)
        : grupoA === 1
        ? timestampLinhaRelatorio(a.lido_em)
        : timestampLinhaRelatorio(a.enviado_em);
    const dataB =
      grupoB === 0
        ? timestampLinhaRelatorio(b.resposta_em)
        : grupoB === 1
        ? timestampLinhaRelatorio(b.lido_em)
        : timestampLinhaRelatorio(b.enviado_em);

    if (dataA !== dataB) return dataB - dataA;

    return (
      timestampLinhaRelatorio(b.enviado_em) -
      timestampLinhaRelatorio(a.enviado_em)
    );
  });
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


async function carregarCampanhaParaRelatorioAcumulado(
  empresaId: string,
  campanha: CampanhaRelatorioRow
): Promise<CampanhaAcumulada> {
  const { data: linhasData, error: linhasError } = await supabaseAdmin.rpc(
    "relatorio_whatsapp_disparo_campanha",
    {
      p_empresa_id: empresaId,
      p_campanha_id: campanha.id,
    }
  );

  if (linhasError) {
    throw new Error(
      `Erro ao montar o relatório da campanha ${campanha.id}: ${linhasError.message}`
    );
  }

  const linhas = Array.isArray(linhasData)
    ? (linhasData as LinhaRelatorio[])
    : [];

  const { data: itensErroData, error: itensErroError } = await supabaseAdmin
    .from("whatsapp_disparo_itens")
    .select("numero,erro,erro_codigo_meta,created_at")
    .eq("empresa_id", empresaId)
    .eq("campanha_id", campanha.id)
    .order("created_at", { ascending: true });

  if (itensErroError) {
    console.warn(
      "[RELATORIO DISPAROS ACUMULADO] Falha ao enriquecer erros:",
      campanha.id,
      itensErroError
    );
  }

  const errosPorNumero = new Map<
    string,
    Array<{ erro?: string | null; erro_codigo_meta?: number | string | null }>
  >();

  for (const item of itensErroData || []) {
    const chave = String(item.numero || "");
    const fila = errosPorNumero.get(chave) || [];
    fila.push({
      erro: item.erro || null,
      erro_codigo_meta: item.erro_codigo_meta || null,
    });
    errosPorNumero.set(chave, fila);
  }

  const nome = nomeCampanhaRelatorio(campanha);
  const linhasComCampanha = linhas.map((linha) => {
    const chave = String(linha.numero || "");
    const fila = errosPorNumero.get(chave) || [];
    const itemErro = fila.shift() || null;

    return {
      ...linha,
      erro: linha.erro || itemErro?.erro || null,
      erro_codigo_meta: itemErro?.erro_codigo_meta || null,
      campanha_id: campanha.id,
      campanha_nome: nome,
    } satisfies LinhaRelatorioAcumulado;
  });

  const totais = calcularTotais(linhasComCampanha);
  const quantidadeBaseCusto = Math.max(
    0,
    Number(campanha.total_enviados || 0),
    totais.enviado + totais.entregue + totais.lido
  );

  return {
    campanha,
    nome,
    linhas: linhasComCampanha,
    totais,
    quantidadeBaseCusto,
    categoriaCusto: normalizarCategoria(campanha.template_categoria),
  };
}

function somarTotaisRelatorio(
  acumulado: TotaisRelatorio,
  atual: TotaisRelatorio
) {
  acumulado.total += atual.total;
  acumulado.enviado += atual.enviado;
  acumulado.entregue += atual.entregue;
  acumulado.lido += atual.lido;
  acumulado.falha += atual.falha;
  acumulado.cancelado += atual.cancelado;
  acumulado.pendente += atual.pendente;
  acumulado.respondido += atual.respondido;
  return acumulado;
}

function aplicarCabecalhoTabelaExcel(
  worksheet: ExcelJS.Worksheet,
  linha: number,
  titulos: string[]
) {
  titulos.forEach((titulo, index) => {
    const cell = worksheet.getCell(linha, index + 1);
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
  worksheet.getRow(linha).height = 26;
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

    const { data: itensErroData, error: itensErroError } = await supabaseAdmin
      .from("whatsapp_disparo_itens")
      .select("numero,erro,erro_codigo_meta,created_at")
      .eq("empresa_id", empresaId)
      .eq("campanha_id", campanhaId)
      .order("created_at", { ascending: true });

    if (itensErroError) {
      console.warn(
        "[RELATORIO DISPAROS] Não foi possível enriquecer os códigos de erro:",
        itensErroError
      );
    }

    const errosPorNumero = new Map<
      string,
      Array<{ erro?: string | null; erro_codigo_meta?: number | string | null }>
    >();

    for (const item of itensErroData || []) {
      const chave = String(item.numero || "");
      const fila = errosPorNumero.get(chave) || [];
      fila.push({
        erro: item.erro || null,
        erro_codigo_meta: item.erro_codigo_meta || null,
      });
      errosPorNumero.set(chave, fila);
    }

    const linhasComCodigos = linhas.map((linha) => {
      const chave = String(linha.numero || "");
      const fila = errosPorNumero.get(chave) || [];
      const itemErro = fila.shift() || null;

      return {
        ...linha,
        erro: linha.erro || itemErro?.erro || null,
        erro_codigo_meta: itemErro?.erro_codigo_meta || null,
      };
    });

    const totais = calcularTotais(linhasComCodigos);
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

    const linhasDetalhadas = ordenarLinhasRelatorio(linhasComCodigos).map(
      (linha) => ({
        ...linha,
        status_final: statusDetalhado(linha),
        status_label: statusDetalhadoLabel(linha),
      })
    );

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


export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => null);
    const campanhaIds = Array.from(
      new Set(
        (Array.isArray(body?.campanha_ids) ? body.campanha_ids : [])
          .map((item: unknown) => String(item || "").trim())
          .filter(Boolean)
      )
    );

    if (campanhaIds.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error: "Selecione pelo menos 2 campanhas para gerar o relatório acumulado.",
        },
        { status: 400 }
      );
    }

    const { data: campanhasData, error: campanhasError } = await supabaseAdmin
      .from("whatsapp_disparo_campanhas")
      .select(
        "id,nome,integracao_whatsapp_id,template_nome,template_categoria,status,total_itens,total_enviados,total_falhas,total_cancelados,created_at,finished_at"
      )
      .eq("empresa_id", empresaId)
      .in("id", campanhaIds);

    if (campanhasError) {
      throw new Error(`Erro ao buscar campanhas: ${campanhasError.message}`);
    }

    const campanhasEncontradas = (campanhasData || []) as CampanhaRelatorioRow[];
    const campanhasPorId = new Map(
      campanhasEncontradas.map((campanha) => [campanha.id, campanha])
    );
    const campanhas = campanhaIds
      .map((id) => campanhasPorId.get(id))
      .filter((campanha): campanha is CampanhaRelatorioRow => Boolean(campanha));

    if (campanhas.length !== campanhaIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Uma ou mais campanhas selecionadas não foram encontradas.",
        },
        { status: 404 }
      );
    }

    const acessoIntegracoes = await listarIntegracoesWhatsappPermitidas({
      usuario,
      empresaId,
    });
    const idsPermitidos = new Set(acessoIntegracoes.idsPermitidos.map(String));

    const campanhaSemAcesso = campanhas.find(
      (campanha) =>
        !idsPermitidos.has(String(campanha.integracao_whatsapp_id || ""))
    );

    if (campanhaSemAcesso) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não possui acesso a uma das integrações das campanhas selecionadas.",
        },
        { status: 403 }
      );
    }

    const campanhasAcumuladas = await Promise.all(
      campanhas.map((campanha) =>
        carregarCampanhaParaRelatorioAcumulado(empresaId, campanha)
      )
    );

    const totais = campanhasAcumuladas.reduce(
      (acc, item) => somarTotaisRelatorio(acc, item.totais),
      {
        total: 0,
        enviado: 0,
        entregue: 0,
        lido: 0,
        falha: 0,
        cancelado: 0,
        pendente: 0,
        respondido: 0,
      } satisfies TotaisRelatorio
    );

    const cotacao = await obterCotacaoUsdBrlAtual();
    let valorTotalUsd = 0;
    let quantidadeCobravelEstimada = 0;
    let categoriasSemPreco = 0;

    const custosPorCampanha = campanhasAcumuladas.map((item) => {
      quantidadeCobravelEstimada += item.quantidadeBaseCusto;

      if (!item.categoriaCusto) {
        categoriasSemPreco += 1;
        return {
          campanha_id: item.campanha.id,
          valorBrl: 0,
          disponivel: false,
        };
      }

      const valorUnitarioUsd =
        WHATSAPP_TEMPLATE_PRICING[item.categoriaCusto].usd;
      const valorUsd = Number(
        (item.quantidadeBaseCusto * valorUnitarioUsd).toFixed(4)
      );
      valorTotalUsd += valorUsd;

      return {
        campanha_id: item.campanha.id,
        valorBrl: Number((valorUsd * cotacao.cotacao).toFixed(2)),
        disponivel: true,
      };
    });

    const valorTotalBrlEstimado = Number(
      (valorTotalUsd * cotacao.cotacao).toFixed(2)
    );
    const custoPorCampanha = new Map(
      custosPorCampanha.map((item) => [item.campanha_id, item])
    );

    const linhasAcumuladas = campanhasAcumuladas.flatMap(
      (item) => item.linhas
    );
    const linhasDetalhadas = (
      ordenarLinhasRelatorio(
        linhasAcumuladas as LinhaRelatorio[]
      ) as LinhaRelatorioAcumulado[]
    ).map((linha) => ({
      ...linha,
      status_final: statusDetalhado(linha),
      status_label: statusDetalhadoLabel(linha),
    }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "CRM Prosperity";
    workbook.company = "CRM Prosperity";
    workbook.subject = "Relatório acumulado dos disparos WhatsApp";
    workbook.title = `Relatório acumulado - ${campanhas.length} campanhas`;
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Resultados acumulados", {
      properties: { defaultRowHeight: 20 },
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
      { key: "campanha", width: 34 },
      { key: "numero", width: 19 },
      { key: "nome", width: 24 },
      { key: "status", width: 15 },
      { key: "resposta", width: 38 },
      { key: "enviado", width: 22 },
      { key: "lido", width: 22 },
      { key: "respondido", width: 22 },
    ];

    worksheet.pageSetup.horizontalCentered = true;
    worksheet.headerFooter.oddFooter =
      "&LCRM Prosperity&CRelatório acumulado dos disparos&R&P / &N";

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

    worksheet.getCell("B2").value = "Resultados acumulados dos disparos";
    worksheet.getCell("B2").font = {
      name: "Aptos",
      size: 14,
      bold: true,
      color: { argb: COR.texto },
    };
    worksheet.getCell("B2").alignment = { vertical: "middle" };

    worksheet.getCell("B3").value =
      `${campanhas.length} campanhas selecionadas`;
    worksheet.getCell("B3").font = {
      name: "Aptos",
      size: 11,
      color: { argb: COR.textoSuave },
    };
    worksheet.getCell("B3").alignment = { vertical: "middle" };

    const datasCriacao = campanhas
      .map((campanha) => Date.parse(String(campanha.created_at || "")))
      .filter(Number.isFinite);
    const menorData = datasCriacao.length ? Math.min(...datasCriacao) : 0;
    const maiorData = datasCriacao.length ? Math.max(...datasCriacao) : 0;

    worksheet.mergeCells("A4:H4");
    worksheet.getCell("A4").value =
      menorData && maiorData
        ? `Período das campanhas: ${formatarDataHora(
            new Date(menorData).toISOString()
          )} até ${formatarDataHora(new Date(maiorData).toISOString())}`
        : `${campanhas.length} campanhas consolidadas`;
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

    worksheet.mergeCells("A9:C9");
    worksheet.mergeCells("A10:C11");
    worksheet.mergeCells("D9:H9");
    worksheet.mergeCells("D10:H11");

    worksheet.getCell("A9").value = "CUSTO ESTIMADO ACUMULADO";
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

    worksheet.getCell("A10").value = valorTotalBrlEstimado;
    worksheet.getCell("A10").numFmt = '"R$" #,##0.00';
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
      `Estimativa acumulada de ${quantidadeCobravelEstimada} envios em ${campanhas.length} campanhas. Cotação: ${cotacao.fonte}.` +
      (categoriasSemPreco
        ? ` ${categoriasSemPreco} campanha(s) sem categoria de preço reconhecida não entraram no custo.`
        : "");
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

    aplicarCabecalhoTabelaExcel(worksheet, 13, [
      "CAMPANHA",
      "NÚMERO",
      "NOME",
      "STATUS",
      "1ª MENSAGEM RESPONDIDA",
      "ENVIADO EM",
      "LIDO EM",
      "RESPONDIDO EM",
    ]);

    linhasDetalhadas.forEach((linha, index) => {
      const rowNumber = 14 + index;
      const row = worksheet.getRow(rowNumber);
      const status = String(linha.status_final || "pendente").toLowerCase();
      const statusStyle = estiloStatusExcel(status);

      row.values = [
        linha.campanha_nome,
        linha.numero || "",
        linha.nome_contato || "Sem nome",
        linha.status_label || "Pendente",
        linha.primeira_resposta || "—",
        formatarDataHora(linha.enviado_em) || "—",
        formatarDataHora(linha.lido_em) || "—",
        formatarDataHora(linha.resposta_em) || "—",
      ];
      row.height = 28;

      for (let col = 1; col <= 8; col += 1) {
        const cell = row.getCell(col);
        cell.font = {
          name: "Aptos",
          size: 10,
          color: { argb: COR.texto },
          bold: col === 1 || col === 2 || col === 3,
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: col === 1 || col === 5,
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

      const statusCell = row.getCell(4);
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

    worksheet.autoFilter = { from: "A13", to: "H13" };
    worksheet.pageSetup.printArea =
      `A1:H${Math.max(14, 13 + linhasDetalhadas.length)}`;

    const resumo = workbook.addWorksheet("Campanhas selecionadas", {
      properties: { defaultRowHeight: 20 },
      views: [{ state: "frozen", ySplit: 3 }],
    });

    resumo.columns = [
      { width: 34 },
      { width: 26 },
      { width: 15 },
      { width: 22 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 18 },
    ];

    resumo.mergeCells("A1:M1");
    resumo.getCell("A1").value =
      `Campanhas selecionadas · ${campanhas.length} campanhas`;
    resumo.getCell("A1").font = {
      name: "Aptos Display",
      size: 16,
      bold: true,
      color: { argb: COR.verdeEscuro },
    };
    resumo.getRow(1).height = 28;

    aplicarCabecalhoTabelaExcel(resumo, 3, [
      "CAMPANHA",
      "TEMPLATE",
      "CATEGORIA",
      "CRIADA EM",
      "TOTAL",
      "ENVIADOS",
      "ENTREGUES",
      "LIDOS",
      "RESPONDIDOS",
      "FALHAS",
      "CANCELADOS",
      "PENDENTES",
      "CUSTO ESTIMADO",
    ]);

    campanhasAcumuladas.forEach((item, index) => {
      const row = resumo.getRow(4 + index);
      const custo = custoPorCampanha.get(item.campanha.id);

      row.values = [
        item.nome,
        item.campanha.template_nome || "-",
        String(item.campanha.template_categoria || "-").toUpperCase(),
        formatarDataHora(item.campanha.created_at) || "-",
        item.totais.total,
        item.totais.enviado,
        item.totais.entregue,
        item.totais.lido,
        item.totais.respondido,
        item.totais.falha,
        item.totais.cancelado,
        item.totais.pendente,
        custo?.disponivel ? custo.valorBrl : "Não disponível",
      ];

      row.getCell(13).numFmt =
        custo?.disponivel ? '"R$" #,##0.00' : "@";

      for (let col = 1; col <= 13; col += 1) {
        const cell = row.getCell(col);
        cell.font = {
          name: "Aptos",
          size: 10,
          color: { argb: COR.texto },
          bold: col === 1,
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: col >= 5 && col <= 12 ? "center" : "left",
          wrapText: col <= 4,
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
    });

    resumo.autoFilter = { from: "A3", to: "M3" };

    const buffer = await workbook.xlsx.writeBuffer();
    const arquivo = Buffer.from(buffer);
    const nomeArquivo =
      `relatorio-acumulado-${campanhas.length}-campanhas.xlsx`;

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
    console.error("[RELATORIO DISPAROS ACUMULADO] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao gerar relatório acumulado.",
      },
      { status: 500 }
    );
  }
}
