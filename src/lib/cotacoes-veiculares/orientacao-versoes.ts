/**
 * Orientação genérica para ambiguidade da FIPE, sem exceções por veículo.
 * Usa SOMENTE descrições retornadas pela FIPE para o ano-modelo consultado.
 */
export type VersaoFipe = {name:string;code:string};

export function descricaoLegivelFipe(nome:string):string{
  return String(nome||"")
    .replace(/\bsed\.\s*/gi,"Sedan ")
    .replace(/\b(?:advant|advan)\.?(?=\s|$)/gi,"Advantage")
    .replace(/\baut\.(?=\s|$)/gi,"automático")
    .replace(/\bmec\.(?=\s|$)/gi,"manual")
    .replace(/\bawd\b/gi,"AWD")
    .replace(/\s+/g," ").trim();
}
function normalizar(valor:string){
  return descricaoLegivelFipe(valor).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function motorDoNome(nome:string):string|null{
  return nome.match(/\b[1-9][.,][0-9]\b/)?.[0].replace(",",".")||null;
}
function cambioDoNome(nome:string):"automático"|"manual"|null{
  const texto=normalizar(nome);
  if(/\b(?:aut|auto|automatico|automatica|cvt|tiptronic|dsg)\b/.test(texto))return "automático";
  if(/\b(?:mec|manual|mecanico|mecanica)\b/.test(texto))return "manual";
  return null;
}
function nomeVersao(nome:string){
  const bruto=descricaoLegivelFipe(nome).split(/\b[1-9][.,][0-9]\b/)[0]
    .replace(/\s+/g," ").replace(/\/\s+/g,"/").trim();
  return bruto||String(nome||"").slice(0,85);
}
function familiaNome(nome:string){
  return normalizar(nome).split(" ")[0]||"";
}
function resumoVersao(nome:string){
  return descricaoLegivelFipe(nome).slice(0,145);
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

/** Uma descrição FIPE pode conter nomes equivalentes separados por barras.
 * Expomos esses nomes como escolhas, mas todos mantêm o MESMO código de origem.
 * Não dividir descrições com motorização/câmbio distintos em opções fictícias.
 */
function rotulosEscolhaFipe(nome:string):string[]{
  const legivel=descricaoLegivelFipe(nome);
  const alias=legivel.match(/^(.+?)\s+([1-9][.,][0-9]\s+[A-Za-z0-9.]+)\s*\/\s*([A-Za-z0-9.]+)\s*\/\s*([A-Za-z0-9.]+)\s+([2-5])p$/i);
  if(!alias)return [legivel];
  return [alias[2],alias[3],alias[4]].map(versao=>versao+" "+alias[5]+"p");
}
export type EscolhaNumeradaFipe={numero:number;rotulo:string;nomeFipe:string};
const MAX_ESCOLHAS_FIPE=18;

/** Numeração reproduzível a partir das opções salvas na conversa.
 * Somente opções exibidas aceitam seleção pelo número. */
export function escolhasNumeradasFipe(
  nomes:string[],limite=MAX_ESCOLHAS_FIPE,
):EscolhaNumeradaFipe[]{
  const escolhas:EscolhaNumeradaFipe[]=[];
  for(const nomeFipe of [...new Set(nomes.map(v=>String(v||"").trim()).filter(Boolean))]){
    for(const rotulo of rotulosEscolhaFipe(nomeFipe)){
      if(escolhas.length>=limite)return escolhas;
      escolhas.push({numero:escolhas.length+1,rotulo,nomeFipe});
    }
  }
  return escolhas;
}

export type ResultadoEscolhaFipe={
  versaoSelecionada:string|null;
  opcoesRestantes:string[];
  filtrou:boolean;
};

/** Filtra progressivamente opções REAIS da FIPE conforme o cliente responde.
 * "2" seleciona a opção numerada. "2 portas" é um atributo, nunca opção 2.
 * Respostas que não distinguem modelos não autorizam escolha automática. */
export function interpretarRespostaOpcoesFipe(
  resposta:string,opcoesFipe:string[],
):ResultadoEscolhaFipe{
  const opcoes=[...new Set(opcoesFipe.map(v=>String(v||"").trim()).filter(Boolean))];
  const base={versaoSelecionada:null,opcoesRestantes:opcoes,filtrou:false};
  if(!opcoes.length)return base;
  const texto=normalizar(resposta);
  const indice=texto.match(/^(?:(?:opcao|numero|alternativa|versao)\s+)?(\d{1,2})$/);
  if(indice){
    const escolha=escolhasNumeradasFipe(opcoes).find(item=>item.numero===Number(indice[1]));
    if(escolha)return {versaoSelecionada:escolha.nomeFipe,opcoesRestantes:[escolha.nomeFipe],filtrou:true};
    return base;
  }
  const portas=texto.match(/(?:^|\s)([2-5])\s*(?:portas?|p)(?:\s|$)/)?.[1];
  const motor=motorDoNome(resposta);
  const cambio=cambioDoNome(resposta);
  let filtradas=opcoes;
  const aplicar=(predicado:(nome:string)=>boolean)=>{
    const proximas=filtradas.filter(predicado);
    if(proximas.length)filtradas=proximas;
  };
  if(portas){
    const n=Number(portas);
    const portasValidas=n===2?[2,3]:n===4?[4,5]:[n];
    const existentes=filtradas.filter(nome=>{
      const codigo=nome.match(/\b([2-5])p\b/i)?.[1];
      return codigo&&portasValidas.includes(Number(codigo));
    });
    if(existentes.length)filtradas=existentes;
  }
  if(motor&&filtradas.some(nome=>motorDoNome(nome)===motor))
    aplicar(nome=>motorDoNome(nome)===motor);
  if(cambio&&filtradas.some(nome=>cambioDoNome(nome)===cambio))
    aplicar(nome=>cambioDoNome(nome)===cambio);
  const ignorar=new Set([
    "quero","essa","esse","dessa","desse","opcao","numero","alternativa",
    "versao","modelo","veiculo","carro","nome","a","o","as","os","da",
    "de","do","é","e","aqui","sera","sim","mesmo","qual","sao","por",
    "portas","porta","automático","automatico","manual","auto",
  ]);
  const tokens=texto.split(" ").filter(t=>t.length>=3&&!ignorar.has(t)&&
    !/^\d+$/.test(t)&&!/^\d+[.,]\d+$/.test(t));
  for(const token of tokens){
    const contem=(nome:string)=>rotulosEscolhaFipe(nome)
      .some(rotulo=>normalizar(rotulo).split(" ").includes(token))||
      normalizar(nome).split(" ").includes(token);
    if(filtradas.some(contem)&&filtradas.some(nome=>!contem(nome)))
      aplicar(contem);
  }
  const filtrou=filtradas.length<opcoes.length;
  return {versaoSelecionada:filtradas.length===1 && filtrou?filtradas[0]:null,
    opcoesRestantes:filtradas,filtrou};
}

export function perguntaUnicaVersoesFipe(
  versoes:VersaoFipe[],
  anoModelo:string,
  motivo:"ambiguidade"|"incompatibilidade",
):string{
  const escolhas=escolhasNumeradasFipe(versoes.map(v=>v.name));
  if(!escolhas.length)return "Não consegui identificar a versão desse veículo. Pode informar o modelo e a motorização?";
  const inicio=motivo==="incompatibilidade"
    ?"Os dados informados não coincidem com as versões disponíveis"
    :"Encontrei mais de uma versão";
  const complemento=escolhas.length>=MAX_ESCOLHAS_FIPE
    ?"\n\nSe não encontrar seu veículo na lista, informe um detalhe como acabamento, motor ou quantidade de portas."
    :"";
  return inicio+" para o ano-modelo "+anoModelo+". As opções verificadas são:\n\n"+
    escolhas.map(item=>item.numero+" - "+item.rotulo).join("\n")+
    "\n\nQual delas corresponde ao veículo? Você pode responder com o número ou o nome."+
    complemento;
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
    "automatico","automatica","auto","mecanico","mecanica","aut","mec",
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

/** Só retoma uma cotação em impasse quando a resposta acrescenta um
 * atributo que realmente diferencia as opções verificadas na FIPE.
 */
export function respostaTrazDistincaoFipe(resposta:string,opcoesFipe:string[]):boolean{
  if(opcoesFipe.length<2)return false;
  return interpretarRespostaOpcoesFipe(resposta,opcoesFipe).filtrou;
}
