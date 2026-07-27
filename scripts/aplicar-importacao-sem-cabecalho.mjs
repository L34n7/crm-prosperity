import { readFile, writeFile } from "node:fs/promises";

const routePath = "src/app/api/contatos/importar/preview/route.ts";
let route = await readFile(routePath, "utf8");

if (route.includes("arquivoSemCabecalho")) {
  console.log("Importação de listas sem cabeçalho já aplicada.");
  process.exit(0);
}

function replaceOnce(source, oldValue, newValue, label) {
  const occurrences = source.split(oldValue).length - 1;

  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }

  return source.replace(oldValue, newValue);
}

route = replaceOnce(
  route,
  "    const { headers, rows } = await parseSpreadsheetFile(file);",
  "    let { headers, rows } = await parseSpreadsheetFile(file);",
  "permitir ajuste dos cabeçalhos"
);

route = replaceOnce(
  route,
  "    const encontrouAlgumaColunaDeTelefone = headers.some((header) =>",
  "    let encontrouAlgumaColunaDeTelefone = headers.some((header) =>",
  "permitir detecção de lista sem cabeçalho"
);

const validationAnchor = `    if (!encontrouAlgumaColunaDeTelefone) {
      return NextResponse.json(`;

const validationBlock = `    let arquivoSemCabecalho = false;

    if (!encontrouAlgumaColunaDeTelefone) {
      const linhasIncluindoPrimeira = [headers, ...rows];
      const indicesComValor = new Set<number>();

      for (const linha of linhasIncluindoPrimeira.slice(0, 100)) {
        linha.forEach((valor, indice) => {
          if (String(valor || "").trim()) {
            indicesComValor.add(indice);
          }
        });
      }

      const indiceColunaUnica =
        indicesComValor.size === 1
          ? (indicesComValor.values().next().value ?? -1)
          : -1;

      if (indiceColunaUnica >= 0) {
        const amostra = linhasIncluindoPrimeira
          .slice(0, 50)
          .map((linha) => String(linha[indiceColunaUnica] || "").trim())
          .filter(Boolean);

        const telefonesValidosNaAmostra = amostra.filter((valor) =>
          telefoneImportacaoValido(
            normalizarTelefoneBrasilParaWhatsApp(valor)
          )
        ).length;

        const percentualValido = amostra.length
          ? telefonesValidosNaAmostra / amostra.length
          : 0;

        if (amostra.length > 0 && percentualValido >= 0.8) {
          headers = ["telefone"];
          rows = linhasIncluindoPrimeira
            .map((linha) => [String(linha[indiceColunaUnica] || "").trim()])
            .filter((linha) => Boolean(linha[0]));
          encontrouAlgumaColunaDeTelefone = true;
          arquivoSemCabecalho = true;
        }
      }
    }

    if (!encontrouAlgumaColunaDeTelefone) {
      return NextResponse.json(`;

route = replaceOnce(
  route,
  validationAnchor,
  validationBlock,
  "detecção automática de lista de telefones sem cabeçalho"
);

route = replaceOnce(
  route,
  "      const linhaReal = index + 2;",
  "      const linhaReal = index + (arquivoSemCabecalho ? 1 : 2);",
  "numeração correta das linhas sem cabeçalho"
);

await writeFile(routePath, route, "utf8");
console.log("Importação de listas de telefone sem cabeçalho aplicada.");
