/**
 * Uma correção ortográfica sugerida pelo agente pode ser aceita pelo
 * contexto da próxima resposta (ano/uso), sem obrigar o contato a
 * digitar novamente a grafia correta do modelo.
 * Não há exceções para marcas/modelos: valida a proximidade do termo
 * digitado com a sugestão REAL da mensagem imediatamente anterior.
 */
export type MensagemSugestaoModelo={role:"user"|"assistant";content:string};

function normalizar(valor:string){
  return String(valor||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g," ").trim();
}
function distanciaEdicaoLimitada(a:string,b:string,maximo:number):number{
  if(Math.abs(a.length-b.length)>maximo)return maximo+1;
  let anterior=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const linha=[i];
    for(let j=1;j<=b.length;j++){
      linha[j]=Math.min(
        linha[j-1]+1,anterior[j]+1,
        anterior[j-1]+(a[i-1]===b[j-1]?0:1),
      );
    }
    anterior=linha;
  }
  return anterior[b.length];
}

/** Exemplo genérico: "Pelio" -> "Você quis dizer Fiat Palio?"
 * -> "2010 flex pra particular" aceita o modelo sugerido.
 * Não aceita quando o cliente rejeita a sugestão nem se o termo
 * sugerido não for uma correção pequena do termo que ele enviou.
 */
export function modeloSugeridoConfirmadoCotacao(
  historico:MensagemSugestaoModelo[],
  respostaAtual:string,
):string|null{
  const resposta=normalizar(respostaAtual);
  if(!resposta||
    /\b(?:nao|errado|incorreto|outro|outra)\b/.test(resposta))return null;
  // Dado de ano/uso ou confirmação inequívoca representa continuação do pedido.
  if(!/\b(?:19|20)\d{2}\b/.test(resposta)&&
     !/\b(?:particular|aplicativo|comercial|taxi|sim|isso|correto|pode)\b/.test(resposta))
    return null;
  // Se a resposta mencionar outro modelo, não substituir sua escolha pela
  // sugestão anterior. Termos técnicos/uso não são novos modelos.
  const termosNeutros=new Set((
    "o a de do da e eh meu minha carro veiculo modelo ano uso para pra " +
    "particular aplicativo comercial taxi sim isso correto pode flex f flex " +
    "gasolina alcool etanol hibrido eletrico diesel motor cambio manual " +
    "automatico automatica portas porta 2p 4p 3p 5p"
  ).split(" "));
  for(let i=historico.length-1;i>=1;i--){
    const item=historico[i];
    if(item.role!=="assistant")continue;
    const trecho=item.content.match(/voc[eê]\s+quis\s+dizer\s+([^?\n]{2,90})\?/i);
    if(!trecho)continue;
    const palavras=trecho[1].trim().split(/\s+/);
    const modelo=palavras.at(-1)?.replace(/[^a-zA-ZÀ-ÿ0-9-]/g,"")||"";
    const chave=normalizar(modelo).replace(/ /g,"");
    if(chave.length<4)return null;
    if(resposta.split(" ").some(termo=>
      termo.length>=3 && !termosNeutros.has(termo) &&
      !/^\d+(?:[.,]\d+)?$/.test(termo) &&
      distanciaEdicaoLimitada(termo,chave,chave.length<=6?1:2)>
        (chave.length<=6?1:2)
    ))return null;
    const origem=historico.slice(0,i).reverse().find(v=>v.role==="user");
    if(!origem)return null;
    const originais=normalizar(origem.content).split(" ").filter(Boolean);
    const proxima=historico.slice(i+1).filter(v=>v.role==="user");
    if(proxima.some(v=>/\b(?:nao|errado|incorreto)\b/.test(normalizar(v.content))))return null;
    const parecido=originais.some(termo=>
      termo.length>=3&&
      distanciaEdicaoLimitada(termo,chave,chave.length<=6?1:2)<=(chave.length<=6?1:2)
    );
    return parecido?modelo:null;
  }
  return null;
}
