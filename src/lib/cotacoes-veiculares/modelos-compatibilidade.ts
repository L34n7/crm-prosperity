/**
 * Seleção estrita de modelos FIPE. "Automático" e "manual" são atributos
 * obrigatórios quando especificados pelo cliente, inclusive nas abreviações
 * "Aut." e "Mec." usadas no catálogo FIPE.
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
  const automatico = ["automatico", "automatica", "aut", "cvt", "tiptronic", "dsg"].some(
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
  "automatico", "automatica", "aut", "cvt", "tiptronic", "dsg",
  "gasolina", "alcool", "flex",
]);

export function modelosCompativeisFipe(
  itens: OpcaoModeloFipe[],
  consulta: string,
): OpcaoModeloFipe[] {
  const nome = normalizar(consulta)
    .replace(/\bsed\b/g, "sedan")
    .replace(/\bdisel\b/g, "diesel");
  if (!nome) return [];

  const exatos = itens.filter((item) =>
    normalizar(item.name).replace(/\bsed\b/g, "sedan") === nome ||
    item.code === consulta.trim()
  );
  if (exatos.length) return exatos;

  const cambioSolicitado = cambioExplicito(nome);
  const tokens = nome.split(" ").filter((token) => token && !termosAtributos.has(token));

  return itens.filter((item) => {
    const partes = new Set(
      normalizar(item.name).replace(/\bsed\b/g, "sedan").split(" "),
    );
    const modeloCompativel = tokens.every((token) =>
      partes.has(token) ||
      (token === "diesel" && ["diesel", "dies", "die"].some((v) => partes.has(v)))
    );
    return modeloCompativel &&
      (!cambioSolicitado || cambioExplicito(item.name) === cambioSolicitado);
  });
}
