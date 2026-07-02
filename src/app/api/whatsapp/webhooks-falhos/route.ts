import { NextResponse } from "next/server";
import { isAdministrador } from "@/lib/auth/authorization";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  extrairIdentificadoresWebhookWhatsapp,
  webhookWhatsappPertenceAosNumeros,
} from "@/lib/whatsapp/webhook-recovery";
import { processarWebhookWhatsappPorId } from "@/lib/whatsapp/webhook-queue";
import type { WhatsAppWebhookBody } from "@/lib/whatsapp/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EventoWebhook = {
  id: string;
  status: string;
  tentativas: number;
  body_json: WhatsAppWebhookBody;
  metadata_json?: Record<string, unknown> | null;
  erro?: string | null;
  created_at: string;
  updated_at: string;
};

async function obterContextoAdministrador() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }

  if (!isAdministrador(resultado.usuario)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Apenas administradores podem recuperar webhooks." },
        { status: 403 }
      ),
    };
  }

  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

async function buscarPhoneNumberIdsEmpresa(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("phone_number_id")
    .eq("empresa_id", empresaId)
    .not("phone_number_id", "is", null);

  if (error) {
    throw new Error(`Erro ao buscar números da empresa: ${error.message}`);
  }

  return new Set(
    (data || [])
      .map((item) => String(item.phone_number_id || "").trim())
      .filter(Boolean)
  );
}

async function buscarEventosFalhosDaEmpresa(params: {
  empresaId: string;
  limite: number;
  eventoIds?: string[];
}) {
  const phoneNumberIds = await buscarPhoneNumberIdsEmpresa(params.empresaId);

  if (phoneNumberIds.size === 0) {
    return [] as EventoWebhook[];
  }

  let eventos: EventoWebhook[] = [];

  if (params.eventoIds?.length) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_webhook_eventos")
      .select(
        "id, status, tentativas, body_json, metadata_json, erro, created_at, updated_at"
      )
      .eq("status", "erro")
      .in("id", params.eventoIds);

    if (error) {
      throw new Error(`Erro ao buscar webhooks selecionados: ${error.message}`);
    }

    eventos = (data || []) as EventoWebhook[];
  } else {
    const resultados = await Promise.all(
      Array.from(phoneNumberIds).map(async (phoneNumberId) => {
        const { data, error } = await supabaseAdmin
          .from("whatsapp_webhook_eventos")
          .select(
            "id, status, tentativas, body_json, metadata_json, erro, created_at, updated_at"
          )
          .eq("status", "erro")
          .contains("body_json", {
            entry: [
              {
                changes: [
                  {
                    value: {
                      metadata: {
                        phone_number_id: phoneNumberId,
                      },
                    },
                  },
                ],
              },
            ],
          })
          .order("updated_at", { ascending: false })
          .limit(params.limite);

        if (error) {
          throw new Error(`Erro ao buscar webhooks com falha: ${error.message}`);
        }

        return (data || []) as EventoWebhook[];
      })
    );

    const eventosPorId = new Map<string, EventoWebhook>();

    for (const evento of resultados.flat()) {
      eventosPorId.set(evento.id, evento);
    }

    eventos = Array.from(eventosPorId.values());
  }

  return eventos
    .filter((evento) =>
      webhookWhatsappPertenceAosNumeros(evento.body_json, phoneNumberIds)
    )
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, params.limite);
}

async function enriquecerEventosComConversas(
  empresaId: string,
  eventos: EventoWebhook[]
) {
  const mensagemExternaIds = Array.from(
    new Set(
      eventos.flatMap(
        (evento) =>
          extrairIdentificadoresWebhookWhatsapp(evento.body_json)
            .mensagemExternaIds
      )
    )
  );

  const { data: mensagens, error: mensagensError } = mensagemExternaIds.length
    ? await supabaseAdmin
        .from("mensagens")
        .select(
          "id, conversa_id, mensagem_externa_id, conteudo, tipo_mensagem, created_at"
        )
        .eq("empresa_id", empresaId)
        .in("mensagem_externa_id", mensagemExternaIds)
    : { data: [], error: null };

  if (mensagensError) {
    throw new Error(
      `Erro ao relacionar falhas às mensagens: ${mensagensError.message}`
    );
  }

  const conversaIds = Array.from(
    new Set(
      (mensagens || [])
        .map((mensagem) => String(mensagem.conversa_id || "").trim())
        .filter(Boolean)
    )
  );
  const { data: conversas, error: conversasError } = conversaIds.length
    ? await supabaseAdmin
        .from("conversas")
        .select("id, contato_id, status, bot_ativo, last_message_at")
        .eq("empresa_id", empresaId)
        .in("id", conversaIds)
    : { data: [], error: null };

  if (conversasError) {
    throw new Error(
      `Erro ao relacionar falhas às conversas: ${conversasError.message}`
    );
  }

  const contatoIds = Array.from(
    new Set(
      (conversas || [])
        .map((conversa) => String(conversa.contato_id || "").trim())
        .filter(Boolean)
    )
  );
  const { data: contatos, error: contatosError } = contatoIds.length
    ? await supabaseAdmin
        .from("contatos")
        .select("id, nome, telefone")
        .eq("empresa_id", empresaId)
        .in("id", contatoIds)
    : { data: [], error: null };

  if (contatosError) {
    throw new Error(
      `Erro ao relacionar falhas aos contatos: ${contatosError.message}`
    );
  }

  const mensagensPorExternaId = new Map(
    (mensagens || []).map((mensagem) => [
      String(mensagem.mensagem_externa_id),
      mensagem,
    ])
  );
  const conversasPorId = new Map(
    (conversas || []).map((conversa) => [String(conversa.id), conversa])
  );
  const contatosPorId = new Map(
    (contatos || []).map((contato) => [String(contato.id), contato])
  );

  return eventos.map((evento) => {
    const identificadores = extrairIdentificadoresWebhookWhatsapp(
      evento.body_json
    );
    const ocorrencias = identificadores.mensagemExternaIds.map(
      (mensagemExternaId) => {
        const mensagem = mensagensPorExternaId.get(mensagemExternaId) || null;
        const conversa = mensagem?.conversa_id
          ? conversasPorId.get(String(mensagem.conversa_id)) || null
          : null;
        const contato = conversa?.contato_id
          ? contatosPorId.get(String(conversa.contato_id)) || null
          : null;

        return {
          mensagem_externa_id: mensagemExternaId,
          mensagem,
          conversa,
          contato,
        };
      }
    );

    return {
      evento_id: evento.id,
      status: evento.status,
      tentativas: evento.tentativas,
      erro: evento.erro || null,
      created_at: evento.created_at,
      updated_at: evento.updated_at,
      phone_number_ids: identificadores.phoneNumberIds,
      telefones_contatos: identificadores.telefonesContatos,
      ocorrencias,
    };
  });
}

export async function GET(request: Request) {
  const contexto = await obterContextoAdministrador();
  if (!contexto.ok) return contexto.response;

  try {
    const url = new URL(request.url);
    const limiteRaw = Number(url.searchParams.get("limit") || 50);
    const limite = Number.isFinite(limiteRaw)
      ? Math.max(1, Math.min(100, Math.floor(limiteRaw)))
      : 50;
    const eventos = await buscarEventosFalhosDaEmpresa({
      empresaId: contexto.empresaId,
      limite,
    });
    const falhas = await enriquecerEventosComConversas(
      contexto.empresaId,
      eventos
    );

    return NextResponse.json({
      ok: true,
      total: falhas.length,
      falhas,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar webhooks com falha.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const contexto = await obterContextoAdministrador();
  if (!contexto.ok) return contexto.response;

  try {
    const body = (await request.json()) as { evento_ids?: unknown };
    const eventoIds = Array.isArray(body.evento_ids)
      ? Array.from(
          new Set(
            body.evento_ids
              .map((item) => String(item || "").trim())
              .filter((item) => UUID_REGEX.test(item))
          )
        ).slice(0, 50)
      : [];

    if (eventoIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe ao menos um evento válido." },
        { status: 400 }
      );
    }

    const eventos = await buscarEventosFalhosDaEmpresa({
      empresaId: contexto.empresaId,
      limite: eventoIds.length,
      eventoIds,
    });

    if (eventos.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nenhum evento com falha foi encontrado para esta empresa.",
        },
        { status: 404 }
      );
    }

    const resultados = [];

    for (const evento of eventos) {
      const agora = new Date().toISOString();
      const { data: reaberto, error: reabrirError } = await supabaseAdmin
        .from("whatsapp_webhook_eventos")
        .update({
          status: "pendente",
          tentativas: 0,
          erro: null,
          locked_at: null,
          processed_at: null,
          resultado_json: {},
          metadata_json: {
            ...(evento.metadata_json || {}),
            recuperacao_manual_em: agora,
            recuperacao_manual_usuario_id: contexto.usuario.id,
            recuperacao_manual_erro_anterior: evento.erro || null,
            recuperacao_manual_tentativas_anteriores: evento.tentativas,
          },
          updated_at: agora,
        })
        .eq("id", evento.id)
        .eq("status", "erro")
        .select("id")
        .maybeSingle();

      if (reabrirError || !reaberto) {
        resultados.push({
          evento_id: evento.id,
          ok: false,
          error:
            reabrirError?.message ||
            "Evento já foi recuperado por outro processamento.",
        });
        continue;
      }

      const resultado = await processarWebhookWhatsappPorId(evento.id);
      resultados.push({
        evento_id: evento.id,
        ...resultado,
      });
    }

    return NextResponse.json({
      ok: resultados.some((resultado) => resultado.ok === true),
      total: resultados.length,
      processados: resultados.filter(
        (resultado) =>
          "processado" in resultado && resultado.processado === true
      ).length,
      resultados,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao recuperar webhooks.",
      },
      { status: 500 }
    );
  }
}
