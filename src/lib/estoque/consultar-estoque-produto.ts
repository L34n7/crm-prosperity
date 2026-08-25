import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export type ModoPesquisaEstoque =
  | "automatico"
  | "nome"
  | "codigo_sku"
  | "codigo_barras";

export type ResultadoConsultaEstoque =
  | "disponivel"
  | "sem_estoque"
  | "nao_encontrado"
  | "multiplos_resultados";

export type CandidatoEstoque = {
  id: string;
  nome: string;
  codigo: string;
  sku: string;
  codigo_barras: string;
  unidade: string;
  preco: number | null;
  preco_formatado: string;
  score: number;
  tipo_correspondencia: string;
  embalagem_id: string;
};

export type ResultadoConsultaEstoqueProduto = {
  resultado: ResultadoConsultaEstoque;
  termo_pesquisado: string;
  termo_normalizado: string;
  candidatos: CandidatoEstoque[];
  total_candidatos: number;
  tem_mais_candidatos: boolean;
  offset_candidatos: number;
  produto: {
    id: string;
    codigo: string;
    sku: string;
    codigo_barras: string;
    nome: string;
    unidade: string;
    preco: number | null;
    preco_formatado: string;
  } | null;
  quantidade_fisica: number;
  quantidade_reservada: number;
  quantidade_disponivel: number;
  depositos: Array<{
    id: string;
    nome: string;
    quantidade_fisica: number;
    quantidade_reservada: number;
    quantidade_disponivel: number;
  }>;
  embalagem: {
    id: string;
    nome: string;
    sigla: string;
    fator: number;
    preco: number | null;
    preco_formatado: string;
    quantidade_disponivel: number;
  } | null;
};

type ConsultaEstoqueProdutoParams = {
  empresaId: string;
  termo?: string | null;
  produtoId?: string | null;
  modoPesquisa?: ModoPesquisaEstoque;
  depositoIds?: string[];
  usarEmbalagemVenda?: boolean;
  limiteCandidatos?: number;
  offsetCandidatos?: number;
  permitirSelecaoAutomatica?: boolean;
};

type ProdutoDb = {
  id: string;
  codigo: string | null;
  sku: string | null;
  codigo_barras: string | null;
  nome: string;
  unidade: string;
  preco_venda: number | string | null;
};

type CandidatoDb = ProdutoDb & {
  score: number | string | null;
  match_tipo: string | null;
  embalagem_id: string | null;
  total_resultados?: number | string | null;
};

type SaldoDb = {
  deposito_id: string;
  lote_id: string | null;
  saldo_fisico: number | string | null;
  saldo_reservado: number | string | null;
};

type LoteDb = {
  id: string;
  bloqueado: boolean | null;
  validade: string | null;
};

type DepositoDb = {
  id: string;
  nome: string;
};

type EmbalagemDb = {
  id: string;
  nome: string;
  sigla: string;
  fator_conversao: number | string;
  preco_venda: number | string | null;
  padrao_venda: boolean | null;
};

const PALAVRAS_RUIDO = new Set([
  "a",
  "ai",
  "as",
  "da",
  "das",
  "de",
  "disponivel",
  "do",
  "dos",
  "esta",
  "me",
  "o",
  "os",
  "para",
  "por",
  "preco",
  "produto",
  "quero",
  "queria",
  "quanto",
  "saber",
  "ta",
  "tem",
  "temos",
  "um",
  "uma",
  "valor",
  "ver",
  "vcs",
  "voce",
  "voces",
]);

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

export function formatarMoedaEstoque(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

export function normalizarTermoConsultaEstoque(valor: unknown) {
  const texto = String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([0-9])\s*,\s*([0-9])/g, "$1.$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!texto) return "";

  const tokens = texto
    .split(" ")
    .filter(Boolean)
    .filter((token) => !PALAVRAS_RUIDO.has(token));

  return (tokens.length > 0 ? tokens : texto.split(" "))
    .slice(0, 10)
    .join(" ")
    .slice(0, 180)
    .trim();
}

function mapearCandidato(item: CandidatoDb): CandidatoEstoque {
  const preco =
    item.preco_venda === null || item.preco_venda === undefined
      ? null
      : numeroSeguro(item.preco_venda);

  return {
    id: String(item.id),
    nome: String(item.nome || "").trim(),
    codigo: String(item.codigo || "").trim(),
    sku: String(item.sku || "").trim(),
    codigo_barras: String(item.codigo_barras || "").trim(),
    unidade: String(item.unidade || "un").trim(),
    preco,
    preco_formatado: formatarMoedaEstoque(preco),
    score: numeroSeguro(item.score),
    tipo_correspondencia: String(item.match_tipo || "texto"),
    embalagem_id: String(item.embalagem_id || ""),
  };
}

function candidatoEhIdentificadorExato(candidato: CandidatoEstoque) {
  return new Set([
    "codigo_exato",
    "sku_exato",
    "codigo_barras_exato",
    "embalagem_codigo_barras_exato",
  ]).has(candidato.tipo_correspondencia);
}

function escolherCandidatoClaro(candidatos: CandidatoEstoque[]) {
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  const exatos = candidatos.filter(candidatoEhIdentificadorExato);
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) return null;

  const primeiro = candidatos[0];
  const segundo = candidatos[1];
  const diferenca = primeiro.score - segundo.score;

  if (primeiro.score >= 0.82 && diferenca >= 0.16) {
    return primeiro;
  }

  return null;
}

async function buscarProdutoPorId(empresaId: string, produtoId: string) {
  const { data, error } = await supabaseAdmin
    .from("estoque_itens")
    .select("id,codigo,sku,codigo_barras,nome,unidade,preco_venda")
    .eq("empresa_id", empresaId)
    .eq("id", produtoId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao consultar produto do estoque: ${error.message}`);
  }

  return (data || null) as ProdutoDb | null;
}

async function buscarCandidatos(params: {
  empresaId: string;
  termoNormalizado: string;
  modoPesquisa: ModoPesquisaEstoque;
  limite: number;
  offset: number;
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "estoque_buscar_produtos_automacao_paginado",
    {
      p_empresa_id: params.empresaId,
      p_termo: params.termoNormalizado,
      p_modo: params.modoPesquisa,
      p_limite: params.limite,
      p_offset: params.offset,
    }
  );

  if (error) {
    throw new Error(`Erro ao localizar produto no estoque: ${error.message}`);
  }

  const itens = (data || []) as CandidatoDb[];
  const total = itens.length
    ? Math.max(0, Math.floor(numeroSeguro(itens[0].total_resultados)))
    : 0;

  return {
    candidatos: itens.map(mapearCandidato),
    total,
  };
}

async function carregarDepositosPermitidos(
  empresaId: string,
  depositoIds: string[]
) {
  let query = supabaseAdmin
    .from("estoque_depositos")
    .select("id,nome")
    .eq("empresa_id", empresaId)
    .eq("ativo", true);

  if (depositoIds.length > 0) {
    query = query.in("id", depositoIds);
  }

  const { data, error } = await query.order("principal", { ascending: false });

  if (error) {
    throw new Error(`Erro ao consultar depósitos do estoque: ${error.message}`);
  }

  return (data || []) as DepositoDb[];
}

async function carregarDisponibilidade(params: {
  empresaId: string;
  produto: ProdutoDb;
  depositoIds: string[];
  usarEmbalagemVenda: boolean;
  embalagemPreferidaId?: string;
}) {
  const depositos = await carregarDepositosPermitidos(
    params.empresaId,
    params.depositoIds
  );
  const depositoIdsPermitidos = depositos.map((deposito) => deposito.id);

  let saldos: SaldoDb[] = [];

  if (depositoIdsPermitidos.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("estoque_saldos")
      .select("deposito_id,lote_id,saldo_fisico,saldo_reservado")
      .eq("empresa_id", params.empresaId)
      .eq("estoque_item_id", params.produto.id)
      .in("deposito_id", depositoIdsPermitidos);

    if (error) {
      throw new Error(`Erro ao consultar saldo do estoque: ${error.message}`);
    }

    saldos = (data || []) as SaldoDb[];
  }

  const loteIds = Array.from(
    new Set(saldos.map((saldo) => saldo.lote_id).filter(Boolean) as string[])
  );
  const lotesPorId = new Map<string, LoteDb>();

  if (loteIds.length > 0) {
    const { data: lotes, error: lotesError } = await supabaseAdmin
      .from("estoque_lotes")
      .select("id,bloqueado,validade")
      .eq("empresa_id", params.empresaId)
      .eq("estoque_item_id", params.produto.id)
      .in("id", loteIds);

    if (lotesError) {
      throw new Error(
        `Erro ao validar lotes disponíveis do estoque: ${lotesError.message}`
      );
    }

    for (const lote of (lotes || []) as LoteDb[]) {
      lotesPorId.set(String(lote.id), lote);
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const saldoValido = saldos.filter((saldo) => {
    if (!saldo.lote_id) return true;

    const lote = lotesPorId.get(saldo.lote_id);
    if (!lote) return false;
    if (lote.bloqueado === true) return false;
    if (lote.validade && lote.validade < hoje) return false;

    return true;
  });

  const totaisPorDeposito = new Map<
    string,
    { fisico: number; reservado: number }
  >();

  for (const saldo of saldoValido) {
    const atual = totaisPorDeposito.get(saldo.deposito_id) || {
      fisico: 0,
      reservado: 0,
    };

    atual.fisico += numeroSeguro(saldo.saldo_fisico);
    atual.reservado += numeroSeguro(saldo.saldo_reservado);
    totaisPorDeposito.set(saldo.deposito_id, atual);
  }

  const depositosResultado = depositos.map((deposito) => {
    const total = totaisPorDeposito.get(deposito.id) || {
      fisico: 0,
      reservado: 0,
    };
    const disponivel = Math.max(0, total.fisico - total.reservado);

    return {
      id: deposito.id,
      nome: deposito.nome,
      quantidade_fisica: total.fisico,
      quantidade_reservada: total.reservado,
      quantidade_disponivel: disponivel,
    };
  });

  const quantidadeFisica = depositosResultado.reduce(
    (total, deposito) => total + deposito.quantidade_fisica,
    0
  );
  const quantidadeReservada = depositosResultado.reduce(
    (total, deposito) => total + deposito.quantidade_reservada,
    0
  );
  const quantidadeDisponivel = Math.max(
    0,
    depositosResultado.reduce(
      (total, deposito) => total + deposito.quantidade_disponivel,
      0
    )
  );

  let embalagem: ResultadoConsultaEstoqueProduto["embalagem"] = null;

  if (params.usarEmbalagemVenda) {
    const { data, error } = await supabaseAdmin
      .from("estoque_embalagens")
      .select("id,nome,sigla,fator_conversao,preco_venda,padrao_venda")
      .eq("empresa_id", params.empresaId)
      .eq("estoque_item_id", params.produto.id)
      .eq("ativo", true)
      .eq("permite_venda", true)
      .order("padrao_venda", { ascending: false })
      .order("nome", { ascending: true });

    if (error) {
      throw new Error(`Erro ao consultar embalagem de venda: ${error.message}`);
    }

    const embalagens = (data || []) as EmbalagemDb[];
    const selecionada =
      embalagens.find((item) => item.id === params.embalagemPreferidaId) ||
      embalagens.find((item) => item.padrao_venda === true) ||
      embalagens[0] ||
      null;

    if (selecionada) {
      const fator = Math.max(0, numeroSeguro(selecionada.fator_conversao));
      const preco =
        selecionada.preco_venda === null ||
        selecionada.preco_venda === undefined
          ? null
          : numeroSeguro(selecionada.preco_venda);

      embalagem = {
        id: selecionada.id,
        nome: selecionada.nome,
        sigla: selecionada.sigla,
        fator,
        preco,
        preco_formatado: formatarMoedaEstoque(preco),
        quantidade_disponivel:
          fator > 0 ? Math.floor(quantidadeDisponivel / fator) : 0,
      };
    }
  }

  return {
    quantidadeFisica,
    quantidadeReservada,
    quantidadeDisponivel,
    depositosResultado,
    embalagem,
  };
}

export async function consultarEstoqueProduto(
  params: ConsultaEstoqueProdutoParams
): Promise<ResultadoConsultaEstoqueProduto> {
  const empresaId = String(params.empresaId || "").trim();
  const produtoId = String(params.produtoId || "").trim();
  const termoOriginal = String(params.termo || "").trim();
  const termoNormalizado = normalizarTermoConsultaEstoque(termoOriginal);
  const modoPesquisa = params.modoPesquisa || "automatico";
  const depositoIds = Array.from(
    new Set(
      (params.depositoIds || [])
        .map(String)
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, 50);
  const limite = Math.min(
    15,
    Math.max(1, Math.floor(Number(params.limiteCandidatos || 15) || 15))
  );
  const offset = Math.min(
    100000,
    Math.max(0, Math.floor(Number(params.offsetCandidatos || 0) || 0))
  );

  if (!empresaId) {
    throw new Error("Empresa não informada para consulta de estoque.");
  }

  let produto: ProdutoDb | null = null;
  let candidatos: CandidatoEstoque[] = [];
  let totalCandidatos = 0;
  let embalagemPreferidaId = "";

  if (produtoId) {
    produto = await buscarProdutoPorId(empresaId, produtoId);

    if (produto) {
      candidatos = [
        mapearCandidato({
          ...produto,
          score: 1,
          match_tipo: "produto_id",
          embalagem_id: null,
          total_resultados: 1,
        }),
      ];
      totalCandidatos = 1;
    }
  } else if (termoNormalizado) {
    const busca = await buscarCandidatos({
      empresaId,
      termoNormalizado,
      modoPesquisa,
      limite,
      offset,
    });
    candidatos = busca.candidatos;
    totalCandidatos = busca.total;

    if (params.permitirSelecaoAutomatica !== false && offset === 0) {
      const candidatoClaro = escolherCandidatoClaro(candidatos);
      if (candidatoClaro) {
        produto = await buscarProdutoPorId(empresaId, candidatoClaro.id);
        embalagemPreferidaId = candidatoClaro.embalagem_id;
      }
    }
  }

  const temMaisCandidatos =
    !produto && totalCandidatos > offset + candidatos.length;

  if (!produto) {
    return {
      resultado:
        candidatos.length > 0 ? "multiplos_resultados" : "nao_encontrado",
      termo_pesquisado: termoOriginal,
      termo_normalizado: termoNormalizado,
      candidatos,
      total_candidatos: totalCandidatos,
      tem_mais_candidatos: temMaisCandidatos,
      offset_candidatos: offset,
      produto: null,
      quantidade_fisica: 0,
      quantidade_reservada: 0,
      quantidade_disponivel: 0,
      depositos: [],
      embalagem: null,
    };
  }

  const disponibilidade = await carregarDisponibilidade({
    empresaId,
    produto,
    depositoIds,
    usarEmbalagemVenda: params.usarEmbalagemVenda !== false,
    embalagemPreferidaId,
  });
  const preco =
    produto.preco_venda === null || produto.preco_venda === undefined
      ? null
      : numeroSeguro(produto.preco_venda);

  return {
    resultado:
      disponibilidade.quantidadeDisponivel > 0 ? "disponivel" : "sem_estoque",
    termo_pesquisado: termoOriginal,
    termo_normalizado: termoNormalizado,
    candidatos,
    total_candidatos: totalCandidatos || candidatos.length,
    tem_mais_candidatos: false,
    offset_candidatos: offset,
    produto: {
      id: produto.id,
      codigo: String(produto.codigo || "").trim(),
      sku: String(produto.sku || "").trim(),
      codigo_barras: String(produto.codigo_barras || "").trim(),
      nome: String(produto.nome || "").trim(),
      unidade: String(produto.unidade || "un").trim(),
      preco,
      preco_formatado: formatarMoedaEstoque(preco),
    },
    quantidade_fisica: disponibilidade.quantidadeFisica,
    quantidade_reservada: disponibilidade.quantidadeReservada,
    quantidade_disponivel: disponibilidade.quantidadeDisponivel,
    depositos: disponibilidade.depositosResultado,
    embalagem: disponibilidade.embalagem,
  };
}
