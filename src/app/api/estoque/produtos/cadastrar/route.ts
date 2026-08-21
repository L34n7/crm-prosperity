import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
const UNIDADES = new Set(["un", "cx", "pct", "kg", "g", "l", "ml", "m", "cm"]);
const TIPOS = new Set(["produto", "material", "insumo"]);

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numero(valor: unknown, padrao = 0) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : padrao;
  const normalizado = texto(valor).replace(",", ".");
  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado : padrao;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : null;
}

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mensagemBanco(error: { message?: string } | null | undefined) {
  const message = error?.message || "Erro desconhecido.";
  if (message.includes("estoque_itens_empresa_codigo_uk")) return "Já existe um item ativo com este código.";
  if (message.includes("estoque_itens_empresa_codigo_barras_uk")) return "Este código de barras já está vinculado a outro produto.";
  if (message.includes("estoque_embalagens_codigo_barras_uk")) return "Este código de barras já está vinculado a outra embalagem.";
  if (message.includes("estoque_embalagens_empresa_id_estoque_item_id_nome_key")) return "Já existe uma embalagem com este nome para o produto.";
  if (message.includes("estoque_embalagens_empresa_id_estoque_item_id_sigla_key")) return "Já existe uma embalagem com esta sigla para o produto.";
  if (message.includes("estoque_lotes_empresa_id_estoque_item_id_codigo_key")) return "Já existe este lote para o produto.";
  if (message.includes("estoque_marcas_empresa_nome_normalizado_uk") || message.includes("estoque_marcas_empresa_id_nome_key")) return "Já existe uma marca com este nome.";
  if (message.includes("estoque_categorias_empresa_nome_normalizado_uk") || message.includes("estoque_categorias_empresa_id_nome_key")) return "Já existe uma categoria com este nome.";
  return message;
}

export async function POST(request: Request) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return erro(contexto.error, contexto.status);
  if (!contexto.usuario.empresa_id) return erro("Usuário sem empresa vinculada.");
  if (!can(contexto.usuario.permissoes, "estoque.gerenciar")) return erro("Sem permissão para cadastrar produtos no estoque.", 403);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  const produto = objeto(body.produto);
  const embalagem = objeto(body.embalagem);
  const estoqueInicial = objeto(body.estoque_inicial);
  if (!produto) return erro("Informe os dados do produto.");

  const nome = texto(produto.nome);
  const tipo = texto(produto.tipo) || "produto";
  const unidade = texto(produto.unidade) || "un";
  if (!nome) return erro("Informe o nome do produto.");
  if (!TIPOS.has(tipo)) return erro("Tipo de produto inválido.");
  if (!UNIDADES.has(unidade)) return erro("Unidade-base inválida.");
  if (numero(produto.estoque_minimo) < 0 || numero(produto.custo_unitario) < 0) return erro("Estoque mínimo e custo não podem ser negativos.");
  if (texto(produto.preco_venda) && numero(produto.preco_venda) < 0) return erro("O preço de venda não pode ser negativo.");

  const controlaValidade = produto.controla_validade === true;
  const controlaLote = produto.controla_lote === true || controlaValidade;
  const controlaSerie = produto.controla_serie === true;

  let embalagemNormalizada: Record<string, unknown> | null = null;
  if (embalagem) {
    if (!can(contexto.usuario.permissoes, "estoque.embalagens")) return erro("Sem permissão para cadastrar conversões de embalagem.", 403);
    const fator = numero(embalagem.fator_conversao);
    const permiteCompra = embalagem.permite_compra !== false;
    const permiteVenda = embalagem.permite_venda !== false;
    const padraoCompra = embalagem.padrao_compra === true;
    const padraoVenda = embalagem.padrao_venda === true;
    if (!texto(embalagem.nome) || !texto(embalagem.sigla)) return erro("Informe o nome e a sigla da embalagem.");
    if (fator <= 0) return erro("O fator de conversão da embalagem deve ser maior que zero.");
    if (padraoCompra && !permiteCompra) return erro("A embalagem padrão de compra precisa estar habilitada para compras.");
    if (padraoVenda && !permiteVenda) return erro("A embalagem padrão de venda precisa estar habilitada para vendas.");
    if (texto(embalagem.preco_venda) && numero(embalagem.preco_venda) < 0) return erro("O preço da embalagem não pode ser negativo.");
    embalagemNormalizada = {
      nome: texto(embalagem.nome),
      sigla: texto(embalagem.sigla).toUpperCase(),
      fator_conversao: fator,
      codigo_barras: texto(embalagem.codigo_barras).replace(/\D/g, "") || null,
      preco_venda: texto(embalagem.preco_venda) ? numero(embalagem.preco_venda) : null,
      permite_compra: permiteCompra,
      permite_venda: permiteVenda,
      padrao_compra: padraoCompra,
      padrao_venda: padraoVenda,
    };
  }

  let estoqueNormalizado: Record<string, unknown> | null = null;
  if (estoqueInicial?.registrar === true) {
    const depositoId = texto(estoqueInicial.deposito_id);
    const quantidade = numero(estoqueInicial.quantidade);
    const unidadeQuantidade = texto(estoqueInicial.unidade_quantidade) || "base";
    const lote = objeto(estoqueInicial.lote);
    const numerosSerie = Array.isArray(estoqueInicial.numeros_serie)
      ? estoqueInicial.numeros_serie.map(texto).filter(Boolean)
      : [];
    if (!depositoId) return erro("Selecione o depósito do estoque inicial.");
    if (quantidade <= 0) return erro("A quantidade inicial deve ser maior que zero.");
    if (!new Set(["base", "embalagem"]).has(unidadeQuantidade)) return erro("Unidade da quantidade inicial inválida.");
    if (unidadeQuantidade === "embalagem" && !embalagemNormalizada) return erro("Configure uma embalagem antes de informar a quantidade inicial por embalagem.");
    if (controlaLote && !texto(lote?.codigo)) return erro("Informe o lote do estoque inicial.");
    if (controlaValidade && !texto(lote?.validade)) return erro("Informe a validade do estoque inicial.");
    if (texto(lote?.fabricado_em) && texto(lote?.validade) && texto(lote?.fabricado_em) > texto(lote?.validade)) return erro("A fabricação não pode ser posterior à validade.");

    const fator = unidadeQuantidade === "embalagem" ? numero(embalagemNormalizada?.fator_conversao, 1) : 1;
    const quantidadeBase = quantidade * fator;
    if (controlaSerie) {
      if (!Number.isInteger(quantidadeBase)) return erro("Produto serializado precisa resultar em uma quantidade inteira de unidades-base.");
      if (numerosSerie.length !== quantidadeBase) return erro(`Informe ${quantidadeBase} número(s) de série, um para cada unidade-base.`);
      if (new Set(numerosSerie.map((item) => item.toLocaleLowerCase("pt-BR"))).size !== numerosSerie.length) return erro("Os números de série não podem se repetir.");
    }

    estoqueNormalizado = {
      registrar: true,
      deposito_id: depositoId,
      localizacao_id: texto(estoqueInicial.localizacao_id) || null,
      quantidade,
      unidade_quantidade: unidadeQuantidade,
      lote: controlaLote ? {
        codigo: texto(lote?.codigo),
        fabricado_em: texto(lote?.fabricado_em) || null,
        validade: texto(lote?.validade) || null,
        fabricante: texto(lote?.fabricante) || null,
      } : null,
      numeros_serie: controlaSerie ? numerosSerie : [],
    };
  }

  const produtoNormalizado = {
    ...produto,
    nome,
    tipo,
    unidade,
    codigo: texto(produto.codigo) || null,
    sku: texto(produto.sku) || null,
    codigo_barras: texto(produto.codigo_barras) || null,
    descricao: texto(produto.descricao) || null,
    categoria_id: texto(produto.categoria_id) || null,
    categoria_nome: texto(produto.categoria_nome) || null,
    marca_id: texto(produto.marca_id) || null,
    marca_nome: texto(produto.marca_nome) || null,
    estoque_minimo: numero(produto.estoque_minimo),
    custo_unitario: numero(produto.custo_unitario),
    preco_venda: texto(produto.preco_venda) ? numero(produto.preco_venda) : null,
    controla_lote: controlaLote,
    controla_validade: controlaValidade,
    controla_serie: controlaSerie,
  };

  const { data, error } = await supabase.rpc("estoque_cadastrar_produto_completo", {
    p_empresa_id: contexto.usuario.empresa_id,
    p_dados: produtoNormalizado,
    p_embalagem: embalagemNormalizada,
    p_estoque_inicial: estoqueNormalizado,
    p_usuario_id: contexto.usuario.id,
  });
  if (error) return erro(mensagemBanco(error));

  return NextResponse.json({
    ok: true,
    message: estoqueNormalizado
      ? "Produto cadastrado com estoque inicial, rastreabilidade e histórico registrados."
      : "Produto cadastrado com sucesso. O estoque inicial poderá ser registrado depois.",
    ...data,
  });
}
