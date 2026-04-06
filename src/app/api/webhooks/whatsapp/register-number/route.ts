import { NextResponse } from "next/server";

async function registerNumber() {
  const phoneNumberId = "1121455171042033";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const pin = process.env.WHATSAPP_PHONE_PIN;

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "WHATSAPP_ACCESS_TOKEN não definido no .env.local",
      },
      { status: 500 }
    );
  }

  if (!pin) {
    return NextResponse.json(
      {
        ok: false,
        error: "WHATSAPP_PHONE_PIN não definido no .env.local",
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/register`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          pin,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("[REGISTER NUMBER] Erro da Meta:", data);

      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao registrar número na Meta",
          meta_response: data,
        },
        { status: response.status }
      );
    }

    console.log("[REGISTER NUMBER] Sucesso:", data);

    return NextResponse.json({
      ok: true,
      message: "Número registrado com sucesso na Meta",
      meta_response: data,
    });
  } catch (error) {
    console.error("[REGISTER NUMBER] Erro interno:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Erro interno ao tentar registrar o número",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return registerNumber();
}

export async function POST() {
  return registerNumber();
}