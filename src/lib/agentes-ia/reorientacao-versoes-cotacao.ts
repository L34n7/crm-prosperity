/**
 * Interrupção de listas FIPE que não correspondem ao veículo do cliente.
 * Nenhum fabricante ou modelo recebe tratamento individual.
 */
function norm(texto:string){
  return String(texto||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
export function clienteRejeitouVersoesFipe(mensagem:string):boolean{
  const t=norm(mensagem);
  return /\b(?:nenhum(?:a)? (?:dessas|desses|deles|delas|das opcoes)|nenhuma dessas|nenhuma delas|nao tem ai|nao esta ai|nao aparece|nao encontrei|nao corresponde|nao e nenhuma|nao quero (?:esse|essa|esses|essas)|essas opcoes estao erradas|nao e esse modelo|nao e essa versao|nao e essa|nao e esse|nenhuma|nenhum)\b/.test(t);
}
/** Modelo dito explicitamente que não pertence à família de NENHUMA
 * descrição exibida: descartar lista antiga e refazer a consulta por modelo.
 * Respostas sobre motor, combustível, acabamento e portas NÃO são um modelo.
 */
export function novoModeloForaDaLista(
 mensagem:string,opcoes:string[]
):string|null{
 if(!opcoes.length||clienteRejeitouVersoesFipe(mensagem))return null;
 const t=norm(mensagem);
 if(!t||t.length>85||/\b(?:desisto|cancelar|cotacao|quero mais|atendente)\b/.test(t))return null;
 // "É BMW XM", "Na verdade é JAC J2" e "meu carro é Fazer 250"
 // corrigem o modelo, não refinam a lista de opções antiga.
 const semIntro=t
  .replace(/^(?:na verdade\s+)?(?:(?:o|a)\s+)?(?:correto|correta)\s+(?:e|eh)\s+/,"")
  .replace(/^(?:na verdade\s+)?(?:e|eh|era|meu carro e|meu veiculo e|meu modelo e)\s+/,"")
  .replace(/^(?:meu|esse|o)\s+(?:carro|veiculo|modelo)\s+(?:(?:e|eh|um|uma|seria)\s+)*/,"")
  .trim();
 if(/^(?:outro|outra|nao|nenhum|nenhuma|modelo|versao|opcao|sim|certo)\b/.test(semIntro))return null;
 const palavras=semIntro.split(" ").filter(Boolean);
 const codigoIsolado=palavras.length===1&&/^[a-z][a-z0-9-]{2,}$/.test(semIntro);
 const marcaEModelo=palavras.length>=2&&palavras.length<=4&&
   /^[a-z]{2,25}$/.test(palavras[0])&&
   palavras.slice(1).some(p=>/^(?:[a-z]\d{1,4}|[a-z]{2,}[0-9]{0,4}|\d{2,4})$/.test(p));
 if(!codigoIsolado&&!marcaEModelo)return null;
 const caracteristicas=new Set(("opcao versao alternativa nenhuma nenhumas nenhum nada " +
   "flex diesel gasolina alcool eletrico hibrido automatico manual carro veiculo modelo " +
   "particular aplicativo comercial taxi sedan hatch motor combustivel uso ano " +
   "primeiro segunda segundaopcao obrigado obrigadaa errado correto " +
   "lt ltz gl gls gsi gs xlt xls xl ex lx exl lxs limited premium completo").split(" "));
 if(palavras.some(p=>caracteristicas.has(p)) ||
   /^(?:19|20)\d{2}$/.test(semIntro))return null;
 // Não interromper quando o contato está apenas escolhendo uma versão
 // da mesma família: "BMW Z4" para opções "Z4 Roadster" é refinamento.
 const tokensOpcoes=new Set(opcoes.flatMap(nome=>norm(nome).split(" ")));
 if(palavras.some(p=>p.length>=2&&tokensOpcoes.has(p)))return null;
 return semIntro.slice(0,65);
}
