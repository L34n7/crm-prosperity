const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.APP_CRYPTO_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "APP_CRYPTO_SECRET não configurado. Informe a mesma chave usada na Vercel."
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function encryptText(value) {
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

const pin = process.argv[2];

if (!pin || !/^\d{6}$/.test(pin)) {
  console.error("Informe o PIN de 6 dígitos. Exemplo:");
  console.error("node scripts/encrypt-pin.js 123456");
  process.exit(1);
}

const encrypted = encryptText(pin);

console.log(encrypted);