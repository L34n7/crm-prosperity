import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.APP_CRYPTO_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "APP_CRYPTO_SECRET não configurado. Informe uma chave com pelo menos 32 caracteres."
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptText(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptText(value: string) {
  const key = getEncryptionKey();

  const [ivBase64, authTagBase64, encryptedBase64] = value.split(".");

  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Texto criptografado inválido.");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(authTagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}