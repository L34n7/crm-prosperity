import { NextResponse } from "next/server";
import {
  emailMarketingResendConfigurado,
  emailMarketingWebhookConfigurado,
  validarAcessoEmailMarketing,
} from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function inicioMesSaoPaulo() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const mapa = new Map(partes.map((parte) => [parte.type, parte.value]));
  const ano = mapa.get("year") || new Date().getFullYear().toString();
  const mes = mapa.get("month") || "01";

  return new Date(`${ano}-${mes}-01T00:00:00-03:00`).toISOString();
}

function contarMensagensUnicas(
  eventos: Array<{ provider_message_id?: string | null; tipo?: string | null }>,
  tipo: string
) {
  return new Set(
    eventos
      .filter((evento) => evento.tipo === tipo)
      .map((evento) => evento.provider_message_id)
      .filter((id): id is string => Boolean(id))
  ).size;
}

export async function GET() {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const [{ data: remetente, error: remetenteError }, { data: eventos, error: eventosError }] =
    await Promise.all([
      supabaseAdmin
        .from("email_remetentes")
        .select("id, nome, email, dominio, provider, status, is_default")
        .eq("escopo", "sistema")
        .eq("is_default", true)
        .maybeSingle(),
      supabaseAdmin
        .from("email_eventos")
        .select("tipo, provider_message_id")
        .gte("created_at", inicioMesSaoPaulo())
        .in("tipo", [
          "email.sent",
          "email.delivered",
          "email.opened",
          "email.clicked",
        ]),
    ]);

  if (remetenteError || eventosError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          remetenteError?.message ||
          eventosError?.message ||
          "Não foi possível carregar a configuração de e-mail.",
      },
      { status: 500 }
    );
  }

  const listaEventos = eventos ?? [];
  const apiKeyConfigurada = emailMarketingResendConfigurado();
  const webhookConfigurado = emailMarketingWebhookConfigurado();
  const remetenteVerificado = remetente?.status === "verificado";
  const enviados = contarMensagensUnicas(listaEventos, "email.sent");
  const entregues = contarMensagensUnicas(listaEventos, "email.delivered");
  const abertos = contarMensagensUnicas(listaEventos, "email.opened");
  const cliques = contarMensagensUnicas(listaEventos, "email.clicked");

  return NextResponse.json({
    ok: true,
    configuracao: {
      provedor: remetente?.provider || "resend",
      provedor_configurado: Boolean(apiKeyConfigurada && remetenteVerificado),
      api_key_configurada: apiKeyConfigurada,
      webhook_configurado: webhookConfigurado,
      dominio: remetente?.dominio || null,
      remetente_nome: remetente?.nome || null,
      remetente_email: remetente?.email || null,
      status: remetente?.status || "pendente",
      spf: remetenteVerificado ? "verificado" : "pendente",
      dkim: remetenteVerificado ? "verificado" : "pendente",
      dmarc: "recomendado",
    },
    metricas: {
      enviados,
      entregues,
      abertos,
      cliques,
      taxa_abertura:
        entregues > 0 ? Number(((abertos / entregues) * 100).toFixed(1)) : null,
    },
  });
}
