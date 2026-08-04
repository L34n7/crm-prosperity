import fs from "node:fs";

const pagePath = "src/app/(private)/agendas/page.tsx";
const marker = "CRM_AGENDA_PREMIUM_REMINDER_INTERVALS_V2";
let page = fs.readFileSync(pagePath, "utf8");

if (!page.includes(marker)) {
  const importAnchor = "const css=`";
  if (!page.includes(importAnchor)) {
    throw new Error("Não foi possível localizar o início dos estilos da página de agendas.");
  }

  page = page.replace(
    importAnchor,
    `import AgendaPremiumRuntimeEnhancer from "./AgendaPremiumRuntimeEnhancer";\n\n// ${marker}\n${importAnchor}`
  );

  const exportPattern = /export default function AgendasPage\(\)\{return <Suspense fallback=\{<div>Carregando\.\.\.<\/div>\}><Page\/><\/Suspense>\}/;
  if (!exportPattern.test(page)) {
    throw new Error("Não foi possível localizar a exportação da página de agendas.");
  }

  page = page.replace(
    exportPattern,
    'export default function AgendasPage(){return <div className="agendaTemplateShell"><Suspense fallback={<div>Carregando...</div>}><Page/></Suspense><AgendaPremiumRuntimeEnhancer/></div>}'
  );

  fs.writeFileSync(pagePath, page, "utf8");
  console.log("Mapeamento dos lembretes montado e intervalos premium aplicados.");
} else {
  console.log("Ajuste premium dos lembretes e intervalos já aplicado.");
}
