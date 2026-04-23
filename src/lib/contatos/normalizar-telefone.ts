export function normalizarTelefone(telefone: string) {
  let numeros = String(telefone || "").replace(/\D/g, "");

  if (!numeros) return "";

  // Remove prefixo internacional 00
  // Ex.: 005511999998888 -> 5511999998888
  if (numeros.startsWith("00")) {
    numeros = numeros.slice(2);
  }

  return numeros;
}

export function telefoneTemDDI(telefone: string) {
  const numeros = normalizarTelefone(telefone);
  return numeros.length >= 8;
}

export function normalizarTelefoneBrasilParaWhatsApp(telefone: string) {
  let numeros = normalizarTelefone(telefone);

  if (!numeros) return "";

  // Remove código de operadora no padrão 0XX
  // Ex.: 04111999998888 -> 111999998888
  if (numeros.length >= 12 && numeros.startsWith("0")) {
    numeros = numeros.slice(3);
  }

  // Se vier número BR sem DDI
  // 11999998888 -> 5511999998888
  if (!numeros.startsWith("55")) {
    if (numeros.length === 10 || numeros.length === 11) {
      numeros = `55${numeros}`;
    }
  }

  // Se vier BR com 10 dígitos locais (DDD + número antigo), adiciona 9
  // Ex.: 551133445566 -> 5511933445566
  if (numeros.startsWith("55") && numeros.length === 12) {
    const ddi = numeros.slice(0, 2);
    const ddd = numeros.slice(2, 4);
    const numero = numeros.slice(4);
    numeros = `${ddi}${ddd}9${numero}`;
  }

  return numeros;
}

export function formatarTelefoneExibicao(telefone: string) {
  const numeros = normalizarTelefone(telefone);

  if (!numeros) return "";

  // Formatação simples para BR
  if (numeros.startsWith("55")) {
    if (numeros.length === 13) {
      return `+55 (${numeros.slice(2, 4)}) ${numeros.slice(4, 9)}-${numeros.slice(9)}`;
    }

    if (numeros.length === 12) {
      return `+55 (${numeros.slice(2, 4)}) ${numeros.slice(4, 8)}-${numeros.slice(8)}`;
    }
  }

  // Internacional genérico
  return `+${numeros}`;
}