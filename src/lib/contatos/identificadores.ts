/** Identificadores opcionais de contato (pelo menos um obrigatório). */
export function normalizarEmailContato(valor: unknown): string | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  return texto || null;
}

export function emailContatoValido(email: string): boolean {
  return email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function possuiIdentificadorContato(telefone: string | null | undefined, email: string | null | undefined) {
  return Boolean(telefone?.trim() || email?.trim());
}
