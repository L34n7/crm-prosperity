import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  IMPORTACAO_PRODUTOS_LIMITE_BYTES,
  IMPORTACAO_PRODUTOS_LIMITE_LINHAS,
  chaveComparacaoImportacao,
  mapearLinhasImportacaoProdutos,
  type LinhaImportacaoProduto,
} from "@/lib/estoque/importacao-produtos";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const supabase = getSupabaseAdmin();

type ItemExistente = {
  id: string;
  codigo: string | null;
  sku: string | null;
  codigo_barras: string | null;
  controla_lote: boolean;
  controla_validade: boolean;
  controla_serie: boolean;
};

type Deposito = { id: string; codigo: string; nome: string; principal: boolean };
type Localizacao = { id: string; deposito_id: string; codigo: string; nome: string };
type IndiceItens = {
  codigo: Map<string, ItemExistente[]>;
  sku: Map<string, ItemExistente[]>;
  codigoBarras: Map<string, ItemExistente[]>;
};

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function lerPlanilha(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const nomeAba = workbook.SheetNames[0];
  if (!nomeAba) return { cabecalhos: [] as unknown[], linhas: [] as unknown[][] };

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nomeAba], {
    header: 1,
    defval: "",
    raw: true,
  });
  const cabecalhos = matriz[0] ?? [];
  const linhas = matriz
    .slice(1)
    .filter((linha) => linha.some((celula) => String(celula ?? "").trim()));
  return { cabecalhos, linhas };
}

function adicionarIndice(mapa: Map<string, ItemExistente[]>, chave: string | null, item: ItemExistente) {
  if (!chave) return;
  mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
}

function indexarItens(itens: ItemExistente[]): IndiceItens {
  const indice: IndiceItens = { codigo: new Map(), sku: new Map(), codigoBarras: new Map() };
  for (const item of itens) {
    adicionarIndice(indice.codigo, chaveComparacaoImportacao(item.codigo), item);
    adicionarIndice(indice.sku, chaveComparacaoImportacao(item.sku), item);
    adicionarIndice(indice.codigoBarras, chaveComparacaoImportacao(item.codigo_barras), item);
  }
  return indice;
}

function encontrarItem(linha: LinhaImportacaoProduto, indice: IndiceItens) {
  const encontrados = new Map<string, ItemExistente>();
  const adicionar = (itens: ItemExistente[] | undefined) => {
    for (const item of itens ?? []) encontrados.set(item.id, item);
  };
  const codigo = chaveComparacaoImportacao(linha.codigo);
  const sku = chaveComparacaoImportacao(linha.sku);
  const barras = chaveComparacaoImportacao(linha.codigo_barras);
  if (codigo) adicionar(indice.codigo.get(codigo));
  if (sku) adicionar(indice.sku.get(sku));
  if (barras) adicionar(indice.codigoBarras.get(barras));
  return [...encontrados.values()];
}

function encontrarDeposito(valor: string | null, depositos: Deposito[]) {
  if (!valor) return depositos.find((deposito) => deposito.principal) ?? depositos[0] ?? null;
  const chave = chaveComparacaoImportacao(valor);
  return depositos.find((deposito) =>
    chaveComparacaoImportacao(deposito.codigo) === chave
    || chaveComparacaoImportacao(deposito.nome) === chave,
  ) ?? null;
}

function encontrarLocalizacao(valor: string | null, depositoId: string, localizacoes: Localizacao[]) {
  if (!valor) return null;
  const chave = chaveComparacaoImportacao(valor);
  return localizacoes.find((localizacao) =>
    localizacao.deposito_id === depositoId
    && (
      chaveComparacaoImportacao(localizacao.codigo) === chave
      || chaveComparacaoImportacao(localizacao.nome) === chave
    ),
  ) ?? null;
}

function validarDuplicidades(linhas: LinhaImportacaoProduto[]) {
  const campos = ["codigo", "sku", "codigo_barras"] as const;
  for (const campo of campos) {
    const ocorrencias = new Map<string, LinhaImportacaoProduto[]>();
    for (const linha of linhas) {
      const chave = chaveComparacaoImportacao(linha[campo]);
      if (!chave) continue;
      ocorrencias.set(chave, [...(ocorrencias.get(chave) ?? []), linha]);
    }
    for (const repetidas of ocorrencias.values()) {
      if (repetidas.length < 2) continue;
      for (const linha of repetidas) {
        linha.erros.push(`${campo.replaceAll("_", " ")} repetido na própria planilha.`);
      }
    }
  }
}

async function carregarItensAtivos(empresaId: string) {
  const itens: ItemExistente[] = [];
  const pagina = 1_000;
  for (let inicio = 0; ; inicio += pagina) {
    const resultado = await supabase
      .from("estoque_itens")
      .select("id,codigo,sku,codigo_barras,controla_lote,controla_validade,controla_serie")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .range(inicio, inicio + pagina - 1);
    if (resultado.error) throw resultado.error;
    const lote = (resultado.data ?? []) as ItemExistente[];
    itens.push(...lote);
    if (lote.length < pagina) return itens;
  }
}

export async function POST(request: Request) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return erro(contexto.error, contexto.status);
  if (!contexto.usuario.empresa_id) return erro("Usuário sem empresa vinculada.");
  if (!can(contexto.usuario.permissoes, "estoque.gerenciar")) {
    return erro("Sem permissão para importar produtos.", 403);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return erro("Selecione uma planilha de produtos.");
    if (file.size > IMPORTACAO_PRODUTOS_LIMITE_BYTES) return erro("A planilha deve ter no máximo 5 MB.");

    const nome = file.name.toLocaleLowerCase("pt-BR");
    if (!nome.endsWith(".csv") && !nome.endsWith(".xlsx") && !nome.endsWith(".xls")) {
      return erro("Envie um arquivo .csv, .xlsx ou .xls.");
    }

    const { cabecalhos, linhas: linhasPlanilha } = await lerPlanilha(file);
    if (!cabecalhos.length || !linhasPlanilha.length) return erro("A planilha não possui produtos para importar.");
    if (linhasPlanilha.length > IMPORTACAO_PRODUTOS_LIMITE_LINHAS) {
      return erro(`A planilha pode ter no máximo ${IMPORTACAO_PRODUTOS_LIMITE_LINHAS} produtos por importação.`);
    }

    const linhas = mapearLinhasImportacaoProdutos(cabecalhos, linhasPlanilha);
    validarDuplicidades(linhas);

    const empresaId = contexto.usuario.empresa_id;
    const [itens, depositosResultado, localizacoesResultado] = await Promise.all([
      carregarItensAtivos(empresaId),
      supabase
        .from("estoque_depositos")
        .select("id,codigo,nome,principal")
        .eq("empresa_id", empresaId)
        .eq("ativo", true),
      supabase
        .from("estoque_localizacoes")
        .select("id,deposito_id,codigo,nome")
        .eq("empresa_id", empresaId)
        .eq("ativo", true),
    ]);

    const falha = depositosResultado.error ?? localizacoesResultado.error;
    if (falha) return erro(`Não foi possível validar a planilha: ${falha.message}`, 500);

    const depositos = (depositosResultado.data ?? []) as Deposito[];
    const localizacoes = (localizacoesResultado.data ?? []) as Localizacao[];
    const indiceItens = indexarItens(itens);

    const itensJaUtilizados = new Set<string>();
    const preview = linhas.map((linha) => {
      const correspondencias = encontrarItem(linha, indiceItens);
      const itemExistente = correspondencias.length === 1 ? correspondencias[0] : null;
      if (correspondencias.length > 1) {
        linha.erros.push("Código, SKU ou código de barras correspondem a produtos diferentes no estoque.");
      }
      if (itemExistente && itensJaUtilizados.has(itemExistente.id)) {
        linha.erros.push("O mesmo produto existente foi identificado em outra linha da planilha.");
      }
      if (itemExistente) itensJaUtilizados.add(itemExistente.id);

      const acao = itemExistente ? "atualizar" as const : "criar" as const;
      if (itemExistente && linha.saldo_inicial > 0) {
        linha.alertas.push("Saldo inicial ignorado porque o produto já existe. Movimente o estoque separadamente.");
      }
      if (itemExistente && linha.custo_unitario !== null) {
        linha.alertas.push("O custo do produto existente não será sobrescrito; ele permanece calculado pelas entradas de estoque.");
      }

      const controlaValidade = linha.controla_validade ?? itemExistente?.controla_validade ?? false;
      const controlaLote = controlaValidade || linha.controla_lote || itemExistente?.controla_lote || false;
      const controlaSerie = linha.controla_serie ?? itemExistente?.controla_serie ?? false;
      let deposito: Deposito | null = null;
      let localizacao: Localizacao | null = null;

      if (!itemExistente && linha.saldo_inicial > 0) {
        deposito = encontrarDeposito(linha.deposito, depositos);
        if (!deposito) linha.erros.push("Depósito não encontrado. Informe o código ou nome de um depósito ativo.");
        if (deposito && linha.localizacao) {
          localizacao = encontrarLocalizacao(linha.localizacao, deposito.id, localizacoes);
          if (!localizacao) linha.erros.push("Localização não encontrada no depósito informado.");
        }
        if (controlaLote && !linha.lote) linha.erros.push("Informe o lote para cadastrar o saldo inicial.");
        if (controlaValidade && !linha.validade) linha.erros.push("Informe a validade para cadastrar o saldo inicial.");
        if (controlaSerie && !linha.numero_serie) linha.erros.push("Informe o número de série para cadastrar o saldo inicial.");
        if (controlaSerie && linha.saldo_inicial !== 1) linha.erros.push("Item serializado deve ter saldo inicial igual a 1.");
      }
      if (linha.fabricado_em && linha.validade && linha.fabricado_em > linha.validade) {
        linha.erros.push("A fabricação não pode ser posterior à validade.");
      }

      return {
        ...linha,
        acao: linha.erros.length ? "erro" as const : acao,
        estoque_item_id: itemExistente?.id ?? null,
        deposito_id: deposito?.id ?? null,
        deposito_nome: deposito?.nome ?? null,
        localizacao_id: localizacao?.id ?? null,
        localizacao_nome: localizacao?.nome ?? null,
        controla_lote: linha.controla_lote ?? (linha.controla_validade === true ? true : null),
      };
    });

    return NextResponse.json({
      ok: true,
      arquivo: file.name,
      linhas: preview,
      resumo: {
        total: preview.length,
        novos: preview.filter((linha) => linha.acao === "criar").length,
        atualizacoes: preview.filter((linha) => linha.acao === "atualizar").length,
        erros: preview.filter((linha) => linha.acao === "erro").length,
        alertas: preview.filter((linha) => linha.alertas.length > 0).length,
      },
    });
  } catch (error) {
    return erro(error instanceof Error ? error.message : "Não foi possível ler a planilha.");
  }
}
