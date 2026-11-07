/** A FIPE entrega o TIPO "trucks", não a subcategoria contratual.
 * Padrão comercial do CRM Prosperity: todo caminhão -> pesado.
 * "Leve" e "agregado" são exceções comerciais por empresa/código FIPE.
 * Tração 4x2/6x2/8x4 descreve eixos, NÃO peso bruto total (PBT).
 */
export function tracaoIndicadaNaFipe(descricao:string):string|null{
  const nome=String(descricao||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/×/g,"X");
  const match=nome.match(/(?:^|[^A-Z0-9])((?:4|6|8|10|12)\s*X\s*(?:2|4|6|8))(?![A-Z0-9])/);
  return match?match[1].replace(/\s+/g,""):null;
}
export function categoriaAutomaticaCaminhao(
  _descricaoFipe:string,
):"caminhao_pesado"{
  return "caminhao_pesado";
}
