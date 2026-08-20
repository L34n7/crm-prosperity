import "server-only";

type AmbienteFiscal = "homologacao" | "producao";

export type RespostaFocusNfce = Record<string, unknown> & {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  protocolo?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
};

function tokenDoAmbiente(ambiente: AmbienteFiscal) {
  return ambiente === "producao"
    ? process.env.FOCUS_NFE_TOKEN_PRODUCAO || process.env.FOCUS_NFE_TOKEN
    : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO || process.env.FOCUS_NFE_TOKEN;
}

function baseUrl(ambiente: AmbienteFiscal) {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

export function focusNfceConfigurada(ambiente: AmbienteFiscal) {
  return Boolean(tokenDoAmbiente(ambiente));
}

export async function emitirFocusNfce(
  ambiente: AmbienteFiscal,
  referencia: string,
  payload: Record<string, unknown>,
) {
  const token = tokenDoAmbiente(ambiente);
  if (!token) {
    throw new Error(`Token da Focus NFe não configurado para o ambiente de ${ambiente}.`);
  }
  const response = await fetch(
    `${baseUrl(ambiente)}/v2/nfce?ref=${encodeURIComponent(referencia)}&completa=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    },
  );
  const resposta = await response.json().catch(() => ({
    status: "erro",
    mensagem_sefaz: `Resposta fiscal inválida (${response.status}).`,
  })) as RespostaFocusNfce;
  return { ok: response.ok, statusHttp: response.status, resposta };
}

export function formaPagamentoFocus(forma: string) {
  const mapa: Record<string, string> = {
    dinheiro: "01",
    cheque: "02",
    cartao_credito: "03",
    cartao_debito: "04",
    credito_loja: "05",
    vale_alimentacao: "10",
    vale_refeicao: "11",
    vale_presente: "12",
    vale_combustivel: "13",
    boleto: "15",
    pix: "17",
    transferencia: "18",
    outro: "99",
  };
  return mapa[forma] || "99";
}
