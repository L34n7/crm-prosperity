import type {CategoriaCotacao} from "./catalogo";

/** Condições negociadas são por empresa ou por plano, não por prompt.
 * Os limites são expressos em centavos e são estritamente "acima de".
 */
export type CondicoesContratacao={
  adesao_ativa:boolean;
  adesao_centavos:number|null;
  rastreador_ativo:boolean;
  rastreador_carro_acima_centavos:number|null;
  rastreador_moto_acima_centavos:number|null;
  rastreador_instalacao_centavos:number;
  rastreador_mensalidade_inclusa:boolean;
  rastreador_mensalidade_adicional_centavos:number;
};
export const CONDICOES_CONTRATACAO_PADRAO:CondicoesContratacao={
  adesao_ativa:false,
  adesao_centavos:null,
  rastreador_ativo:false,
  rastreador_carro_acima_centavos:null,
  rastreador_moto_acima_centavos:null,
  rastreador_instalacao_centavos:0,
  rastreador_mensalidade_inclusa:true,
  rastreador_mensalidade_adicional_centavos:0,
};
const MAX_TAXA_CENTAVOS=100_000_000;
const MAX_FIPE_CENTAVOS=2_000_000_000;

function valorCentavos(valor:unknown,chave:string,max:number):number|null{
  if(valor===null)return null;
  if(typeof valor!=="number"||!Number.isSafeInteger(valor)||valor<0||valor>max)
    throw new Error("Informe um valor válido para "+chave+".");
  return valor;
}

/** Validação estrita em cada gravação e leitura do backend. Um estado
 * incompleto jamais ativa cobrança desconhecida por acidente.
 */
export function validarCondicoesContratacao(valor:unknown):CondicoesContratacao{
  if(!valor||typeof valor!=="object"||Array.isArray(valor))
    throw new Error("Informe as condições de contratação.");
  const v=valor as Record<string,unknown>;
  for(const k of ["adesao_ativa","rastreador_ativo","rastreador_mensalidade_inclusa"]){
    if(typeof v[k]!=="boolean")throw new Error("A configuração "+k+" deve ser booleana.");
  }
  const c:CondicoesContratacao={
    adesao_ativa:v.adesao_ativa as boolean,
    adesao_centavos:valorCentavos(v.adesao_centavos,"adesão",MAX_TAXA_CENTAVOS),
    rastreador_ativo:v.rastreador_ativo as boolean,
    rastreador_carro_acima_centavos:valorCentavos(
      v.rastreador_carro_acima_centavos,"limite FIPE de automóveis",MAX_FIPE_CENTAVOS),
    rastreador_moto_acima_centavos:valorCentavos(
      v.rastreador_moto_acima_centavos,"limite FIPE de motocicletas",MAX_FIPE_CENTAVOS),
    rastreador_instalacao_centavos:valorCentavos(
      v.rastreador_instalacao_centavos,"instalação do rastreador",MAX_TAXA_CENTAVOS)??0,
    rastreador_mensalidade_inclusa:v.rastreador_mensalidade_inclusa as boolean,
    rastreador_mensalidade_adicional_centavos:valorCentavos(
      v.rastreador_mensalidade_adicional_centavos,"mensalidade adicional",MAX_TAXA_CENTAVOS)??0,
  };
  if(c.rastreador_ativo){
    if(c.rastreador_carro_acima_centavos===null&&c.rastreador_moto_acima_centavos===null)
      throw new Error("Configure um limite FIPE para carro ou moto ao ativar o rastreador.");
    if(!c.rastreador_mensalidade_inclusa&&c.rastreador_mensalidade_adicional_centavos<=0)
      throw new Error("Informe o custo mensal adicional do rastreador ou marque como já incluído.");
  }
  return c;
}

export function normalizarCondicoesContratacao(valor:unknown):CondicoesContratacao{
  if(valor===null||valor===undefined)return {...CONDICOES_CONTRATACAO_PADRAO};
  return validarCondicoesContratacao({
    ...CONDICOES_CONTRATACAO_PADRAO,
    ...(typeof valor==="object"&&!Array.isArray(valor)?valor:{}),
  });
}

export type TaxasDaCotacao={
  adesao_ativa:boolean;
  adesao_centavos:number|null;
  rastreador_obrigatorio:boolean;
  rastreador_instalacao_centavos:number;
  rastreador_mensalidade_inclusa:boolean;
  rastreador_mensalidade_adicional_centavos:number;
  taxas_unicas_centavos:number|null;
};

/** tipoFipe é a identidade real cars/motorcycles/trucks, inclusive se
 * comercialmente um automóvel foi classificado em "especiais".
 * Nunca aplica limite de carro a van/caminhão por inferência textual.
 */
export function calcularTaxasContratacao(p:{
  condicoes:CondicoesContratacao;
  valorFipeCentavos:number;
  categoria:CategoriaCotacao;
  tipoFipe?:"cars"|"motorcycles"|"trucks"|null;
}):TaxasDaCotacao{
  const c=p.condicoes;
  const categoriaVeiculo=p.tipoFipe==="motorcycles"?"moto":
    p.tipoFipe==="trucks"?"outros":
    p.tipoFipe==="cars"?"carro":
    p.categoria==="motocicleta"?"moto":
    (p.categoria==="auto_leves"||p.categoria==="app_taxi")?"carro":"outros";
  const limite=categoriaVeiculo==="carro"?c.rastreador_carro_acima_centavos:
    categoriaVeiculo==="moto"?c.rastreador_moto_acima_centavos:null;
  const obrigatorio=c.rastreador_ativo&&limite!==null&&
    p.valorFipeCentavos>limite;
  const instalacao=obrigatorio?c.rastreador_instalacao_centavos:0;
  const adicional=obrigatorio&&!c.rastreador_mensalidade_inclusa
    ?c.rastreador_mensalidade_adicional_centavos:0;
  return {
    adesao_ativa:c.adesao_ativa,
    adesao_centavos:c.adesao_ativa?c.adesao_centavos:null,
    rastreador_obrigatorio:obrigatorio,
    rastreador_instalacao_centavos:instalacao,
    rastreador_mensalidade_inclusa:c.rastreador_mensalidade_inclusa,
    rastreador_mensalidade_adicional_centavos:adicional,
    // Taxa de adesão pendente impede apresentar total definitivo.
    taxas_unicas_centavos:c.adesao_ativa&&c.adesao_centavos===null?null:
      (c.adesao_ativa?(c.adesao_centavos??0):0)+instalacao,
  };
}
