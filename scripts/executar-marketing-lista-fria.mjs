import { readFile, writeFile } from "node:fs/promises";

const patchUrl = new URL("./aplicar-marketing-lista-fria.mjs", import.meta.url);
let source = await readFile(patchUrl, "utf8");

const oldBlock = `  source = replaceAllRequired(
    source,
    \`              utilityComListaFria &&
               confirmacaoResponsabilidadeListaFria\`,
    \`              templateComListaFria &&
               confirmacaoResponsabilidadeListaFria\`,
    "envio da confirmação ao backend",
    2
  );`;

const newBlock = `  source = replaceAllRequired(
    source,
    \`utilityComListaFria &&
\`,
    \`templateComListaFria &&
\`,
    "envio da confirmação ao backend"
  );`;

if (source.includes(oldBlock)) {
  source = source.replace(oldBlock, newBlock);
  await writeFile(patchUrl, source, "utf8");
}

await import(`${patchUrl.href}?corrigido=1`);

const disparosPageUrl = new URL(
  "../src/app/(private)/disparos-whatsapp/page.tsx",
  import.meta.url
);
let disparosPage = await readFile(disparosPageUrl, "utf8");

function replacePageOnce(oldValue, newValue, label) {
  const occurrences = disparosPage.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  disparosPage = disparosPage.replace(oldValue, newValue);
}

if (!disparosPage.includes("idsContatosSelecionadosParaDisparo")) {
  replacePageOnce(
    `  const contatosDisponiveisFiltrados = useMemo(() => {
    return contatosDisponiveis.filter(contatoPassaFiltrosSelecionados);
  }, [contatosDisponiveis, contatoPassaFiltrosSelecionados]);`,
    `  const idsContatosSelecionadosParaDisparo = useMemo(
    () => new Set(contatosSelecionados.map((contato) => contato.id)),
    [contatosSelecionados]
  );

  const contatosDisponiveisFiltrados = useMemo(() => {
    return contatosDisponiveis.filter(
      (contato) =>
        contatoPassaFiltrosSelecionados(contato) &&
        !idsContatosSelecionadosParaDisparo.has(contato.id)
    );
  }, [
    contatosDisponiveis,
    contatoPassaFiltrosSelecionados,
    idsContatosSelecionadosParaDisparo,
  ]);`,
    "remoção visual dos contatos já selecionados"
  );

  replacePageOnce(
    `                                disabled={
                                  !telefoneValido ||
                                  contatoTemOptOutParaCategoria(
                                    contato,
                                    categoriaTemplateSelecionado
                                  ) ||
                                  cooldownMarketingAtivo
                                }
                              >`,
    `                                aria-disabled={
                                  !telefoneValido ||
                                  contatoTemOptOutParaCategoria(
                                    contato,
                                    categoriaTemplateSelecionado
                                  ) ||
                                  cooldownMarketingAtivo
                                }
                                title={
                                  !telefoneValido
                                    ? "Este contato não possui telefone válido."
                                    : contatoTemOptOutParaCategoria(
                                        contato,
                                        categoriaTemplateSelecionado
                                      )
                                    ? "Este contato solicitou opt-out para esta categoria."
                                    : cooldownMarketingAtivo
                                    ? "Este contato está em pausa temporária para marketing."
                                    : "Adicionar contato ao disparo"
                                }
                              >`,
    "botão de adicionar contato responsivo"
  );

  await writeFile(disparosPageUrl, disparosPage, "utf8");
}
