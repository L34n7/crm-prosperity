/**
 * Orientação genérica para ambiguidade da FIPE, sem exceções por veículo.
 * Usa SOMENTE descrições retornadas pela FIPE para o ano-modelo consultado.
 */
export type VersaoFipe = {name:string;code:string};

function normalizar(valor:string){
  return String(valor||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function motorDoNome(nome:string):string|null{
  return nome.match(/\b[1-9][.,][0-9]\b/)?.[0].replace(",",".")||null;
}
function cambioDoNome(nome:string):"automático"|"manual"|null{
  const texto=normalizar(nome);
  if(/\b(?:aut|automatico|automatica|cvt|tiptronic|dsg)\b/.test(texto))return "automático";
  if(/\b(?:mec|manual|mecanico|mecanica)\b/.test(texto))return "manual";
  return null;
}
function nomeVersao(nome:string){
  const bruto=String(nome||"").split(/\b[1-9][.,][0-9]\b/)[0]
    .replace(/\s+/g," ").replace(/\/\s+/g,"/").trim();
  return bruto||String(nome||"").slice(0,85);
}
function familiaNome(nome:string){
  return normalizar(nome).split(" ")[0]||"";
}
function resumoVersao(nome:string){
  const prefixo=nomeVersao(nome);
  const motor=motorDoNome(nome);
  const cambio=cambioDoNome(nome);
  return [prefixo,motor,cambio].filter(Boolean).join(" ").slice(0,115);
}
export function opcoesFipeDistintas(versoes:VersaoFipe[],limite=4):string[]{
  const unicas=new Map<string,string>();
  for(const versao of versoes){
    const resumo=resumoVersao(versao.name);
    const chave=normalizar(resumo);
    if(chave&&!unicas.has(chave))unicas.set(chave,resumo);
  }
  return [...unicas.values()].slice(0,limite);
}
export function perguntaUnicaVersoesFipe(
  versoes:VersaoFipe[],
  anoModelo:string,
  motivo:"ambiguidade"|"incompatibilidade",
):string{
  const unicas=[...new Map(versoes.map(v=>[v.code,v])).values()];
  const opcoes=opcoesFipeDistintas(unicas);
  if(!opcoes.length){
    return "Não consegui identificar com segurança a versão desse veículo. " +
      "Pode confirmar o modelo e a motorização?";
  }
  const prefixos=[...new Set(unicas.map(v=>normalizar(nomeVersao(v.name))))];
  const motores=[...new Set(unicas.map(v=>motorDoNome(v.name)||""))];
  const cambios=[...new Set(unicas.map(v=>cambioDoNome(v.name)||""))];
  const inicio=motivo==="incompatibilidade"
    ?"Os dados informados não coincidem com as versões disponíveis"
    :"Encontrei mais de uma versão";
  const contexto=" para o ano-modelo "+anoModelo+". ";
  if(motivo==="ambiguidade"&&prefixos.length===1&&motores.length===1&&
    cambios.length===2&&cambios.every(Boolean)){
    return "Para o "+opcoes[0].replace(/\s+(?:automático|manual)$/,"")+
      ", o câmbio é automático ou manual?";
  }
  // Mais de quatro versões: perguntar um único atributo que possa
  // reduzir o conjunto, sem enumerar uma lista enorme ao cliente.
  if(unicas.length>4){
    const nomes=[...new Set(unicas.map(v=>nomeVersao(v.name)))].slice(0,5);
    if(nomes.length>1&&nomes.length<=5){
      return inicio+contexto+"Qual é a versão: "+nomes.join(", ")+"?";
    }
    return inicio+contexto+"Pode informar o acabamento ou a motorização?";
  }
  if(motivo==="ambiguidade"&&prefixos.length===1&&motores.length>1){
    return inicio+contexto+"Qual é a motorização: "+
      motores.filter(Boolean).join(" ou ")+"?";
  }
  return inicio+contexto+"Encontrei "+opcoes.join(" ou ")+
    ". Qual dessas versões corresponde ao veículo?";
}
/** Ordena opções reais que correspondem ao acabamento OU à motorização,
 * priorizando versões que preservam mais dados do cliente.
 */
export function ordenarAlternativasFipe(
  consulta:string,
  candidatos:VersaoFipe[],
  limite=4,
):VersaoFipe[]{
  const texto=normalizar(consulta);
  const motor=motorDoNome(consulta);
  const cambio=cambioDoNome(consulta);
  const palavras=texto.split(" ").filter(t=>t.length>=2&&![
    "sedan","sed","hatch","coupe","flex","gasolina","manual",
    "automatico","automatica","mecanico","mecanica","aut","mec",
    "tiptronic","dsg","cvt",
  ].includes(t));
  const familia=familiaNome(consulta);
  return candidatos.map(item=>{
    const nome=normalizar(item.name);
    const tokens=new Set(nome.split(" "));
    const termosIguais=palavras.filter(t=>tokens.has(t)).length;
    const mesmoMotor=Boolean(motor&&motorDoNome(item.name)===motor);
    const mesmoCambio=Boolean(cambio&&cambioDoNome(item.name)===cambio);
    return {item,nota:termosIguais*2+(mesmoMotor?5:0)+(mesmoCambio?3:0)+
      (familiaNome(item.name)===familia?2:0)};
  }).sort((a,b)=>b.nota-a.nota).map(v=>v.item).slice(0,limite);
}
