export function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeWhatsAppPhone(phone: string | null | undefined) {
  let digits = onlyDigits(phone);

  if (!digits) return "";

  // Remove zeros à esquerda
  digits = digits.replace(/^0+/, "");

  return digits;
}

export function normalizeContactName(name: string | null | undefined) {
  return (name ?? "").trim();
}