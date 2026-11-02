import "server-only";
import { randomUUID } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { CATEGORIAS_COTACAO, type CategoriaCotacao, type PlanoCotacao } from "./catalogo";
import { type EnergiaVeiculo, type UsoVeiculo } from "./comercial";
import { consultarRegraComercial, statusConfiguracaoCotacao } from "./configuracao";
export { CATEGORIAS_COTACAO };
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
export async function configuracaoCotacao(empresaId: string) {
  const { data, error } = await getSupabaseAdmin().from("cotacao_veicular_configuracoes")
    .select("tabela_validada,ia_habilitada,tabela_importada,modelos_importados,referencia,vigencia_ate,updated_at")
    .eq("empresa_id", empresaId).maybeSingle();
  if (error) throw new Error(error.message);
  return data || {
    tabela_validada: false,
    ia_habilitada: false,
    tabela_importada: false,
    modelos_importados: false,
    vigencia_ate: null as string | null,
    referencia: "Tabela Save Car jan/2024 — pendente de confirmação",
    updated_at: null,
  };
}
export async function consultarFaixas(empresaId: string, categoria: CategoriaCotacao) {
  const supabase = getSupabaseAdmin();
  const config = await configuracaoCotacao(empresaId);
  if (config.tabela_importada) {
    const { data, error } = await supabase.from("cotacao_veicular_faixas")
      .select("*").eq("empresa_id",empresaId).eq("categoria",categoria).order("fipe_min_centavos");
    if (error) throw new Error(error.message);
    return (data || []) as Faixa[];
  }
  const [{ data: base, error: errorBase }, { data: ajustadas, error: errorAjustadas }] = await Promise.all([
    supabase.from("cotacao_veicular_faixas_base").select("*").eq("categoria",categoria).order("fipe_min_centavos"),
    supabase.from("cotacao_veicular_faixas").select("*").eq("empresa_id",empresaId).eq("categoria",categoria),
  ]);
  if (errorBase || errorAjustadas) throw new Error(errorBase?.message || errorAjustadas?.message);
  const ajustes = new Map((ajustadas || []).map(item => [Number(item.fipe_min_centavos), item]));
  return ((base || []) as Faixa[]).map(item => ajustes.get(Number(item.fipe_min_centavos)) || item) as Faixa[];
}

/** Correspondência exata pelo código FIPE ou nome normalizado, sem inferências ambíguas. */
export async function verificarEspecialEmpresa(empresaId:string, modelo:string, codigoFipe?:string) {
  const {data,error} = await getSupabaseAdmin().from("cotacao_veicular_modelos_empresa")
    .select("modelo,codigo_fipe").eq("empresa_id",empresaId).limit(5000);
  if(error) throw new Error(error.message);
  const normalizar=(v:string)=>v.normalize("NFD").replace(/\p{M}/gu,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const buscado=normalizar(modelo);
  const especial=(data||[]).some(item=>
    Boolean(codigoFipe && item.codigo_fipe && item.codigo_fipe.trim()===codigoFipe.trim()) ||
    normalizar(item.modelo)===buscado
  );
  return especial;
}
export async function calcularCotacaoVeicular(params: {
  empresaId: string; categoria: CategoriaCotacao; plano: PlanoCotacao;
  valorFipeCentavos: number; opcionais?: string[];
  uso: UsoVeiculo; energia: EnergiaVeiculo; origem: "manual" | "agente_ia";
}) {
  if (!categoriaValida(params.categoria) || !planoValido(params.plano))
    throw new Error("Selecione categoria e plano válidos.");
  if (!Number.isSafeInteger(params.valorFipeCentavos) || params.valorFipeCentavos<=0 ||
      params.valorFipeCentavos>2000000000)
    throw new Error("Informe um valor FIPE válido.");
  const config=await configuracaoCotacao(params.empresaId);
  if(!config.tabela_importada)
    throw new Error("Importe a tabela de preços da empresa antes de calcular.");
  const status=await statusConfiguracaoCotacao(params.empresaId);
  if(params.origem==="agente_ia"&&!status.pronta)
    throw new Error("Cotação automática indisponível: "+status.pendencias.slice(0,2).join(" "));
  const [{regra,opcionais:disponiveis},faixas]=await Promise.all([
    consultarRegraComercial(params.empresaId,params.categoria,params.plano),
    consultarFaixas(params.empresaId,params.categoria),
  ]);
  if(!regra.usos_permitidos.includes(params.uso))
    throw new Error("Esta modalidade não atende ao uso informado. Encaminhe à equipe comercial.");
  if(!regra.energias_permitidas.includes(params.energia))
    throw new Error("Esta modalidade não atende à motorização informada. Encaminhe à equipe comercial.");
  const faixa=faixas.find(item=>params.valorFipeCentavos>=Number(item.fipe_min_centavos) &&
    params.valorFipeCentavos<=Number(item.fipe_max_centavos));
  if(!faixa)throw new Error("Valor FIPE fora das faixas cadastradas. Encaminhe para análise.");
  if(faixa.revisar&&params.origem==="agente_ia")
    throw new Error("Faixa sob revisão. Encaminhe à equipe comercial.");
  const ativos=disponiveis.filter(item=>item.ativo);
  const codigos=[...new Set(params.opcionais||[])];
  if(codigos.some(codigo=>!ativos.some(item=>item.codigo===codigo)))
    throw new Error("Um dos opcionais não está disponível neste plano.");
  const extras=ativos.filter(item=>codigos.includes(item.codigo));
  const grupos=extras.map(item=>item.grupo_exclusivo).filter(Boolean);
  if(new Set(grupos).size!==grupos.length)
    throw new Error("Selecione somente um opcional de cada grupo exclusivo.");
  const base=Number(params.plano==="premium"?faixa.premium_centavos:faixa.completo_centavos);
  return {
    categoria:params.categoria,plano:params.plano,faixa,
    codigo_produto:params.plano==="premium"?faixa.codigo_premium:faixa.codigo_completo,
    mensalidade_base_centavos:base,
    opcionais:extras.map(item=>({codigo:item.codigo,nome:item.nome,centavos:item.valor_centavos})),
    total_centavos:base+extras.reduce((total,item)=>total+Number(item.valor_centavos),0),
    cota_participacao_centavos:Math.max(
      Math.round(params.valorFipeCentavos*Number(regra.participacao_percentual)/100),
      Number(regra.participacao_min_centavos)),
    participacao_percentual:Number(regra.participacao_percentual),
    tabela_validada:status.pronta,
    referencia:config.referencia,
    terceiros_limite_centavos:Number(regra.terceiros_limite_centavos),
    assistencia_km_total:Number(regra.assistencia_km_total),
    assistencias_ano:Number(regra.assistencias_ano),
    carro_reserva_incluso_dias:Number(regra.carro_reserva_incluso_dias),
    coberturas:regra.coberturas,observacoes:regra.observacoes,
    uso:params.uso,energia:params.energia,
  };
}

export async function salvarCotacaoVeicular(params: {
  empresaId: string; contatoId?: string | null; conversaId?: string | null; agenteId?: string | null;
  origem: "manual" | "agente_ia"; nomeContato?: string; veiculo: string; anoModelo?: number | null;
  categoria: CategoriaCotacao; plano: PlanoCotacao; valorFipeCentavos: number;
  uso: UsoVeiculo; energia: EnergiaVeiculo;
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
    regras_snapshot: calculo,
    idempotency_key: params.idempotencyKey || null,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { cotacao: data, calculo };
}

export async function calcularCotacaoPlanos(params: {
  empresaId:string; categoria:CategoriaCotacao; valorFipeCentavos:number;
  uso:UsoVeiculo; energia:EnergiaVeiculo;
  origem:"manual"|"agente_ia";
  opcionaisPorPlano?: Partial<Record<PlanoCotacao,string[]>>;
}) {
  const [premium,completo] = await Promise.all((["premium","completo"] as const).map(plano =>
    calcularCotacaoVeicular({
      empresaId:params.empresaId,categoria:params.categoria,valorFipeCentavos:params.valorFipeCentavos,
      origem:params.origem,plano,uso:params.uso,energia:params.energia,opcionais:params.opcionaisPorPlano?.[plano] || [],
    })
  ));
  return { premium, completo };
}

export async function salvarCotacaoPlanos(params:{
  empresaId:string; contatoId?:string|null; conversaId?:string|null; agenteId?:string|null;
  origem:"manual"|"agente_ia"; nomeContato?:string; veiculo:string; anoModelo?:number|null;
  categoria:CategoriaCotacao; valorFipeCentavos:number; referenciaFipe?:string;
  uso:UsoVeiculo; energia:EnergiaVeiculo;
  opcionaisPorPlano?:Partial<Record<PlanoCotacao,string[]>>; idempotencyKey?:string|null;
}) {
  const calculos=await calcularCotacaoPlanos(params);
  const supabase=getSupabaseAdmin();
  const chave=params.idempotencyKey || null;
  if (chave) {
    const {data,error}=await supabase.from("cotacao_veicular_cotacoes").select("*")
      .eq("empresa_id",params.empresaId).eq("idempotency_key",chave+":premium").maybeSingle();
    if(error) throw new Error(error.message);
    if(data?.grupo_id) {
      const {data:existentes,error:erroGrupo}=await supabase.from("cotacao_veicular_cotacoes")
        .select("*").eq("empresa_id",params.empresaId).eq("grupo_id",data.grupo_id);
      if(erroGrupo) throw new Error(erroGrupo.message);
      if((existentes||[]).length===2) return {cotacoes:existentes,calculos,grupo_id:data.grupo_id};
    }
  }
  const grupoId=randomUUID();
  const linhas=(["premium","completo"] as const).map(plano=>{
    const calculo=calculos[plano];
    return {
      empresa_id:params.empresaId, contato_id:params.contatoId || null,
      conversa_id:params.conversaId || null, agente_id:params.agenteId || null,
      grupo_id:grupoId, origem:params.origem,
      status:calculo.tabela_validada ? "emitida" : "rascunho",
      nome_contato:(params.nomeContato||"").trim().slice(0,160)||null,
      veiculo:params.veiculo.trim().slice(0,240),categoria:params.categoria,
      ano_modelo:params.anoModelo||null,valor_fipe_centavos:params.valorFipeCentavos,
      referencia_fipe:(params.referenciaFipe||"").slice(0,100)||null,
      plano,codigo_produto:calculo.codigo_produto,
      mensalidade_base_centavos:calculo.mensalidade_base_centavos,
      opcionais_json:calculo.opcionais,total_centavos:calculo.total_centavos,
      cota_participacao_centavos:calculo.cota_participacao_centavos,
      tabela_validada:calculo.tabela_validada,
      regras_snapshot:calculo,
      idempotency_key:chave?chave+":"+plano:null,
    };
  });
  const {data,error}=await supabase.from("cotacao_veicular_cotacoes").insert(linhas).select("*");
  if(error) throw new Error(error.message);
  return {cotacoes:data||[],calculos,grupo_id:grupoId};
}
