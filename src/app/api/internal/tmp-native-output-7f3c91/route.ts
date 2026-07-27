import { NextResponse } from "next/server";

const CHAVE = "7f3c91-native";
const ORIGEM =
  "https://gypbaslogvldndeyjmno.supabase.co/functions/v1/tmp-native-patcher-7f3c91";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("k") !== CHAVE) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = searchParams.get("file") || "";
  if (!["page", "layout", "alignment"].includes(file)) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const response = await fetch(
    `${ORIGEM}?file=${encodeURIComponent(file)}&k=${encodeURIComponent(CHAVE)}`,
    { cache: "no-store" }
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
