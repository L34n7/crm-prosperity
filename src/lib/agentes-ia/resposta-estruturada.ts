/**
 * Saída estruturada segura para agentes. A falha de parsing não pode
 * publicar objetos internos (mensagens/memoria_delta) no WhatsApp.
 */
export function textoWhatsappComQuebras(valor:unknown,limite=3500):string{
  return String(valor??"")
    .replace(/\r\n?/g,"\n")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim().slice(0,limite);
}

function possuiMensagens(valor:unknown):valor is {mensagens:string[];memoria_delta?:unknown}{
  if(!valor||typeof valor!=="object"||Array.isArray(valor))return false;
  const mensagens=(valor as {mensagens?:unknown}).mensagens;
  return Array.isArray(mensagens)&&mensagens.some(item=>typeof item==="string"&&item.trim());
}

/** Recupera um objeto válido mesmo se o modelo concatenar duas saídas JSON.
 * Usa balanço de chaves respeitando strings e escapes, sem regex de JSON.
 */
export function recuperarRespostaEstruturada(
  resposta:string,
):{mensagens:string[];memoria_delta?:unknown}|null{
  const texto=String(resposta||"").trim();
  try{
    const objeto=JSON.parse(texto) as unknown;
    if(possuiMensagens(objeto))return objeto;
  }catch{}
  let emString=false;
  let escapado=false;
  let profundidade=0;
  let inicio=-1;
  for(let i=0;i<texto.length;i++){
    const letra=texto[i];
    if(inicio<0){
      if(letra!=="{")continue;
      inicio=i;
      profundidade=1;
      continue;
    }
    if(escapado){escapado=false;continue;}
    if(emString){
      if(letra==="\\")escapado=true;
      else if(letra==='"')emString=false;
      continue;
    }
    if(letra==='"'){emString=true;continue;}
    if(letra==="{")profundidade++;
    if(letra==="}"){
      profundidade--;
      if(profundidade===0){
        try{
          const objeto=JSON.parse(texto.slice(inicio,i+1)) as unknown;
          if(possuiMensagens(objeto))return objeto;
        }catch{}
        inicio=-1;
      }
    }
  }
  return null;
}

export function textoPareceEstruturaInterna(resposta:string):boolean{
  return /^\s*(?:[{\[]|[\`]{3}\s*json\b)/i.test(resposta)||
    /["'](?:mensagens|memoria_delta)["']\s*:/.test(resposta);
}


/** Última barreira antes do WhatsApp: nenhum caminho deve enviar o
 * JSON interno da IA, mesmo que a normalização anterior seja ignorada.
 * Recupera as mensagens de um objeto válido ou concatenado sem duplicá-las.
 */
export function protegerMensagensSaida(
  mensagens:unknown[],limite=3,
):string[]{
  const seguras:string[]=[];
  for(const item of mensagens){
    const texto=String(item??"").trim();
    if(!texto)continue;
    if(textoPareceEstruturaInterna(texto)){
      const recuperada=recuperarRespostaEstruturada(texto);
      if(recuperada){
        seguras.push(...recuperada.mensagens
          .map(m=>textoWhatsappComQuebras(m,3500)).filter(Boolean));
      }else{
        seguras.push("Não consegui organizar minha resposta. Pode repetir a última pergunta?");
      }
    }else seguras.push(texto);
    if(seguras.length>=limite)break;
  }
  return seguras.slice(0,limite);
}
