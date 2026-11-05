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
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

  if (!cambioSolicitado) return compativeis;
  const cambioIdentificado = compativeis.filter(
    (item) => cambioExplicito(item.name) === cambioSolicitado
  );
  // Uma indicação explícita da FIPE é preferível a modelos sem câmbio
  // documentado. Nunca misturar Aut. e Mec. na mesma escolha.
  if (cambioIdentificado.length) return cambioIdentificado;
  // Há veículos antigos (ex.: Vectra GLS/Challenge 2000) cujo catálogo
  // não registra o câmbio na descrição. Isso não significa câmbio oposto.
  // Mantemos SOMENTE as versões sem câmbio identificado; a seleção por
  // motor, acabamento e ano-modelo permanece rigorosa.
  return compativeis.filter((item) => cambioExplicito(item.name) === null);
}
