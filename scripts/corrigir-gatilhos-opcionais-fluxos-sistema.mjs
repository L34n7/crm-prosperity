import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const relativePath = "src/app/api/automacoes/route.ts";
const absolutePath = path.join(root, relativePath);
let content = fs.readFileSync(absolutePath, "utf8");

const marker = "CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_EDIT_VALIDATION_V1";

if (!content.includes(marker)) {
  const current = `    if (statusFinal === "ativo" && !fluxoPadraoFinal) {
      const possuiGatilhoAtivo = await fluxoPossuiGatilhoAtivo({
        empresaId: usuario.empresa_id,
        fluxoId: id,
      });

      if (!possuiGatilhoAtivo) {
        return respostaFluxoAtivoSemGatilho();
      }
    }`;

  const replacement = `    const configuracaoSistemaAtual = configuracaoComoObjeto(
      fluxoAntes.configuracao_json
    );
    const fluxoSistemaCalendario =
      configuracaoMarcada(
        configuracaoSistemaAtual.fluxo_sistema_calendario
      ) &&
      configuracaoMarcada(configuracaoSistemaAtual.protegido_sistema);

    // CRM_SYSTEM_FLOW_OPTIONAL_TRIGGER_EDIT_VALIDATION_V1
    if (
      statusFinal === "ativo" &&
      !fluxoPadraoFinal &&
      !fluxoSistemaCalendario
    ) {
      const possuiGatilhoAtivo = await fluxoPossuiGatilhoAtivo({
        empresaId: usuario.empresa_id,
        fluxoId: id,
      });

      if (!possuiGatilhoAtivo) {
        return respostaFluxoAtivoSemGatilho();
      }
    }`;

  if (!content.includes(current)) {
    throw new Error(
      "Não foi possível localizar a validação de gatilho ativo na edição do fluxo."
    );
  }

  content = content.replace(current, replacement);
  fs.writeFileSync(absolutePath, content, "utf8");
}

console.log(
  "Edição dos fluxos fixos do sistema liberada sem gatilho ativo."
);
