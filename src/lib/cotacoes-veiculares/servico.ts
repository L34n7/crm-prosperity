import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { CATEGORIAS_COTACAO, opcionaisDisponiveis, type CategoriaCotacao, type PlanoCotacao } from "./catalogo";
export { CATEGORIAS_COTACAO, opcionaisDisponiveis };
export type { CategoriaCotacao, PlanoCotacao };

type Faixa = {
  categoria: string; fipe_min_centavos: number; fipe_max_centavos: number;
  codigo_premium: string; codigo_completo: string;
  premium_centavos: number; completo_centavos: number; revisar: boolean;
};
export function categoriaValida(valor: unknown): valor is CategoriaCotacao {
  return typeof valor === "string" && Object.hasOwn(CATEGORIAS_COTACAO, valor);
}
export function planoValido(valor: unknown): valor is PlanoCotacao {
  return valor === "premium" || valor === "completo";
}
function regraParticipacao(categoria: CategoriaCotacao, plano: PlanoCotacao) {
  switch (categoria) {
    case "motocicleta": return { percentual: 10, minimo: 120000 };
    case "auto_leves": return { percentual: 5, minimo: 130000 };
    case "app_taxi": return plano === "premium" ? { percentual: 10, minimo: 350000 } : { percentual: 7.5, minimo: 210000 };
    case "especiais": return plano === "premium" ? { percentual: 7.5, minimo: 310000 } : { percentual: 10, minimo: 500000 };
    case "van_utilitario": return { percentual: 7.5, minimo: 310000 };
    case "caminhao_leve": case "caminhao_pesado": return { percentual: 8, minimo: 350000 };
    case "agregado": return { percentual: 10, minimo: 200000 };
  }
}
export async function configuracaoCotacao(empresaId: string) {
  const { data, error } = await getSupabaseAdmin().from("cotacao_veicular_configuracoes")
    .select("tabela_validada,ia_habilitada,referencia,updated_at")
    .eq("empresa_id", empresaId).maybeSingle();
  if (error) throw new Error(error.message);
  return data || {
    tabela_validada: false,
    ia_habilitada: false,
    referencia: "Tabela Save Car jan/2024 — pendente de confirmação",
    updated_at: null,
  };
}
export async function consultarFaixas(empresaId: string, categoria: CategoriaCotacao) {
  const supabase = getSupabaseAdmin();
  const [{ data: base, error: errorBase }, { data: ajustadas, error: errorAjustadas }] = await Promise.all([
    supabase.from("cotacao_veicular_faixas_base").select("*").eq("categoria", categoria).order("fipe_min_centavos"),
    supabase.from("cotacao_veicular_faixas").select("*").eq("empresa_id",empresaId).eq("categoria", categoria),
  ]);
  if (errorBase || errorAjustadas) throw new Error(errorBase?.message || errorAjustadas?.message);
  const ajustes = new Map((ajustadas || []).map((item) => [Number(item.fipe_min_centavos), item]));
  return ((base || []) as Faixa[]).map((item) => ajustes.get(Number(item.fipe_min_centavos)) || item) as Faixa[];
}
export async function calcularCotacaoVeicular(params: {
  empresaId: string; categoria: CategoriaCotacao; plano: PlanoCotacao;
  valorFipeCentavos: number; opcionais?: string[]; origem: "manual" | "agente_ia";
}) {
  if (!categoriaValida(params.categoria) || !planoValido(params.plano))
    throw new Error("Selecione categoria e plano válidos.");
  if (!Number.isSafeInteger(params.valorFipeCentavos) || params.valorFipeCentavos <= 0 || params.valorFipeCentavos > 2000000000)
    throw new Error("Informe um valor FIPE válido.");
  const config = await configuracaoCotacao(params.empresaId);
  if (params.origem === "agente_ia" && (!config.tabela_validada || !config.ia_habilitada))
    throw new Error("Cotação automática ainda não autorizada. Encaminhe o cliente à equipe comercial.");
  const faixas = await consultarFaixas(params.empresaId, params.categoria);
  const faixa = faixas.find((item) => params.valorFipeCentavos >= Number(item.fipe_min_centavos) && params.valorFipeCentavos <= Number(item.fipe_max_centavos));
  if (!faixa) throw new Error("O valor FIPE informado está fora das faixas cadastradas. Encaminhe para análise comercial.");
  if (params.origem === "agente_ia" && faixa.revisar)
    throw new Error("Essa faixa de preço precisa de conferência comercial. Transfira para a equipe.");
  const validos = opcionaisDisponiveis(params.categoria, params.plano);
  const solicitados = [...new Set(params.opcionais || [])];
  if (solicitados.some((item) => !validos.some((v) => v.codigo === item)))
    throw new Error("Opcionais incompatíveis com a categoria ou plano.");
  if (solicitados.includes("carro_reserva_7d") && solicitados.includes("carro_reserva_15d"))
    throw new Error("Selecione apenas um prazo de carro reserva.");
  const extras = validos.filter((item) => solicitados.includes(item.codigo));
  const base = Number(params.plano === "premium" ? faixa.premium_centavos : faixa.completo_centavos);
  const participacao = regraParticipacao(params.categoria, params.plano);
  return {
    categoria: params.categoria,
    plano: params.plano,
    faixa,
    codigo_produto: params.plano === "premium" ? faixa.codigo_premium : faixa.codigo_completo,
    mensalidade_base_centavos: base,
    opcionais: extras,
    total_centavos: base + extras.reduce((s, item) => s + item.centavos, 0),
    cota_participacao_centavos: Math.max(
      Math.round(params.valorFipeCentavos * participacao.percentual / 100), participacao.minimo
    ),
    participacao_percentual: participacao.percentual,
    tabela_validada: config.tabela_validada && !faixa.revisar,
    referencia: config.referencia,
    terceiros_limite_centavos: params.categoria === "agregado" ? 0 : params.plano === "premium" ? 10000000 : 3000000,
    assistencia_km_total: params.plano === "premium" ? 600 : 300,
    assistencias_ano: params.plano === "premium" ? 12 : 4,
    carro_reserva_incluso_dias: params.categoria === "app_taxi" && params.plano === "premium" ? 30 : 0,
  };
}

export async function salvarCotacaoVeicular(params: {
  empresaId: string; contatoId?: string | null; conversaId?: string | null; agenteId?: string | null;
  origem: "manual" | "agente_ia"; nomeContato?: string; veiculo: string; anoModelo?: number | null;
  categoria: CategoriaCotacao; plano: PlanoCotacao; valorFipeCentavos: number;
  referenciaFipe?: string; opcionais?: string[]; idempotencyKey?: string | null;
}) {
  const calculo = await calcularCotacaoVeicular(params);
  const supabase = getSupabaseAdmin();
  if (params.idempotencyKey) {
    const { data: existente, error: consultaErro } = await supabase.from("cotacao_veicular_cotacoes")
      .select("*").eq("empresa_id",params.empresaId).eq("idempotency_key",params.idempotencyKey).maybeSingle();
    if (consultaErro) throw new Error(consultaErro.message);
    if (existente) return { cotacao: existente, calculo };
  }
  const { data, error } = await supabase.from("cotacao_veicular_cotacoes").insert({
    empresa_id: params.empresaId,
    contato_id: params.contatoId || null,
    conversa_id: params.conversaId || null,
    agente_id: params.agenteId || null,
    origem: params.origem,
    status: calculo.tabela_validada ? "emitida" : "rascunho",
    nome_contato: (params.nomeContato || "").trim().slice(0,160) || null,
    veiculo: params.veiculo.trim().slice(0,240),
    categoria: params.categoria,
    ano_modelo: params.anoModelo || null,
    valor_fipe_centavos: params.valorFipeCentavos,
    referencia_fipe: (params.referenciaFipe || "").slice(0,100) || null,
    plano: params.plano,
    codigo_produto: calculo.codigo_produto,
    mensalidade_base_centavos: calculo.mensalidade_base_centavos,
    opcionais_json: calculo.opcionais,
    total_centavos: calculo.total_centavos,
    cota_participacao_centavos: calculo.cota_participacao_centavos,
    tabela_validada: calculo.tabela_validada,
    idempotency_key: params.idempotencyKey || null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { cotacao: data, calculo };
}
