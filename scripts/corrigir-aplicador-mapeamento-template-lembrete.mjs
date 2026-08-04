import fs from "node:fs";

const arquivo = "scripts/aplicar-mapeamento-template-lembrete-individual.mjs";
let codigo = fs.readFileSync(arquivo, "utf8");

const inicio = codigo.indexOf('  const ancoraCss = "@media(max-width:760px)');
const fim = codigo.indexOf("\n\n  const ancoraMapas =", inicio);

if (inicio < 0 || fim < 0) {
  throw new Error("Não foi possível localizar o bloco antigo de estilos do mapeamento individual.");
}

const novoBloco = [
  '  const fimCss = "\\n`;\\n\\nfunction normalize";',
  '  const indiceFimCss = codigo.indexOf(fimCss);',
  '  if (indiceFimCss < 0) {',
  '    throw new Error("Não foi possível localizar o final dos estilos do mapeamento de templates.");',
  '  }',
  '  const estilosIndividuais = `\\n/* ${marcador} */\\n.agendaIndividualTemplateBound{min-width:0!important;max-width:100%;overflow:hidden}.agendaIndividualTemplateBound>*{min-width:0;max-width:100%}.agendaIndividualTemplateBound div,.agendaIndividualTemplateBound label,.agendaIndividualTemplateBound .field{min-width:0;max-width:100%}.agendaIndividualTemplateBound select,.agendaIndividualTemplateBound input[type="text"]{width:100%!important;min-width:0!important;max-width:100%!important}.agendaIndividualTemplateBound .agendaTemplateMappingPanel{grid-column:1/-1;width:100%;min-width:0;max-width:100%;overflow:hidden}.agendaIndividualTemplateBound .agendaTemplateVariableRow{grid-template-columns:58px minmax(0,1.2fr) minmax(0,1fr)}.agendaIndividualTemplateBound .agendaTemplatePreview{min-width:0}.agendaIndividualTemplateBound .agendaTemplatePreview pre{max-width:100%;overflow-wrap:anywhere}.agendaIndividualLegacyMarketingAck,.agendaIndividualLegacyHelper{display:none!important}\\nbody .a2 .repeat.rem{min-width:0;max-width:100%;overflow:hidden;grid-template-columns:minmax(0,1fr) minmax(0,.72fr) minmax(0,1fr) 30px}body .a2 .repeat.rem>*{min-width:0;max-width:100%}body .a2 .repeat.rem .field,body .a2 .repeat.rem label,body .a2 .repeat.rem div{min-width:0;max-width:100%}body .a2 .repeat.rem select{width:100%!important;min-width:0!important;max-width:100%!important}\\n`;',
  '  codigo = codigo.slice(0, indiceFimCss) + estilosIndividuais + codigo.slice(indiceFimCss);',
].join("\n");

codigo = codigo.slice(0, inicio) + novoBloco + codigo.slice(fim);

const alvoRender = `            flows: loaded.fluxos,
            saved: salvo,`;
const renderCompatível = `            flows: loaded.fluxos,
            variables: Array.isArray((loaded as any).variables)
              ? (loaded as any).variables
              : [],
            saved: salvo,
            onOpenVariables: () => {},`;

if (!codigo.includes(alvoRender)) {
  throw new Error("Não foi possível localizar a chamada do painel do lembrete individual.");
}
codigo = codigo.replace(alvoRender, renderCompatível);

const inicioAplicacao = codigo.indexOf('  const ancoraAplicacao = `');
const fimAplicacao = codigo.indexOf("\n\n  fs.writeFileSync", inicioAplicacao);

if (inicioAplicacao < 0 || fimAplicacao < 0) {
  throw new Error("Não foi possível localizar o bloco antigo de observação dos lembretes.");
}

const novoBlocoAplicacao = [
  '  const inicioApply = codigo.indexOf("    const apply = () => {");',
  '  const fimApply = codigo.indexOf("\\n    };\\n    const schedule = () => {", inicioApply);',
  '  if (inicioApply < 0 || fimApply < 0) {',
  '    throw new Error("Não foi possível localizar a rotina de aplicação do enhancer.");',
  '  }',
  '  const observacaoIndividual = `\\n      shell.querySelectorAll<HTMLElement>(".a2 .drawer .repeat.rem").forEach((row) => {\\n        void bindIndividualReminder(row);\\n      });`;',
  '  codigo = codigo.slice(0, fimApply) + observacaoIndividual + codigo.slice(fimApply);',
].join("\n");

codigo =
  codigo.slice(0, inicioAplicacao) +
  novoBlocoAplicacao +
  codigo.slice(fimAplicacao);

fs.writeFileSync(arquivo, codigo, "utf8");
console.log("Aplicador do mapeamento individual preparado para os estilos, variáveis e observadores atuais.");
