import { createDecipheriv, createHash } from "node:crypto";

function chaveCredenciais() {
  const segredo =
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!segredo) {
    throw new Error(
      "Configure CREDENTIALS_ENCRYPTION_KEY para usar credenciais externas.",
    );
  }

  return createHash("sha256").update(segredo).digest();
}

export function descriptografarTokenIntegracao(valor: string | null | undefined) {
  const conteudo = String(valor || "").trim();
  if (!conteudo) return "";

  const partes = conteudo.split(":");
  if (partes.length !== 4 || partes[0] !== "v1") {
    throw new Error("Credencial externa armazenada em formato inválido.");
  }

  const [, ivBase64, tagBase64, dadosBase64] = partes;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    chaveCredenciais(),
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dadosBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
