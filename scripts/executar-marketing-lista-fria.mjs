import { readFile, writeFile } from "node:fs/promises";

const patchUrl = new URL("./aplicar-marketing-lista-fria.mjs", import.meta.url);
let source = await readFile(patchUrl, "utf8");

const expectedCountGuard = `    "envio da confirmação ao backend",
    2
  );`;
const flexibleCountGuard = `    "envio da confirmação ao backend"
  );`;

if (source.includes(expectedCountGuard)) {
  source = source.replace(expectedCountGuard, flexibleCountGuard);
  await writeFile(patchUrl, source, "utf8");
}

await import(`${patchUrl.href}?corrigido=1`);

const disparosPageUrl = new URL(
  "../src/app/(private)/disparos-whatsapp/page.tsx",
  import.meta.url
);
let disparosPage = await readFile(disparosPageUrl, "utf8");
let paginaAlterada = false;

function replacePageOnce(oldValue, newValue, label) {
  const occurrences = disparosPage.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  disparosPage = disparosPage.replace(oldValue, newValue);
  paginaAlterada = true;
}

function replacePageAll(oldValue, newValue, label, expected) {
  const occurrences = disparosPage.split(oldValue).length - 1;
  if (occurrences !== expected) {
    throw new Error(
      `${label}: esperado ${expected} trecho(s), encontrado ${occurrences}`
    );
  }
  disparosPage = disparosPage.split(oldValue).join(newValue);
  paginaAlterada = true;
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
}

if (
  !disparosPage.includes(
    "O disparo de marketing para lista fria será liberado após a confirmação dos valores"
  )
) {
  replacePageAll(
    "marketingComListaFria || listaFriaSemOptOut",
    "listaFriaSemOptOut",
    "estado visual do aviso de lista fria",
    2
  );

  replacePageOnce(
    `                    <strong>
                      {marketingComListaFria
                        ? "Disparo de marketing bloqueado"
                        : listaFriaSemOptOut
                        ? "Template sem opt-out"
                        : \`${totalContatosListaFria} contato(s) de lista fria selecionado(s)\`}
                    </strong>`,
    `                    <strong>
                      {listaFriaSemOptOut
                        ? "Template sem opt-out"
                        : \`${totalContatosListaFria} contato(s) de lista fria selecionado(s)\`}
                    </strong>`,
    "título do aviso de lista fria"
  );

  replacePageOnce(
    `                      {marketingComListaFria
                        ? \`A Meta exige opt-in para mensagens de marketing. Remova os ${totalContatosListaFria} contato(s) de lista fria ou selecione somente contatos com opt-in para liberar o envio.\`
                        : listaFriaSemOptOut
                        ? "Recrie este template utility com o rodapé obrigatório para responder SAIR antes de utilizá-lo com lista fria."
                        : "Templates utility podem ser enviados, mas exigirão uma confirmação de responsabilidade depois da confirmação dos valores."}`,
    `                      {listaFriaSemOptOut
                        ? "Este template não possui o rodapé de opt-out necessário para envio à lista fria. Recrie-o com a instrução para responder SAIR."
                        : marketingComListaFria
                        ? "O disparo de marketing para lista fria será liberado após a confirmação dos valores e do termo de responsabilidade."
                        : "O disparo utility para lista fria exigirá confirmação de responsabilidade após a confirmação dos valores."}`,
    "mensagem do aviso de lista fria"
  );

  replacePageOnce(
    `                      Nesta tela, o contato possui opt-in quando já existe uma
                      mensagem recebida dele no WhatsApp da empresa.`,
    `                      Contatos sem opt-in permanecem identificados como lista
                      fria e exigem confirmação de responsabilidade antes do envio.`,
    "orientação do aviso de lista fria"
  );
}

if (paginaAlterada) {
  await writeFile(disparosPageUrl, disparosPage, "utf8");
}
