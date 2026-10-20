
import { NextRequest, NextResponse } from "next/server";
import { obterBrandingPorHost } from "@/lib/white-label/branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const branding = await obterBrandingPorHost(host);

  return NextResponse.json(
    { ok: true, branding },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    }
  );
}
