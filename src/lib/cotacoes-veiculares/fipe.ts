import "server-only";
import { modelosCompativeisFipe } from "./modelos-compatibilidade";
import { ordenarAlternativasFipe, perguntaUnicaVersoesFipe, type VersaoFipe } from "./orientacao-versoes";
export { modelosCompativeisFipe } from "./modelos-compatibilidade";

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

export class ErroIdentificacaoVersaoFipe extends Error {
  constructor(
    public readonly codigo:"FIPE_VERSAO_INCOMPATIVEL"|"FIPE_VERSAO_AMBIGUA",
    public readonly opcoes:VersaoFipe[],
    public readonly perguntaCliente:string,
    detalhe:string,
  ){super(detalhe);this.name="ErroIdentificacaoVersaoFipe";}
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

/** Busca alternativas FIPE reais do MESMO ano que preservem o acabamento
 * ou a motorização informada, sem escolher uma delas automaticamente.
 */
async function alternativasProximasFipe(params:{
  tipo:TipoFipe;marca:string;listaModelos:OpcaoFipe[];
  consulta:string;anoModelo:string;excluir?:OpcaoFipe[];
}):Promise<{opcoes:OpcaoFipe[];erros:number}>{
  const motor=params.consulta.match(/\b[1-9][.,][0-9]\b/)?.[0]||"";
  const familia=params.consulta.trim().split(/\s+/)[0]||"";
  const semMotor=params.consulta.replace(/\b[1-9][.,][0-9]\b/g," ")
    .replace(/\s+/g," ").trim();
  const consultas=[semMotor];
  if(motor&&familia)consultas.push(familia+" "+motor);
  const excluidos=new Set((params.excluir||[]).map(v=>v.code));
  const unicos=new Map<string,OpcaoFipe>();
  for(const consulta of consultas)
    for(const item of modelosCompativeisFipe(params.listaModelos,consulta))
      if(!excluidos.has(item.code))unicos.set(item.code,item);
  const candidatos=[...unicos.values()];
  if(!candidatos.length||candidatos.length>45)return {opcoes:[],erros:0};
  const resultado=await consultarCandidatosPorAno({
    tipo:params.tipo,marca:params.marca,candidatos,ano:params.anoModelo,
  });
  return {
    opcoes:ordenarAlternativasFipe(params.consulta,resultado.validos.map(v=>v.modelo),4),
    erros:resultado.erros,
  };
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
    const sugestoes=await alternativasProximasFipe({
      tipo:params.tipo,marca:marca.code,listaModelos,
      consulta:params.modelo,anoModelo,
    });
    if(sugestoes.opcoes.length)throw new ErroIdentificacaoVersaoFipe(
      "FIPE_VERSAO_INCOMPATIVEL",sugestoes.opcoes,
      perguntaUnicaVersoesFipe(sugestoes.opcoes,anoModelo,"incompatibilidade"),
      "Combinação informada não corresponde às versões FIPE do ano-modelo "+anoModelo+"."
    );
    if(sugestoes.erros)throw new Error("Consulta FIPE indisponível ao conferir alternativas.");
    throw new Error("Não encontrei esta descrição exata nos modelos FIPE. Confirme a versão correta.");
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
    const sugestoes=await alternativasProximasFipe({
      tipo:params.tipo,marca:marca.code,listaModelos,
      consulta:params.modelo,anoModelo,excluir:candidatos,
    });
    if(sugestoes.opcoes.length)throw new ErroIdentificacaoVersaoFipe(
      "FIPE_VERSAO_INCOMPATIVEL",sugestoes.opcoes,
      perguntaUnicaVersoesFipe(sugestoes.opcoes,anoModelo,"incompatibilidade"),
      "Combinação não encontrada para o ano-modelo "+anoModelo+"."
    );
    if(sugestoes.erros)throw new Error("Consulta FIPE indisponível ao conferir as versões.");
    throw new Error("Nenhuma versão localizada para o ano-modelo "+anoModelo+
      " com a descrição informada. Confirme somente a versão.");
  }
  if(compativeis.length>1){
    const alternativas=compativeis.map(item=>item.modelo);
    throw new ErroIdentificacaoVersaoFipe(
      "FIPE_VERSAO_AMBIGUA",alternativas,
      perguntaUnicaVersoesFipe(alternativas,anoModelo,"ambiguidade"),
      "Existem "+alternativas.length+" versões desse veículo para "+anoModelo+"."
    );
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
