import fs from "node:fs";

const caminho = "src/app/(private)/disparos-whatsapp/page.tsx";
let conteudo = fs.readFileSync(caminho, "utf8");
const campo = "  telefone_revisar?: boolean;";
const marcador = `  // CRM_PHONE_REVIEW_DISPATCH_V1\n${campo}\n`;
const ocorrencias = conteudo.split(campo).length - 1;

if (ocorrencias > 1 && conteudo.includes(marcador)) {
  conteudo = conteudo.replace(marcador, "");
  fs.writeFileSync(caminho, conteudo, "utf8");
  console.log("Campo duplicado de revisao de telefone removido.");
} else {
  console.log("Campo de revisao de telefone sem duplicidade.");
}
