import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getEmailMarketingResend } from "@/lib/email-marketing/admin";
import {
  buscarEmailsSuprimidos,
  recalcularMetricasCampanhaEmail,
} from "@/lib/email-marketing/campanhas";
import {
  adicionarRodapeDescadastro,
  aplicarFallbacksVariaveis,
  renderizarVariaveis,
  type VariaveisEmailMarketing,
} from "@/lib/email-marketing/conteudo";
import {
  publicarCampanhaEmailQstash,
  urlPublicaEmailMarketing,
} from "@/lib/email-marketing/fila";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolverNomeCapturaContato } from "@/lib/automacoes/variaveis-fixas-contato";
import { extrairChavesVariaveis } from "@/lib/variaveis/catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

type DestinatarioRow = {
  id: string;
  campanha_id: string;
  contato_id: string | null;
  email: string;
  nome: string | null;
  status: string;
  unsubscribe_token: string;
  tentativas: number;
  max_tentativas: number;
  next_attempt_at: string | null;
  variaveis_json: Record<string, unknown> | null;
};

type ProtocoloContato = {
  protocolo_atual: string;
  ultimo_protocolo: string;
};

function dataRetry(tentativa: number) {
  const minutos = Math.min(30, Math.max(1, Math.pow(2, tentativa - 1)));
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

async function carregarVariaveisPersonalizadas(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("automacao_variaveis")
    .select("chave, valor")
    .eq("empresa_id", empresaId)
    .is("execucao_id", null)
    .is("contato_id", null)
    .eq("metadata_json->>tipo", "global_empresa")
    .eq("metadata_json->>ativo", "true");

  if (error) {
    console.warn(
      "[EMAIL MARKETING] Variáveis personalizadas indisponíveis:",
      error.message
    );
    return {};
  }

  return Object.fromEntries(
    (data || [])
      .map((item) => [
        String(item.chave || "").trim().toLowerCase(),
        String(item.valor || ""),
      ])
      .filter(([chave]) => Boolean(chave))
  ) as Record<string, string>;
}

async function carregarProtocolos(
  empresaId: string,
  contatoIds: string[]
): Promise<Record<string, ProtocoloContato>> {
  const ids = Array.from(new Set(contatoIds.filter(Boolean)));
  const resultado: Record<string, ProtocoloContato> = {};

  ids.forEach((id) => {
    resultado[id] = {
      protocolo_atual: "",
      ultimo_protocolo: "",
    };
  });

  if (!ids.length) return resultado;

  const { data: conversas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id, contato_id")
    .eq("empresa_id", empresaId)
    .in("contato_id", ids);

  if (conversasError || !conversas?.length) {
    if (conversasError) {
      console.warn(
        "[EMAIL MARKETING] Protocolos indisponíveis:",
        conversasError.message
      );
    }
    return resultado;
  }

  const conversaParaContato = new Map<string, string>();
  const conversaIds: string[] = [];

  for (const conversa of conversas) {
    if (!conversa.id || !conversa.contato_id) continue;
    conversaIds.push(conversa.id);
    conversaParaContato.set(conversa.id, conversa.contato_id);
  }

  if (!conversaIds.length) return resultado;

  const { data: protocolos, error: protocolosError } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("conversa_id, protocolo, ativo, created_at")
    .eq("empresa_id", empresaId)
    .in("conversa_id", conversaIds)
    .order("created_at", { ascending: false });

  if (protocolosError) {
    console.warn(
      "[EMAIL MARKETING] Protocolos indisponíveis:",
      protocolosError.message
    );
    return resultado;
  }

  for (const protocolo of protocolos || []) {
    const contatoId = conversaParaContato.get(protocolo.conversa_id);
    if (!contatoId || !resultado[contatoId]) continue;

    if (protocolo.ativo === true && !resultado[contatoId].protocolo_atual) {
      resultado[contatoId].protocolo_atual = protocolo.protocolo || "";
    }

    if (protocolo.ativo === false && !resultado[contatoId].ultimo_protocolo) {
      resultado[contatoId].ultimo_protocolo = protocolo.protocolo || "";
    }
  }

  return resultado;
}

async function agendarProximaExecucao(
  campanhaId: string,
  executarEm: string | null,
  dedupeSuffix: string
) {
  const fila = await publicarCampanhaEmailQstash({
    campanhaId,
    executarEm,
    dedupeSuffix,
  });

  await supabaseAdmin
    .from("email_campanhas")
    .update({
      qstash_message_id: fila.messageId,
      qstash_agendado_em: fila.ok ? new Date().toISOString() : null,
      erro: fila.ok ? null : fila.erro,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campanhaId);

  return fila;
}

async function finalizarSeConcluida(campanhaId: string) {
  const [{ count: pendentes }, { count: enviados }, { count: falhas }] =
    await Promise.all([
      supabaseAdmin
        .from("email_campanha_destinatarios")
        .select("id", { count: "exact", head: true })
        .eq("campanha_id", campanhaId)
        .eq("status", "pendente"),
      supabaseAdmin
        .from("email_campanha_destinatarios")
        .select("id", { count: "exact", head: true })
        .eq("campanha_id", campanhaId)
        .not("provider_message_id", "is", null),
      supabaseAdmin
        .from("email_campanha_destinatarios")
        .select("id", { count: "exact", head: true })
        .eq("campanha_id", campanhaId)
        .eq("status", "falha"),
    ]);

  if (Number(pendentes || 0) > 0) {
    return false;
  }

  await recalcularMetricasCampanhaEmail(campanhaId);

  const totalEnviados = Number(enviados || 0);
  const totalFalhas = Number(falhas || 0);

  await supabaseAdmin
    .from("email_campanhas")
    .update({
      status: totalEnviados > 0 || totalFalhas === 0 ? "enviada" : "falha",
      finalizada_em: new Date().toISOString(),
      erro:
        totalFalhas > 0
          ? totalFalhas + " destinatário(s) não puderam ser enviados."
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campanhaId);

  return true;
}

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();

    const valido = await receiver.verify({
      signature: request.headers.get("upstash-signature") || "",
      body: bodyText,
    });

    if (!valido) {
      return NextResponse.json(
        { ok: false, error: "Assinatura QStash inválida." },
        { status: 401 }
      );
    }

    const body = JSON.parse(bodyText) as { campanhaId?: string };
    const campanhaId = String(body.campanhaId || "").trim();

    if (!campanhaId) {
      return NextResponse.json(
        { ok: false, error: "campanhaId ausente." },
        { status: 400 }
      );
    }

    const { data: campanha, error: campanhaError } = await supabaseAdmin
      .from("email_campanhas")
      .select(
        "id, empresa_id, nome, assunto, html, texto, status, agendada_para, iniciada_em, remetente_id, variaveis_config_json"
      )
      .eq("id", campanhaId)
      .maybeSingle();

    if (campanhaError) {
      throw new Error(campanhaError.message);
    }

    if (!campanha) {
      return NextResponse.json({ ok: true, ignorada: "campanha_ausente" });
    }

    if (!["agendada", "processando"].includes(campanha.status)) {
      return NextResponse.json({
        ok: true,
        ignorada: "status_" + campanha.status,
      });
    }

    if (!campanha.empresa_id) {
      throw new Error("Campanha sem empresa vinculada.");
    }

    const agendadaMs = campanha.agendada_para
      ? new Date(campanha.agendada_para).getTime()
      : Date.now();

    if (Number.isFinite(agendadaMs) && agendadaMs > Date.now() + 15_000) {
      const fila = await agendarProximaExecucao(
        campanha.id,
        new Date(agendadaMs).toISOString(),
        "aguardar-" + Math.floor(agendadaMs / 1000)
      );

      if (!fila.ok) {
        throw new Error(fila.erro || "Falha ao reagendar campanha.");
      }

      return NextResponse.json({
        ok: true,
        reagendada: true,
        executar_em: new Date(agendadaMs).toISOString(),
      });
    }

    const [{ data: remetente, error: remetenteError }, { data: empresa }] =
      await Promise.all([
        supabaseAdmin
          .from("email_remetentes")
          .select("id, nome, email, dominio, status")
          .eq("id", campanha.remetente_id)
          .maybeSingle(),
        supabaseAdmin
          .from("empresas")
          .select("id, nome_fantasia")
          .eq("id", campanha.empresa_id)
          .maybeSingle(),
      ]);

    if (remetenteError || !remetente || remetente.status !== "verificado") {
      throw new Error(
        remetenteError?.message || "Remetente da campanha não está verificado."
      );
    }

    await supabaseAdmin
      .from("email_campanhas")
      .update({
        status: "processando",
        iniciada_em: campanha.iniciada_em || new Date().toISOString(),
        erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    const agoraIso = new Date().toISOString();
    const { data: lote, error: loteError } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .select(
        "id, campanha_id, contato_id, email, nome, status, unsubscribe_token, tentativas, max_tentativas, next_attempt_at, variaveis_json"
      )
      .eq("campanha_id", campanha.id)
      .eq("status", "pendente")
      .or("next_attempt_at.is.null,next_attempt_at.lte." + agoraIso)
      .order("created_at", { ascending: true })
      .limit(10);

    if (loteError) {
      throw new Error(loteError.message);
    }

    const destinatarios = (lote || []) as DestinatarioRow[];

    if (!destinatarios.length) {
      const { data: proximo } = await supabaseAdmin
        .from("email_campanha_destinatarios")
        .select("id, next_attempt_at")
        .eq("campanha_id", campanha.id)
        .eq("status", "pendente")
        .order("next_attempt_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (proximo) {
        const executarEm =
          proximo.next_attempt_at ||
          new Date(Date.now() + 1000).toISOString();
        const fila = await agendarProximaExecucao(
          campanha.id,
          executarEm,
          "pendente-" +
            proximo.id +
            "-" +
            Math.floor(new Date(executarEm).getTime() / 1000)
        );

        if (!fila.ok) {
          throw new Error(fila.erro || "Falha ao continuar campanha.");
        }

        return NextResponse.json({
          ok: true,
          aguardando_retry: Boolean(proximo.next_attempt_at),
        });
      }

      await finalizarSeConcluida(campanha.id);
      return NextResponse.json({ ok: true, concluida: true });
    }

    const chavesUsadas = new Set(
      extrairChavesVariaveis(
        campanha.assunto,
        campanha.html,
        campanha.texto
      )
    );
    const precisaProtocolos =
      chavesUsadas.has("protocolo_atual") ||
      chavesUsadas.has("ultimo_protocolo");
    const precisaNomeCaptura =
      chavesUsadas.has("nome_captura") ||
      chavesUsadas.has("primeiro_nome_captura");

    const contatoIds = destinatarios
      .map((item) => item.contato_id || "")
      .filter(Boolean);

    const [suprimidos, personalizadas, protocolos] = await Promise.all([
      buscarEmailsSuprimidos(campanha.empresa_id),
      carregarVariaveisPersonalizadas(campanha.empresa_id),
      precisaProtocolos
        ? carregarProtocolos(campanha.empresa_id, contatoIds)
        : Promise.resolve({} as Record<string, ProtocoloContato>),
    ]);

    const config =
      campanha.variaveis_config_json &&
      typeof campanha.variaveis_config_json === "object"
        ? (campanha.variaveis_config_json as Record<string, unknown>)
        : {};
    const fallbacks =
      config.fallbacks &&
      typeof config.fallbacks === "object" &&
      !Array.isArray(config.fallbacks)
        ? (config.fallbacks as Record<string, unknown>)
        : {};

    const resend = getEmailMarketingResend();
    const basePublica = urlPublicaEmailMarketing();

    for (const destinatario of destinatarios) {
      const email = destinatario.email.trim().toLowerCase();

      if (suprimidos.has(email)) {
        await supabaseAdmin
          .from("email_campanha_destinatarios")
          .update({
            status: "suprimido",
            suprimido_em: new Date().toISOString(),
            erro: "Endereço presente na lista de supressão.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", destinatario.id);
        continue;
      }

      const snapshot =
        destinatario.variaveis_json &&
        typeof destinatario.variaveis_json === "object"
          ? destinatario.variaveis_json
          : {};

      let variaveis: VariaveisEmailMarketing = {
        ...personalizadas,
        ...snapshot,
        email,
      };

      if (!String(variaveis.empresa || "").trim()) {
        variaveis.empresa = empresa?.nome_fantasia || "";
      }

      if (destinatario.contato_id && precisaProtocolos) {
        const protocolo = protocolos[destinatario.contato_id];
        variaveis.protocolo_atual = protocolo?.protocolo_atual || "";
        variaveis.ultimo_protocolo = protocolo?.ultimo_protocolo || "";
      }

      if (destinatario.contato_id && precisaNomeCaptura) {
        const nomes = await resolverNomeCapturaContato({
          empresaId: campanha.empresa_id,
          contatoId: destinatario.contato_id,
          nomeWhatsapp: String(variaveis.nome_whatsapp || ""),
          nomeFallback: String(
            variaveis.nome_contato || destinatario.nome || ""
          ),
        });

        variaveis.nome_captura = nomes.nome_captura;
        variaveis.primeiro_nome_captura = nomes.primeiro_nome_captura;
      }

      for (const [chave, valor] of Object.entries(personalizadas)) {
        variaveis[chave] = renderizarVariaveis(
          valor,
          variaveis,
          false
        );
      }

      variaveis = aplicarFallbacksVariaveis(variaveis, fallbacks);

      const unsubscribeUrl =
        basePublica +
        "/api/email-marketing/descadastrar?token=" +
        encodeURIComponent(destinatario.unsubscribe_token);
      const htmlRenderizado = adicionarRodapeDescadastro(
        renderizarVariaveis(String(campanha.html || ""), variaveis, true),
        unsubscribeUrl
      );
      const textoBase = renderizarVariaveis(
        String(campanha.texto || ""),
        variaveis,
        false
      );
      const textoRenderizado =
        (textoBase ? textoBase + "\n\n" : "") +
        "Para se descadastrar desta comunicação: " +
        unsubscribeUrl;
      const assuntoRenderizado = renderizarVariaveis(
        campanha.assunto,
        variaveis,
        false
      );

      const tentativa = Number(destinatario.tentativas || 0) + 1;

      try {
        const { data, error } = await resend.emails.send({
          from: remetente.nome + " <" + remetente.email + ">",
          to: [email],
          subject: assuntoRenderizado,
          html: htmlRenderizado,
          text: textoRenderizado,
          headers: {
            "List-Unsubscribe": "<" + unsubscribeUrl + ">",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            "X-CRM-Campanha-ID": campanha.id,
          },
          tags: [{ name: "crm_campanha", value: campanha.id }],
        });

        if (error || !data?.id) {
          throw new Error(
            error?.message || "Resend não retornou o ID do envio."
          );
        }

        await supabaseAdmin
          .from("email_campanha_destinatarios")
          .update({
            status: "enviado",
            provider_message_id: data.id,
            tentativas: tentativa,
            next_attempt_at: null,
            erro: null,
            enviado_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", destinatario.id);
      } catch (error) {
        const mensagem =
          error instanceof Error ? error.message : "Falha ao enviar e-mail.";
        const esgotou = tentativa >= Number(destinatario.max_tentativas || 3);

        await supabaseAdmin
          .from("email_campanha_destinatarios")
          .update({
            status: esgotou ? "falha" : "pendente",
            tentativas: tentativa,
            next_attempt_at: esgotou ? null : dataRetry(tentativa),
            erro: mensagem.slice(0, 1000),
            updated_at: new Date().toISOString(),
          })
          .eq("id", destinatario.id);
      }
    }

    await recalcularMetricasCampanhaEmail(campanha.id);

    const { data: proximo } = await supabaseAdmin
      .from("email_campanha_destinatarios")
      .select("id, next_attempt_at")
      .eq("campanha_id", campanha.id)
      .eq("status", "pendente")
      .order("next_attempt_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (proximo) {
      const executarEm =
        proximo.next_attempt_at || new Date(Date.now() + 1000).toISOString();
      const fila = await agendarProximaExecucao(
        campanha.id,
        executarEm,
        "continuar-" +
          proximo.id +
          "-" +
          Math.floor(new Date(executarEm).getTime() / 1000)
      );

      if (!fila.ok) {
        throw new Error(fila.erro || "Falha ao continuar campanha.");
      }

      return NextResponse.json({
        ok: true,
        processados: destinatarios.length,
        continua: true,
      });
    }

    await finalizarSeConcluida(campanha.id);

    return NextResponse.json({
      ok: true,
      processados: destinatarios.length,
      concluida: true,
    });
  } catch (error) {
    console.error("[EMAIL MARKETING WORKER] Erro:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno no worker de E-mail Marketing.",
      },
      { status: 500 }
    );
  }
}
