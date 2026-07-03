const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const argumentos = process.argv.slice(2);
const confirmar = argumentos.includes("--confirmar");
const conversaIds = argumentos.filter(
  (item) => item !== "--confirmar" && !item.startsWith("--url=")
);
const urlArgumento = argumentos
  .find((item) => item.startsWith("--url="))
  ?.slice("--url=".length);
const baseUrl = String(
  urlArgumento || process.env.NEXT_PUBLIC_SITE_URL || ""
).replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;

if (!confirmar || conversaIds.length === 0 || !baseUrl || !secret) {
  console.error(
    [
      "Uso:",
      "node scripts/recuperar-fluxos-conversas.cjs --confirmar UUID_1 UUID_2",
      "",
      "Também é possível informar --url=https://seu-crm.com.",
      "CRON_SECRET e NEXT_PUBLIC_SITE_URL precisam estar configurados.",
    ].join("\n")
  );
  process.exit(1);
}

fetch(`${baseUrl}/api/internal/recuperar-fluxos-conversas`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    conversa_ids: conversaIds,
    confirmar: true,
  }),
})
  .then(async (response) => {
    const resultado = await response.json().catch(() => ({}));
    console.log(JSON.stringify(resultado, null, 2));

    if (!response.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error("Erro ao chamar a recuperação:", error);
    process.exitCode = 1;
  });
