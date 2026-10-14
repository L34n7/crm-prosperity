export function isValidBuyerEmail(value: string) {
  const email = value.trim();
  if (email.length > 254) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (domain.split(".").some((label) => label.length > 63)) return false;
  return /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email);
}

export function normalizeBuyerPhone(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidBuyerPhone(value: string) {
  const telefone = normalizeBuyerPhone(value);
  return (
    (telefone.length === 10 || telefone.length === 11) &&
    !/^(\d)\1+$/.test(telefone)
  );
}

const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "yahoo.com",
  "yahoo.com.br",
  "live.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "proton.me",
  "protonmail.com",
] as const;

const EXPLICIT_EMAIL_DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.com.br": "gmail.com",
  "hotnail.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "icloud.co": "icloud.com",
  "iclod.com": "icloud.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.com.b": "yahoo.com.br",
};

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

export function getBuyerEmailSuggestion(value: string) {
  const email = String(value || "").trim().toLowerCase();
  if (!isValidBuyerEmail(email)) return null;

  const separator = email.lastIndexOf("@");
  if (separator <= 0) return null;

  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);

  if ((COMMON_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return null;
  }

  const explicit = EXPLICIT_EMAIL_DOMAIN_TYPOS[domain];
  if (explicit) {
    return `${local}@${explicit}`;
  }

  let bestDomain: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = levenshtein(domain, candidate);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestDomain = candidate;
    }
  }

  if (!bestDomain) return null;

  const tld = domain.split(".").slice(1).join(".");
  const bestTld = bestDomain.split(".").slice(1).join(".");
  const sameTld = Boolean(tld) && tld === bestTld;
  const shouldSuggest =
    bestDistance === 1 ||
    (bestDistance === 2 && sameTld && domain.length >= 7);

  return shouldSuggest ? `${local}@${bestDomain}` : null;
}

