/** Máscara monetária pt-BR da configuração de cotação.
 * O formulário mantém centavos inteiros; apenas a apresentação usa
 * milhares com ponto e decimais com vírgula.
 */
const formatoMoeda=new Intl.NumberFormat("pt-BR",{
  minimumFractionDigits:2,
  maximumFractionDigits:2,
});

export function formatarCentavosMoedaBR(centavos:number|null):string{
  return centavos===null?"":formatoMoeda.format(centavos/100);
}

/** Digitação progressiva: os dois últimos números são os centavos.
 * Ex.: 1 -> 0,01; 100 -> 1,00; 100000 -> 1.000,00.
 * undefined sinaliza entrada inválida (não alterar o valor anterior).
 */
export function centavosDaDigitacaoMoedaBR(
  texto:string,maximoCentavos:number,
):number|null|undefined{
  if(texto.trim()==="")return null;
  const digitos=texto.replace(/\D/g,"");
  if(!digitos)return undefined;
  const centavos=Number(digitos);
  return Number.isSafeInteger(centavos)&&centavos<=maximoCentavos
    ?centavos:undefined;
}

/** Colagem aceita o valor monetário inteiro, com ou sem "R$".
 * Diferentemente da digitação, "1000" colado equivale a R$ 1.000,00.
 */
export function centavosDoTextoColadoMoedaBR(
  texto:string,maximoCentavos:number,
):number|null|undefined{
  const valor=texto.trim().replace(/^R\$\s*/i,"").replace(/\s/g,"");
  if(!valor)return null;
  if(!/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,2})?$/.test(valor))
    return undefined;
  const [inteiro,decimais=""]=valor.split(",");
  const centavos=Number(inteiro.replace(/\./g,""))*100+
    Number(decimais.padEnd(2,"0"));
  return Number.isSafeInteger(centavos)&&centavos<=maximoCentavos
    ?centavos:undefined;
}
