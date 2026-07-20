import { NextResponse } from "next/server";
import { GET as buscarMensagens } from "@/app/api/mensagens/route";

const TEXTO_MENSAGEM_UNSUPPORTED =
  "⚠️ Mensagem não suportada pela API do WhatsApp";

type MensagemApi = {
  tipo_mensagem?: string | null;
  conteudo?: string | null;
  [key: string]: unknown;
};

type PayloadMensagens = {
  mensagens?: MensagemApi[];
  [key: string]: unknown;
};

function normalizarMensagemParaExibicao(mensagem: MensagemApi): MensagemApi {
  if (mensagem.tipo_mensagem !== "unsupported") {
    return mensagem;
  }

  return {
    ...mensagem,
    conteudo: TEXTO_MENSAGEM_UNSUPPORTED,
    tipo_mensagem: "unsupported_compacto",
  };
}

export async function GET(request: Request) {
  const response = await buscarMensagens(request);
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.includes("application/json")) {
    return response;
  }

  const payload = (await response.json()) as PayloadMensagens;

  if (!Array.isArray(payload.mensagens)) {
    return NextResponse.json(payload, {
      status: response.status,
      headers: response.headers,
    });
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return NextResponse.json(
    {
      ...payload,
      mensagens: payload.mensagens.map(normalizarMensagemParaExibicao),
    },
    {
      status: response.status,
      headers,
    }
  );
}
