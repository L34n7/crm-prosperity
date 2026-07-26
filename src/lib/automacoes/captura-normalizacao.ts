export type PrecisaoDataCapturada = "completa" | "dia_mes" | "mes_ano";

export type FormatoDataCapturada =
  | "DD/MM/AAAA"
  | "DD/MM/AA"
  | "AAAA-MM-DD"
  | "DD/MM"
  | "MM/AAAA"
  | "MM/AA";

export type ResultadoValidacaoCaptura = {
  valido: boolean;
  valorLimpo: string;
  valorFormatado: string;
  valorNormalizado: string;
  precisaoData: PrecisaoDataCapturada | null;
  formatoData: FormatoDataCapturada | null;
};

function somenteDigitos(valor: string) {
  return String(valor || "").replace(/\D/g, "");
}

function resultadoInvalido(
  valorLimpo = "",
  valorFormatado = "",
  valorNormalizado = ""
): ResultadoValidacaoCaptura {
  return {
    valido: false,
    valorLimpo,
    valorFormatado,
    valorNormalizado,
    precisaoData: null,
    formatoData: null,
  };
}

function resultadoValido(params: {
  valorLimpo: string;
  valorFormatado?: string;
  valorNormalizado?: string;
  precisaoData?: PrecisaoDataCapturada | null;
  formatoData?: FormatoDataCapturada | null;
}): ResultadoValidacaoCaptura {
  return {
    valido: true,
    valorLimpo: params.valorLimpo,
    valorFormatado: params.valorFormatado ?? params.valorLimpo,
    valorNormalizado: params.valorNormalizado ?? params.valorLimpo,
    precisaoData: params.precisaoData ?? null,
    formatoData: params.formatoData ?? null,
  };
}

export function normalizarTextoCapturado(valor: string) {
  return String(valor || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function normalizarTelefoneCapturado(valor: string) {
  const digitos = somenteDigitos(valor);

  if (
    (digitos.length === 12 || digitos.length === 13) &&
    digitos.startsWith("55")
  ) {
    return digitos.slice(2);
  }

  return digitos;
}

function validarCpf(cpfEntrada: string) {
  const cpf = somenteDigitos(cpfEntrada);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  const calcularDigito = (quantidade: number) => {
    let soma = 0;

    for (let indice = 0; indice < quantidade; indice += 1) {
      soma += Number(cpf[indice]) * (quantidade + 1 - indice);
    }

    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return (
    calcularDigito(9) === Number(cpf[9]) &&
    calcularDigito(10) === Number(cpf[10])
  );
}

function validarCnpj(cnpjEntrada: string) {
  const cnpj = somenteDigitos(cnpjEntrada);

  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = base
      .split("")
      .reduce((total, digito, indice) => total + Number(digito) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = calcularDigito(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );
  const segundo = calcularDigito(
    `${cnpj.slice(0, 12)}${primeiro}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return primeiro === Number(cnpj[12]) && segundo === Number(cnpj[13]);
}

function anoEhBissexto(ano: number) {
  return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
}

function diasNoMes(mes: number, ano?: number) {
  if (mes === 2) {
    return ano === undefined || anoEhBissexto(ano) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function dataValida(dia: number, mes: number, ano?: number) {
  if (!Number.isInteger(dia) || !Number.isInteger(mes)) return false;
  if (mes < 1 || mes > 12 || dia < 1) return false;
  if (ano !== undefined && (!Number.isInteger(ano) || ano < 1)) return false;

  return dia <= diasNoMes(mes, ano);
}

function pad2(valor: number) {
  return String(valor).padStart(2, "0");
}

function expandirAnoAbreviado(ano: number) {
  return 2000 + ano;
}

function validarDataCapturada(valor: string): ResultadoValidacaoCaptura {
  let match = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const ano = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);

    if (!dataValida(dia, mes, ano)) return resultadoInvalido(valor, valor);

    return resultadoValido({
      valorLimpo: valor,
      valorFormatado: valor,
      valorNormalizado: `${String(ano).padStart(4, "0")}-${pad2(mes)}-${pad2(dia)}`,
      precisaoData: "completa",
      formatoData: "AAAA-MM-DD",
    });
  }

  match = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = Number(match[3]);

    if (!dataValida(dia, mes, ano)) return resultadoInvalido(valor, valor);

    return resultadoValido({
      valorLimpo: valor,
      valorFormatado: valor,
      valorNormalizado: `${String(ano).padStart(4, "0")}-${pad2(mes)}-${pad2(dia)}`,
      precisaoData: "completa",
      formatoData: "DD/MM/AAAA",
    });
  }

  match = valor.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);

  if (match) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = expandirAnoAbreviado(Number(match[3]));

    if (!dataValida(dia, mes, ano)) return resultadoInvalido(valor, valor);

    return resultadoValido({
      valorLimpo: valor,
      valorFormatado: valor,
      valorNormalizado: `${ano}-${pad2(mes)}-${pad2(dia)}`,
      precisaoData: "completa",
      formatoData: "DD/MM/AA",
    });
  }

  match = valor.match(/^(\d{2})\/(\d{4})$/);

  if (match) {
    const mes = Number(match[1]);
    const ano = Number(match[2]);

    if (mes < 1 || mes > 12 || ano < 1) return resultadoInvalido(valor, valor);

    return resultadoValido({
      valorLimpo: valor,
      valorFormatado: valor,
      valorNormalizado: `${String(ano).padStart(4, "0")}-${pad2(mes)}`,
      precisaoData: "mes_ano",
      formatoData: "MM/AAAA",
    });
  }

  match = valor.match(/^(\d{2})\/(\d{2})$/);

  if (!match) return resultadoInvalido(valor, valor);

  const primeiro = Number(match[1]);
  const segundo = Number(match[2]);

  if (segundo > 12) {
    const mes = primeiro;
    const ano = expandirAnoAbreviado(segundo);

    if (mes < 1 || mes > 12) return resultadoInvalido(valor, valor);

    return resultadoValido({
      valorLimpo: valor,
      valorFormatado: valor,
      valorNormalizado: `${ano}-${pad2(mes)}`,
      precisaoData: "mes_ano",
      formatoData: "MM/AA",
    });
  }

  const dia = primeiro;
  const mes = segundo;

  if (!dataValida(dia, mes)) return resultadoInvalido(valor, valor);

  return resultadoValido({
    valorLimpo: valor,
    valorFormatado: valor,
    valorNormalizado: `--${pad2(mes)}-${pad2(dia)}`,
    precisaoData: "dia_mes",
    formatoData: "DD/MM",
  });
}

export function validarCaptura(
  tipoOriginal: string,
  valorOriginal: string
): ResultadoValidacaoCaptura {
  const tipo = String(tipoOriginal || "texto").trim().toLowerCase();
  const valor = String(valorOriginal || "").trim();
  const digitos = somenteDigitos(valor);

  if (!valor) return resultadoInvalido();

  if (tipo === "texto") {
    return resultadoValido({
      valorLimpo: valor,
      valorNormalizado: normalizarTextoCapturado(valor),
    });
  }

  if (tipo === "nome") {
    const pareceFrase =
      valor.split(/\s+/).length > 5 ||
      /\b(quero|preciso|boleto|conta|pagamento|segunda via|atendente)\b/i.test(
        valor
      );
    const valido =
      /^[A-Za-zÀ-ÿ'´`^~\s]{2,80}$/.test(valor) &&
      !/\d/.test(valor) &&
      !pareceFrase;

    return valido
      ? resultadoValido({
          valorLimpo: valor.replace(/\s+/g, " "),
          valorNormalizado: normalizarTextoCapturado(valor),
        })
      : resultadoInvalido(valor, valor, normalizarTextoCapturado(valor));
  }

  if (tipo === "cpf") {
    const formatado =
      digitos.length === 11
        ? `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
        : valor;

    return validarCpf(valor)
      ? resultadoValido({
          valorLimpo: digitos,
          valorFormatado: formatado,
          valorNormalizado: digitos,
        })
      : resultadoInvalido(digitos, formatado, digitos);
  }

  if (tipo === "cnpj") {
    const formatado =
      digitos.length === 14
        ? `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
        : valor;

    return validarCnpj(valor)
      ? resultadoValido({
          valorLimpo: digitos,
          valorFormatado: formatado,
          valorNormalizado: digitos,
        })
      : resultadoInvalido(digitos, formatado, digitos);
  }

  if (tipo === "email") {
    const normalizado = valor.replace(/\s+/g, "").toLowerCase();
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);

    return valido
      ? resultadoValido({
          valorLimpo: normalizado,
          valorFormatado: normalizado,
          valorNormalizado: normalizado,
        })
      : resultadoInvalido(normalizado, normalizado, normalizado);
  }

  if (tipo === "telefone") {
    const normalizado = normalizarTelefoneCapturado(valor);
    const valido = normalizado.length >= 10 && normalizado.length <= 11;

    return valido
      ? resultadoValido({
          valorLimpo: digitos,
          valorFormatado: valor,
          valorNormalizado: normalizado,
        })
      : resultadoInvalido(digitos, valor, normalizado);
  }

  if (tipo === "numero") {
    const normalizado = valor.replace(",", ".");
    const valido = /^-?\d+([.,]\d+)?$/.test(valor);

    return valido
      ? resultadoValido({
          valorLimpo: normalizado,
          valorFormatado: valor,
          valorNormalizado: normalizado,
        })
      : resultadoInvalido(normalizado, valor, normalizado);
  }

  if (tipo === "data") return validarDataCapturada(valor);

  if (tipo === "cep") {
    const formatado =
      digitos.length === 8
        ? `${digitos.slice(0, 5)}-${digitos.slice(5)}`
        : valor;

    return digitos.length === 8
      ? resultadoValido({
          valorLimpo: digitos,
          valorFormatado: formatado,
          valorNormalizado: digitos,
        })
      : resultadoInvalido(digitos, formatado, digitos);
  }

  if (tipo === "moeda") {
    const normalizado = valor.replace(/[R$\s.]/g, "").replace(",", ".");
    const numero = Number(normalizado);
    const valido = Number.isFinite(numero) && numero >= 0;

    return valido
      ? resultadoValido({
          valorLimpo: String(numero),
          valorFormatado: valor,
          valorNormalizado: String(numero),
        })
      : resultadoInvalido(normalizado, valor, normalizado);
  }

  return resultadoValido({
    valorLimpo: valor,
    valorNormalizado: normalizarTextoCapturado(valor),
  });
}
