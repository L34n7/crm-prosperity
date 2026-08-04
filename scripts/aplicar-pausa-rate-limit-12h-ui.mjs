import fs from "node:fs";

const pagePath = "src/app/(private)/disparos-whatsapp/page.tsx";
const cssPath =
  "src/app/(private)/disparos-whatsapp/disparos-whatsapp.module.css";

function replaceRequired(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) {
    throw new Error(`[PAUSA RATE LIMIT] Trecho ausente: ${label}`);
  }
  return content.replace(search, replacement);
}

function replaceRegexRequired(content, regex, replacement, label) {
  if (!regex.test(content)) {
    throw new Error(`[PAUSA RATE LIMIT] Trecho ausente: ${label}`);
  }
  return content.replace(regex, replacement);
}

let page = fs.readFileSync(pagePath, "utf8");
const originalPage = page;

if (!page.includes("CRM_RATE_LIMIT_CONTACT_12H_V1")) {
  page = replaceRequired(
    page,
    "function formatarDuracaoCooldownContato(contato: ContatoOpcao) {",
    [
      "// CRM_RATE_LIMIT_CONTACT_12H_V1",
      "function contatoTemCooldownRateLimit(contato: ContatoOpcao) {",
      "  return (",
      "    contato.whatsapp_disparo_cooldown_ativo === true &&",
      "    Number(contato.whatsapp_disparo_cooldown_horas || 0) === 12",
      "  );",
      "}",
      "",
      "function contatoEstaEmCooldownAplicavel(",
      "  contato: ContatoOpcao,",
      "  categoriaTemplate: string",
      ") {",
      "  if (contatoTemCooldownRateLimit(contato)) return true;",
      "  return (",
      "    categoriaTemplate !== \"utility\" &&",
      "    contatoTemCooldownMarketing(contato)",
      "  );",
      "}",
      "",
      "function formatarDuracaoCooldownContato(contato: ContatoOpcao) {",
    ].join("\n"),
    "helpers"
  );

  page = replaceRegexRequired(
    page,
    /  const contatosCooldownSelecionados = useMemo\([\s\S]*?\n  \);\n  const totalContatosOptOut/,
    [
      "  const contatosCooldownSelecionados = useMemo(",
      "    () =>",
      "      contatosSelecionados.filter((contato) =>",
      "        contatoEstaEmCooldownAplicavel(",
      "          contato,",
      "          categoriaTemplateSelecionado",
      "        )",
      "      ),",
      "    [contatosSelecionados, categoriaTemplateSelecionado]",
      "  );",
      "  const totalContatosOptOut",
    ].join("\n"),
    "selecionados em pausa"
  );

  page = replaceRequired(
    page,
    [
      "        !(\n",
      "          contatoTemCooldownMarketing(contato) &&\n",
      "          categoriaTemplateSelecionado !== \"utility\"\n",
      "        )",
    ].join(""),
    "        !contatoEstaEmCooldownAplicavel(contato, categoriaTemplateSelecionado)",
    "lista de contatos validos"
  );

  page = replaceRequired(
    page,
    [
      "    if (\n",
      "      contatoTemCooldownMarketing(contato) &&\n",
      "      categoriaTemplateSelecionado !== \"utility\"\n",
      "    ) {\n",
      "      setErro(\n",
      "        \"Este contato esta em pausa temporaria para disparos de marketing porque a Meta recusou uma entrega recente.\"\n",
      "      );\n",
      "      return;\n",
      "    }",
    ].join(""),
    [
      "    if (contatoEstaEmCooldownAplicavel(contato, categoriaTemplateSelecionado)) {",
      "      setErro(",
      "        contatoTemCooldownRateLimit(contato)",
      "          ? \"Este contato esta em pausa de 12 horas apos um rate limit da Meta.\"",
      "          : \"Este contato esta em pausa temporaria para disparos de marketing porque a Meta recusou uma entrega recente.\"",
      "      );",
      "      return;",
      "    }",
    ].join("\n"),
    "adicao individual"
  );

  page = page.replace(
    "!(contatoTemCooldownMarketing(contato) && categoriaTemplateSelecionado !== \"utility\")",
    "!contatoEstaEmCooldownAplicavel(contato, categoriaTemplateSelecionado)"
  );

  page = replaceRegexRequired(
    page,
    /  function renderBadgeCooldownContato\(contato: ContatoOpcao\) \{[\s\S]*?\n  \}\n\n  function renderBadgesDisparoAntigo/,
    [
      "  function renderBadgeCooldownContato(contato: ContatoOpcao) {",
      "    if (contatoTemCooldownRateLimit(contato)) {",
      "      const expiraEm = contato.whatsapp_disparo_cooldown_expira_em;",
      "      const tooltip = [",
      "        \"A Meta aplicou rate limit para este contato.\",",
      "        \"Novos disparos ficam bloqueados por 12 horas para evitar a repeticao do erro.\",",
      "        expiraEm ? `Expira em ${formatarDataHora(expiraEm)}.` : \"\",",
      "      ]",
      "        .filter(Boolean)",
      "        .join(\" \");",
      "",
      "      return (",
      "        <span className={styles.contactBadgeRateLimit} title={tooltip}>",
      "          Pausa 12hr",
      "        </span>",
      "      );",
      "    }",
      "",
      "    if (!contatoTemCooldownMarketing(contato)) return null;",
      "    if (categoriaTemplateSelecionado === \"utility\") return null;",
      "",
      "    const duracao = formatarDuracaoCooldownContato(contato);",
      "    const expiraEm = contato.whatsapp_disparo_cooldown_expira_em;",
      "    const tooltip = [",
      "      \"Pausa temporaria para disparos de marketing.\",",
      "      \"A Meta recusou uma entrega recente para este contato por limite de qualidade ou frequencia.\",",
      "      expiraEm ? `Expira em ${formatarDataHora(expiraEm)}.` : \"\",",
      "    ]",
      "      .filter(Boolean)",
      "      .join(\" \");",
      "",
      "    return (",
      "      <span className={styles.contactBadgeCooldown} title={tooltip}>",
      "        Pausa {duracao}",
      "      </span>",
      "    );",
      "  }",
      "",
      "  function renderBadgesDisparoAntigo",
    ].join("\n"),
    "badge"
  );

  page = page.replace(
    [
      "                          const cooldownMarketingAtivo =\n",
      "                            contatoTemCooldownMarketing(contato) &&\n",
      "                            categoriaTemplateSelecionado !== \"utility\";",
    ].join(""),
    [
      "                          const cooldownDisparoAtivo =",
      "                            contatoEstaEmCooldownAplicavel(",
      "                              contato,",
      "                              categoriaTemplateSelecionado",
      "                            );",
    ].join("\n")
  );
  page = page.replaceAll(
    "cooldownMarketingAtivo",
    "cooldownDisparoAtivo"
  );

  page = page.replaceAll(
    "A seleção possui contatos em pausa temporária para disparos de marketing. Remova-os para continuar.",
    "A seleção possui contatos em pausa temporária da Meta. Remova-os para continuar."
  );
  page = page.replace(
    "                      em pausa temporária para marketing porque a Meta recusou\n                      uma entrega recente por limite de qualidade ou frequência.",
    "                      em pausa temporária porque a Meta recusou uma entrega\n                      recente por rate limit, qualidade ou frequência."
  );
}

if (page !== originalPage) fs.writeFileSync(pagePath, page, "utf8");

let css = fs.readFileSync(cssPath, "utf8");
if (!css.includes("CRM_RATE_LIMIT_12H_BADGE")) {
  css += [
    "",
    "",
    "/* CRM_RATE_LIMIT_12H_BADGE */",
    ".contactBadgeRateLimit {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  min-height: 24px;",
    "  padding: 0 9px;",
    "  border-radius: 999px;",
    "  background: #0b2a4a;",
    "  border: 1px solid #164f82;",
    "  color: #ffffff;",
    "  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);",
    "  font-size: 11px;",
    "  font-weight: 800;",
    "  cursor: help;",
    "  white-space: nowrap;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(cssPath, css, "utf8");
}

console.log("Badge e bloqueio de rate limit por 12 horas aplicados.");