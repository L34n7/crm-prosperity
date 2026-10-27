import { NextResponse } from "next/server";
import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function descadastrar(token: string) {
  if (!UUID_REGEX.test(token)) {
    return { ok: false as const, status: 404, error: "Link inválido." };
  }

  const { data: destinatario, error } = await supabaseAdmin
    .from("email_campanha_destinatarios")
    .select("id, campanha_id, email, descadastrado_em")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }

  if (!destinatario) {
    return { ok: false as const, status: 404, error: "Link não encontrado." };
  }

  const { data: campanha } = await supabaseAdmin
    .from("email_campanhas")
    .select("id, empresa_id")
    .eq("id", destinatario.campanha_id)
    .maybeSingle();

  if (!campanha) {
    return { ok: false as const, status: 404, error: "Campanha não encontrada." };
  }

  if (!destinatario.descadastrado_em) {
    const agora = new Date().toISOString();

    let consulta = supabaseAdmin
      .from("email_suppressions")
      .select("id")
      .ilike("email", destinatario.email);

    consulta = campanha.empresa_id
      ? consulta.eq("empresa_id", campanha.empresa_id)
      : consulta.is("empresa_id", null);

    const { data: existente } = await consulta.limit(1);

    if (existente?.length) {
      await supabaseAdmin
        .from("email_suppressions")
        .update({
          motivo: "descadastro",
          fonte: "email_marketing",
          metadata_json: {
            campanha_id: campanha.id,
            destinatario_id: destinatario.id,
          },
        })
        .eq("id", existente[0].id);
    } else {
      await supabaseAdmin.from("email_suppressions").insert({
        empresa_id: campanha.empresa_id,
        email: destinatario.email.toLowerCase(),
        motivo: "descadastro",
        fonte: "email_marketing",
        metadata_json: {
          campanha_id: campanha.id,
          destinatario_id: destinatario.id,
        },
      });
    }

    await supabaseAdmin
      .from("email_campanha_destinatarios")
      .update({
        status: "suprimido",
        suprimido_em: agora,
        descadastrado_em: agora,
        updated_at: agora,
      })
      .eq("id", destinatario.id);

    await supabaseAdmin.from("email_eventos").insert({
      empresa_id: campanha.empresa_id,
      campanha_id: campanha.id,
      destinatario_id: destinatario.id,
      provider: "crm",
      provider_event_id: "unsubscribe-" + destinatario.id,
      provider_message_id: null,
      tipo: "email.unsubscribed",
      destinatario_email: destinatario.email.toLowerCase(),
      ocorrido_em: agora,
      payload_json: {
        origem: "link_descadastro",
      },
    });

    await recalcularMetricasCampanhaEmail(campanha.id);
  }

  return { ok: true as const };
}

function paginaHtml(ok: boolean) {
  const titulo = ok ? "Descadastro confirmado" : "Não foi possível concluir";
  const texto = ok
    ? "Seu endereço foi removido desta lista de comunicação."
    : "O link de descadastro é inválido ou não está mais disponível.";

  return (
    "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" +
    titulo +
    "</title></head><body style=\"margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#172033\"><main style=\"max-width:560px;margin:80px auto;padding:0 18px\"><div style=\"background:#fff;border:1px solid #e4e8ef;border-radius:16px;padding:30px;text-align:center\"><h1 style=\"font-size:24px;margin:0 0 12px\">" +
    titulo +
    "</h1><p style=\"margin:0;color:#647084;line-height:1.6\">" +
    texto +
    "</p></div></main></body></html>"
  );
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const resultado = await descadastrar(token);

  return new Response(paginaHtml(resultado.ok), {
    status: resultado.ok ? 200 : resultado.status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const resultado = await descadastrar(token);

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  return NextResponse.json({ ok: true });
}
