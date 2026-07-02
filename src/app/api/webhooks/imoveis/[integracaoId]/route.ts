import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  extrairSegredoWebhook,
  LIMITE_WEBHOOK_IMOVEIS_BYTES,
  normalizarWebhookImovel,
  sanitizarPayloadSemMidia,
  segredoWebhookValido,
  type ImovelWebhookNormalizado,
} from "@/lib/imoveis/webhook";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const runtime = "nodejs";

const supabase = getSupabaseAdmin();

type IntegracaoWebhook = {
  id: string;
  empresa_id: string;
  nome: string;
  canal_codigo: string;
  token_hash: string;
  status: "ativo" | "inativo";
};

type ImovelExternoExistente = Record<string, unknown> & {
  id: string;
  status: string;
};

type EventoWebhook = {
  id: string;
  status: "recebido" | "processado" | "ignorado" | "erro";
  recebido_em: string;
};

function jsonErro(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function valorExistente(
  novoValor: unknown,
  existente: Record<string, unknown> | null,
  campo: string
) {
  if (novoValor !== null && novoValor !== undefined) return novoValor;
  return existente?.[campo] ?? null;
}

function coordenadaValida(
  valor: number | null,
  minimo: number,
  maximo: number
) {
  return valor !== null && valor >= minimo && valor <= maximo ? valor : null;
}

async function buscarIntegracao(integracaoId: string) {
  const { data, error } = await supabase
    .from("imobiliario_integracoes_webhook")
    .select("id, empresa_id, nome, canal_codigo, token_hash, status")
    .eq("id", integracaoId)
    .eq("status", "ativo")
    .maybeSingle<IntegracaoWebhook>();

  if (error) {
    throw new Error(`Erro ao buscar integracao: ${error.message}`);
  }

  return data;
}

async function registrarEvento(params: {
  integracao: IntegracaoWebhook;
  normalizado: ImovelWebhookNormalizado;
  payload: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("imobiliario_webhook_eventos")
    .insert({
      empresa_id: params.integracao.empresa_id,
      integracao_id: params.integracao.id,
      event_id: params.normalizado.eventId,
      event_type: params.normalizado.eventType,
      external_id: params.normalizado.externalId,
      status: "recebido",
      payload: params.payload,
    })
    .select("id, status, recebido_em")
    .single<EventoWebhook>();

  if (error?.code === "23505") {
    const { data: existente, error: buscaError } = await supabase
      .from("imobiliario_webhook_eventos")
      .select("id, status, recebido_em")
      .eq("integracao_id", params.integracao.id)
      .eq("event_id", params.normalizado.eventId)
      .maybeSingle<EventoWebhook>();

    if (buscaError || !existente) {
      throw new Error(
        `Erro ao buscar evento repetido: ${
          buscaError?.message ?? "evento nao encontrado"
        }`
      );
    }

    const recebidoEm = new Date(existente.recebido_em).getTime();
    const recebimentoExpirado =
      Number.isFinite(recebidoEm) && Date.now() - recebidoEm > 5 * 60_000;
    const deveReprocessar =
      existente.status === "erro" ||
      (existente.status === "recebido" && recebimentoExpirado);

    if (!deveReprocessar) {
      return { duplicado: true as const, evento: null };
    }

    const agora = new Date().toISOString();
    const { data: retomado, error: retomadaError } = await supabase
      .from("imobiliario_webhook_eventos")
      .update({
        event_type: params.normalizado.eventType,
        external_id: params.normalizado.externalId,
        status: "recebido",
        payload: params.payload,
        erro: null,
        recebido_em: agora,
        processado_em: null,
      })
      .eq("id", existente.id)
      .eq("status", existente.status)
      .eq("recebido_em", existente.recebido_em)
      .select("id, status, recebido_em")
      .maybeSingle<EventoWebhook>();

    if (retomadaError) {
      throw new Error(
        `Erro ao retomar evento: ${retomadaError.message}`
      );
    }

    if (!retomado) {
      return { duplicado: true as const, evento: null };
    }

    return { duplicado: false as const, evento: retomado };
  }

  if (error || !data) {
    throw new Error(
      `Erro ao registrar evento: ${error?.message ?? "evento nao salvo"}`
    );
  }

  return { duplicado: false as const, evento: data };
}

async function atualizarEvento(
  eventoId: string,
  status: "processado" | "ignorado" | "erro",
  erro?: string | null
) {
  const { error } = await supabase
    .from("imobiliario_webhook_eventos")
    .update({
      status,
      erro: erro?.slice(0, 5000) ?? null,
      processado_em: new Date().toISOString(),
    })
    .eq("id", eventoId);

  if (error) {
    console.error("[WEBHOOK IMOVEIS] Falha ao atualizar evento:", error);
  }
}

async function buscarImovelExterno(
  integracao: IntegracaoWebhook,
  externalId: string
) {
  const { data, error } = await supabase
    .from("imoveis_externos")
    .select("*")
    .eq("empresa_id", integracao.empresa_id)
    .eq("canal_codigo", integracao.canal_codigo)
    .eq("external_id", externalId)
    .maybeSingle<ImovelExternoExistente>();

  if (error) {
    throw new Error(`Erro ao buscar imovel externo: ${error.message}`);
  }

  return data;
}

async function arquivarImovelExterno(params: {
  integracao: IntegracaoWebhook;
  normalizado: ImovelWebhookNormalizado;
  payload: Record<string, unknown>;
}) {
  const existente = await buscarImovelExterno(
    params.integracao,
    params.normalizado.externalId
  );

  if (!existente) return null;

  const { data, error } = await supabase
    .from("imoveis_externos")
    .update({
      status: "arquivado",
      status_origem:
        params.normalizado.imovel.statusOrigem ?? "removido_na_origem",
      payload: params.payload,
      atualizado_origem_em: params.normalizado.occurredAt,
      recebido_em: new Date().toISOString(),
    })
    .eq("empresa_id", params.integracao.empresa_id)
    .eq("id", existente.id)
    .select("id")
    .single<{ id: string }>();

  if (error) {
    throw new Error(`Erro ao arquivar imovel externo: ${error.message}`);
  }

  return data;
}

async function salvarImovelExterno(params: {
  integracao: IntegracaoWebhook;
  normalizado: ImovelWebhookNormalizado;
  payload: Record<string, unknown>;
}) {
  const { integracao, normalizado, payload } = params;
  const imovel = normalizado.imovel;
  const existente = await buscarImovelExterno(
    integracao,
    normalizado.externalId
  );

  const imagemUrls =
    imovel.imagemUrls.length > 0
      ? imovel.imagemUrls
      : Array.isArray(existente?.imagem_urls)
        ? existente.imagem_urls
        : [];

  const dados = {
    empresa_id: integracao.empresa_id,
    integracao_id: integracao.id,
    canal_codigo: integracao.canal_codigo,
    canal_nome: integracao.nome,
    external_id: normalizado.externalId,
    external_url: valorExistente(
      imovel.externalUrl,
      existente,
      "external_url"
    ),
    codigo: valorExistente(imovel.codigo, existente, "codigo"),
    titulo: valorExistente(imovel.titulo, existente, "titulo"),
    tipo: valorExistente(imovel.tipo, existente, "tipo"),
    finalidade: valorExistente(
      imovel.finalidade,
      existente,
      "finalidade"
    ),
    status_origem: valorExistente(
      imovel.statusOrigem,
      existente,
      "status_origem"
    ),
    valor: valorExistente(imovel.valor, existente, "valor"),
    valor_venda: valorExistente(
      imovel.valorVenda,
      existente,
      "valor_venda"
    ),
    valor_locacao: valorExistente(
      imovel.valorLocacao,
      existente,
      "valor_locacao"
    ),
    valor_condominio: valorExistente(
      imovel.valorCondominio,
      existente,
      "valor_condominio"
    ),
    valor_iptu: valorExistente(
      imovel.valorIptu,
      existente,
      "valor_iptu"
    ),
    cep: valorExistente(imovel.cep, existente, "cep"),
    logradouro: valorExistente(
      imovel.logradouro,
      existente,
      "logradouro"
    ),
    numero: valorExistente(imovel.numero, existente, "numero"),
    complemento: valorExistente(
      imovel.complemento,
      existente,
      "complemento"
    ),
    bairro: valorExistente(imovel.bairro, existente, "bairro"),
    cidade: valorExistente(imovel.cidade, existente, "cidade"),
    estado: valorExistente(imovel.estado, existente, "estado"),
    quartos: valorExistente(imovel.quartos, existente, "quartos"),
    suites: valorExistente(imovel.suites, existente, "suites"),
    banheiros: valorExistente(
      imovel.banheiros,
      existente,
      "banheiros"
    ),
    vagas: valorExistente(imovel.vagas, existente, "vagas"),
    area_m2: valorExistente(imovel.areaM2, existente, "area_m2"),
    area_util_m2: valorExistente(
      imovel.areaUtilM2,
      existente,
      "area_util_m2"
    ),
    area_total_m2: valorExistente(
      imovel.areaTotalM2,
      existente,
      "area_total_m2"
    ),
    area_terreno_m2: valorExistente(
      imovel.areaTerrenoM2,
      existente,
      "area_terreno_m2"
    ),
    latitude: valorExistente(
      coordenadaValida(imovel.latitude, -90, 90),
      existente,
      "latitude"
    ),
    longitude: valorExistente(
      coordenadaValida(imovel.longitude, -180, 180),
      existente,
      "longitude"
    ),
    descricao: valorExistente(
      imovel.descricao,
      existente,
      "descricao"
    ),
    caracteristicas:
      Object.keys(imovel.caracteristicas).length > 0
        ? imovel.caracteristicas
        : (existente?.caracteristicas ?? {}),
    imagem_url:
      imovel.imagemUrl ||
      String(existente?.imagem_url ?? "").trim() ||
      null,
    imagem_urls: imagemUrls,
    status:
      existente?.status && existente.status !== "arquivado"
        ? existente.status
        : "novo",
    payload,
    atualizado_origem_em: normalizado.occurredAt,
    recebido_em: new Date().toISOString(),
  };

  if (existente) {
    const { data, error } = await supabase
      .from("imoveis_externos")
      .update(dados)
      .eq("empresa_id", integracao.empresa_id)
      .eq("id", existente.id)
      .select("*")
      .single<ImovelExternoExistente>();

    if (error) {
      throw new Error(`Erro ao atualizar imovel externo: ${error.message}`);
    }

    return data;
  }

  const { data, error } = await supabase
    .from("imoveis_externos")
    .insert(dados)
    .select("*")
    .single<ImovelExternoExistente>();

  if (error?.code === "23505") {
    const concorrente = await buscarImovelExterno(
      integracao,
      normalizado.externalId
    );

    if (concorrente) {
      const { data: atualizado, error: updateError } = await supabase
        .from("imoveis_externos")
        .update(dados)
        .eq("empresa_id", integracao.empresa_id)
        .eq("id", concorrente.id)
        .select("*")
        .single<ImovelExternoExistente>();

      if (updateError) {
        throw new Error(
          `Erro ao atualizar imovel concorrente: ${updateError.message}`
        );
      }

      return atualizado;
    }
  }

  if (error) {
    throw new Error(`Erro ao criar imovel externo: ${error.message}`);
  }

  return data;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Webhook de imoveis disponivel. Envie eventos por POST.",
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ integracaoId: string }> }
) {
  const { integracaoId } = await context.params;

  try {
    const integracao = await buscarIntegracao(integracaoId);

    if (!integracao) {
      return jsonErro("Credenciais invalidas.", 401);
    }

    const segredo = extrairSegredoWebhook(request.headers);

    if (
      !segredo ||
      !segredoWebhookValido(segredo, integracao.token_hash)
    ) {
      return jsonErro("Credenciais invalidas.", 401);
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonErro("Use Content-Type application/json.", 415);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > LIMITE_WEBHOOK_IMOVEIS_BYTES
    ) {
      return jsonErro("Payload excede o limite de 1 MB.", 413);
    }

    const payloadBruto = await request.text();
    if (Buffer.byteLength(payloadBruto, "utf8") > LIMITE_WEBHOOK_IMOVEIS_BYTES) {
      return jsonErro("Payload excede o limite de 1 MB.", 413);
    }

    let payloadDesconhecido: unknown;

    try {
      payloadDesconhecido = JSON.parse(payloadBruto);
    } catch {
      return jsonErro("JSON invalido.", 400);
    }

    let normalizado: ImovelWebhookNormalizado;

    try {
      normalizado = normalizarWebhookImovel(
        payloadDesconhecido,
        payloadBruto
      );
    } catch (error) {
      return jsonErro(
        error instanceof Error ? error.message : "Payload invalido.",
        422
      );
    }

    const payloadObjeto = payloadDesconhecido as Record<string, unknown>;
    const payload = sanitizarPayloadSemMidia(payloadObjeto);
    const registroEvento = await registrarEvento({
      integracao,
      normalizado,
      payload,
    });

    if (registroEvento.duplicado) {
      return NextResponse.json({
        ok: true,
        duplicated: true,
        event_id: normalizado.eventId,
        external_id: normalizado.externalId,
      });
    }

    const evento = registroEvento.evento;

    try {
      let imovelExterno: { id: string } | null = null;
      let statusEvento: "processado" | "ignorado" = "processado";

      if (normalizado.action === "delete") {
        imovelExterno = await arquivarImovelExterno({
          integracao,
          normalizado,
          payload,
        });

        if (!imovelExterno) statusEvento = "ignorado";
      } else {
        imovelExterno = await salvarImovelExterno({
          integracao,
          normalizado,
          payload,
        });
      }

      await Promise.all([
        atualizarEvento(evento.id, statusEvento),
        supabase
          .from("imobiliario_integracoes_webhook")
          .update({ ultimo_evento_em: new Date().toISOString() })
          .eq("id", integracao.id),
      ]);

      if (imovelExterno) {
        const auditMeta = getRequestAuditMetadata(request);

        await registrarLogAuditoriaSeguro({
          empresa_id: integracao.empresa_id,
          categoria: "imobiliario",
          entidade: "imovel_externo",
          entidade_id: imovelExterno.id,
          acao:
            normalizado.action === "delete"
              ? "imovel_externo_arquivado_webhook"
              : "imovel_externo_recebido_webhook",
          descricao: `${integracao.nome}: ${normalizado.eventType}`,
          metadata: {
            integracao_id: integracao.id,
            event_id: normalizado.eventId,
            external_id: normalizado.externalId,
          },
          ip: auditMeta.ip,
          user_agent: auditMeta.user_agent,
        });
      }

      return NextResponse.json({
        ok: true,
        duplicated: false,
        action:
          normalizado.action === "delete"
            ? imovelExterno
              ? "archived"
              : "ignored"
            : "upserted",
        event_id: normalizado.eventId,
        external_id: normalizado.externalId,
        imovel_externo_id: imovelExterno?.id ?? null,
        images_received_as_urls: normalizado.imovel.imagemUrls.length,
      });
    } catch (error) {
      const mensagem =
        error instanceof Error ? error.message : "Erro ao processar evento.";

      await atualizarEvento(evento.id, "erro", mensagem);
      throw error;
    }
  } catch (error) {
    console.error("[WEBHOOK IMOVEIS]", error);

    return jsonErro("Erro interno ao processar o webhook.", 500);
  }
}
