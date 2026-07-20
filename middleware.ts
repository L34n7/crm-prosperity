import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/api/mensagens") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/mensagens-exibicao";

    return NextResponse.rewrite(url);
  }

  if (pathname === "/conversas") {
    const url = request.nextUrl.clone();
    url.pathname = "/conversas-aviso";

    return NextResponse.rewrite(url);
  }

  if (pathname === "/" || pathname === "/sobre") {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/api/mensagens",
    "/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
