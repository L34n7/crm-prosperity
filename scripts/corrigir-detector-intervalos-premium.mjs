import fs from "node:fs";

const file = "src/app/(private)/agendas/AgendaPremiumRuntimeEnhancer.tsx";
let source = fs.readFileSync(file, "utf8");

const pattern = /function findDayCard\(title: HTMLElement\) \{[\s\S]*?\n\}\n\nfunction isIntervalRow/;
const replacement = `function findDayCard(title: HTMLElement) {
  let current: HTMLElement | null = title.parentElement;
  while (current) {
    const hasAdd = Boolean(findAddButton(current));
    const hasAvailabilityRow = Boolean(current.querySelector(\".av\"));
    if (hasAdd && hasAvailabilityRow) return current;
    current = current.parentElement;
  }
  return null;
}

function isIntervalRow`;

if (!pattern.test(source)) {
  throw new Error("Não foi possível corrigir a identificação dos cards de intervalo.");
}

source = source.replace(pattern, replacement);
fs.writeFileSync(file, source, "utf8");
console.log("Detecção estrutural dos intervalos premium corrigida.");
