import { NextResponse } from "next/server";
import {
  getEmailMarketingResend,
  validarAcessoEmailMarketing,
} from "@/lib/email-marketing/admin";
import { recalcularMetricasCampanhaEmail } from "@/lib/email-marketing/campanhas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const db = getSupabaseAdmin();
const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POR_CONSULTA = 20;

type Contexto = { params: Promise<{ id: string }> };

type DestinatarioPendente = {
  id: string;
  status: string;
  provider_message_id: string;
};

export async function POST(_request: Request, { params }: Contexto) {
  const acesso = await validarAcessoEmailMarketing();
  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const empresaId = acesso.usuario.empresa_id;
  const { id } = await params;

  if (!empresaId || !UUID_VALIDO.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Campanha inválida." },
      { status: 400 }
    );
  }

  // Valide a empresa ANTES de consultar dados ou acessar o provedor.
  const { data: campanha, error: campanhaError } = await db
    .from("email_campanhas")
    .select("id")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (campanhaError) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível validar a campanha." },
      { status: 500 }
    );
  }
  if (!campanha) {
    return NextResponse.json(
      { ok: false, error: "Campanha não encontrada." },
      { status: 404 }
    );
  }

  const { data, error } = await db
    .from("email_campanha_destinatarios")
    .select("id,status,provider_message_id")
    .eq("campanha_id", id)
    .in("status", ["enviado", "aberto", "clicado"])
    .is("entregue_em", null)
    .not("provider_message_id", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(MAX_POR_CONSULTA);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Falha ao consultar os envios da campanha." },
      { status: 500 }
    );
  }

  const destinatarios = (data || []) as DestinatarioPendente[];
  if (!destinatarios.length) {
    return NextResponse.json({
      ok: true,
      consultados: 0,
      atualizados: 0,
      aguardando: 0,
      falhas_consulta: 0,
      message: "Nenhum envio com entrega pendente de confirmação foi encontrado.",
    });
  }

  let resend: Awaited<ReturnType<typeof getEmailMarketingResend>>;
  try {
    resend = await getEmailMarketingResend(empresaId);
  } catch {
    return NextResponse.json(
      { ok: false, error: "A integração de E-mail Marketing não está disponível." },
      { status: 503 }
    );
  }

  let atualizados = 0;
  let aguardando = 0;
  let falhasConsulta = 0;
  let rejeitados = 0;

  for (const destinatario of destinatarios) {
    try {
      const { data: mensagem, error: erroProvedor } = await resend.emails.get(
        destinatario.provider_message_id
      );

      if (erroProvedor || !mensagem) {
        falhasConsulta += 1;
        continue;
      }

      const evento = String(mensagem.last_event || "").trim().toLowerCase();
      const agora = new Date().toISOString();
      const alteracoes: Record<string, unknown> = { updated_at: agora };

      if (["delivered", "opened", "clicked"].includes(evento)) {
        alteracoes.entregue_em = agora;
        if (destinatario.status === "enviado") {
          alteracoes.status =
            evento === "clicked"
              ? "clicado"
              : evento === "opened"
                ? "aberto"
                : "entregue";
        }
        if (evento === "opened") alteracoes.aberto_em = agora;
        if (evento === "clicked") alteracoes.clicado_em = agora;
      } else if (evento === "bounced") {
        alteracoes.status = "bounce";
        alteracoes.bounce_em = agora;
        alteracoes.erro = "O servidor de destino devolveu a mensagem (Resend).";
        rejeitados += 1;
      } else if (evento === "failed") {
        alteracoes.status = "falha";
        alteracoes.erro = "O Resend confirmou falha no envio.";
        rejeitados += 1;
      } else if (evento === "suppressed") {
        alteracoes.status = "suprimido";
        alteracoes.suprimido_em = agora;
        alteracoes.erro = "O Resend suprimiu o destinatário.";
        rejeitados += 1;
      } else if (evento === "complained") {
        alteracoes.status = "reclamacao";
        alteracoes.reclamacao_em = agora;
        alteracoes.erro = "O destinatário reportou a mensagem como spam.";
        rejeitados += 1;
      } else {
        // Sent/queued/delivery_delayed não equivale a entrega confirmada.
        aguardando += 1;
        continue;
      }

      const { data: alterado, error: erroAtualizacao } = await db
        .from("email_campanha_destinatarios")
        .update(alteracoes)
        .eq("id", destinatario.id)
        .eq("campanha_id", id)
        .eq("status", destinatario.status)
        .is("entregue_em", null)
        .select("id")
        .maybeSingle();

      if (erroAtualizacao) {
        falhasConsulta += 1;
      } else if (alterado) {
        atualizados += 1;
      }
    } catch {
      falhasConsulta += 1;
    }
  }

  if (atualizados > 0) {
    await recalcularMetricasCampanhaEmail(id);
  }

  const message =
    falhasConsulta === destinatarios.length
      ? "Não foi possível consultar os envios na conta Resend configurada. Confira se a chave pertence à conta que realizou o disparo."
      : `Resend consultado: ${atualizados} atualização(ões), ${aguardando} sem confirmação de entrega${rejeitados ? `, ${rejeitados} com falha ou rejeição` : ""}.`;

  return NextResponse.json({
    ok: falhasConsulta !== destinatarios.length,
    consultados: destinatarios.length,
    atualizados,
    aguardando,
    rejeitados,
    falhas_consulta: falhasConsulta,
    message,
  }, { status: falhasConsulta === destinatarios.length ? 502 : 200 });
}
