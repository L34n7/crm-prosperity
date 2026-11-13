import { NextResponse } from "next/server";
import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import { registrarDescadastroNaResend, ResendSupressoesSemPermissaoError } from "@/lib/email-marketing/supressoes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function validarToken(token: string) {
  if (!UUID_REGEX.test(token)) {
    return { ok: false as const, status: 404, error: "Link inválido." };
  }
  const { data: destinatario, error } = await supabaseAdmin
    .from("email_campanha_destinatarios")
    .select("id, campanha_id, email, descadastrado_em")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!destinatario) {
    return { ok: false as const, status: 404, error: "Link não encontrado." };
  }
  const { data: campanha } = await supabaseAdmin
    .from("email_campanhas")
    .select("id, empresa_id")
    .eq("id", destinatario.campanha_id)
    .maybeSingle();
  if (!campanha?.empresa_id) {
    return { ok: false as const, status: 404, error: "Campanha não encontrada." };
  }
  return { ok: true as const, destinatario, campanha };
}

async function descadastrar(token: string) {
  const validacao = await validarToken(token);
  if (!validacao.ok) return validacao;
  const { destinatario, campanha } = validacao;
  if (destinatario.descadastrado_em) return { ok: true as const };

  // Opt-out explícito deve ser respeitado mesmo com chave apenas Sending access.
  let confirmadoResend = false;
  try {
    await registrarDescadastroNaResend(campanha.empresa_id, destinatario.email);
    confirmadoResend = true;
  } catch (error) {
    if (!(error instanceof ResendSupressoesSemPermissaoError)) {
      console.error("[EMAIL MARKETING] Resend indisponível ao registrar descadastro.", error);
    }
    // Mantém o endereço bloqueado localmente; sincroniza quando houver permissão.
  }

  const agora = new Date().toISOString();
  const { data: existente, error: buscaErro } = await supabaseAdmin
    .from("email_suppressions")
    .select("id")
    .eq("empresa_id", campanha.empresa_id)
    .ilike("email", destinatario.email)
    .limit(1);
  if (buscaErro) {
    return { ok: false as const, status: 500, error: buscaErro.message };
  }

  const campos = {
    motivo: confirmadoResend ? "manual" : "descadastro",
    fonte: confirmadoResend ? "resend" : "email_marketing",
    metadata_json: {
      origem: "descadastro_confirmado",
      campanha_id: campanha.id,
      destinatario_id: destinatario.id,
    },
  };
  const operacao = existente?.length
    ? await supabaseAdmin.from("email_suppressions")
        .update(campos).eq("id", existente[0].id)
    : await supabaseAdmin.from("email_suppressions")
        .insert({
          empresa_id: campanha.empresa_id,
          email: destinatario.email.toLowerCase(),
          ...campos,
        });

  if (operacao.error && operacao.error.code !== "23505") {
    return { ok: false as const, status: 500, error: operacao.error.message };
  }
  const { error: atualizarErro } = await supabaseAdmin
    .from("email_campanha_destinatarios")
    .update({
      status: "suprimido",
      suprimido_em: agora,
      descadastrado_em: agora,
      updated_at: agora,
    })
    .eq("id", destinatario.id);
  if (atualizarErro) {
    return { ok: false as const, status: 500, error: atualizarErro.message };
  }

  await supabaseAdmin.from("email_eventos").insert({
    empresa_id: campanha.empresa_id,
    campanha_id: campanha.id,
    destinatario_id: destinatario.id,
    provider: "crm",
    provider_event_id: "unsubscribe-" + destinatario.id,
    tipo: "email.unsubscribed",
    destinatario_email: destinatario.email.toLowerCase(),
    ocorrido_em: agora,
    payload_json: { origem: "confirmacao_post", sincronizado_resend: confirmadoResend },
  });
  await recalcularMetricasCampanhaEmail(campanha.id);
  return { ok: true as const };
}

function paginaHtml(config: { titulo: string; texto: string; form?: string }) {
  return (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + config.titulo + '</title></head>' +
    '<body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#172033">' +
    '<main style="max-width:560px;margin:80px auto;padding:0 18px">' +
    '<div style="background:#fff;border:1px solid #e4e8ef;border-radius:16px;padding:30px;text-align:center">' +
    '<h1 style="font-size:24px;margin:0 0 12px">' + config.titulo + '</h1>' +
    '<p style="margin:0 0 22px;color:#647084;line-height:1.6">' + config.texto + '</p>' +
    (config.form || "") + '</div></main></body></html>'
  );
}

function respostaHtml(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const validacao = await validarToken(token);
  if (!validacao.ok) {
    return respostaHtml(paginaHtml({
      titulo: "Link inválido", texto: "Este link de descadastro não está disponível.",
    }), validacao.status);
  }
  if (validacao.destinatario.descadastrado_em) {
    return respostaHtml(paginaHtml({
      titulo: "Descadastro confirmado",
      texto: "Seu endereço já foi removido desta lista de comunicação.",
    }));
  }
  // GET é apenas visualização: verificadores automáticos de links não descadastram.
  const form = '<form method="POST" action="/api/email-marketing/descadastrar?token=' +
    encodeURIComponent(token) + '">' +
    '<button type="submit" style="background:#13664a;color:white;border:0;border-radius:10px;' +
    'padding:14px 24px;font-size:16px;font-weight:600;cursor:pointer">' +
    'Confirmar descadastro</button></form>';
  return respostaHtml(paginaHtml({
    titulo: "Deseja se descadastrar?",
    texto: "Confirme abaixo para parar de receber nossos e-mails de marketing.",
    form,
  }));
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const resultado = await descadastrar(token);
  if (request.headers.get("accept")?.includes("text/html")) {
    return respostaHtml(paginaHtml(resultado.ok
      ? { titulo: "Descadastro confirmado", texto: "Você não receberá mais e-mails desta lista." }
      : { titulo: "Não foi possível concluir", texto: resultado.error }),
      resultado.ok ? 200 : resultado.status);
  }
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  }
  return NextResponse.json({ ok: true });
}
