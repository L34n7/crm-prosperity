import { randomBytes } from "crypto";

export function slugifyRastreamento(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizarCodigoCampanha(valor: string) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function gerarCodigoCampanha(nome: string) {
  const base =
    normalizarCodigoCampanha(nome)
      .split("-")
      .filter(Boolean)
      .map((parte) => parte.slice(0, 4))
      .join("-")
      .slice(0, 24) || "CAMPANHA";

  return `${base}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export function gerarSlugLink(nome: string) {
  const base = slugifyRastreamento(nome) || "campanha";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

export function somenteDigitos(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

export function getPublicAppUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");
}
