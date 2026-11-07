import {interpretarRespostaOpcoesFipe} from "../cotacoes-veiculares/orientacao-versoes.ts";

export type AcaoAjusteCotacao=
  "atendente"|"outro_veiculo"|"modelo"|"ano"|"versao"|
  "voltar_opcoes"|"cambio"|"motor"|"tracao";
export type AjusteCotacao={acao:AcaoAjusteCotacao;ano:string|null;pista:string|null};

function norm(valor:string):string{
  return String(valor||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/×/g,"x").replace(/\s+/g," ").trim();
}
const marcadoresCorrecao=/\b(?:nao e|nao era|nao foi|nao corresponde|errei|errado|errada|corrigir|corrija|correto|correta|na verdade|confundi|respondi errado|me enganei|outro|outra|troquei|o certo|a certa|me equivoquei)\b/;
function isCorrecao(t:string){return marcadoresCorrecao.test(t);}

/** O último valor afirmado prevalece, excluindo o que foi explicitamente negado. */
export function textoPositivoDaCorrecao(resposta:string):string{
  // Desconsidera o valor NEGADO, inclusive quando há um nome de campo entre
  // "não é" e o valor: "não é a versão MPI, é GLS".
  // Não basta usar o último número/palavra: "é 1.8, não 2.0" confirmaria 2.0.
  const t=norm(resposta).replace(
    /\b(?:nao\s+(?:(?:e|eh|era|foi|seria)\s+)?|nem\s+|em vez de\s+|ao inves de\s+)(?:(?:o|a|esse|essa|este|esta|modelo|versao|opcao|motor|motorizacao|cambio|tracao|ano)\s+){0,3}(?:\d{4}|\d{1,2}\s*x\s*\d|\d[.,]\d|[a-z][\w.-]*)\b/g,
    " "
  );
  const segmentos=t.split(/[,;]|\b(?:mas|na verdade|so que)\b/g).map(x=>x.trim())
    .filter(Boolean);
  const positivos=segmentos.filter(s=>!/^nao\b/.test(s));
  const ultimo=positivos.at(-1)||"";
  return ultimo.replace(/^(?:a|o|e|eh|era|foi|correto|correta|certo|certa|versao|opcao|modelo|cambio|motor|ano)\s+/g,"").trim();
}
export function anoCorrigidoCotacao(texto:string):string|null{
  const positivo=textoPositivoDaCorrecao(texto);
  const anos=[...positivo.matchAll(/\b((?:19|20)\d{2})\b/g)].map(m=>m[1]);
  return anos.at(-1)||null;
}
export function identificarAjusteCotacao(mensagem:string,temOpcoes=false):AjusteCotacao|null{
  const t=norm(mensagem);
  if(!t)return null;
  const fazer=(acao:AcaoAjusteCotacao,pista:string|null=null):AjusteCotacao=>({
    acao,ano:acao==="ano"?anoCorrigidoCotacao(mensagem):null,pista,
  });
  if(/\b(?:falar|conversar|passar|passa|transferir|transfira|transfere|encaminhar|encaminhe|chamar|atendimento)\b.{0,35}\b(?:atendente|humano|pessoa|equipe|consultor)\b/.test(t)||
     /\b(?:quero|preciso|prefiro)\s+(?:um|uma)?\s*(?:atendente|humano)\b/.test(t)||
     /^(?:atendente|atendimento humano|falar com atendente)$/.test(t))
    return fazer("atendente");
  if(/\b(?:outro|outra|trocar|mudar)\s+(?:veiculo|carro|caminhao|moto|automovel)\b/.test(t)||
     /\b(?:veiculo|carro|caminhao|moto)\s+(?:e|eh|era|esta|ta)?\s*(?:outro|outra|errado|errada)\b/.test(t)||
     /\b(?:nao e|nao era|nao foi)\s+(?:esse|essa|este|esta)?\s*(?:veiculo|carro|caminhao|moto)\b/.test(t))
    return fazer("outro_veiculo");
  if(/\b(?:outro modelo|modelo\s+(?:esta\s+|ta\s+|foi\s+)?(?:errado|incorreto)|modelo\s+(?:e|eh|era)\s+outro|nao\s+(?:e|era|foi)\s+(?:esse|este|o)?\s*modelo|o\s+modelo\s+(?:correto|certo)\s+(?:e|eh)|troquei\s+o\s+modelo)\b/.test(t))
    return fazer("modelo");
  if((/\b(?:ano|ano.modelo)\b/.test(t)&&isCorrecao(t))||
     /\b(?:nao\s+(?:e|era|foi)\s+)(?:19|20)\d{2}\b/.test(t)||
     /\b(?:era|e|eh)\s+(?:19|20)\d{2}\s*(?:nao|ao inves)/.test(t))
    return fazer("ano");
  if(/\b(?:cambio|marcha|transmissao)\b/.test(t)&&isCorrecao(t)||
     /\bnao\s+(?:e|era)\s+(?:automatic[oa]|manual|mecanic[oa])\b/.test(t))
    return fazer("cambio",textoPositivoDaCorrecao(mensagem));
  if(/\b(?:motor|motorizacao)\b/.test(t)&&isCorrecao(t)||
     /\bnao\s+(?:e|era)\s+\d[.,]\d\b/.test(t))
    return fazer("motor",textoPositivoDaCorrecao(mensagem));
  if((/\b(?:tracao|eixos?)\b/.test(t)&&isCorrecao(t))||
     (isCorrecao(t)&&/\b(?:4|6|8|10|12)\s*x\s*(?:2|4|6|8)\b/.test(t)))
    return fazer("tracao",textoPositivoDaCorrecao(mensagem));
  if(/\b(?:respondi errado|respondi errada|errei a resposta|errei a opcao|escolhi errado|marquei errado|voltar as opcoes|(?:mostrar|ver|rever) (?:as )?opcoes|voltar a lista|me enganei na resposta)\b/.test(t))
    return fazer("voltar_opcoes",textoPositivoDaCorrecao(mensagem));
  if(/\b(?:versao|opcao|acabamento)\b/.test(t)&&isCorrecao(t)||
     // "Não é MPI, é GLS" deve recuperar a lista original mesmo sem
     // o cliente escrever "versão" ou "opção".
     (temOpcoes&&/\b(?:na verdade|confundi|errei|mas|o correto e|a correta e|o certo e|a certa e|nao|nao e|nao era|nao foi|nem|e sim)\b/.test(t)))
    return fazer("versao",textoPositivoDaCorrecao(mensagem));
  return null;
}

/** Retorna sempre opções ORIGINAIS. Se o cliente muda a escolha,
 * o filtro antigo não pode excluir a nova versão.
 */
export function recuperarOpcoesFipe(
  todas:string[],resposta:string,
):{selecionada:string|null;opcoes:string[];filtrou:boolean}{
  const originais=[...new Set(todas.map(s=>String(s||"").trim()).filter(Boolean))];
  const pista=textoPositivoDaCorrecao(resposta);
  if(!pista)return {selecionada:null,opcoes:originais,filtrou:false};
  const escolha=interpretarRespostaOpcoesFipe(pista,originais);
  return {selecionada:escolha.versaoSelecionada,
    opcoes:escolha.filtrou?escolha.opcoesRestantes:originais,
    filtrou:escolha.filtrou};
}
