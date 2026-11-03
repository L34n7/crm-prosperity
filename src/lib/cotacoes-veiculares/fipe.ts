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
  const nome=normalizar(consulta).replace(/\bsed\b/g,"sedan");
  if(!nome)return [];
  const exatos=itens.filter(item=>normalizar(item.name).replace(/\bsed\b/g,"sedan")===nome
    ||item.code===consulta.trim());
  if(exatos.length)return exatos;
  const tokens=nome.split(" ").filter(t=>t&&!["manual","mecanico","automático","automatico","gasolina","alcool","flex"].includes(t));
  const compativeis=itens.filter(item=>{
    const partes=new Set(normalizar(item.name).replace(/\bsed\b/g,"sedan").split(" "));
    return tokens.every(token=>partes.has(token));
  });
  return compativeis;
}

function correspondeAnoFipe(ano:OpcaoFipe[],consulta:string){
  const anos=String(consulta).match(/\b(?:19|20)\d{2}\b/g);
  const numero=anos?.at(-1)||"";
  const exatos=ano.filter(i=>i.code===consulta||normalizar(i.name)===normalizar(consulta));
  if(exatos.length)return exatos;
  return numero?ano.filter(i=>i.code.startsWith(numero+"-")||i.name.startsWith(numero+" ")): [];
}

export async function encontrarVeiculoFipe(params: {
  tipo: TipoFipe; marca: string; modelo: string; ano: string;
}) {
  const marca = unico(await listarMarcasFipe(params.tipo), params.marca);
  const listaModelos=await listarModelosFipe(params.tipo,marca.code);
  const candidatos=modelosCompativeisFipe(listaModelos,params.modelo);
  if(!candidatos.length){
    throw new Error("Não encontrei esta descrição entre os modelos FIPE da marca. "+
      "Verifique apenas o nome/versão do modelo, não solicite tabela de preços ou documento.");
  }
  if(candidatos.length>15){
    throw new Error("Informe uma versão mais específica: "+candidatos.slice(0,8).map(m=>m.name).join("; "));
  }
  const possiveis=await Promise.allSettled(candidatos.map(async modelo=>{
    const anos=await listarAnosFipe(params.tipo,marca.code,modelo.code);
    return {modelo,anos:correspondeAnoFipe(anos,params.ano)};
  }));
  const validos=possiveis.filter((p):p is PromiseFulfilledResult<{
    modelo:OpcaoFipe;anos:OpcaoFipe[];
  }>=>p.status==="fulfilled").map(p=>p.value);
  if(!validos.length){
    const falha=possiveis.find((p):p is PromiseRejectedResult=>p.status==="rejected");
    throw falha?.reason instanceof Error?falha.reason:
      new Error("Consulta FIPE indisponível. Tente novamente mais tarde.");
  }
  const compativeis=validos.filter(v=>v.anos.length);
  if(compativeis.length>1){
    throw new Error("Informe uma versão mais específica: "+
      compativeis.slice(0,8).map(v=>v.modelo.name).join("; ")+
      ". Confirme somente o detalhe que diferencia as versões (por exemplo, 8V ou 16V).");
  }
  if(compativeis.length===0){
    throw new Error("Nenhuma versão localizada para o ano "+params.ano+
      ". Confirme apenas o ano-modelo do veículo.");
  }
  const {modelo,anos}=compativeis[0];
  if(anos.length!==1){
    throw new Error("A FIPE tem mais de uma opção para este ano: "+
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
