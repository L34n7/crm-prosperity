import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CATEGORIAS_COTACAO,type CategoriaCotacao,type PlanoCotacao } from "./catalogo";
import { type EnergiaVeiculo,type UsoVeiculo } from "./comercial";
import { consultarRegraComercial, listarPlanosEmpresa, listarArquivosPlano,statusConfiguracaoCotacao } from "./configuracao";
import {planosPermitidosFerramentaCotacao} from "./planos-ferramenta";
import {calcularTaxasContratacao} from "./condicoes-contratacao";
import {carregarCondicoesContratacao,condicoesEfetivasPlano} from "./condicoes-servidor";
export { CATEGORIAS_COTACAO };
export type { CategoriaCotacao, PlanoCotacao };
const admin=getSupabaseAdmin();
export function categoriaValida(v:unknown):v is CategoriaCotacao{
  return typeof v==="string"&&Object.hasOwn(CATEGORIAS_COTACAO,v);
}
export async function configuracaoCotacao(empresaId:string){
  const {data,error}=await admin.from("cotacao_veicular_configuracoes")
    .select("tabela_importada,modelos_importados,referencia,vigencia_ate,arquivo_precos_nome,arquivo_precos_em,arquivo_especiais_nome,arquivo_especiais_em,updated_at")
    .eq("empresa_id",empresaId).maybeSingle();
  if(error)throw new Error(error.message);
  return data||{
    tabela_importada:false,modelos_importados:false,
    referencia:"",vigencia_ate:null,arquivo_precos_nome:null,arquivo_precos_em:null,
    arquivo_especiais_nome:null,arquivo_especiais_em:null,updated_at:null,
  };
}
export async function consultarFaixas(empresaId:string,categoria:CategoriaCotacao){
  const {data,error}=await admin.from("cotacao_veicular_precos_planos").select("*")
    .eq("empresa_id",empresaId).eq("categoria",categoria).order("fipe_min_centavos");
  if(error)throw new Error(error.message);
  return data||[];
}
export async function verificarEspecialEmpresa(
  empresaId:string, modelo:string, codigoFipe?:string, plano?:string
){
  let consulta=admin.from("cotacao_veicular_modelos_plano")
    .select("modelo,codigo_fipe,plano").eq("empresa_id",empresaId).limit(5000);
  if(plano)consulta=consulta.eq("plano",plano);
  const {data,error}=await consulta;
  if(error)throw new Error(error.message);
  const normalizar=(texto:string)=>texto.normalize("NFD").replace(/\p{M}/gu,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const nomeModelo=normalizar(modelo);
  return (data||[]).some(v=>{
    if(codigoFipe&&v.codigo_fipe&&v.codigo_fipe.trim()===codigoFipe.trim())
      return true;
    const referencia=normalizar(v.modelo);
    if(referencia===nomeModelo)return true;
    // Tabela de origem admite registros como "316 (todas)" para a família.
    const familia=v.modelo.match(/^([0-9]{3,4})\s*\(todas\)$/i);
    return Boolean(familia && new RegExp("^"+familia[1]+"(?:[a-z]|\\b)","i").test(nomeModelo));
  });
}
export type ParametrosCotacao={
  empresaId:string;categoria:CategoriaCotacao;valorFipeCentavos:number;
  uso:UsoVeiculo;energia:EnergiaVeiculo;origem:"manual"|"agente_ia";
  veiculo?:string;modeloFipe?:string;codigoFipe?:string;
  opcionaisPorPlano?:Record<string,string[]>;
  tipoFipe?:"cars"|"motorcycles"|"trucks"|null;
  /** Restrição interna para cotações automáticas; null/ausente = todos os planos ativos. */
  planosPermitidos?:string[]|null;
};
export async function calcularCotacaoPlanos(p:ParametrosCotacao){
  if(!categoriaValida(p.categoria)||!Number.isSafeInteger(p.valorFipeCentavos)||
    p.valorFipeCentavos<=0||p.valorFipeCentavos>2000000000)
    throw new Error("Informe uma categoria e valor FIPE válidos.");
  const [status,planos,faixas,faixasEspeciais,arquivos,configTaxas]=await Promise.all([
    statusConfiguracaoCotacao(
      p.empresaId,p.origem==="agente_ia"?p.planosPermitidos:null
    ),listarPlanosEmpresa(p.empresaId,true),
    consultarFaixas(p.empresaId,p.categoria),
    p.categoria==="especiais" ? Promise.resolve([]) : consultarFaixas(p.empresaId,"especiais"),
    listarArquivosPlano(p.empresaId),
    carregarCondicoesContratacao(p.empresaId),
  ]);
  if(!planos.length)throw new Error("Crie ao menos um plano antes de cotar.");
  const planosDaCotacao=planosPermitidosFerramentaCotacao(
    planos,p.origem==="agente_ia"?p.planosPermitidos??null:null,
  );
  if(!planosDaCotacao.length)throw new Error(
    "Selecione ao menos um plano ativo para gerar a cotação."
  );
  if(p.origem==="agente_ia"&&!status.pronta)
    throw new Error("Configuração comercial pendente: "+status.pendencias.slice(0,2).join(" "));
  const resultados=[];
  const tetosFipe:number[]=[];
  for(const plano of planosDaCotacao){
    const meta=arquivos.find(a=>a.plano===plano.codigo);
    const modeloConsulta=p.modeloFipe||p.veiculo||"";
    const especial=Boolean(modeloConsulta) && await verificarEspecialEmpresa(
      p.empresaId,modeloConsulta,p.codigoFipe,plano.codigo);
    if(p.categoria==="especiais"&&!especial)continue;
    const categoriaPlano=especial?"especiais":p.categoria;
    const faixasPlano=categoriaPlano==="especiais"?p.categoria==="especiais"?faixas:faixasEspeciais:faixas;
    const faixasDisponiveis=faixasPlano.filter(f=>f.plano===plano.codigo);
    const limite=Math.max(0,...faixasDisponiveis.map(f=>Number(f.fipe_max_centavos)));
    if(limite>0&&Number.isFinite(limite))tetosFipe.push(limite);
    const faixa=faixasDisponiveis.find(f=>
      p.valorFipeCentavos>=Number(f.fipe_min_centavos)&&
      p.valorFipeCentavos<=Number(f.fipe_max_centavos));
    if(!faixa)continue; // Planos podem atender categorias e faixas diferentes.
    if(!meta?.arquivo_precos_nome)continue;
    if(p.categoria==="especiais"&&
      !(await verificarEspecialEmpresa(p.empresaId,modeloConsulta,p.codigoFipe,plano.codigo)))continue;
    const {regra,opcionais}=await consultarRegraComercial(p.empresaId,categoriaPlano,plano.codigo);
    if(!regra.usos_permitidos.includes(p.uso)||!regra.energias_permitidas.includes(p.energia))
      continue;
    const solicitados=[...new Set(p.opcionaisPorPlano?.[plano.codigo]||[])];
    const ativos=opcionais.filter(o=>o.ativo);
    if(solicitados.some(c=>!ativos.some(o=>o.codigo===c)))
      throw new Error("Opcional inválido para "+plano.nome+".");
    const extras=ativos.filter(o=>solicitados.includes(o.codigo));
    const grupos=extras.map(o=>o.grupo_exclusivo).filter(Boolean);
    if(grupos.length!==new Set(grupos).size)
      throw new Error("Existem opcionais incompatíveis em "+plano.nome+".");
    const base=Number(faixa.valor_centavos);
    const taxas=calcularTaxasContratacao({
      condicoes:condicoesEfetivasPlano(configTaxas,plano.codigo),
      valorFipeCentavos:p.valorFipeCentavos,
      categoria:p.categoria,
      tipoFipe:p.tipoFipe,
    });
    resultados.push({
      plano:plano.codigo,plano_nome:plano.nome,categoria:categoriaPlano,
      codigo_produto:faixa.codigo_produto,mensalidade_base_centavos:base,
      opcionais:extras.map(o=>({codigo:o.codigo,nome:o.nome,centavos:Number(o.valor_centavos)})),
      opcionais_disponiveis:ativos.map(o=>({
        codigo:o.codigo,nome:o.nome,centavos:Number(o.valor_centavos),
        grupo_exclusivo:o.grupo_exclusivo||"",
      })),
      total_centavos:base+extras.reduce((total,item)=>total+Number(item.valor_centavos),0)
        +taxas.rastreador_mensalidade_adicional_centavos,
      ...taxas,
      cota_participacao_centavos:Math.max(
        Math.round(p.valorFipeCentavos*Number(regra.participacao_percentual)/100),
        Number(regra.participacao_min_centavos)),
      participacao_percentual:Number(regra.participacao_percentual),
      tabela_validada:status.pronta,referencia:meta.referencia,
      terceiros_limite_centavos:Number(regra.terceiros_limite_centavos),
      assistencia_km_total:Number(regra.assistencia_km_total),
      assistencias_ano:Number(regra.assistencias_ano),
      carro_reserva_incluso_dias:Number(regra.carro_reserva_incluso_dias),
      coberturas:regra.coberturas,observacoes:regra.observacoes,
      uso:p.uso,energia:p.energia,faixa_fipe_min_centavos:Number(faixa.fipe_min_centavos),
      faixa_fipe_max_centavos:Number(faixa.fipe_max_centavos),
    });
  }
  if(!resultados.length){
    const teto=tetosFipe.length?Math.max(...tetosFipe):0;
    if(teto>0&&p.valorFipeCentavos>teto){
      const reais=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v/100);
      throw new Error("O valor FIPE deste veículo ("+reais(p.valorFipeCentavos)+
        ") ultrapassa a maior faixa cadastrada para sua categoria ("+reais(teto)+
        "). Não há mensalidade definida para este valor. Atualize a tabela de preços do plano antes de cotar.");
    }
    throw new Error("Nenhum plano disponível para este veículo. Confira os critérios de aceitação, a categoria e as faixas de preço cadastradas.");
  }
  return {planos:resultados};
}
export async function salvarCotacaoPlanos(p:ParametrosCotacao & {
 contatoId?:string|null;conversaId?:string|null;agenteId?:string|null;
 nomeContato?:string;veiculo:string;anoModelo?:number|null;referenciaFipe?:string;
 idempotencyKey?:string|null;
}){
  const calculos=await calcularCotacaoPlanos(p);
  const chave=p.idempotencyKey||null;
  if(chave){
    const {data,error}=await admin.from("cotacao_veicular_cotacoes").select("grupo_id")
      .eq("empresa_id",p.empresaId).eq("idempotency_key",chave+":grupo").maybeSingle();
    if(error)throw new Error(error.message);
    if(data?.grupo_id){
      const {data:existentes,error:err}=await admin.from("cotacao_veicular_cotacoes").select("*")
        .eq("empresa_id",p.empresaId).eq("grupo_id",data.grupo_id);
      if(err)throw new Error(err.message);
      if((existentes||[]).length===calculos.planos.length)
        return {cotacoes:existentes,calculos,grupo_id:data.grupo_id};
    }
  }
  const grupoId=randomUUID();
  const linhas=calculos.planos.map((c,i)=>({
    empresa_id:p.empresaId,contato_id:p.contatoId||null,conversa_id:p.conversaId||null,
    agente_id:p.agenteId||null,grupo_id:grupoId,origem:p.origem,
    status:c.tabela_validada?"emitida":"rascunho",nome_contato:(p.nomeContato||"").trim().slice(0,160)||null,
    veiculo:p.veiculo.trim().slice(0,240),categoria:c.categoria,ano_modelo:p.anoModelo||null,
    valor_fipe_centavos:p.valorFipeCentavos,referencia_fipe:(p.referenciaFipe||"").slice(0,100)||null,
    plano:c.plano,plano_nome:c.plano_nome,codigo_produto:c.codigo_produto,
    mensalidade_base_centavos:c.mensalidade_base_centavos,opcionais_json:c.opcionais,
    total_centavos:c.total_centavos,cota_participacao_centavos:c.cota_participacao_centavos,
    tabela_validada:c.tabela_validada,regras_snapshot:c,
    idempotency_key:chave?chave+(i===0?":grupo":":"+c.plano):null,
  }));
  const {data,error}=await admin.from("cotacao_veicular_cotacoes").insert(linhas).select("*");
  if(error)throw new Error(error.message);
  return {cotacoes:data||[],calculos,grupo_id:grupoId};
}
