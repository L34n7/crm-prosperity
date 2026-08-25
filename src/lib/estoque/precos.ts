import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

export const CANAIS_PRECO = ["balcao", "online", "whatsapp"] as const;
export const FORMAS_PRECO = ["pix", "dinheiro", "debito", "credito"] as const;

export type CanalPreco = (typeof CANAIS_PRECO)[number];
export type FormaPreco = (typeof FORMAS_PRECO)[number];
export type TipoAjustePagamento =
  | "nenhum"
  | "desconto_percentual"
  | "acrescimo_percentual"
  | "preco_fixo";
export type TipoAjustePromocao =
  | "preco_fixo"
  | "desconto_percentual"
  | "desconto_valor";

type ItemPrecoDb = {
  id: string;
  preco_venda: number | string | null;
};

type PrecoCanalDb = {
  estoque_item_id: string;
  canal: CanalPreco;
  preco: number | string;
};

type RegraPagamentoDb = {
  id: string;
  estoque_item_id: string | null;
  canal: CanalPreco | null;
  forma: FormaPreco;
  parcelas_min: number | string;
  parcelas_max: number | string;
  tipo_ajuste: TipoAjustePagamento;
  valor: number | string;
  updated_at?: string | null;
};

type PromocaoDb = {
  id: string;
  nome: string;
  tipo_ajuste: TipoAjustePromocao;
  valor: number | string;
  inicio_em: string;
  fim_em: string;
  canais: CanalPreco[];
  prioridade: number | string;
};

type VinculoPromocaoDb = {
  promocao_id: string;
  estoque_item_id: string;
};

export type PromocaoPrecoResolvida = {
  id: string;
  nome: string;
  tipo_ajuste: TipoAjustePromocao;
  valor: number;
  inicio_em: string;
  fim_em: string;
  canais: CanalPreco[];
};

export type PrecosProdutoResolvidos = {
  produto_id: string;
  base: number | null;
  balcao: number | null;
  online: number | null;
  whatsapp: number | null;
  promocional: number | null;
  pix: number | null;
  dinheiro: number | null;
  debito: number | null;
  credito: number | null;
  formatados: {
    base: string;
    balcao: string;
    online: string;
    whatsapp: string;
    promocional: string;
    pix: string;
    dinheiro: string;
    debito: string;
    credito: string;
  };
  promocao: PromocaoPrecoResolvida | null;
  promocoes_por_canal: Record<CanalPreco, PromocaoPrecoResolvida | null>;
};

function numeroOuNull(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function moeda(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function dinheiro(valor: number | null) {
  if (valor === null || !Number.isFinite(valor)) return null;
  return Number(Math.max(0, valor).toFixed(2));
}

function aplicarPromocao(
  preco: number | null,
  promocao: PromocaoDb | null
): number | null {
  if (preco === null || !promocao) return preco;
  const valor = Number(promocao.valor || 0);

  if (promocao.tipo_ajuste === "preco_fixo") return dinheiro(valor);
  if (promocao.tipo_ajuste === "desconto_percentual") {
    return dinheiro(preco * (1 - Math.min(100, Math.max(0, valor)) / 100));
  }
  return dinheiro(preco - Math.max(0, valor));
}

function aplicarRegraPagamento(
  preco: number | null,
  regra: RegraPagamentoDb | null
): number | null {
  if (preco === null || !regra || regra.tipo_ajuste === "nenhum") return preco;
  const valor = Number(regra.valor || 0);

  if (regra.tipo_ajuste === "preco_fixo") return dinheiro(valor);
  if (regra.tipo_ajuste === "desconto_percentual") {
    return dinheiro(preco * (1 - Math.min(100, Math.max(0, valor)) / 100));
  }
  return dinheiro(preco * (1 + Math.max(0, valor) / 100));
}

function promocaoResolvida(promocao: PromocaoDb | null): PromocaoPrecoResolvida | null {
  if (!promocao) return null;
  return {
    id: promocao.id,
    nome: promocao.nome,
    tipo_ajuste: promocao.tipo_ajuste,
    valor: Number(promocao.valor || 0),
    inicio_em: promocao.inicio_em,
    fim_em: promocao.fim_em,
    canais: Array.isArray(promocao.canais) ? promocao.canais : [],
  };
}

function melhorPromocao(promocoes: PromocaoDb[], canal: CanalPreco) {
  return (
    promocoes
      .filter((promocao) => Array.isArray(promocao.canais) && promocao.canais.includes(canal))
      .sort((a, b) => {
        const prioridade = Number(b.prioridade || 0) - Number(a.prioridade || 0);
        if (prioridade !== 0) return prioridade;
        return new Date(b.inicio_em).getTime() - new Date(a.inicio_em).getTime();
      })[0] || null
  );
}

function melhorRegraPagamento(params: {
  regras: RegraPagamentoDb[];
  itemId: string;
  canal: CanalPreco;
  forma: FormaPreco;
  parcelas: number;
}) {
  return (
    params.regras
      .filter(
        (regra) =>
          regra.forma === params.forma &&
          Number(regra.parcelas_min) <= params.parcelas &&
          Number(regra.parcelas_max) >= params.parcelas &&
          (regra.estoque_item_id === null || regra.estoque_item_id === params.itemId) &&
          (regra.canal === null || regra.canal === params.canal)
      )
      .sort((a, b) => {
        const especificidadeA =
          (a.estoque_item_id === params.itemId ? 2 : 0) +
          (a.canal === params.canal ? 1 : 0);
        const especificidadeB =
          (b.estoque_item_id === params.itemId ? 2 : 0) +
          (b.canal === params.canal ? 1 : 0);
        if (especificidadeA !== especificidadeB) return especificidadeB - especificidadeA;
        return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
      })[0] || null
  );
}

function vazio(produtoId: string): PrecosProdutoResolvidos {
  return {
    produto_id: produtoId,
    base: null,
    balcao: null,
    online: null,
    whatsapp: null,
    promocional: null,
    pix: null,
    dinheiro: null,
    debito: null,
    credito: null,
    formatados: {
      base: "",
      balcao: "",
      online: "",
      whatsapp: "",
      promocional: "",
      pix: "",
      dinheiro: "",
      debito: "",
      credito: "",
    },
    promocao: null,
    promocoes_por_canal: { balcao: null, online: null, whatsapp: null },
  };
}

export async function resolverPrecosProdutos(params: {
  empresaId: string;
  itemIds: string[];
  agora?: Date;
}) {
  const empresaId = String(params.empresaId || "").trim();
  const itemIds = Array.from(
    new Set(params.itemIds.map((id) => String(id || "").trim()).filter(Boolean))
  ).slice(0, 2000);
  const resultado = new Map<string, PrecosProdutoResolvidos>();

  if (!empresaId || itemIds.length === 0) return resultado;

  const agoraIso = (params.agora || new Date()).toISOString();
  const [itensResultado, canaisResultado, regrasResultado, vinculosResultado] =
    await Promise.all([
      supabase
        .from("estoque_itens")
        .select("id,preco_venda")
        .eq("empresa_id", empresaId)
        .in("id", itemIds),
      supabase
        .from("estoque_precos_canais")
        .select("estoque_item_id,canal,preco")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .in("estoque_item_id", itemIds),
      supabase
        .from("estoque_regras_pagamento")
        .select("id,estoque_item_id,canal,forma,parcelas_min,parcelas_max,tipo_ajuste,valor,updated_at")
        .eq("empresa_id", empresaId)
        .eq("ativo", true),
      supabase
        .from("estoque_promocao_itens")
        .select("promocao_id,estoque_item_id")
        .eq("empresa_id", empresaId)
        .in("estoque_item_id", itemIds),
    ]);

  const falha = [
    itensResultado.error,
    canaisResultado.error,
    regrasResultado.error,
    vinculosResultado.error,
  ].find(Boolean);
  if (falha) {
    throw new Error(`Erro ao resolver preços do estoque: ${falha?.message || "falha de consulta"}`);
  }

  const vinculos = (vinculosResultado.data || []) as VinculoPromocaoDb[];
  const promocaoIds = Array.from(new Set(vinculos.map((item) => item.promocao_id)));
  let promocoes: PromocaoDb[] = [];

  if (promocaoIds.length > 0) {
    const { data, error } = await supabase
      .from("estoque_promocoes")
      .select("id,nome,tipo_ajuste,valor,inicio_em,fim_em,canais,prioridade")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .lte("inicio_em", agoraIso)
      .gt("fim_em", agoraIso)
      .in("id", promocaoIds);

    if (error) throw new Error(`Erro ao consultar promoções vigentes: ${error.message}`);
    promocoes = (data || []) as PromocaoDb[];
  }

  const canais = (canaisResultado.data || []) as PrecoCanalDb[];
  const regras = (regrasResultado.data || []) as RegraPagamentoDb[];
  const promocoesPorId = new Map(promocoes.map((promocao) => [promocao.id, promocao]));
  const promocoesPorItem = new Map<string, PromocaoDb[]>();

  for (const vinculo of vinculos) {
    const promocao = promocoesPorId.get(vinculo.promocao_id);
    if (!promocao) continue;
    const lista = promocoesPorItem.get(vinculo.estoque_item_id) || [];
    lista.push(promocao);
    promocoesPorItem.set(vinculo.estoque_item_id, lista);
  }

  for (const item of (itensResultado.data || []) as ItemPrecoDb[]) {
    const base = dinheiro(numeroOuNull(item.preco_venda));
    const canaisItem = canais.filter((canal) => canal.estoque_item_id === item.id);
    const promosItem = promocoesPorItem.get(item.id) || [];
    const precoCanalAntesPromo = (canal: CanalPreco) =>
      dinheiro(
        numeroOuNull(canaisItem.find((registro) => registro.canal === canal)?.preco) ?? base
      );

    const promoBalcao = melhorPromocao(promosItem, "balcao");
    const promoOnline = melhorPromocao(promosItem, "online");
    const promoWhatsapp = melhorPromocao(promosItem, "whatsapp");
    const balcao = aplicarPromocao(precoCanalAntesPromo("balcao"), promoBalcao);
    const online = aplicarPromocao(precoCanalAntesPromo("online"), promoOnline);
    const whatsapp = aplicarPromocao(precoCanalAntesPromo("whatsapp"), promoWhatsapp);

    const precoPagamento = (forma: FormaPreco) =>
      aplicarRegraPagamento(
        whatsapp,
        melhorRegraPagamento({
          regras,
          itemId: item.id,
          canal: "whatsapp",
          forma,
          parcelas: 1,
        })
      );

    const pix = precoPagamento("pix");
    const dinheiroPreco = precoPagamento("dinheiro");
    const debito = precoPagamento("debito");
    const credito = precoPagamento("credito");
    const promocaoPrincipal = promoWhatsapp || promoBalcao || promoOnline;

    resultado.set(item.id, {
      produto_id: item.id,
      base,
      balcao,
      online,
      whatsapp,
      promocional: promoWhatsapp ? whatsapp : null,
      pix,
      dinheiro: dinheiroPreco,
      debito,
      credito,
      formatados: {
        base: moeda(base),
        balcao: moeda(balcao),
        online: moeda(online),
        whatsapp: moeda(whatsapp),
        promocional: moeda(promoWhatsapp ? whatsapp : null),
        pix: moeda(pix),
        dinheiro: moeda(dinheiroPreco),
        debito: moeda(debito),
        credito: moeda(credito),
      },
      promocao: promocaoResolvida(promocaoPrincipal),
      promocoes_por_canal: {
        balcao: promocaoResolvida(promoBalcao),
        online: promocaoResolvida(promoOnline),
        whatsapp: promocaoResolvida(promoWhatsapp),
      },
    });
  }

  for (const itemId of itemIds) {
    if (!resultado.has(itemId)) resultado.set(itemId, vazio(itemId));
  }

  return resultado;
}

export async function resolverPrecosProduto(params: {
  empresaId: string;
  itemId: string;
  agora?: Date;
}) {
  const mapa = await resolverPrecosProdutos({
    empresaId: params.empresaId,
    itemIds: [params.itemId],
    agora: params.agora,
  });
  return mapa.get(params.itemId) || vazio(params.itemId);
}
