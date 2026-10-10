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
