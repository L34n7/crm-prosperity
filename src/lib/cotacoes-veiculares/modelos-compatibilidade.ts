/**
 * Seleção estrita de modelos FIPE. "Automático" e "manual" são atributos
 * usados como filtro quando a FIPE identifica explicitamente a transmissão,
 * inclusive nas abreviações "Aut." e "Mec.". Quando a própria descrição FIPE
 * omite o câmbio, a versão não pode ser descartada apenas por essa ausência.
 *
 * Módulo puro para ser exercitado por testes sem acessar a API FIPE.
 */
export type OpcaoModeloFipe = { code: string; name: string };
type CambioFipe = "automatico" | "manual";

function normalizar(valor: string) {
  return String(valor || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsed\b/g,"sedan")
    .replace(/\b(?:advant|advan)\b/g,"advantage")
    .replace(/\s+/g," ").trim();
}

function cambioExplicito(valor: string): CambioFipe | null {
  const tokens = new Set(normalizar(valor).split(" "));
  const automatico = ["automatico", "automatica", "aut", "auto", "cvt", "tiptronic", "dsg"].some(
    (token) => tokens.has(token),
  );
  const manual = ["manual", "mecanico", "mecanica", "mec"].some(
    (token) => tokens.has(token),
  );
  if (automatico === manual) return null;
  return automatico ? "automatico" : "manual";
}

/** Tolerância de UMA letra apenas na família de modelo FIPE.
 * Versões, câmbio, motores e anos continuam sujeitos à consulta real. */
function nomeComUmErro(a:string,b:string):boolean{
  if(a===b||Math.min(a.length,b.length)<5||
    Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,erros=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++erros>1)return false;
    if(a.length>b.length)i++;
    else if(b.length>a.length)j++;
    else {i++;j++;}
  }
  return erros+(a.length-i)+(b.length-j)===1;
}

const termosAtributos = new Set([
  "manual", "mecanico", "mecanica", "mec",
  "automatico", "automatica", "aut", "auto", "cvt", "tiptronic", "dsg",
  "gasolina", "alcool", "flex",
]);

export function modelosCompativeisFipe(
  itens: OpcaoModeloFipe[],
  consulta: string,
): OpcaoModeloFipe[] {
  const nome = normalizar(consulta)
    .replace(/\b(?:sed|seda)\b/g, "sedan")
    .replace(/\bdisel\b/g, "diesel");
  if (!nome) return [];

  const exatos = itens.filter((item) =>
    normalizar(item.name).replace(/\b(?:sed|seda)\b/g, "sedan") === nome ||
    item.code === consulta.trim()
  );
  if (exatos.length) return exatos;

  const cambioSolicitado = cambioExplicito(nome);
  const tokens = nome.split(" ").filter((token) => token && !termosAtributos.has(token));

  const compativeis = itens.filter((item) => {
    const partes = new Set(
      normalizar(item.name).replace(/\b(?:sed|seda)\b/g, "sedan").split(" "),
    );
    return tokens.every((token) =>
      partes.has(token) ||
      (token === "diesel" && ["diesel", "dies", "die"].some((v) => partes.has(v)))
    );
  });

  // Corrigir somente quando não há correspondência exata. A grafia
  // sugerida deve diferir em UMA letra no primeiro token do veículo;
  // detalhes restantes precisam coincidir. Depois, a FIPE valida o ano
  // e exige escolha caso múltiplas versões permaneçam.
  const familiaInformada=tokens[0]||"";
  const candidatos=compativeis.length||!familiaInformada
    ?compativeis
    :itens.filter((item)=>{
      const partes=normalizar(item.name)
        .replace(/\b(?:sed|seda)\b/g,"sedan").split(" ");
      return nomeComUmErro(familiaInformada,partes[0]||"") &&
        tokens.slice(1).every(token=>
          partes.includes(token) ||
          (token==="diesel"&&["diesel","dies","die"].some(v=>partes.includes(v))));
    });

  if (!cambioSolicitado) return candidatos;
  const cambioIdentificado = candidatos.filter(
    (item) => cambioExplicito(item.name) === cambioSolicitado
  );
  // Uma indicação explícita da FIPE é preferível a modelos sem câmbio
  // documentado. Nunca misturar Aut. e Mec. na mesma escolha.
  if (cambioIdentificado.length) return cambioIdentificado;
  // Há veículos antigos (ex.: Vectra GLS/Challenge 2000) cujo catálogo
  // não registra o câmbio na descrição. Isso não significa câmbio oposto.
  // Mantemos SOMENTE as versões sem câmbio identificado; a seleção por
  // motor, acabamento e ano-modelo permanece rigorosa.
  return candidatos.filter((item) => cambioExplicito(item.name) === null);
}
