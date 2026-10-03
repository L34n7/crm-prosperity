import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookiePendente = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function possuiCookieAuth(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("code-verifier")
    );
}

export async function updateSession(request: NextRequest) {
  // Sem cookie de sessão não há nada para renovar no middleware.
  // As áreas privadas continuam fazendo a validação autoritativa no servidor.
  if (!possuiCookieAuth(request)) {
    return NextResponse.next({ request });
  }

  const cookiesPendentes = new Map<string, CookiePendente>();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Não propagamos cookies enquanto a renovação não tiver sido
          // validada. Isso evita que uma requisição concorrente com refresh
          // token já rotacionado apague a sessão renovada por outra requisição.
          cookiesToSet.forEach(({ name, value, options }) => {
            cookiesPendentes.set(name, { name, value, options });
          });
        },
      },
    }
  );

  try {
    const { error } = await supabase.auth.getUser();

    if (error) {
      const codigo = String(
        (error as { code?: string }).code || error.message || ""
      ).toLowerCase();

      if (
        codigo.includes("refresh_token_not_found") ||
        codigo.includes("invalid refresh token")
      ) {
        console.warn(
          "[AUTH MIDDLEWARE] Refresh concorrente rejeitado; preservando cookies atuais."
        );
      }

      // Não transforma uma falha transitória do Auth em logout. O layout
      // privado / API continua responsável pela autorização efetiva.
      return NextResponse.next({ request });
    }

    if (cookiesPendentes.size === 0) {
      return NextResponse.next({ request });
    }

    // Só depois de getUser() ter sido validado propagamos a rotação para a
    // própria request e para o navegador.
    cookiesPendentes.forEach(({ name, value }) => {
      request.cookies.set(name, value);
    });

    const response = NextResponse.next({ request });

    cookiesPendentes.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  } catch (error) {
    console.warn(
      "[AUTH MIDDLEWARE] Falha transitória ao validar sessão; preservando cookies.",
      error instanceof Error ? error.message : String(error)
    );

    return NextResponse.next({ request });
  }
}
