import { createElement, Fragment } from "react";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { REDES_EMAIL, type RedeSocialEmail } from "@/lib/email-marketing/redes-sociais";

export const runtime = "nodejs";

/** PNG de ícones para Gmail e Outlook. Não acessa dados de empresas. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ rede: string }> }) {
  const { rede } = await params;
  if (!REDES_EMAIL.includes(rede as RedeSocialEmail)) {
    return new Response("Rede social inválida", { status: 404 });
  }
  const solicitada = request.nextUrl.searchParams.get("cor") || "ffffff";
  const cor = /^(#)?[0-9a-f]{6}$/i.test(solicitada) ? "#" + solicitada.replace("#", "") : "#ffffff";
  const path = (d: string, fill = cor) => createElement("path", { d, fill });
  const icon = rede === "facebook"
    ? path("M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.5-3.9 3.78-3.9 1.09 0 2.23.2 2.23.2v2.46H15.2c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12Z")
    : rede === "instagram"
      ? createElement(Fragment, null,
          createElement("rect", { x: 2.5, y: 2.5, width: 19, height: 19, rx: 5.5, fill: "none", stroke: cor, strokeWidth: 2.2 }),
          createElement("circle", { cx: 12, cy: 12, r: 4.25, fill: "none", stroke: cor, strokeWidth: 2.2 }),
          createElement("circle", { cx: 17.7, cy: 6.7, r: 1.35, fill: cor }))
      : createElement(Fragment, null,
          createElement("path", { d: "M20.7 11.8a8.7 8.7 0 0 1-12.9 7.6L3.4 20.6l1.2-4.2A8.7 8.7 0 1 1 20.7 11.8Z", stroke: cor, strokeWidth: 1.85, strokeLinejoin: "round", fill: "none" }),
          path("M8.3 7.8c-.35-.2-.75.05-1 .55-.5 1.1-.24 2.38.58 3.53 1.12 1.55 2.94 2.92 4.55 3.5 1.07.39 2.16.23 2.9-.43.4-.36.61-.93.49-1.18l-2.13-.97c-.23-.1-.4-.08-.62.2l-.6.72c-.2.2-.39.21-.68.07-1.22-.6-2.28-1.56-2.88-2.75-.14-.27-.02-.42.17-.58l.45-.52c.14-.2.13-.37.06-.57L8.3 7.8Z"));
  const img = createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } },
    createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", width: "56", height: "56" }, icon));
  return new ImageResponse(img, { width: 64, height: 64, headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800" } });
}
