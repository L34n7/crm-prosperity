import fs from "node:fs";

const file = "src/app/(private)/agendas/AgendaPremiumRuntimeEnhancer.tsx";
const marker = "CRM_AGENDA_AVAILABILITY_STRUCTURAL_LAYOUT_V5";
let source = fs.readFileSync(file, "utf8");

if (!source.includes(marker)) {
  const intervalBlockPattern =
    /function findAddButton\(root: ParentNode\) \{[\s\S]*?\n\}\n\nfunction clearOldDecorations/;

  const intervalBlockReplacement = `function decorateIntervals(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".avDay").forEach((dayCard) => {
    const breaks = dayCard.querySelector<HTMLElement>(".avBreaks");
    if (!breaks) return;

    dayCard.classList.add("agendaPremiumDayCard");

    const header = breaks.querySelector<HTMLElement>(".avBreakHead");
    const title = header?.querySelector<HTMLElement>("span");
    const addButton = header?.querySelector<HTMLButtonElement>(".avAddBreak");

    header?.classList.add("agendaPremiumIntervalHeader");
    title?.classList.add("agendaPremiumIntervalTitle");
    addButton?.classList.add("agendaPremiumIntervalAdd");

    breaks
      .querySelectorAll<HTMLElement>(".avBreakEmpty")
      .forEach((empty) => empty.classList.add("agendaPremiumIntervalEmpty"));

    breaks.querySelectorAll<HTMLElement>(".avBreak").forEach((row) => {
      row.classList.add("agendaPremiumIntervalRow");
      row
        .querySelector<HTMLButtonElement>('button[aria-label="Remover intervalo"],button.remove')
        ?.classList.add("agendaPremiumIntervalRemove");
    });
  });
}

function clearOldDecorations`;

  if (!intervalBlockPattern.test(source)) {
    throw new Error(
      "Não foi possível substituir o detector antigo dos intervalos da disponibilidade semanal."
    );
  }

  source = source.replace(intervalBlockPattern, intervalBlockReplacement);

  const cssEnd = "\n`;\n\nfunction normalize";
  if (!source.includes(cssEnd)) {
    throw new Error(
      "Não foi possível localizar o final dos estilos premium da agenda."
    );
  }

  const layoutCss = `

/* ${marker} */
body .a2 .availability>.avDay.agendaPremiumDayCard{
  display:grid!important;
  grid-template-columns:minmax(0,1fr)!important;
  grid-auto-flow:row!important;
  align-items:stretch!important;
  gap:0!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.av{
  grid-column:1/-1!important;
  grid-row:auto!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  margin:0!important;
  position:static!important;
  inset:auto!important;
  transform:none!important;
  float:none!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks{
  display:grid!important;
  grid-template-columns:minmax(0,1fr)!important;
  grid-auto-flow:row!important;
  align-items:stretch!important;
  gap:8px!important;
  grid-column:1/-1!important;
  grid-row:auto!important;
  width:100%!important;
  min-width:0!important;
  max-width:100%!important;
  margin:0!important;
  padding:10px 2px 0!important;
  border-top:0!important;
  position:static!important;
  inset:auto!important;
  transform:none!important;
  float:none!important;
  clear:both!important;
  overflow:visible!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks>.agendaPremiumIntervalHeader,
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks>.agendaPremiumIntervalRow,
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks>.agendaPremiumIntervalEmpty{
  grid-column:1/-1!important;
  grid-row:auto!important;
  position:static!important;
  inset:auto!important;
  transform:none!important;
  float:none!important;
  clear:both!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks>.agendaPremiumIntervalHeader{
  margin:0!important;
}
body .a2 .availability>.avDay.agendaPremiumDayCard>.avBreaks>.agendaPremiumIntervalRow{
  margin:0!important;
}
`;

  source = source.replace(cssEnd, `${layoutCss}${cssEnd}`);
  fs.writeFileSync(file, source, "utf8");
  console.log(
    "Disponibilidade semanal corrigida com detecção estrutural e layout em linhas independentes."
  );
} else {
  console.log("Layout estrutural da disponibilidade semanal já corrigido.");
}
