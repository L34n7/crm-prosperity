import fs from "node:fs";

function substituirObrigatorio(conteudo, anterior, novo, descricao) {
  if (conteudo.includes(novo)) return conteudo;
  if (!conteudo.includes(anterior)) {
    throw new Error(`[REVISAO TELEFONE] Trecho nao encontrado: ${descricao}`);
  }
  return conteudo.replace(anterior, novo);
}

function salvarSeAlterado(caminho, anterior, novo) {
  if (anterior === novo) return false;
  fs.writeFileSync(caminho, novo, "utf8");
  return true;
}

const paginaDisparosPath = "src/app/(private)/disparos-whatsapp/page.tsx";
const cssDisparosPath =
  "src/app/(private)/disparos-whatsapp/disparos-whatsapp.module.css";
const paginaContatosPath = "src/app/(private)/contatos/page.tsx";
const cssContatosPath = "src/app/(private)/contatos/contatos.module.css";

let paginaDisparos = fs.readFileSync(paginaDisparosPath, "utf8");
const paginaDisparosOriginal = paginaDisparos;

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `  whatsapp_disparo_cooldown_horas?: number | null;\n  contexto_integracao_whatsapp_id?: string | null;`,
  `  whatsapp_disparo_cooldown_horas?: number | null;\n  // CRM_PHONE_REVIEW_DISPATCH_V1\n  telefone_revisar?: boolean;\n  contexto_integracao_whatsapp_id?: string | null;`,
  "campo telefone_revisar no contato da tela de disparos"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `  disparoAnteriorId?: string;\n  mensagemDataInicio?: string;`,
  `  disparoAnteriorId?: string;\n  telefoneRevisar?: string;\n  mensagemDataInicio?: string;`,
  "filtro telefoneRevisar"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `  const [disparoAnteriorFiltroContatos, setDisparoAnteriorFiltroContatos] =\n    useState("");\n  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<`,
  `  const [disparoAnteriorFiltroContatos, setDisparoAnteriorFiltroContatos] =\n    useState("");\n  const [telefoneRevisarFiltro, setTelefoneRevisarFiltro] = useState("");\n  const [atendentesDisponiveis, setAtendentesDisponiveis] = useState<`,
  "estado do filtro de revisao"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `        disparoAnteriorId = "",\n        mensagemDataInicio = "",`,
  `        disparoAnteriorId = "",\n        telefoneRevisar = "",\n        mensagemDataInicio = "",`,
  "desestruturacao do filtro de revisao"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `        if (disparoAnteriorId.trim()) {\n          params.set("disparo_anterior_id", disparoAnteriorId.trim());\n        }\n\n        if (integracaoId) {`,
  `        if (disparoAnteriorId.trim()) {\n          params.set("disparo_anterior_id", disparoAnteriorId.trim());\n        }\n\n        if (telefoneRevisar === "true" || telefoneRevisar === "false") {\n          params.set("telefone_revisar", telefoneRevisar);\n        }\n\n        if (integracaoId) {`,
  "parametro telefone_revisar da API"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `        disparoAnteriorId: disparoAnteriorFiltroContatos,\n        mensagemDataInicio: mensagemDataInicioFiltro,`,
  `        disparoAnteriorId: disparoAnteriorFiltroContatos,\n        telefoneRevisar: telefoneRevisarFiltro,\n        mensagemDataInicio: mensagemDataInicioFiltro,`,
  "envio do filtro de revisao para carregarContatos"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `    disparoAnteriorFiltroContatos,\n    integracaoId,`,
  `    disparoAnteriorFiltroContatos,\n    telefoneRevisarFiltro,\n    integracaoId,`,
  "dependencia do filtro de revisao"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `      campanhaFiltro ||\n      disparoAnteriorFiltroContatos ||\n      quantidadeFiltrosAvancadosAtivos > 0`,
  `      campanhaFiltro ||\n      disparoAnteriorFiltroContatos ||\n      telefoneRevisarFiltro ||\n      quantidadeFiltrosAvancadosAtivos > 0`,
  "indicador de filtros ativos"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `  const filtrosServidorContatosAtivos = Boolean(\n    disparoAnteriorFiltroContatos ||\n      mensagemDataInicioFiltro ||`,
  `  const filtrosServidorContatosAtivos = Boolean(\n    disparoAnteriorFiltroContatos ||\n      telefoneRevisarFiltro ||\n      mensagemDataInicioFiltro ||`,
  "filtros de servidor ativos"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `                          setDisparoAnteriorFiltroContatos("");\n                          setMensagemDataInicioFiltro("");`,
  `                          setDisparoAnteriorFiltroContatos("");\n                          setTelefoneRevisarFiltro("");\n                          setMensagemDataInicioFiltro("");`,
  "limpeza do filtro de revisao"
);

paginaDisparos = substituirObrigatorio(
  paginaDisparos,
  `                      </select>\n                    </div>\n                  </div>\n\n                  {filtrosAvancadosAbertos ? (`,
  `                      </select>\n                    </div>\n\n                    <div className={styles.field}>\n                      <label className={styles.label}>Revisão do número</label>\n                      <select\n                        value={telefoneRevisarFiltro}\n                        onChange={(e) => setTelefoneRevisarFiltro(e.target.value)}\n                        className={styles.input}\n                      >\n                        <option value="">Todos</option>\n                        <option value="false">Sem revisão</option>\n                        <option value="true">⚠ revisão</option>\n                      </select>\n                    </div>\n                  </div>\n\n                  {filtrosAvancadosAbertos ? (`,
  "select rapido de revisao ao lado de Disparo anterior"
);

if (!paginaDisparos.includes("styles.contactBadgeReview")) {
  const ancoraBadge = /^(\s*)\{renderBadgeCooldownContato\(contato\)\}$/gm;
  let totalBadges = 0;
  paginaDisparos = paginaDisparos.replace(ancoraBadge, (linha, espacos) => {
    totalBadges += 1;
    return `${espacos}{contato.telefone_revisar ? (\n${espacos}  <span className={styles.contactBadgeReview}>⚠ revisão</span>\n${espacos}) : null}\n\n${linha}`;
  });

  if (totalBadges < 2) {
    throw new Error(
      `[REVISAO TELEFONE] Esperados ao menos 2 pontos de badge; encontrados ${totalBadges}.`
    );
  }
}

salvarSeAlterado(
  paginaDisparosPath,
  paginaDisparosOriginal,
  paginaDisparos
);

let cssDisparos = fs.readFileSync(cssDisparosPath, "utf8");
const cssDisparosOriginal = cssDisparos;

cssDisparos = substituirObrigatorio(
  cssDisparos,
  `.searchFilters {\n  display: grid;\n  grid-template-columns:\n    minmax(220px, 1.35fr)\n    minmax(160px, 0.85fr)\n    minmax(170px, 0.9fr)\n    minmax(180px, 1fr);\n  gap: 12px;`,
  `.searchFilters {\n  display: grid;\n  grid-template-columns:\n    minmax(210px, 1.25fr)\n    minmax(145px, 0.75fr)\n    minmax(155px, 0.8fr)\n    minmax(170px, 0.9fr)\n    minmax(140px, 0.7fr);\n  gap: 12px;`,
  "quinta coluna dos filtros rapidos"
);

if (!cssDisparos.includes("CRM_PHONE_REVIEW_DISPATCH_BADGE_V1")) {
  cssDisparos += `\n\n/* CRM_PHONE_REVIEW_DISPATCH_BADGE_V1 */\n.contactBadgeReview {\n  display: inline-flex;\n  align-items: center;\n  min-height: 24px;\n  padding: 0 8px;\n  border-radius: 999px;\n  border: 1px solid var(--crm-warning-border);\n  background: var(--crm-warning-bg);\n  color: var(--crm-warning-text);\n  font-size: 11px;\n  font-weight: 800;\n  line-height: 1;\n  white-space: nowrap;\n}\n`;
}

salvarSeAlterado(cssDisparosPath, cssDisparosOriginal, cssDisparos);

let paginaContatos = fs.readFileSync(paginaContatosPath, "utf8");
const paginaContatosOriginal = paginaContatos;
const alertaDetalhado = `\n                            {contato.telefone_revisar && (\n                              <div className={styles.infoBlockFull}>\n                                <span className={styles.infoLabel}>Alerta</span>\n                                <span className={styles.infoValue}>\n                                  Este contato foi marcado para revisão de telefone.\n                                </span>\n                              </div>\n                            )}`;

if (paginaContatos.includes(alertaDetalhado)) {
  paginaContatos = paginaContatos.replace(alertaDetalhado, "");
}

salvarSeAlterado(paginaContatosPath, paginaContatosOriginal, paginaContatos);

let cssContatos = fs.readFileSync(cssContatosPath, "utf8");
const cssContatosOriginal = cssContatos;

if (!cssContatos.includes("CRM_CONTACT_REVIEW_BADGE_V1")) {
  const regexReviewDot = /\.reviewDot\s*\{[\s\S]*?\}\s*/;

  if (!regexReviewDot.test(cssContatos)) {
    throw new Error("[REVISAO TELEFONE] Estilo .reviewDot nao encontrado.");
  }

  cssContatos = cssContatos.replace(
    regexReviewDot,
    `/* CRM_CONTACT_REVIEW_BADGE_V1 */\n.reviewDot {\n  flex: 0 0 auto;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 24px;\n  padding: 0 8px;\n  border-radius: 999px;\n  border: 1px solid var(--crm-warning-border);\n  background: var(--crm-warning-bg);\n  color: var(--crm-warning-text);\n  font-size: 11px;\n  font-weight: 800;\n  line-height: 1;\n  white-space: nowrap;\n}\n\n.reviewDot::after {\n  content: "⚠ revisão";\n}\n\n`
  );
}

salvarSeAlterado(cssContatosPath, cssContatosOriginal, cssContatos);

console.log("Revisao de telefone e filtro de disparos aplicados.");
