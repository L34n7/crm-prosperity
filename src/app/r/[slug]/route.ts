import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CampanhaLink = {
  id: string;
  nome: string;
  codigo: string;
  numero_whatsapp: string;
  mensagem_inicial: string;
  origem_id: string;
  status: string;
};

function obterCampanha(
  relacao: CampanhaLink | CampanhaLink[] | null
) {
  return Array.isArray(relacao) ? relacao[0] || null : relacao;
}

function identificarDispositivo(userAgent: string) {
  const valor = userAgent.toLowerCase();

  if (/tablet|ipad/.test(valor)) return "tablet";
  if (/mobile|android|iphone/.test(valor)) return "mobile";
  return "desktop";
}

function obterIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function gerarIpHash(ip: string | null) {
  if (!ip) return null;

  const salt =
    process.env.RASTREAMENTO_IP_HASH_SALT ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "crm-prosperity";

  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const supabase = getSupabaseAdmin();
  const { data: link, error } = await supabase
    .from("rastreamento_links")
    .select(`
      id,
      empresa_id,
      status,
      rastreamento_campanhas!inner (
        id,
        nome,
        codigo,
        numero_whatsapp,
        mensagem_inicial,
        origem_id,
        status
      )
    `)
    .ilike("slug", slug)
    .eq("status", "ativo")
    .eq("rastreamento_campanhas.status", "ativo")
    .maybeSingle();

  const campanha = obterCampanha(link?.rastreamento_campanhas || null);

  if (error || !link || !campanha) {
    return NextResponse.json(
      { ok: false, error: "Link rastreavel nao encontrado ou inativo." },
      { status: 404 }
    );
  }

  const trackingToken = randomUUID();
  const userAgent = request.headers.get("user-agent") || "";
  const { error: cliqueError } = await supabase
    .from("rastreamento_cliques")
    .insert({
      empresa_id: link.empresa_id,
      origem_id: campanha.origem_id,
      campanha_id: campanha.id,
      link_id: link.id,
      tracking_token: trackingToken,
      ip_hash: gerarIpHash(obterIp(request)),
      user_agent: userAgent.slice(0, 500) || null,
      referer: request.headers.get("referer")?.slice(0, 500) || null,
      dispositivo: identificarDispositivo(userAgent),
    });

  if (cliqueError) {
    console.error("[RASTREAMENTO] Erro ao registrar clique:", cliqueError);
  }

  const mensagem = [
    campanha.mensagem_inicial,
    `Codigo: ${campanha.codigo}`,
    `[trk:${trackingToken}]`,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappUrl = `https://wa.me/${campanha.numero_whatsapp}?text=${encodeURIComponent(
    mensagem
  )}`;

  return NextResponse.redirect(whatsappUrl, 302);
}
