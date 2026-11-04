import "server-only";

export type TipoFipe = "cars" | "motorcycles" | "trucks";
export type OpcaoFipe = { code: string; name: string };
export type DetalheFipe = {
  brand: string; model: string; modelYear: number; fuel: string;
  price: string; codeFipe: string; referenceMonth: string;
};

function normalizar(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function solicitarFipe<T>(tipo: TipoFipe, caminho: string): Promise<T> {
  const url = "https://fipe.parallelum.com.br/api/v2/" + tipo + caminho;
  const resposta = await fetch(url, {
    headers: process.env.FIPE_API_TOKEN ? { "X-Subscription-Token": process.env.FIPE_API_TOKEN } : {},
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(12000),
  });
  if (!resposta.ok) throw new Error("Consulta FIPE indisponível no momento (" + resposta.status + ").");
  return await resposta.json() as T;
}

export async function listarMarcasFipe(tipo: TipoFipe) {
  return solicitarFipe<OpcaoFipe[]>(tipo, "/brands");
}
export async function listarModelosFipe(tipo: TipoFipe, marca: string) {
  return solicitarFipe<OpcaoFipe[]>(tipo, "/brands/" + encodeURIComponent(marca) + "/models");
}
export async function listarAnosFipe(tipo: TipoFipe, marca: string, modelo: string) {
  return solicitarFipe<OpcaoFipe[]>(tipo, "/brands/" + encodeURIComponent(marca) + "/models/" + encodeURIComponent(modelo) + "/years");
}
export async function detalharVeiculoFipe(tipo: TipoFipe, marca: string, modelo: string, ano: string) {
  return solicitarFipe<DetalheFipe>(
    tipo, "/brands/" + encodeURIComponent(marca) + "/models/" + encodeURIComponent(modelo) + "/years/" + encodeURIComponent(ano)
  );
}
export function precoFipeCentavos(preco: string) {
  const numero = Number(String(preco).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) throw new Error("Valor FIPE inválido na consulta.");
  return Math.round(numero * 100);
}
function unico(itens: OpcaoFipe[], busca: string) {
  const chave = normalizar(busca);
  const exatos = itens.filter((item) => normalizar(item.name) === chave || item.code === busca);
  if (exatos.length === 1) return exatos[0];
  const parciais = itens.filter((item) => normalizar(item.name).includes(chave));
  if (parciais.length === 1) return parciais[0];
  const sugestoes = (exatos.length ? exatos : parciais).slice(0, 6).map((item) => item.name);
  throw new Error(
    sugestoes.length
      ? "Informe uma versão mais específica: " + sugestoes.join("; ")
      : "Não encontrei " + busca + " na consulta FIPE. Confirme marca, modelo e ano."
  );
}
/** Correspondência estrita: todas as palavras da versão informada precisam existir
 * no modelo da FIPE, mesmo que o fornecedor reorganize ou abrevie o nome.
 * Não escolhe versões diferentes com o mesmo nome simplificado.
 */
export function modelosCompativeisFipe(itens:OpcaoFipe[],consulta:string):OpcaoFipe[]{
  const nome=normalizar(consulta)
    .replace(/\bsed\b/g,"sedan")
    .replace(/\bdisel\b/g,"diesel");
  if(!nome)return [];
  const exatos=itens.filter(item=>normalizar(item.name).replace(/\bsed\b/g,"sedan")===nome
    ||item.code===consulta.trim());
  if(exatos.length)return exatos;
  const tokens=nome.split(" ").filter(t=>t&&![
    "manual","mecanico","automatico","gasolina","alcool","flex"
  ].includes(t));
  return itens.filter(item=>{
    const partes=new Set(normalizar(item.name).replace(/\bsed\b/g,"sedan").split(" "));
    return tokens.every(token=>partes.has(token)||
      (token==="diesel"&&["diesel","dies","die"].some(x=>partes.has(x))));
  });
}

/** "2004/2005" corresponde ao ano-modelo 2005; 2004 é fabricação. */
export function anoModeloSolicitado(ano:string):string{
  const anos=String(ano).match(/\b(?:19|20)\d{2}\b/g);
  return anos?.at(-1)||"";
}

function correspondeAnoFipe(anos:OpcaoFipe[],consulta:string){
  const ano=anoModeloSolicitado(consulta);
  const exatos=anos.filter(i=>i.code===consulta||normalizar(i.name)===normalizar(consulta));
  if(exatos.length)return exatos;
  return ano?anos.filter(i=>i.code.startsWith(ano+"-")||i.name.startsWith(ano+" ")): [];
}

type ModeloComAno={modelo:OpcaoFipe;anos:OpcaoFipe[]};
async function consultarCandidatosPorAno(params:{
  tipo:TipoFipe;marca:string;candidatos:OpcaoFipe[];ano:string;
}):Promise<{validos:ModeloComAno[];erros:number}>{
  const validos:ModeloComAno[]=[];
  let erros=0;
  // Evita rajadas sem limite de consultas na API da FIPE.
  for(let inicio=0;inicio<params.candidatos.length;inicio+=10){
    const lote=params.candidatos.slice(inicio,inicio+10);
    const respostas=await Promise.allSettled(lote.map(async modelo=>({
      modelo,
      anos:correspondeAnoFipe(
        await listarAnosFipe(params.tipo,params.marca,modelo.code),params.ano),
    })));
    for(const item of respostas){
      if(item.status==="rejected"){erros++;continue;}
      if(item.value.anos.length)validos.push(item.value);
    }
  }
  return {validos,erros};
}

function alternativasAno(versoes:ModeloComAno[],limite=8){
  return versoes.slice(0,limite).map(v=>v.modelo.name).join("; ");
}

export async function encontrarVeiculoFipe(params: {
  tipo: TipoFipe; marca: string; modelo: string; ano: string;
}) {
  const marca=unico(await listarMarcasFipe(params.tipo),params.marca);
  const listaModelos=await listarModelosFipe(params.tipo,marca.code);
  const anoModelo=anoModeloSolicitado(params.ano);
  if(!anoModelo)throw new Error("Informe somente o ano-modelo, por exemplo 2005.");

  const candidatos=modelosCompativeisFipe(listaModelos,params.modelo);
  if(!candidatos.length){
    const semMotor=params.modelo.replace(/\b[1-9][.,][0-9]\b/g," ")
      .replace(/\s+/g," ").trim();
    if(semMotor!==params.modelo.trim()){
      const alternativas=modelosCompativeisFipe(listaModelos,semMotor);
      if(alternativas.length&&alternativas.length<=40){
        const sugestoes=await consultarCandidatosPorAno({
          tipo:params.tipo,marca:marca.code,candidatos:alternativas,ano:anoModelo,
        });
        if(sugestoes.validos.length)throw new Error(
          "A motorização/versão informada não existe para o ano-modelo "+anoModelo+
          ". A FIPE apresenta: "+alternativasAno(sugestoes.validos)+
          ". Confirme somente a versão/motor. Não envie documentos.");
        if(sugestoes.erros)throw new Error(
          "Consulta FIPE indisponível ao conferir modelos alternativos. Tente novamente.");
      }
    }
    throw new Error("Não encontrei esta descrição exata nos modelos FIPE. "+
      "Confirme somente a versão, a motorização ou a sigla da cabine; não solicite documentos.");
  }
  // Consultar os anos antes de sugerir opções. Evita oferecer versões que
  // não existem no ano selecionado (ocorria com a Ranger).
  if(candidatos.length>50)
    throw new Error("Há muitas versões desse modelo. Confirme a versão ou a motorização "+
      "para identificar uma opção FIPE sem solicitar documento.");
  const consulta=await consultarCandidatosPorAno({
    tipo:params.tipo,marca:marca.code,candidatos,ano:anoModelo,
  });
  let compativeis=consulta.validos;
  if(!compativeis.length){
    if(consulta.erros)throw new Error(
      "A consulta de anos FIPE ficou temporariamente indisponível. Tente novamente sem solicitar documentos.");
    // Quando o motor indicado não consta para aquele ano, oferecer apenas
    // alternativas FIPE reais no mesmo ano, sem trocar o motor silenciosamente.
    const semMotor=params.modelo.replace(/\b[1-9][.,][0-9]\b/g," ")
      .replace(/\s+/g," ").trim();
    if(semMotor!==params.modelo.trim()){
      const outras=modelosCompativeisFipe(listaModelos,semMotor)
        .filter(v=>!candidatos.some(c=>c.code===v.code));
      if(outras.length&&outras.length<=40){
        const alternativas=await consultarCandidatosPorAno({
          tipo:params.tipo,marca:marca.code,candidatos:outras,ano:anoModelo,
        });
        if(alternativas.validos.length)
          throw new Error("A versão/motorização informada não consta para o ano-modelo "+
            anoModelo+". A FIPE apresenta para esse ano: "+
            alternativasAno(alternativas.validos)+
            ". Confirme apenas a motorização/versão correta; não solicite documento.");
        if(alternativas.erros)throw new Error("Consulta FIPE indisponível ao conferir as versões. Tente novamente.");
      }
    }
    throw new Error("Nenhuma versão localizada para o ano-modelo "+anoModelo+
      " com a descrição informada. Confirme somente a versão ou a motorização; não peça documentos.");
  }
  if(compativeis.length>1){
    throw new Error("Informe uma versão mais específica para o ano-modelo "+anoModelo+": "+
      alternativasAno(compativeis)+
      ". Pergunte somente o detalhe que diferencia essas versões.");
  }
  const {modelo,anos}=compativeis[0];
  if(anos.length!==1){
    throw new Error("A FIPE tem mais de uma opção para o ano-modelo "+anoModelo+": "+
      anos.slice(0,8).map(v=>v.name).join("; ")+
      ". Confirme apenas o combustível, se necessário para distinguir essas opções.");
  }
  const detalhe=await detalharVeiculoFipe(params.tipo,marca.code,modelo.code,anos[0].code);
  return { ...detalhe, anoCodigo:anos[0].code, valorCentavos: precoFipeCentavos(detalhe.price) };
}

export function tipoFipeDaCategoria(categoria: string): TipoFipe {
  if (categoria === "motocicleta") return "motorcycles";
  if (categoria === "caminhao_leve" || categoria === "caminhao_pesado") return "trucks";
  return "cars";
}
