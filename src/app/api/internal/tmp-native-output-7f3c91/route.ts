import { NextResponse } from "next/server";

const CHAVE = "7f3c91-native";
const PATCHER =
  "https://gypbaslogvldndeyjmno.supabase.co/functions/v1/tmp-native-patcher-7f3c91";
const STATUS =
  "https://gypbaslogvldndeyjmno.supabase.co/functions/v1/tmp-github-actions-status-7f3c91";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("k") !== CHAVE) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = searchParams.get("file") || "";
  const origem =
    file === "status"
      ? `${STATUS}?k=7f3c91-status`
      : ["page", "layout", "alignment"].includes(file)
        ? `${PATCHER}?file=${encodeURIComponent(file)}&k=${encodeURIComponent(CHAVE)}`
        : "";

  if (!origem) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }

  const response = await fetch(origem, { cache: "no-store" });

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "content-type":
        file === "status"
          ? "application/json; charset=utf-8"
          : "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
