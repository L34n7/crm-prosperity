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
export async function encontrarVeiculoFipe(params: {
  tipo: TipoFipe; marca: string; modelo: string; ano: string;
}) {
  const marca = unico(await listarMarcasFipe(params.tipo), params.marca);
  const modelo = unico(await listarModelosFipe(params.tipo, marca.code), params.modelo);
  const anos = await listarAnosFipe(params.tipo, marca.code, modelo.code);
  const ano = unico(anos, params.ano);
  const detalhe = await detalharVeiculoFipe(params.tipo, marca.code, modelo.code, ano.code);
  return { ...detalhe, valorCentavos: precoFipeCentavos(detalhe.price) };
}

export function tipoFipeDaCategoria(categoria: string): TipoFipe {
  if (categoria === "motocicleta") return "motorcycles";
  if (categoria === "caminhao_leve" || categoria === "caminhao_pesado") return "trucks";
  return "cars";
}
