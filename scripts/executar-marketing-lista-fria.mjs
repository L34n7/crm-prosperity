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
const contatosPageUrl = new URL(
  "../src/app/(private)/contatos/page.tsx",
  import.meta.url
);
const contatosCssUrl = new URL(
  "../src/app/(private)/contatos/contatos.module.css",
  import.meta.url
);

let disparosPage = await readFile(disparosPageUrl, "utf8");
let contatosPage = await readFile(contatosPageUrl, "utf8");
let contatosCss = await readFile(contatosCssUrl, "utf8");
let paginaAlterada = false;
let contatosPageAlterada = false;
let contatosCssAlterado = false;

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

function replaceContatosPageOnce(oldValue, newValue, label) {
  const occurrences = contatosPage.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  contatosPage = contatosPage.replace(oldValue, newValue);
  contatosPageAlterada = true;
}

function replaceContatosCssOnce(oldValue, newValue, label) {
  const occurrences = contatosCss.split(oldValue).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: esperado 1 trecho, encontrado ${occurrences}`);
  }
  contatosCss = contatosCss.replace(oldValue, newValue);
  contatosCssAlterado = true;
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
                                    ? contato.telefone_revisar === true
                                      ? "Telefone marcado para revisão. Corrija-o na página de Contatos antes do disparo."
                                      : "Este contato não possui telefone válido."
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
                        : \`\${totalContatosListaFria} contato(s) de lista fria selecionado(s)\`}
                    </strong>`,
    `                    <strong>
                      {listaFriaSemOptOut
                        ? "Template sem opt-out"
                        : \`\${totalContatosListaFria} contato(s) de lista fria selecionado(s)\`}
                    </strong>`,
    "título do aviso de lista fria"
  );

  replacePageOnce(
    `                      {marketingComListaFria
                        ? \`A Meta exige opt-in para mensagens de marketing. Remova os \${totalContatosListaFria} contato(s) de lista fria ou selecione somente contatos com opt-in para liberar o envio.\`
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

if (!disparosPage.includes("telefone_revisar?: boolean;")) {
  replacePageOnce(
    `  telefone: string | null;
  email: string | null;`,
    `  telefone: string | null;
  telefone_revisar?: boolean;
  email: string | null;`,
    "tipo do indicador de revisão do telefone"
  );
}

if (
  disparosPage.includes(
    `function contatoTemTelefoneValido(contato: ContatoOpcao) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}`
  )
) {
  replacePageOnce(
    `function contatoTemTelefoneValido(contato: ContatoOpcao) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}`,
    `function contatoTemTelefoneValido(contato: ContatoOpcao) {
  if (contato.telefone_revisar === true) return false;

  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}`,
    "validação do telefone marcado para revisão"
  );
}

if (
  disparosPage.includes(
    `    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }`
  )
) {
  replacePageOnce(
    `    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }`,
    `    if (contato.telefone_revisar === true) {
      setErro(
        "Este número está marcado para revisão na página de Contatos e precisa ser corrigido antes do disparo. Confira o DDI (Brasil: 55), o DDD da região e a quantidade de dígitos."
      );
      return;
    }

    if (!telefone || telefone.length < 10) {
      setErro(
        "O telefone deste contato não possui formato válido para disparo. Acesse a página de Contatos e confira o DDI (Brasil: 55), o DDD da região e a quantidade de dígitos."
      );
      return;
    }`,
    "orientação ao adicionar telefone inválido"
  );
}

if (
  disparosPage.includes(
    `                                  !telefoneValido
                                    ? "Este contato não possui telefone válido."`
  )
) {
  replacePageOnce(
    `                                  !telefoneValido
                                    ? "Este contato não possui telefone válido."`,
    `                                  !telefoneValido
                                    ? contato.telefone_revisar === true
                                      ? "Telefone marcado para revisão. Corrija-o na página de Contatos antes do disparo."
                                      : "Este contato não possui telefone válido."`,
    "orientação do botão para telefone em revisão"
  );
}

if (!contatosPage.includes("className={styles.phoneReviewAlert}")) {
  replaceContatosPageOnce(
    `                        ) : (
                          <div className={styles.detailsGrid}>
                            <div className={styles.infoBlock}>`,
    `                        ) : (
                          <div className={styles.detailsGrid}>
                            {contato.telefone_revisar && (
                              <div
                                className={styles.phoneReviewAlert}
                                role="alert"
                              >
                                <span
                                  className={styles.phoneReviewAlertIcon}
                                  aria-hidden="true"
                                >
                                  !
                                </span>
                                <div className={styles.phoneReviewAlertContent}>
                                  <span className={styles.phoneReviewAlertLabel}>
                                    Telefone precisa de revisão
                                  </span>
                                  <strong>
                                    Corrija o número antes de utilizar este contato em disparos.
                                  </strong>
                                  <p>
                                    Verifique se o DDI está correto — para números do Brasil,
                                    use 55. Confira também o DDD da região, a quantidade de
                                    dígitos e se há zeros ou caracteres indevidos. Clique em
                                    Editar para ajustar o telefone.
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className={styles.infoBlock}>`,
    "alerta de revisão no topo dos detalhes"
  );

  replaceContatosPageOnce(
    `
                            {contato.telefone_revisar && (
                              <div className={styles.infoBlockFull}>
                                <span className={styles.infoLabel}>Alerta</span>
                                <span className={styles.infoValue}>
                                  Este contato foi marcado para revisão de telefone.
                                </span>
                              </div>
                            )}`,
    "",
    "remoção do alerta antigo no rodapé"
  );
}

if (!contatosCss.includes(".phoneReviewAlert")) {
  replaceContatosCssOnce(
    `.infoValue {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--crm-text-strong);
  word-break: break-word;
}

.statusBadge {`,
    `.infoValue {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--crm-text-strong);
  word-break: break-word;
}

.phoneReviewAlert {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 15px 17px;
  border: 1px solid var(--crm-warning-border);
  border-radius: 17px;
  background: var(--crm-warning-bg);
  color: var(--crm-warning-text);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--crm-warning-text) 8%, transparent);
}

.phoneReviewAlertIcon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--crm-warning-border);
  border-radius: 999px;
  background: var(--crm-surface);
  color: var(--crm-warning-text);
  font-size: 17px;
  font-weight: 900;
}

.phoneReviewAlertContent {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.phoneReviewAlertLabel {
  font-size: 11px;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.phoneReviewAlertContent strong {
  color: var(--crm-warning-text);
  font-size: 14px;
  line-height: 1.4;
}

.phoneReviewAlertContent p {
  margin: 0;
  color: var(--crm-warning-text);
  font-size: 13px;
  line-height: 1.55;
}

.statusBadge {`,
    "estilos do alerta de revisão do telefone"
  );
}

if (paginaAlterada) {
  await writeFile(disparosPageUrl, disparosPage, "utf8");
}
if (contatosPageAlterada) {
  await writeFile(contatosPageUrl, contatosPage, "utf8");
}
if (contatosCssAlterado) {
  await writeFile(contatosCssUrl, contatosCss, "utf8");
}
