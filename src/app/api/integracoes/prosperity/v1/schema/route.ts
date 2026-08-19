import { NextRequest, NextResponse } from "next/server";
import { autenticarProsperityApi } from "@/lib/integracoes/prosperity-external-api";
import { CRM_PROSPERITY_SISTEMA_MAPEADO } from "@/lib/integracoes/sistemas-mapeados";

export async function GET(request: NextRequest) {
  const auth = await autenticarProsperityApi(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    sistema: CRM_PROSPERITY_SISTEMA_MAPEADO,
  });
}
