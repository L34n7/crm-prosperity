import { NextResponse } from "next/server";

async function checkPhone() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_ACCESS_TOKEN não definido" },
      { status: 500 }
    );
  }

  if (!wabaId) {
    return NextResponse.json(
      { ok: false, error: "WHATSAPP_WABA_ID não definido" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/${wabaId}/phone_numbers`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const data = await response.json();

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Erro ao consultar números da WABA" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return checkPhone();
}