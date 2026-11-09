import type {PlanoEmpresa} from "./catalogo";

/** Ausência ou null preserva o comportamento legado: todos os planos ativos.
 * Uma lista explícita precisa ser não vazia e conter apenas códigos válidos.
 * Não aceitar valores malformados para impedir retorno silencioso a "todos".
 */
export function codigosPlanosFerramentaCotacao(
  config:Record<string,unknown>,
):string[]|null{
  const valor=config.planos_cotacao_codigos;
  if(valor===undefined||valor===null)return null;
  if(!Array.isArray(valor)||valor.length===0||valor.length>30||
     valor.some(codigo=>typeof codigo!=="string"||
       !/^[a-z0-9_]{2,50}$/.test(codigo))){
    throw new Error(
      "Selecione pelo menos um plano válido para a ferramenta de cotação.",
    );
  }
  const unicos=[...new Set(valor as string[])];
  if(unicos.length!==valor.length)
    throw new Error("A lista da ferramenta contém planos duplicados.");
  return unicos;
}

/** Nunca incluir planos desativados, excluídos ou de outra empresa.
 * Esta validação é executada tanto ao salvar a ferramenta quanto na
 * geração real da proposta, sempre contra o catálogo da própria empresa.
 */
export function planosPermitidosFerramentaCotacao(
  planos:readonly PlanoEmpresa[],
  codigos:string[]|null,
):PlanoEmpresa[]{
  const ativos=planos.filter(plano=>plano.ativo);
  if(!codigos)return ativos;
  const permitidos=new Set(codigos);
  if(codigos.some(codigo=>!ativos.some(plano=>plano.codigo===codigo))){
    throw new Error(
      "Um dos planos selecionados para a ferramenta não está ativo ou foi excluído. "+
      "Atualize a seleção de planos do agente.",
    );
  }
  return ativos.filter(plano=>permitidos.has(plano.codigo));
}
