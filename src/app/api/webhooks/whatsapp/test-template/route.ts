import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const numero = req.nextUrl.searchParams.get("numero");

    if (!numero) {
      return NextResponse.json(
        { ok: false, error: "Número é obrigatório" },
        { status: 400 }
      );
    }

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return NextResponse.json(
        { ok: false, error: "WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurado" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "template",
          template: {
            name: "crm_prosperity",
            language: {
              code: "pt_BR",
            },
          },
        }),
      }
    );

    const data = await response.json();

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message ?? "Erro interno" },
      { status: 500 }
    );
  }
}