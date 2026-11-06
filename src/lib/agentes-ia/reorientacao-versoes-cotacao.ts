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
  return /\b(?:nenhum(?:a)? (?:dessas|desses|deles|delas|das opcoes)|nenhuma dessas|nenhuma delas|nao tem ai|nao esta ai|nao aparece|nao encontrei|nao corresponde|nao e nenhuma|nao quero (?:esse|essa|esses|essas)|essas opcoes estao erradas|nao e esse modelo|nao e essa versao)\b/.test(t);
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
 if(!t||/\b(?:nao|desisto|cancelar|cotacao|quero mais)\b/.test(t))return null;
 const marcador=t.match(/\b(?:meu|esse|o)?\s*(?:carro|caro|veiculo|modelo)\s+(?:(?:e|eh|um|uma|seria|correto|certo|do|da)\s+)*([a-z][a-z0-9-]{2,})\b/);
 const sozinho=/^[a-z][a-z0-9-]{2,}$/.test(t)?t:null;
 const candidato=marcador?.[1]||sozinho;
 if(!candidato)return null;
 const caracteristicas=new Set(("opcao versao alternativa nenhuma nenhumas nenhum nada " +
   "flex diesel gasolina alcool eletrico hibrido automatico manual carro veiculo modelo " +
   "particular aplicativo comercial taxi sedan hatch motor combustivel uso ano " +
   "primeiro segunda segundaopcao obrigado obrigadaa errado correto " +
   "lt ltz gl gls gsi gs xlt xls xl ex lx exl lxs limited premium completo").split(" "));
 if(caracteristicas.has(candidato)||/^(?:19|20)\d{2}$/.test(candidato))return null;
 if(opcoes.some(nome=>norm(nome).split(" ").includes(candidato)))return null;
 return candidato.slice(0,50);
}
