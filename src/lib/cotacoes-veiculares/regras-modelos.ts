import type {CategoriaCotacao} from "./catalogo";

export type TipoModeloFipe="cars"|"motorcycles"|"trucks";
export type RegraModeloCotacao={
  id?:string;
  tipo_fipe:TipoModeloFipe;
  marca:string;
  modelo:string;
  categoria:CategoriaCotacao;
};

/** O identificador de uma família é independente de maiúsculas, acentos e
 * separadores. Não usar correspondência aproximada: regras comerciais não
 * podem acabar afetando outro modelo com nome semelhante.
 */
export function normalizarChaveModelo(valor:string):string{
  return String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}

function mesmaMarca(marcaRegra:string,marcaFipe:string):boolean{
  const regra=normalizarChaveModelo(marcaRegra);
  const oficial=normalizarChaveModelo(marcaFipe);
  if(!regra||!oficial)return false;
  // A FIPE também usa marcas compostas, como "GM - Chevrolet".
  return oficial===regra||
    (regra.length>=4&&(" "+oficial+" ").includes(" "+regra+" "));
}

/** Regras mais específicas da mesma marca têm preferência; a regra nunca
 * identifica um veículo por si só e não afeta outras empresas ou tipos FIPE.
 */
export function selecionarRegraModelo(
  regras:RegraModeloCotacao[],
  veiculo:{tipo_fipe:TipoModeloFipe;marca:string;modelo:string},
):RegraModeloCotacao|null{
  const modelo=normalizarChaveModelo(veiculo.modelo);
  if(!modelo)return null;
  return regras
    .filter(regra=>regra.tipo_fipe===veiculo.tipo_fipe&&
      mesmaMarca(regra.marca,veiculo.marca)&&
      (()=>{const familia=normalizarChaveModelo(regra.modelo);
        return Boolean(familia)&&(modelo===familia||modelo.startsWith(familia+" "));})())
    .sort((a,b)=>normalizarChaveModelo(b.modelo).length-
      normalizarChaveModelo(a.modelo).length)[0]||null;
}

export const CATEGORIAS_POR_TIPO_MODELO:Record<TipoModeloFipe,CategoriaCotacao[]>={
  cars:["auto_leves","van_utilitario","app_taxi","especiais"],
  motorcycles:["motocicleta"],
  trucks:["caminhao_leve","caminhao_pesado","agregado"],
};
