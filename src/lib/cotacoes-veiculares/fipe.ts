import "server-only";
import { modelosCompativeisFipe, modelosDaMesmaFamiliaFipe } from "./modelos-compatibilidade";
import {agruparModelosPorAnoFipe} from "./modelos-ano";
import {diagnosticarIdentificacaoFipe} from "./erros-identificacao";
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

/** Diagnóstico interno preserva status HTTP e endpoint da falha. */
export class ErroConsultaFipe extends Error {
  constructor(public readonly statusHttp:number|null,public readonly recurso:string,causa:string){
    super("Consulta FIPE indisponível: "+causa+" ("+recurso+").");
    this.name="ErroConsultaFipe";
  }
}
async function solicitarFipe<T>(tipo: TipoFipe, caminho: string): Promise<T> {
  const url = "https://fipe.parallelum.com.br/api/v2/" + tipo + caminho;
  let resposta:Response;
  try {
    resposta = await fetch(url, {
    headers: process.env.FIPE_API_TOKEN ? { "X-Subscription-Token": process.env.FIPE_API_TOKEN } : {},
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(12000),
  });
  }catch(erro){
    throw new ErroConsultaFipe(null,tipo+caminho,
      erro instanceof Error?erro.message:String(erro));
  }
  if(!resposta.ok)throw new ErroConsultaFipe(
    resposta.status,tipo+caminho,"HTTP "+resposta.status);
  try{return await resposta.json() as T;}
  catch{throw new ErroConsultaFipe(null,tipo+caminho,"resposta inválida");}
}

export async function listarMarcasFipe(tipo: TipoFipe) {
  return solicitarFipe<OpcaoFipe[]>(tipo, "/brands");
}
export async function listarModelosFipe(tipo: TipoFipe, marca: string) {
  return solicitarFipe<OpcaoFipe[]>(tipo, "/brands/" + encodeURIComponent(marca) + "/models");
}
/** Consulta FIPE alternativa por marca e ano: evita varrer dezenas de modelos. */
export async function listarAnosMarcaFipe(tipo:TipoFipe,marca:string){
  return solicitarFipe<OpcaoFipe[]>(tipo,"/brands/"+encodeURIComponent(marca)+"/years");
}
export async function listarModelosMarcaAnoFipe(tipo:TipoFipe,marca:string,anoCodigo:string){
  return solicitarFipe<OpcaoFipe[]>(tipo,
    "/brands/"+encodeURIComponent(marca)+"/years/"+encodeURIComponent(anoCodigo)+"/models");
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
/** Filtragem por ano sem limite arbitrário de versões do modelo.
 * FIPE oferece marca/ano/modelos; cada combinação de combustível é consultada
 * e uma resposta parcial não pode ser usada para gerar preço errado.
 */
async function consultarCandidatosMarcaAno(params:{
  tipo:TipoFipe;marca:string;candidatos:OpcaoFipe[];ano:string;
}):Promise<{validos:ModeloComAno[];erros:number}>{
  const anos=correspondeAnoFipe(await listarAnosMarcaFipe(params.tipo,params.marca),params.ano);
  if(!anos.length)return {validos:[],erros:0};
  const respostas=await Promise.allSettled(anos.map(async ano=>({
    ano,modelos:await listarModelosMarcaAnoFipe(params.tipo,params.marca,ano.code),
  })));
  const falha=respostas.find(item=>item.status==="rejected" &&
    !(item.reason instanceof ErroConsultaFipe && item.reason.statusHttp===404));
  if(falha?.status==="rejected")throw falha.reason;
  // Combinações não existentes (404) não anulam os anos válidos da marca.
  const consultas=respostas.flatMap(resposta=>
    resposta.status==="fulfilled"?[resposta.value]:[]
  );
  return {validos:agruparModelosPorAnoFipe(params.candidatos,consultas),erros:0};
}
async function consultarCandidatosPorAno(params:{
  tipo:TipoFipe;marca:string;candidatos:OpcaoFipe[];ano:string;
}):Promise<{validos:ModeloComAno[];erros:number}>{
  if(params.candidatos.length>12)return consultarCandidatosMarcaAno(params);
  const validos:ModeloComAno[]=[];
  let erros=0;
  let primeiraFalha:unknown=null;
  // Evita rajadas sem limite de consultas na API da FIPE.
  for(let inicio=0;inicio<params.candidatos.length;inicio+=10){
    const lote=params.candidatos.slice(inicio,inicio+10);
    const respostas=await Promise.allSettled(lote.map(async modelo=>{
      try{
        return {modelo,anos:correspondeAnoFipe(
          await listarAnosFipe(params.tipo,params.marca,modelo.code),params.ano,
        )};
      }catch(erro){
        // Modelo/código fora do catálogo retorna 404 e não significa
        // indisponibilidade temporária da API nem autoriza transferência.
        if(erro instanceof ErroConsultaFipe&&erro.statusHttp===404)
          return {modelo,anos:[] as OpcaoFipe[]};
        throw erro;
      }
    }));
    for(const item of respostas){
      if(item.status==="rejected"){erros++;primeiraFalha ??= item.reason;continue;}
      if(item.value.anos.length)validos.push(item.value);
    }
  }
  // Não aceitar uma lista incompleta que poderia eliminar uma versão válida.
  if(erros)throw primeiraFalha instanceof Error?primeiraFalha:
    new ErroConsultaFipe(null,params.tipo+"/models","consulta incompleta");
  return {validos,erros:0};
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
  const semMotor=params.consulta
    .replace(/\b[1-9][.,][0-9]\b/g," ")
    // Potência informada pelo cliente pode não constar do título FIPE.
    // Remover APENAS na pesquisa de alternativas, nunca no match final.
    .replace(/\b\d{2,4}\s*cv\b/gi," ")
    .replace(/\s+/g," ").trim();
  const consultas=[semMotor];
  if(motor&&familia)consultas.push(familia+" "+motor);
  const excluidos=new Set((params.excluir||[]).map(v=>v.code));
  const unicos=new Map<string,OpcaoFipe>();
  for(const consulta of consultas)
    for(const item of modelosCompativeisFipe(params.listaModelos,consulta))
      if(!excluidos.has(item.code))unicos.set(item.code,item);
  // Só depois das buscas estritas, considerar versões da mesma família.
  // A lista é validada pelo ano real da FIPE e usada EXCLUSIVAMENTE como
  // pergunta para confirmar versão, nunca como substituição automática.
  if(!unicos.size){
    for(const item of modelosDaMesmaFamiliaFipe(
      params.listaModelos,params.consulta,
    )){
      if(!excluidos.has(item.code))unicos.set(item.code,item);
    }
  }
  const candidatos=[...unicos.values()];
  if(!candidatos.length)return {opcoes:[],erros:0};
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
  codigoModelo?:string|null;
}) {
  const marca=unico(await listarMarcasFipe(params.tipo),params.marca);
  const anoModelo=anoModeloSolicitado(params.ano);
  if(!anoModelo)throw new Error("Informe somente o ano-modelo, por exemplo 2005.");
  if(params.codigoModelo){
    // Código recuperado da lista real FIPE no pedido, não inferido pela IA.
    if(!/^\d{1,12}$/.test(params.codigoModelo))
      throw new Error("Código de modelo FIPE inválido.");
    const anos=correspondeAnoFipe(
      await listarAnosFipe(params.tipo,marca.code,params.codigoModelo),params.ano);
    if(!anos.length)throw diagnosticarIdentificacaoFipe({
      modelo:params.modelo,anoModelo,possuiModeloNaMarca:true,
    });
    if(anos.length!==1)throw new Error("A FIPE tem mais de uma opção para o ano-modelo "+
      anoModelo+". Confirme o combustível.");
    const detalhe=await detalharVeiculoFipe(
      params.tipo,marca.code,params.codigoModelo,anos[0].code);
    return {...detalhe,anoCodigo:anos[0].code,
      valorCentavos:precoFipeCentavos(detalhe.price)};
  }
  const listaModelos=await listarModelosFipe(params.tipo,marca.code);
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
    throw diagnosticarIdentificacaoFipe({
      modelo:params.modelo,anoModelo,possuiModeloNaMarca:false,
    });
  }
  // Consultar os anos antes de sugerir opções. Evita oferecer versões que
  // não existem no ano selecionado (ocorria com a Ranger).
  // Disponibilidade por ano validada na FIPE, inclusive para famílias grandes.
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
    throw diagnosticarIdentificacaoFipe({
      modelo:params.modelo,anoModelo,possuiModeloNaMarca:true,
    });
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
