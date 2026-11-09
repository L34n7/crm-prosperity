/** Confirmações conservadoras de erros de digitação em TRAÇÃO.
 * A sugestão nunca é aplicada automaticamente e só existe quando há uma
 * única versão FIPE com a tração candidata.
 */
function padronizar(texto:string):string{
 return String(texto||"").normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/×/g,"x").replace(/\b(\d+)\s*x\s*(\d+)\b/g,"$1x$2")
  .replace(/\s+/g," ").trim();
}
const tracao=/\b(?:4|5|6|8|10|12)x(?:2|4|6|8)\b/;

export function sugestaoUnicaTracaoFipe(
 mensagem:string,opcoes:string[],
):{informada:string;sugerida:string;versao:string}|null{
 const texto=padronizar(mensagem);
 const match=texto.match(tracao);
 if(!match||opcoes.length<2)return null;
 const informada=match[0];
 const alternativas=opcoes.map(versao=>({
   versao,tracao:padronizar(versao).match(tracao)?.[0]||"",
 })).filter(item=>item.tracao);
 if(alternativas.some(item=>item.tracao===informada))return null;
 const proximas=alternativas.filter(item=>
   item.tracao.length===informada.length&&
   [...informada].filter((ch,i)=>ch!==item.tracao[i]).length===1);
 return proximas.length===1?{
   informada,sugerida:proximas[0].tracao,versao:proximas[0].versao,
 }:null;
}
