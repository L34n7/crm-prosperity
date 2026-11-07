import type {CategoriaCotacao} from "./catalogo";
import type {TipoFipe} from "./fipe";
import {categoriaAutomaticaCaminhao} from "./classificacao-caminhoes";

/** Classificação comercial padrão no momento da consulta FIPE.
 * Nunca presume aceitação ou preço: o cálculo dos planos valida tudo.
 */
export function categoriaAutomaticaPorFipe(
  tipo:TipoFipe,modelo:string,
):CategoriaCotacao{
  if(tipo==="motorcycles")return "motocicleta";
  if(tipo==="trucks")return categoriaAutomaticaCaminhao(modelo);
  const descricao=String(modelo||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toUpperCase();
  // Descrições explícitas de carroceria; mantém famílias comerciais
  // já contempladas na política anterior sem reclassificar picapes/SUV.
  if(/\b(VAN|FURGAO|MINIBUS|MICRO[ -]?ONIBUS|SPRINTER|DUCATO|MASTER|TRANSIT|JUMPER|BOXER|IVECO DAILY)\b/.test(descricao))
    return "van_utilitario";
  return "auto_leves";
}

/** A definição manual da empresa prevalece inclusive sobre o catálogo
 * histórico por ano. Sem intervenção manual, preserva uma categoria
 * já corrigida diretamente no catálogo; caso contrário aplica padrão.
 * "app_taxi" só é decidido posteriormente pelo uso declarado.
 */
export function categoriaBaseEfetivaFipe(params:{
  categoriaClassificacao:CategoriaCotacao|null;
  origemClassificacao:"manual"|"automatica";
  categoriaCatalogo:CategoriaCotacao|null|undefined;
}):CategoriaCotacao|null{
  if(params.origemClassificacao==="manual")
    return params.categoriaClassificacao;
  return params.categoriaCatalogo??params.categoriaClassificacao;
}
