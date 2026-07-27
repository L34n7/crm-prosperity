import { NextResponse } from "next/server";

const CHAVE = "7f3c91d2";
const ARQUIVOS: Record<string, string> = {
  page: "https://raw.githubusercontent.com/L34n7/crm-prosperity/main/src/app/(private)/conversas/page.tsx",
  css: "https://raw.githubusercontent.com/L34n7/crm-prosperity/main/src/app/(private)/conversas/conversas.module.css",
  layout: "https://raw.githubusercontent.com/L34n7/crm-prosperity/main/src/app/(private)/conversas/layout.tsx",
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("k") !== CHAVE) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origem = ARQUIVOS[searchParams.get("file") || ""];
  if (!origem) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const response = await fetch(origem, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Falha ao carregar fonte: ${response.status}` },
      { status: 502 }
    );
  }

  return new Response(await response.text(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
