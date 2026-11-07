import type {CategoriaCotacao} from "./catalogo";
import type {TipoFipe} from "./fipe";

/** A categoria comercial é confirmada pela FIPE e pelas regras da empresa.
 * A finalidade de uso é uma declaração do cliente e só pode ser PRESUMIDA
 * quando o veículo/descrição indicam claramente uma operação de carga.
 * Não confundir "categoria caminhão pesado" com uso comercial obrigatório.
 */
function normalizar(valor:string):string{
  return String(valor||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
export type ContextoUsoFipe={
  tipo:TipoFipe;
  categoria:CategoriaCotacao|null;
  descricaoFipe:string;
  mensagensPedido?:string[];
};

/** Retorna null quando o uso precisa ser confirmado pelo cliente.
 * Não usa nomes comerciais individuais, porte por tração, preço ou potência.
 * O cliente pode sempre declarar uso particular mesmo em um caminhão.
 */
export function usoComercialInferivelFipe(ctx:ContextoUsoFipe):"comercial"|null{
  const nome=normalizar(ctx.descricaoFipe);
  const textoCliente=normalizar((ctx.mensagensPedido||[]).join(" "));
  const conjunto=[nome,textoCliente].filter(Boolean).join(" ");
  // Motorhome, lazer e transporte familiar podem ser particulares.
  // Não inferir o uso mesmo que o cadastro FIPE seja "trucks".
  if(/\b(?:motorhome|motor home|camper|recreativ[oa]|lazer|familia|familiar|uso pessoal|uso privado|colecionador)\b/.test(textoCliente))
    return null;
  if(ctx.categoria==="agregado")return "comercial";
  if(ctx.tipo==="trucks"||ctx.categoria==="caminhao_leve"||ctx.categoria==="caminhao_pesado")
    return "comercial";
  if(ctx.categoria!=="van_utilitario")return null;
  // A descrição de transporte de pessoas (inclusive escolar/executivo)
  // não informa se o serviço será privado ou remunerado.
  if(/\b(?:passageir[oa]s?|escolar|turismo|executiv[oa]|micro onibus|minibus|mini bus|motorhome|motor home|camper)\b/.test(conjunto))
    return null;
  // Vans de carga, furgões e carrocerias de entrega são comercial
  // por padrão; uma van genérica permanece ambígua.
  if(/\b(?:carga|cargas|cargo|furg[aã]o|furgao|furg|entrega|entregas|mercadorias|bau|refrigerad[oa]|logistica|transportadora)\b/.test(conjunto))
    return "comercial";
  return null;
}
