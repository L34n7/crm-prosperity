import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

export const TIPOS_FERRAMENTAS_NEGOCIO = [
  "consultar_produtos_estoque",
  "informar_valor_produto",
  "consultar_servicos",
  "consultar_imoveis",
  "registrar_interesse_preferencia",
  "realizar_venda",
] as const;

export type TipoFerramentaNegocio = (typeof TIPOS_FERRAMENTAS_NEGOCIO)[number];

export type HistoricoNegocio = {
  role: "user" | "assistant";
  content: string;
};

export type ItemVendaAgente = {
  estoque_item_id: string;
  quantidade: number;
};

export type PreconsultaNegocio = {
  relevante: boolean;
  consulta: string;
  blocos: string[];
  resultados: Array<{
    ferramenta: TipoFerramentaNegocio;
    dados: unknown[];
  }>;
  produtosAutorizados: Set<string>;
  confirmacaoVenda: boolean;
};

function textoCurto(valor: unknown, limite: number) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, limite);
}

export function normalizarTextoNegocio(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function ehConfirmacaoCurtaVenda(valor: unknown) {
  const texto = normalizarTextoNegocio(valor).replace(/[.!?]+$/g, "");
  return /^(sim|sim quero|quero|quero sim|pode|pode sim|pode fechar|fecha|fechado|confirmo|confirmado|vou levar|eu quero|compro|pode fazer|pode gerar|pode reservar|separa pra mim|separe pra mim)$/.test(
    texto
  );
}

function possuiIntencaoDiretaVenda(valor: unknown) {
  const texto = normalizarTextoNegocio(valor);
  return (
    /\b(quero comprar|vou levar|eu levo|compro|fechar (?:a )?compra|fechar (?:o )?pedido|pode fechar|pode gerar (?:o )?pedido|pode reservar|separa pra mim|separe pra mim|me ve|me vê)\b/.test(
      texto
    ) ||
    /\bquero\s+\d+(?:[,.]\d+)?\b/.test(texto)
  );
}

function historicoTemContextoVenda(historico: HistoricoNegocio[]) {
  const ultimos = historico.slice(-5);
  return ultimos.some((item) => {
    const texto = normalizarTextoNegocio(item.content);
    if (item.role === "assistant") {
      return /\b(r\$|preco|valor|produto|unidade|comprar|pedido|fechar|levar|reservar)\b/.test(texto);
    }
    return /\b(produto|comprar|compra|levar|pedido|quantidade|unidade|preco|valor|r\$)\b/.test(texto);
  });
}

export function confirmacaoVendaPeloHistorico(
  mensagem: string,
  historico: HistoricoNegocio[]
) {
  if (possuiIntencaoDiretaVenda(mensagem)) return true;
  return ehConfirmacaoCurtaVenda(mensagem) && historicoTemContextoVenda(historico);
}

function consultaParaNegocio(mensagem: string, historico: HistoricoNegocio[]) {
  if (!ehConfirmacaoCurtaVenda(mensagem)) return textoCurto(mensagem, 180);
  const anteriorUsuario = [...historico]
    .reverse()
    .find(
      (item) =>
        item.role === "user" &&
        !ehConfirmacaoCurtaVenda(item.content) &&
        textoCurto(item.content, 180).length >= 3
    );
  return textoCurto(anteriorUsuario?.content || mensagem, 180);
}

export async function carregarFerramentasNegocioAtivas(
  empresaId: string,
  agenteId: string
) {
  const { data, error } = await supabaseAdmin
    .from("agente_ia_ferramentas")
    .select("tipo, config_json")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId)
    .eq("ativo", true)
    .in("tipo", [...TIPOS_FERRAMENTAS_NEGOCIO]);
  if (error) throw new Error(error.message);
  const mapa = new Map<TipoFerramentaNegocio, Record<string, unknown>>();
  for (const item of data || []) {
    const tipo = String(item.tipo || "") as TipoFerramentaNegocio;
    if ((TIPOS_FERRAMENTAS_NEGOCIO as readonly string[]).includes(tipo)) {
      mapa.set(tipo, (item.config_json || {}) as Record<string, unknown>);
    }
  }
  return mapa;
}

export async function consultarProdutosEstoque(empresaId: string, consulta: string) {
  const { data, error } = await supabaseAdmin.rpc("agente_ia_consultar_produtos_estoque", {
    p_empresa_id: empresaId,
    p_consulta: textoCurto(consulta, 180),
    p_limite: 5,
  });
  if (error) throw new Error(error.message);
  return (data || []).slice(0, 5).map((item: any) => ({
    id: String(item.id),
    nome: textoCurto(item.nome, 160),
    sku: textoCurto(item.sku, 80) || null,
    codigo: textoCurto(item.codigo, 80) || null,
    codigo_barras: textoCurto(item.codigo_barras, 80) || null,
    descricao: textoCurto(item.descricao, 400) || null,
    unidade: textoCurto(item.unidade, 30) || "un",
    saldo_disponivel: Number(item.saldo_disponivel || 0),
    rank: Number(item.rank || 0),
  }));
}

export async function informarValorProduto(empresaId: string, consulta: string) {
  const { data, error } = await supabaseAdmin.rpc("agente_ia_informar_valor_produto", {
    p_empresa_id: empresaId,
    p_consulta: textoCurto(consulta, 180),
    p_limite: 5,
  });
  if (error) throw new Error(error.message);
  return (data || []).slice(0, 5).map((item: any) => ({
    id: String(item.id),
    nome: textoCurto(item.nome, 160),
    sku: textoCurto(item.sku, 80) || null,
    codigo: textoCurto(item.codigo, 80) || null,
    unidade: textoCurto(item.unidade, 30) || "un",
    preco_venda:
      item.preco_venda === null || item.preco_venda === undefined
        ? null
        : Number(item.preco_venda),
    rank: Number(item.rank || 0),
  }));
}

export async function consultarServicos(empresaId: string, consulta: string) {
  const { data, error } = await supabaseAdmin.rpc("agente_ia_consultar_servicos", {
    p_empresa_id: empresaId,
    p_consulta: textoCurto(consulta, 180),
    p_limite: 5,
  });
  if (error) throw new Error(error.message);
  return (data || []).slice(0, 5).map((item: any) => ({
    id: String(item.id),
    nome: textoCurto(item.nome, 160),
    codigo: textoCurto(item.codigo, 80) || null,
    categoria: textoCurto(item.categoria, 100) || null,
    descricao: textoCurto(item.descricao, 450) || null,
    unidade: textoCurto(item.unidade, 30) || null,
    preco: item.preco === null || item.preco === undefined ? null : Number(item.preco),
    duracao_minutos:
      item.duracao_minutos === null || item.duracao_minutos === undefined
        ? null
        : Number(item.duracao_minutos),
    rank: Number(item.rank || 0),
  }));
}

export async function consultarImoveis(
  empresaId: string,
  filtros: {
    consulta?: string | null;
    finalidade?: string | null;
    cidade?: string | null;
    bairro?: string | null;
    valor_maximo?: number | null;
    quartos_minimos?: number | null;
    vagas_minimas?: number | null;
  }
) {
  const { data, error } = await supabaseAdmin.rpc("agente_ia_consultar_imoveis", {
    p_empresa_id: empresaId,
    p_consulta: textoCurto(filtros.consulta, 180) || null,
    p_finalidade: textoCurto(filtros.finalidade, 40) || null,
    p_cidade: textoCurto(filtros.cidade, 100) || null,
    p_bairro: textoCurto(filtros.bairro, 100) || null,
    p_valor_maximo:
      Number.isFinite(Number(filtros.valor_maximo)) && Number(filtros.valor_maximo) > 0
        ? Number(filtros.valor_maximo)
        : null,
    p_quartos_minimos:
      Number.isFinite(Number(filtros.quartos_minimos)) && Number(filtros.quartos_minimos) > 0
        ? Math.floor(Number(filtros.quartos_minimos))
        : null,
    p_vagas_minimas:
      Number.isFinite(Number(filtros.vagas_minimas)) && Number(filtros.vagas_minimas) > 0
        ? Math.floor(Number(filtros.vagas_minimas))
        : null,
    p_limite: 5,
  });
  if (error) throw new Error(error.message);
  return (data || []).slice(0, 5).map((item: any) => ({
    id: String(item.id),
    titulo: textoCurto(item.titulo, 180),
    codigo: textoCurto(item.codigo, 80) || null,
    tipo: textoCurto(item.tipo, 80) || null,
    finalidade: textoCurto(item.finalidade, 50) || null,
    valor: item.valor === null || item.valor === undefined ? null : Number(item.valor),
    valor_condominio:
      item.valor_condominio === null || item.valor_condominio === undefined
        ? null
        : Number(item.valor_condominio),
    valor_iptu:
      item.valor_iptu === null || item.valor_iptu === undefined
        ? null
        : Number(item.valor_iptu),
    bairro: textoCurto(item.bairro, 100) || null,
    cidade: textoCurto(item.cidade, 100) || null,
    estado: textoCurto(item.estado, 40) || null,
    quartos: item.quartos ?? null,
    suites: item.suites ?? null,
    banheiros: item.banheiros ?? null,
    vagas: item.vagas ?? null,
    area_m2: item.area_m2 ?? null,
    descricao: textoCurto(item.descricao, 500) || null,
    caracteristicas:
      item.caracteristicas && typeof item.caracteristicas === "object"
        ? JSON.stringify(item.caracteristicas).slice(0, 600)
        : null,
    fotos: Array.isArray(item.fotos) ? item.fotos.slice(0, 4) : [],
    rank: Number(item.rank || 0),
  }));
}

function formatarDinheiro(valor: unknown) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numero);
}

function blocoProdutos(produtos: Awaited<ReturnType<typeof consultarProdutosEstoque>>) {
  if (!produtos.length) return "PRODUTOS/ESTOQUE: nenhum produto compatível encontrado.";
  return `PRODUTOS/ESTOQUE ATUAIS:\n${produtos
    .map(
      (item) =>
        `- id=${item.id}; ${item.nome}; saldo disponível=${item.saldo_disponivel} ${item.unidade}${item.sku ? `; SKU=${item.sku}` : ""}${item.descricao ? `; ${item.descricao}` : ""}`
    )
    .join("\n")}`;
}

function blocoValores(produtos: Awaited<ReturnType<typeof informarValorProduto>>) {
  if (!produtos.length) return "VALORES DE PRODUTOS: nenhum produto compatível encontrado.";
  return `PREÇOS DE VENDA ATUAIS:\n${produtos
    .map(
      (item) =>
        `- id=${item.id}; ${item.nome}; preço=${item.preco_venda === null ? "não cadastrado" : formatarDinheiro(item.preco_venda)}; unidade=${item.unidade}`
    )
    .join("\n")}`;
}

function blocoServicos(servicos: Awaited<ReturnType<typeof consultarServicos>>) {
  if (!servicos.length) return "SERVIÇOS: nenhum serviço compatível encontrado.";
  return `SERVIÇOS ATUAIS:\n${servicos
    .map(
      (item) =>
        `- ${item.nome}${item.preco === null ? "" : `; preço=${formatarDinheiro(item.preco)}`}${item.duracao_minutos ? `; duração=${item.duracao_minutos} min` : ""}${item.descricao ? `; ${item.descricao}` : ""}`
    )
    .join("\n")}`;
}

function blocoImoveis(imoveis: Awaited<ReturnType<typeof consultarImoveis>>) {
  if (!imoveis.length) return "IMÓVEIS: nenhum imóvel disponível compatível encontrado.";
  return `IMÓVEIS DISPONÍVEIS:\n${imoveis
    .map(
      (item) =>
        `- id=${item.id}; ${item.titulo}${item.codigo ? `; código=${item.codigo}` : ""}${item.finalidade ? `; finalidade=${item.finalidade}` : ""}${item.valor === null ? "" : `; valor=${formatarDinheiro(item.valor)}`}${item.bairro ? `; bairro=${item.bairro}` : ""}${item.cidade ? `; cidade=${item.cidade}` : ""}${item.quartos !== null ? `; quartos=${item.quartos}` : ""}${item.vagas !== null ? `; vagas=${item.vagas}` : ""}${item.descricao ? `; ${item.descricao}` : ""}`
    )
    .join("\n")}`;
}

export async function preconsultarNegocio(params: {
  empresaId: string;
  agenteId: string;
  ferramentas: Map<TipoFerramentaNegocio, Record<string, unknown>>;
  mensagem: string;
  historico?: HistoricoNegocio[];
}): Promise<PreconsultaNegocio> {
  const historico = params.historico || [];
  const texto = normalizarTextoNegocio(params.mensagem);
  const consulta = consultaParaNegocio(params.mensagem, historico);
  const confirmacaoVenda = confirmacaoVendaPeloHistorico(params.mensagem, historico);

  const sinalProduto = /\b(produto|produtos|estoque|disponivel|disponibilidade|tem|vende|vender|comprar|compra|levar|quantidade|unidade)\b/.test(
    texto
  );
  const sinalValor = /\b(preco|precos|valor|valores|quanto custa|custa|custam|r\$|reais)\b/.test(texto);
  const sinalServico = /\b(servico|servicos|procedimento|atendimento|orcamento de servico|banho|tosa|consulta|instalacao|manutencao)\b/.test(
    texto
  );
  const sinalImovel = /\b(imovel|imoveis|casa|apartamento|apto|terreno|sobrado|aluguel|alugar|locacao|quartos|suite|suites|vagas|bairro)\b/.test(
    texto
  );
  const sinalOfertaGenerica = /\b(voces tem|voce tem|tem algum|tem alguma|voces fazem|voce faz|oferece|oferecem)\b/.test(
    texto
  );

  const blocos: string[] = [];
  const resultados: PreconsultaNegocio["resultados"] = [];
  const produtosAutorizados = new Set<string>();

  if (
    params.ferramentas.has("consultar_produtos_estoque") &&
    (sinalProduto || sinalValor || confirmacaoVenda || sinalOfertaGenerica)
  ) {
    const dados = await consultarProdutosEstoque(params.empresaId, consulta);
    dados.forEach((item) => produtosAutorizados.add(item.id));
    resultados.push({ ferramenta: "consultar_produtos_estoque", dados });
    if (dados.length || sinalProduto || confirmacaoVenda) blocos.push(blocoProdutos(dados));
  }

  if (
    params.ferramentas.has("informar_valor_produto") &&
    (sinalValor || confirmacaoVenda || possuiIntencaoDiretaVenda(params.mensagem))
  ) {
    const dados = await informarValorProduto(params.empresaId, consulta);
    dados.forEach((item) => produtosAutorizados.add(item.id));
    resultados.push({ ferramenta: "informar_valor_produto", dados });
    if (dados.length || sinalValor) blocos.push(blocoValores(dados));
  }

  if (
    params.ferramentas.has("consultar_servicos") &&
    (sinalServico || sinalValor || sinalOfertaGenerica)
  ) {
    const dados = await consultarServicos(params.empresaId, consulta);
    resultados.push({ ferramenta: "consultar_servicos", dados });
    if (dados.length || sinalServico) blocos.push(blocoServicos(dados));
  }

  if (params.ferramentas.has("consultar_imoveis") && sinalImovel) {
    const dados = await consultarImoveis(params.empresaId, { consulta });
    resultados.push({ ferramenta: "consultar_imoveis", dados });
    blocos.push(blocoImoveis(dados));
  }

  const vendaRelevante =
    params.ferramentas.has("realizar_venda") &&
    (confirmacaoVenda || possuiIntencaoDiretaVenda(params.mensagem));

  const houveDado = resultados.some((item) => item.dados.length > 0);
  const sinalExplicitoComFerramenta =
    (sinalProduto && params.ferramentas.has("consultar_produtos_estoque")) ||
    (sinalValor &&
      (params.ferramentas.has("informar_valor_produto") ||
        params.ferramentas.has("consultar_servicos"))) ||
    (sinalServico && params.ferramentas.has("consultar_servicos")) ||
    (sinalImovel && params.ferramentas.has("consultar_imoveis"));

  return {
    relevante: vendaRelevante || houveDado || sinalExplicitoComFerramenta,
    consulta,
    blocos,
    resultados,
    produtosAutorizados,
    confirmacaoVenda,
  };
}

export async function executarFerramentaNegocio(params: {
  tipo: TipoFerramentaNegocio;
  empresaId: string;
  agenteId: string;
  conversaId: string;
  argumentos: any;
  produtosAutorizados: Set<string>;
  confirmacaoVenda: boolean;
  mensagemIds: string[];
}) {
  if (params.tipo === "consultar_produtos_estoque") {
    const dados = await consultarProdutosEstoque(
      params.empresaId,
      textoCurto(params.argumentos?.consulta, 180)
    );
    dados.forEach((item) => params.produtosAutorizados.add(item.id));
    return { ok: true, produtos: dados };
  }

  if (params.tipo === "informar_valor_produto") {
    const dados = await informarValorProduto(
      params.empresaId,
      textoCurto(params.argumentos?.consulta, 180)
    );
    dados.forEach((item) => params.produtosAutorizados.add(item.id));
    return { ok: true, produtos: dados };
  }

  if (params.tipo === "consultar_servicos") {
    const dados = await consultarServicos(
      params.empresaId,
      textoCurto(params.argumentos?.consulta, 180)
    );
    return { ok: true, servicos: dados };
  }

  if (params.tipo === "consultar_imoveis") {
    const dados = await consultarImoveis(params.empresaId, {
      consulta: textoCurto(params.argumentos?.consulta, 180) || null,
      finalidade: textoCurto(params.argumentos?.finalidade, 40) || null,
      cidade: textoCurto(params.argumentos?.cidade, 100) || null,
      bairro: textoCurto(params.argumentos?.bairro, 100) || null,
      valor_maximo: params.argumentos?.valor_maximo ?? null,
      quartos_minimos: params.argumentos?.quartos_minimos ?? null,
      vagas_minimas: params.argumentos?.vagas_minimas ?? null,
    });
    return { ok: true, imoveis: dados };
  }

  if (params.tipo === "realizar_venda") {
    if (!params.confirmacaoVenda) {
      return {
        ok: false,
        code: "CONFIRMACAO_CLIENTE_OBRIGATORIA",
        error:
          "A venda só pode ser criada depois de uma confirmação explícita do cliente na conversa atual.",
      };
    }
    if (!Array.isArray(params.argumentos?.itens) || !params.argumentos.itens.length) {
      return { ok: false, error: "Informe os itens e quantidades confirmados pelo cliente." };
    }

    const agregados = new Map<string, number>();
    for (const item of params.argumentos.itens.slice(0, 10)) {
      const id = String(item?.estoque_item_id || "").trim();
      const quantidade = Number(item?.quantidade);
      if (!id || !params.produtosAutorizados.has(id)) {
        return {
          ok: false,
          code: "PRODUTO_NAO_VALIDADO",
          error:
            "O produto precisa ter sido consultado no backend nesta execução antes de entrar na venda.",
        };
      }
      if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 9999) {
        return { ok: false, error: "Quantidade inválida para a venda." };
      }
      agregados.set(id, (agregados.get(id) || 0) + quantidade);
    }
    const itens: ItemVendaAgente[] = Array.from(agregados.entries()).map(
      ([estoque_item_id, quantidade]) => ({ estoque_item_id, quantidade })
    );
    const assinatura = JSON.stringify(
      [...itens].sort((a, b) => a.estoque_item_id.localeCompare(b.estoque_item_id))
    );
    const idempotencyKey = `agente-ia:${crypto
      .createHash("sha256")
      .update(
        `${params.empresaId}:${params.conversaId}:${params.mensagemIds.join(",")}:${assinatura}`
      )
      .digest("hex")}`;

    const { data, error } = await supabaseAdmin.rpc("agente_ia_realizar_venda", {
      p_empresa_id: params.empresaId,
      p_agente_id: params.agenteId,
      p_conversa_id: params.conversaId,
      p_itens: itens,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return data || { ok: false, error: "Não foi possível criar o pedido de venda." };
  }

  return { ok: false, error: "Ferramenta de negócio não executável diretamente." };
}

export function definicoesFerramentasNegocio(
  ferramentas: Map<TipoFerramentaNegocio, Record<string, unknown>>,
  preconsulta: PreconsultaNegocio
) {
  const defs: any[] = [];

  if (ferramentas.has("consultar_produtos_estoque")) {
    defs.push({
      type: "function",
      name: "consultar_produtos_estoque",
      description:
        "Consulta produtos e saldo disponível real. Não retorna preço. Use antes de afirmar disponibilidade ou antes de vender.",
      strict: true,
      parameters: {
        type: "object",
        properties: { consulta: { type: "string", maxLength: 180 } },
        required: ["consulta"],
        additionalProperties: false,
      },
    });
  }

  if (ferramentas.has("informar_valor_produto")) {
    defs.push({
      type: "function",
      name: "informar_valor_produto",
      description:
        "Consulta o preço de venda atual cadastrado. Nunca estime, altere ou invente preço.",
      strict: true,
      parameters: {
        type: "object",
        properties: { consulta: { type: "string", maxLength: 180 } },
        required: ["consulta"],
        additionalProperties: false,
      },
    });
  }

  if (ferramentas.has("consultar_servicos")) {
    defs.push({
      type: "function",
      name: "consultar_servicos",
      description: "Consulta serviços ativos, preço, descrição e duração atuais.",
      strict: true,
      parameters: {
        type: "object",
        properties: { consulta: { type: "string", maxLength: 180 } },
        required: ["consulta"],
        additionalProperties: false,
      },
    });
  }

  if (ferramentas.has("consultar_imoveis")) {
    defs.push({
      type: "function",
      name: "consultar_imoveis",
      description:
        "Busca imóveis atualmente disponíveis usando os filtros informados pelo cliente.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          consulta: { anyOf: [{ type: "string", maxLength: 180 }, { type: "null" }] },
          finalidade: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
          cidade: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          bairro: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          valor_maximo: { anyOf: [{ type: "number" }, { type: "null" }] },
          quartos_minimos: { anyOf: [{ type: "integer" }, { type: "null" }] },
          vagas_minimas: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
        required: [
          "consulta",
          "finalidade",
          "cidade",
          "bairro",
          "valor_maximo",
          "quartos_minimos",
          "vagas_minimas",
        ],
        additionalProperties: false,
      },
    });
  }

  if (ferramentas.has("realizar_venda") && preconsulta.confirmacaoVenda) {
    defs.push({
      type: "function",
      name: "realizar_venda",
      description:
        "Cria pedido de venda e reserva estoque usando preço real do backend. Use SOMENTE após confirmação explícita do cliente. Não confirma pagamento.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          itens: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                estoque_item_id: { type: "string" },
                quantidade: { type: "number", exclusiveMinimum: 0 },
              },
              required: ["estoque_item_id", "quantidade"],
              additionalProperties: false,
            },
          },
        },
        required: ["itens"],
        additionalProperties: false,
      },
    });
  }

  return defs;
}

export function contextoPreconsultadoNegocio(preconsulta: PreconsultaNegocio) {
  if (!preconsulta.blocos.length) return "";
  return [
    "DADOS OPERACIONAIS JÁ CONSULTADOS NO BACKEND:",
    ...preconsulta.blocos,
    "Use apenas estes dados ou execute uma ferramenta habilitada para refinar a consulta. Não invente preço, saldo, serviço, imóvel ou disponibilidade.",
  ].join("\n\n");
}
