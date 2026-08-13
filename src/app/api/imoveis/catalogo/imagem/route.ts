import { NextResponse } from "next/server";
import { obterAcessoImoveis } from "@/lib/imoveis/acesso";
import { normalizarUrlHttp } from "@/lib/imoveis/webhook";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

type CatalogoRow = {
  origem_tipo: "crm" | "externo";
  origem_id: string;
  codigo: string | null;
};

type ImovelCrmRow = {
  fotos: unknown[] | null;
};

type ImovelExternoRow = {
  imagem_url: string | null;
  imagem_urls: unknown[] | null;
};

function inteiroSeguro(valor: string | null) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 && numero < 50 ? numero : null;
}

function normalizarImagens(valor: unknown, capa?: unknown) {
  const itens = Array.isArray(valor) ? valor : [];
  const urls = itens
    .map((foto) => {
      if (typeof foto === "string") return normalizarUrlHttp(foto);
      if (!foto || typeof foto !== "object") return null;
      const item = foto as Record<string, unknown>;
      return normalizarUrlHttp(item.url ?? item.src ?? item.original);
    })
    .filter((url): url is string => Boolean(url));
  const capaNormalizada = normalizarUrlHttp(capa);

  return Array.from(
    new Set([...(capaNormalizada ? [capaNormalizada] : []), ...urls]),
  ).slice(0, 50);
}

function hostPermitido(url: URL) {
  if (url.protocol !== "https:") return false;

  const hosts = new Set(["storage.googleapis.com"]);
  for (const candidato of [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  ]) {
    if (!candidato) continue;
    try {
      hosts.add(new URL(candidato).hostname.toLowerCase());
    } catch {
      // Variável inválida não deve ampliar a lista de hosts permitidos.
    }
  }

  return hosts.has(url.hostname.toLowerCase());
}

function extensaoPorContentType(contentType: string) {
  const mapa: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return mapa[contentType] ?? "jpg";
}

function nomeSeguro(valor: string | null) {
  const texto = String(valor || "imovel")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return texto || "imovel";
}

export async function GET(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.visualizar");
  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const catalogoId = String(searchParams.get("imovel") ?? "").trim();
  const indice = inteiroSeguro(searchParams.get("indice"));

  if (!catalogoId || indice === null) {
    return NextResponse.json(
      { ok: false, error: "Imagem do imóvel não informada corretamente." },
      { status: 400 },
    );
  }

  const empresaId = acesso.usuario.empresa_id;

  try {
    const { data: catalogo, error: catalogoError } = await supabase
      .from("catalogo_imoveis_global")
      .select("origem_tipo,origem_id,codigo")
      .eq("empresa_id", empresaId)
      .eq("catalogo_id", catalogoId)
      .maybeSingle<CatalogoRow>();

    if (catalogoError) {
      return NextResponse.json(
        { ok: false, error: catalogoError.message },
        { status: 500 },
      );
    }
    if (!catalogo) {
      return NextResponse.json(
        { ok: false, error: "Imóvel não encontrado no catálogo." },
        { status: 404 },
      );
    }

    let fotos: string[] = [];

    if (catalogo.origem_tipo === "crm") {
      const { data, error } = await supabase
        .from("imoveis")
        .select("fotos")
        .eq("empresa_id", empresaId)
        .eq("id", catalogo.origem_id)
        .maybeSingle<ImovelCrmRow>();

      if (error) throw error;
      fotos = normalizarImagens(data?.fotos);
    } else {
      const { data, error } = await supabase
        .from("imoveis_externos")
        .select("imagem_url,imagem_urls")
        .eq("empresa_id", empresaId)
        .eq("id", catalogo.origem_id)
        .maybeSingle<ImovelExternoRow>();

      if (error) throw error;
      fotos = normalizarImagens(data?.imagem_urls, data?.imagem_url);
    }

    const origem = fotos[indice];
    if (!origem) {
      return NextResponse.json(
        { ok: false, error: "Imagem não encontrada para este imóvel." },
        { status: 404 },
      );
    }

    const url = new URL(origem);
    if (!hostPermitido(url)) {
      return NextResponse.json(
        { ok: false, error: "Origem da imagem não permitida para download." },
        { status: 422 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let remoto: Response;
    try {
      remoto = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!remoto.ok || !remoto.body) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível baixar a imagem na origem." },
        { status: 502 },
      );
    }

    const contentType = String(remoto.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();

    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "O arquivo recebido não é uma imagem válida." },
        { status: 502 },
      );
    }

    const extensao = extensaoPorContentType(contentType);
    const nome = `${nomeSeguro(catalogo.codigo)}-foto-${indice + 1}.${extensao}`;

    return new Response(remoto.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao baixar a imagem do imóvel.",
      },
      { status: 500 },
    );
  }
}
