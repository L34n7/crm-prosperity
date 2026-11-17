type Registro = Record<string, unknown>;

function objeto(value: unknown): Registro {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Registro)
    : {};
}

function componentes(payload: unknown) {
  const lista = objeto(payload).components;
  return Array.isArray(lista) ? lista.map(objeto) : [];
}

function cabecalhoImagem(payload: unknown) {
  return componentes(payload).find(
    (item) =>
      String(item.type || "").toUpperCase() === "HEADER" &&
      String(item.format || "").toUpperCase() === "IMAGE"
  );
}

/** Um identificador de upload (4:...) não é uma URL que o navegador possa exibir. */
export function obterUrlImagemTemplate(payload: unknown) {
  const header = cabecalhoImagem(payload);
  const valores = objeto(header?.example).header_handle;
  if (!Array.isArray(valores)) return "";
  return valores
    .map((valor) => String(valor || "").trim())
    .find((valor) => /^https:\/\//i.test(valor)) || "";
}

/** Altera somente a cópia local; o envio de criação à Meta mantém o handle original. */
export function atribuirUrlImagemTemplate<T>(payload: T, url: string): T {
  const copia = JSON.parse(JSON.stringify(payload || {})) as Registro;
  const lista = Array.isArray(copia.components) ? copia.components : [];
  const header = lista.find(
    (item) => String(objeto(item).type || "").toUpperCase() === "HEADER" &&
      String(objeto(item).format || "").toUpperCase() === "IMAGE"
  );
  if (!header || !/^https:\/\//i.test(String(url || "").trim())) return copia as T;
  const registro = objeto(header);
  registro.example = {
    ...objeto(registro.example),
    header_handle: [url.trim()],
  };
  return copia as T;
}
