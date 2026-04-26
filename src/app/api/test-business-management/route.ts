import { NextResponse } from "next/server";

export async function GET() {
  try {
    const accessToken = process.env.META_TEST_ACCESS_TOKEN;

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "META_TEST_ACCESS_TOKEN não configurado." },
        { status: 500 }
      );
    }

    const url = `https://graph.facebook.com/v22.0/me/businesses?access_token=${accessToken}`;

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    const data = await response.json();

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}