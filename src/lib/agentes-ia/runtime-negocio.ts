/* eslint-disable @typescript-eslint/no-explicit-any */

import crypto from "node:crypto";
import OpenAI from "openai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { registrarUsoTokensIa } from "@/lib/ia/tokens";
import { getWhatsAppAccessToken } from "@/lib/whatsapp/access-token";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send-text-message";
import { executarContingenciaAgente } from "./fallback";
import {
  carregarFerramentasNegocioAtivas,
  contextoPreconsultadoNegocio,
  definicoesFerramentasNegocio,
  executarFerramentaNegocio,
  preconsultarNegocio,
  type HistoricoNegocio,
  type TipoFerramentaNegocio,
} from "./ferramentas-negocio";

const supabaseAdmin = getSupabaseAdmin();
const MODELO_PADRAO = process.env.OPENAI_AGENT_MODEL?.trim() || "gpt-5.6-luna";
const MAX_RODADAS = 3;
const MAX_MENSAGENS_SAIDA = 3;

const FERRAMENTAS_EXECUTAVEIS = new Set<TipoFerramentaNegocio>([
  "consultar_produtos_estoque",
  "informar_valor_produto",
  "consultar_servicos",
  "consultar_imoveis",
  "realizar_venda",
]);

type PendenciaRow = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  numero_destino?: string | null;
  mensagem_ids: string[];
  conteudo_agregado: string;
  status: string;
  versao: number;
};

type EstadoConversa = {
  tipo_negocio: string | null;
  dores: string[];
  interesses: string[];
  objecoes: string[];
  estagio: string;
  proxima_acao: string | null;
  fatos_confirmados: string[];
};

type SaidaAgente = {
  mensagens: string[];
  estado: EstadoConversa;
};

type ContextoRuntime = {
  pendencia: PendenciaRow;
  agente: any;
  execucaoId: string;
  historico: HistoricoNegocio[];
  estado: EstadoConversa;
  produtosAutorizados: Set<string>;
  confirmacaoVenda: boolean;
  ferramentasExecutadas: Array<Record<string, unknown>>;
  acaoCriticaExecutada: boolean;
  respostaEnviada: boolean;
  vendaResultado: any | null;
};

const ESTADO_VAZIO: EstadoConversa = {
  tipo_negocio: null,
  dores: [],
  interesses: [],
  objecoes: [],
  estagio: "novo",
  proxima_acao: null,
  fatos_confirmados: [],
};

function textoCurto(valor: unknown, limite: number) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, limite);
}

function listaCurta(valor: unknown, maxItens: number, maxChars = 120) {
  if (!Array.isArray(valor)) return [] as string[];
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const bruto of valor) {
    const item = textoCurto(bruto, maxChars);
    const chave = item.toLocaleLowerCase("pt-BR");
    if (!item || vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(item);
    if (itens.length >= maxItens) break;
  }
  return itens;
}

function normalizarEstado(valor: unknown): EstadoConversa {
  const obj = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  return {
    tipo_negocio: textoCurto(obj.tipo_negocio, 120) || null,
    dores: listaCurta(obj.dores, 6),
    interesses: listaCurta(obj.interesses, 6),
    objecoes: listaCurta(obj.objecoes, 5),
    estagio: textoCurto(obj.estagio, 80) || "novo",
    proxima_acao: textoCurto(obj.proxima_acao, 160) || null,
    fatos_confirmados: listaCurta(obj.fatos_confirmados, 8, 140),
  };
}

function unir(base: string[], novos: unknown, maxItens: number, maxChars = 120) {
  return listaCurta([...(base || []), ...listaCurta(novos, maxItens, maxChars)], maxItens, maxChars);
}

function aplicarDelta(estado: EstadoConversa, delta: unknown): EstadoConversa {
  const obj = delta && typeof delta === "object" ? (delta as Record<string, unknown>) : {};
  const temProxima = Object.prototype.hasOwnProperty.call(obj, "proxima_acao");
  return {
    tipo_negocio: textoCurto(obj.tipo_negocio, 120) || estado.tipo_negocio,
    dores: unir(estado.dores, obj.dores, 6),
    interesses: unir(estado.interesses, obj.interesses, 6),
    objecoes: unir(estado.objecoes, obj.objecoes, 5),
    estagio: textoCurto(obj.estagio, 80) || estado.estagio,
    proxima_acao: temProxima
      ? textoCurto(obj.proxima_acao, 160) || null
      : estado.proxima_acao,
    fatos_confirmados: unir(estado.fatos_confirmados, obj.fatos, 8, 140),
  };
}

function normalizarSaida(valor: unknown, estado: EstadoConversa, fallback = ""): SaidaAgente {
  const obj = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const mensagens = Array.isArray(obj.mensagens)
    ? obj.mensagens
        .map((item) => textoCurto(item, 900))
        .filter(Boolean)
        .slice(0, MAX_MENSAGENS_SAIDA)
    : [];
  if (!mensagens.length && fallback.trim()) mensagens.push(textoCurto(fallback, 900));
  return {
    mensagens,
    estado: aplicarDelta(estado, obj.memoria_delta),
  };
}

function formatarDinheiro(valor: unknown) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numero);
}

function respostaVenda(resultado: any) {
  const numero = resultado?.numero ? ` #${resultado.numero}` : "";
  const total = Number.isFinite(Number(resultado?.total))
    ? ` no valor de ${formatarDinheiro(resultado.total)}`
    : "";
  return [
    `Pedido${numero} criado${total} e estoque reservado.`,
    "O pagamento ainda não foi confirmado.",
  ];
}

function estadoAposVenda(estado: EstadoConversa, resultado: any): EstadoConversa {
  if (!resultado?.ok) return estado;
  const numero = resultado.numero ? ` #${resultado.numero}` : "";
  const total = Number.isFinite(Number(resultado.total))
    ? `, total ${formatarDinheiro(resultado.total)}`
    : "";
  return {
    ...estado,
    estagio: "pedido de venda criado",
    proxima_acao: "seguir com pagamento e entrega conforme o processo da empresa",
    fatos_confirmados: unir(
      estado.fatos_confirmados,
      [`Pedido de venda${numero} criado${total}; pagamento não confirmado`],
      8,
      140
    ),
  };
}

function memoriaCompacta(estado: EstadoConversa) {
  return [
    estado.tipo_negocio ? `negócio=${estado.tipo_negocio}` : "",
    estado.estagio ? `estágio=${estado.estagio}` : "",
    estado.proxima_acao ? `próxima=${estado.proxima_acao}` : "",
    estado.interesses.length ? `interesses=${estado.interesses.slice(-4).join("; ")}` : "",
    estado.dores.length ? `dores=${estado.dores.slice(-3).join("; ")}` : "",
    estado.objecoes.length ? `objeções=${estado.objecoes.slice(-2).join("; ")}` : "",
    estado.fatos_confirmados.length
      ? `fatos=${estado.fatos_confirmados.slice(-4).join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 900);
}

async function carregarHistorico(
  empresaId: string,
  conversaId: string,
  limite: number
): Promise<HistoricoNegocio[]> {
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("remetente_tipo, conteudo, created_at")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(Math.max(4, Math.min(12, limite)));
  if (error) throw new Error(error.message);
  return (data || [])
    .reverse()
    .filter((item) => String(item.conteudo || "").trim())
    .map((item) => ({
      role: item.remetente_tipo === "contato" ? ("user" as const) : ("assistant" as const),
      content: String(item.conteudo || "").slice(0, 500),
    }));
}

async function carregarEstado(empresaId: string, agenteId: string, conversaId: string) {
  const { data, error } = await supabaseAdmin
    .from("agente_ia_conversa_estados")
    .select("estado_json")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId)
    .eq("conversa_id", conversaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.estado_json ? normalizarEstado(data.estado_json) : { ...ESTADO_VAZIO };
}

function conversaComHumano(conversa: any) {
  if (!conversa) return true;
  if (conversa.aguardando_atendente === true) return true;
  return conversa.bot_ativo !== true && ["fila", "em_atendimento"].includes(String(conversa.status || ""));
}

async function enviarMensagem(params: {
  empresaId: string;
  conversaId: string;
  agenteId: string;
  execucaoId: string;
  numeroDestino: string;
  texto: string;
}) {
  const { data: conversa, error: conversaError } = await supabaseAdmin
    .from("conversas")
    .select("integracao_whatsapp_id")
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId)
    .maybeSingle();
  if (conversaError || !conversa?.integracao_whatsapp_id) {
    throw new Error("Conversa sem integração WhatsApp.");
  }

  const { data: integracao, error: integracaoError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, phone_number_id, token_ref, config_json")
    .eq("empresa_id", params.empresaId)
    .eq("id", conversa.integracao_whatsapp_id)
    .maybeSingle();
  if (integracaoError || !integracao?.phone_number_id) {
    throw new Error("Integração WhatsApp indisponível.");
  }
  const accessToken = getWhatsAppAccessToken(integracao);
  if (!accessToken) throw new Error("Token do WhatsApp indisponível.");

  const envio = await sendWhatsAppTextMessage({
    phoneNumberId: integracao.phone_number_id,
    accessToken,
    to: params.numeroDestino,
    body: params.texto,
  });

  const { data: protocolo } = await supabaseAdmin
    .from("conversa_protocolos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .eq("ativo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const agora = new Date().toISOString();
  const { error: persistenciaError } = await supabaseAdmin.from("mensagens").insert({
    empresa_id: params.empresaId,
    conversa_id: params.conversaId,
    conversa_protocolo_id: protocolo?.id || null,
    remetente_tipo: "bot",
    remetente_id: null,
    conteudo: params.texto,
    tipo_mensagem: "texto",
    origem: "automatica",
    status_envio: envio.ok ? "enviada" : "falha",
    mensagem_externa_id: envio.messageId,
    metadata_json: {
      origem: "agente_ia_negocio",
      agente_id: params.agenteId,
      agente_execucao_id: params.execucaoId,
      meta_status: envio.status,
      meta_error: envio.error,
    },
    created_at: agora,
    updated_at: agora,
  });
  if (persistenciaError) {
    console.error("[AGENTE_IA_NEGOCIO] Falha ao persistir mensagem:", persistenciaError);
  }
  if (!envio.ok) throw new Error(envio.error || "Falha ao enviar resposta do agente.");

  await supabaseAdmin
    .from("conversas")
    .update({ last_message_at: agora, updated_at: agora })
    .eq("empresa_id", params.empresaId)
    .eq("id", params.conversaId);
}

async function enviarMensagens(ctx: ContextoRuntime, mensagens: string[]) {
  if (!ctx.pendencia.numero_destino) return;
  const limpas = mensagens.map((item) => textoCurto(item, 900)).filter(Boolean).slice(0, 3);
  for (let indice = 0; indice < limpas.length; indice++) {
    if (indice > 0) {
      const delay = Math.min(1200, Math.max(450, 350 + limpas[indice - 1].length * 2));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    await enviarMensagem({
      empresaId: ctx.pendencia.empresa_id,
      conversaId: ctx.pendencia.conversa_id,
      agenteId: ctx.agente.id,
      execucaoId: ctx.execucaoId,
      numeroDestino: ctx.pendencia.numero_destino,
      texto: limpas[indice],
    });
    ctx.respostaEnviada = true;
  }
}

async function finalizarPendencia(params: {
  pendencia: PendenciaRow;
  lockToken: string;
  status: "processado" | "erro" | "cancelado";
  erro?: string | null;
}) {
  const { data, error } = await supabaseAdmin.rpc("agente_ia_finalizar_pendencia", {
    p_pendencia_id: params.pendencia.id,
    p_lock_token: params.lockToken,
    p_versao: params.pendencia.versao,
    p_status: params.status,
    p_erro: params.erro || null,
  });
  if (error) throw new Error(error.message);
  return data as { ok?: boolean; reagendar?: boolean; status?: string } | null;
}

function montarFerramentasRelevantes(
  ferramentas: Awaited<ReturnType<typeof carregarFerramentasNegocioAtivas>>,
  preconsulta: Awaited<ReturnType<typeof preconsultarNegocio>>
) {
  const relevantes = new Map<TipoFerramentaNegocio, Record<string, unknown>>();
  for (const resultado of preconsulta.resultados) {
    const config = ferramentas.get(resultado.ferramenta);
    if (config && FERRAMENTAS_EXECUTAVEIS.has(resultado.ferramenta)) {
      relevantes.set(resultado.ferramenta, config);
    }
  }
  if (preconsulta.confirmacaoVenda && ferramentas.has("realizar_venda")) {
    relevantes.set("realizar_venda", ferramentas.get("realizar_venda") || {});
    for (const tipo of ["consultar_produtos_estoque", "informar_valor_produto"] as const) {
      if (ferramentas.has(tipo)) relevantes.set(tipo, ferramentas.get(tipo) || {});
    }
  }
  return relevantes;
}

function instrucoesAgente(agente: any, estado: EstadoConversa) {
  return [
    `Você é ${agente.nome}, assistente do CRM Prosperity.`,
    agente.prompt_sistema || "",
    agente.tom_voz ? `Características: ${agente.tom_voz}` : "",
    agente.instrucoes ? `Instruções: ${agente.instrucoes}` : "",
    "REGRAS OPERACIONAIS DE NEGÓCIO:",
    "- Responda em PT-BR para WhatsApp, em 1 a 3 mensagens curtas e naturais.",
    "- Produto, estoque, preço, serviço e imóvel: use somente os dados do backend desta execução. Nunca estime ou invente.",
    "- A ferramenta de estoque NÃO autoriza informar preço. Para preço de produto use somente Informar valor do produto.",
    "- Venda: só execute realizar_venda depois de confirmação explícita do cliente. O backend revalida produto, preço, saldo e quantidade.",
    "- realizar_venda cria um PEDIDO DE VENDA e reserva estoque. Isso NÃO significa pagamento recebido. Nunca diga que o pagamento foi confirmado sem uma confirmação real do gateway.",
    "- Se um produto, serviço ou imóvel não for encontrado, diga que não encontrou nos dados atuais e peça um detalhe útil para refinar a busca.",
    "- Não prometa consultar, vender ou verificar depois. Execute a ferramenta no mesmo turno ou peça objetivamente o dado que falta.",
    `Memória: ${memoriaCompacta(estado) || "sem fatos relevantes"}`,
    "Em memoria_delta registre apenas novidades reais. Interesses e preferências explícitos do cliente devem entrar em interesses; o CRM cuidará da persistência quando essa capacidade estiver habilitada.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const FORMATO_SAIDA = {
  type: "json_schema",
  name: "resposta_agente_negocio",
  strict: true,
  schema: {
    type: "object",
    properties: {
      mensagens: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string", minLength: 1, maxLength: 900 },
      },
      memoria_delta: {
        type: "object",
        properties: {
          tipo_negocio: { anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }] },
          estagio: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] },
          proxima_acao: { anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }] },
          dores: { type: "array", maxItems: 2, items: { type: "string", maxLength: 120 } },
          interesses: { type: "array", maxItems: 2, items: { type: "string", maxLength: 120 } },
          objecoes: { type: "array", maxItems: 2, items: { type: "string", maxLength: 120 } },
          fatos: { type: "array", maxItems: 3, items: { type: "string", maxLength: 140 } },
        },
        required: [
          "tipo_negocio",
          "estagio",
          "proxima_acao",
          "dores",
          "interesses",
          "objecoes",
          "fatos",
        ],
        additionalProperties: false,
      },
    },
    required: ["mensagens", "memoria_delta"],
    additionalProperties: false,
  },
};

async function preflight(pendenciaId: string) {
  const { data: pendencia, error } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select(
      "id, empresa_id, agente_id, conversa_id, contato_id, numero_destino, mensagem_ids, conteudo_agregado, status, versao"
    )
    .eq("id", pendenciaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pendencia || !["pendente", "processando"].includes(String(pendencia.status || ""))) {
    return { relevante: false as const };
  }

  const ferramentas = await carregarFerramentasNegocioAtivas(
    pendencia.empresa_id,
    pendencia.agente_id
  );
  const temExecutavel = Array.from(ferramentas.keys()).some((tipo) =>
    FERRAMENTAS_EXECUTAVEIS.has(tipo)
  );
  if (!temExecutavel) return { relevante: false as const };

  const historico = await carregarHistorico(pendencia.empresa_id, pendencia.conversa_id, 6);
  const preconsulta = await preconsultarNegocio({
    empresaId: pendencia.empresa_id,
    agenteId: pendencia.agente_id,
    ferramentas,
    mensagem: pendencia.conteudo_agregado,
    historico,
  });
  return {
    relevante: preconsulta.relevante,
    pendencia: pendencia as PendenciaRow,
  };
}

export async function processarPendenciaNegocio(
  pendenciaId: string,
  options: { forcar?: boolean } = {}
): Promise<{ tratado: boolean; resultado?: Record<string, unknown> }> {
  const verificacao = await preflight(pendenciaId);
  if (!verificacao.relevante) return { tratado: false };

  const lockToken = crypto.randomUUID();
  const { data: reservada, error: reservaError } = await supabaseAdmin.rpc(
    "agente_ia_reservar_pendencia",
    {
      p_pendencia_id: pendenciaId,
      p_lock_token: lockToken,
      p_forcar: options.forcar === true,
    }
  );
  if (reservaError) throw new Error(reservaError.message);
  if (!reservada) {
    return {
      tratado: true,
      resultado: { ok: true, processado: false, motivo: "pendencia_indisponivel_ou_debounce" },
    };
  }

  const pendencia = reservada as PendenciaRow;
  const inicio = Date.now();
  let execucaoId = "";
  let ctx: ContextoRuntime | null = null;
  let tokensInput = 0;
  let tokensOutput = 0;
  let tokensTotal = 0;

  try {
    const [
      { data: agente, error: agenteError },
      { data: conversa, error: conversaError },
      ferramentas,
    ] = await Promise.all([
      supabaseAdmin
        .from("agentes_ia")
        .select(
          "id, empresa_id, nome, status, modelo, prompt_sistema, tom_voz, instrucoes, max_mensagens_contexto, fallback_tipo, fallback_fluxo_id, fallback_transferencia_json"
        )
        .eq("empresa_id", pendencia.empresa_id)
        .eq("id", pendencia.agente_id)
        .eq("status", "ativo")
        .maybeSingle(),
      supabaseAdmin
        .from("conversas")
        .select("id, status, bot_ativo, aguardando_atendente, integracao_whatsapp_id")
        .eq("empresa_id", pendencia.empresa_id)
        .eq("id", pendencia.conversa_id)
        .maybeSingle(),
      carregarFerramentasNegocioAtivas(pendencia.empresa_id, pendencia.agente_id),
    ]);

    if (agenteError || !agente) {
      await finalizarPendencia({
        pendencia,
        lockToken,
        status: "cancelado",
        erro: "agente_inativo_ou_removido",
      });
      return {
        tratado: true,
        resultado: { ok: true, processado: false, motivo: "agente_inativo_ou_removido" },
      };
    }
    if (conversaError || conversaComHumano(conversa)) {
      await finalizarPendencia({
        pendencia,
        lockToken,
        status: "cancelado",
        erro: "atendimento_humano",
      });
      return {
        tratado: true,
        resultado: { ok: true, processado: false, motivo: "atendimento_humano" },
      };
    }

    const limiteContexto = Math.max(
      4,
      Math.min(12, Number(agente.max_mensagens_contexto || 4))
    );
    const [historico, estado] = await Promise.all([
      carregarHistorico(pendencia.empresa_id, pendencia.conversa_id, limiteContexto),
      carregarEstado(pendencia.empresa_id, agente.id, pendencia.conversa_id),
    ]);

    const preconsulta = await preconsultarNegocio({
      empresaId: pendencia.empresa_id,
      agenteId: agente.id,
      ferramentas,
      mensagem: pendencia.conteudo_agregado,
      historico,
    });
    const ferramentasRelevantes = montarFerramentasRelevantes(ferramentas, preconsulta);

    const { data: execucao, error: execucaoError } = await supabaseAdmin
      .from("agente_ia_execucoes")
      .insert({
        empresa_id: pendencia.empresa_id,
        agente_id: agente.id,
        conversa_id: pendencia.conversa_id,
        contato_id: pendencia.contato_id || null,
        mensagem_ids: pendencia.mensagem_ids,
        status: "processando",
        entrada_resumida: pendencia.conteudo_agregado.slice(0, 4000),
        modelo: agente.modelo || MODELO_PADRAO,
        started_at: new Date().toISOString(),
        metadata_json: { runtime: "negocio" },
      })
      .select("id")
      .single();
    if (execucaoError || !execucao) {
      throw new Error(execucaoError?.message || "Não foi possível abrir execução do agente.");
    }
    execucaoId = execucao.id;

    ctx = {
      pendencia,
      agente,
      execucaoId,
      historico,
      estado,
      produtosAutorizados: preconsulta.produtosAutorizados,
      confirmacaoVenda: preconsulta.confirmacaoVenda,
      ferramentasExecutadas: preconsulta.resultados.map((item) => ({
        nome: item.ferramenta,
        preconsulta: true,
        resultado: { ok: true, dados: item.dados },
      })),
      acaoCriticaExecutada: false,
      respostaEnviada: false,
      vendaResultado: null,
    };

    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY não configurada.");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const modelo = String(agente.modelo || MODELO_PADRAO).trim() || MODELO_PADRAO;
    const inputIa: any[] = historico.length
      ? [...historico]
      : [{ role: "user", content: pendencia.conteudo_agregado }];
    const contextoOperacional = contextoPreconsultadoNegocio(preconsulta);
    if (contextoOperacional) {
      inputIa.push({ role: "developer", content: contextoOperacional });
    }

    let saidaFinal: SaidaAgente = { mensagens: [], estado };
    const tools = definicoesFerramentasNegocio(ferramentasRelevantes, preconsulta);

    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const request: any = {
        model: modelo,
        instructions: instrucoesAgente(agente, estado),
        input: inputIa,
        parallel_tool_calls: false,
        reasoning: { effort: "none" },
        text: { verbosity: "low", format: FORMATO_SAIDA },
      };
      if (tools.length) request.tools = tools;

      const response: any = await openai.responses.create(request);
      tokensInput += Number(response.usage?.input_tokens || 0);
      tokensOutput += Number(response.usage?.output_tokens || 0);
      tokensTotal += Number(response.usage?.total_tokens || 0);

      const chamadas = (response.output || []).filter((item: any) => item.type === "function_call");
      inputIa.push(...(response.output || []));

      if (!chamadas.length) {
        const textoSaida = String(response.output_text || "").trim();
        try {
          saidaFinal = normalizarSaida(JSON.parse(textoSaida), estado);
        } catch {
          saidaFinal = normalizarSaida(null, estado, textoSaida);
        }
        break;
      }

      for (const chamada of chamadas) {
        const nome = String(chamada.name || "") as TipoFerramentaNegocio;
        if (!ferramentasRelevantes.has(nome) || !FERRAMENTAS_EXECUTAVEIS.has(nome)) {
          inputIa.push({
            type: "function_call_output",
            call_id: chamada.call_id,
            output: JSON.stringify({ ok: false, error: "Ferramenta não habilitada para esta mensagem." }),
          });
          continue;
        }

        let argumentos: any = {};
        try {
          argumentos = JSON.parse(chamada.arguments || "{}");
        } catch {
          argumentos = {};
        }

        let resultado: any;
        try {
          resultado = await executarFerramentaNegocio({
            tipo: nome,
            empresaId: pendencia.empresa_id,
            agenteId: agente.id,
            conversaId: pendencia.conversa_id,
            argumentos,
            produtosAutorizados: ctx.produtosAutorizados,
            confirmacaoVenda: ctx.confirmacaoVenda,
            mensagemIds: pendencia.mensagem_ids,
          });
        } catch (error) {
          resultado = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        ctx.ferramentasExecutadas.push({ nome, argumentos, resultado });
        if (nome === "realizar_venda" && resultado?.ok === true) {
          ctx.acaoCriticaExecutada = true;
          ctx.vendaResultado = resultado;
          saidaFinal = {
            mensagens: respostaVenda(resultado),
            estado: estadoAposVenda(estado, resultado),
          };
        }

        inputIa.push({
          type: "function_call_output",
          call_id: chamada.call_id,
          output: JSON.stringify(resultado),
        });
      }

      if (ctx.vendaResultado?.ok === true) break;
    }

    if (tokensTotal > 0) {
      await registrarUsoTokensIa({
        empresaId: pendencia.empresa_id,
        origem: "agente_ia_chat",
        modelo,
        tokensTotal,
        tokensInput,
        tokensOutput,
        metadata: {
          agente_id: agente.id,
          agente_execucao_id: execucaoId,
          conversa_id: pendencia.conversa_id,
          runtime: "negocio",
          ferramentas_negocio: ctx.ferramentasExecutadas.map((item) => item.nome),
        },
      });
    }

    const { data: versaoAtual } = await supabaseAdmin
      .from("agente_ia_pendencias")
      .select("versao")
      .eq("id", pendencia.id)
      .maybeSingle();
    const supersedido = Number(versaoAtual?.versao || 0) > Number(pendencia.versao);

    if (supersedido && !ctx.acaoCriticaExecutada) {
      const agora = new Date().toISOString();
      await supabaseAdmin
        .from("agente_ia_execucoes")
        .update({
          status: "cancelado",
          resposta: saidaFinal.mensagens.join("\n\n") || null,
          ferramentas_json: ctx.ferramentasExecutadas,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          tokens_total: tokensTotal,
          latencia_ms: Date.now() - inicio,
          finished_at: agora,
          updated_at: agora,
          metadata_json: { runtime: "negocio", supersedido_por_novas_mensagens: true },
        })
        .eq("id", execucaoId);
      await finalizarPendencia({ pendencia, lockToken, status: "processado" });
      return {
        tratado: true,
        resultado: { ok: true, processado: true, supersedido: true },
      };
    }

    if (!saidaFinal.mensagens.length) {
      saidaFinal.mensagens = [
        ctx.acaoCriticaExecutada
          ? "Pronto, o pedido foi criado."
          : "Não encontrei informação suficiente nos dados atuais. Me passe um detalhe do que você procura.",
      ];
    }
    await enviarMensagens(ctx, saidaFinal.mensagens);

    await supabaseAdmin.from("agente_ia_conversa_estados").upsert(
      {
        empresa_id: pendencia.empresa_id,
        agente_id: agente.id,
        conversa_id: pendencia.conversa_id,
        resumo: memoriaCompacta(saidaFinal.estado).slice(0, 1800),
        estado_json: {
          ...saidaFinal.estado,
          ultima_acao_critica: ctx.acaoCriticaExecutada,
          runtime_ultima_interacao: "negocio",
          pedido_venda_id: ctx.vendaResultado?.documento_id || null,
        },
        ultima_mensagem_id: pendencia.mensagem_ids.at(-1) || null,
        ultima_interacao_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agente_id,conversa_id" }
    );

    const finalAgora = new Date().toISOString();
    await supabaseAdmin
      .from("agente_ia_execucoes")
      .update({
        status: "concluido",
        resposta: saidaFinal.mensagens.join("\n\n") || null,
        ferramentas_json: ctx.ferramentasExecutadas,
        tokens_input: tokensInput,
        tokens_output: tokensOutput,
        tokens_total: tokensTotal,
        latencia_ms: Date.now() - inicio,
        finished_at: finalAgora,
        updated_at: finalAgora,
        metadata_json: {
          runtime: "negocio",
          venda_criada: ctx.vendaResultado?.ok === true,
          documento_venda_id: ctx.vendaResultado?.documento_id || null,
          pagamento_confirmado: false,
        },
      })
      .eq("id", execucaoId);
    await finalizarPendencia({ pendencia, lockToken, status: "processado" });

    return {
      tratado: true,
      resultado: {
        ok: true,
        processado: true,
        runtime: "negocio",
        vendaCriada: ctx.vendaResultado?.ok === true,
        documentoId: ctx.vendaResultado?.documento_id || null,
      },
    };
  } catch (error) {
    const mensagemErro = error instanceof Error ? error.message : String(error);
    console.error("[AGENTE_IA_NEGOCIO] Erro:", { pendenciaId, erro: mensagemErro });

    let contingencia: unknown = null;
    if (ctx && !ctx.acaoCriticaExecutada && !ctx.respostaEnviada) {
      try {
        contingencia = await executarContingenciaAgente(ctx.agente, pendencia);
      } catch (fallbackError) {
        console.error("[AGENTE_IA_NEGOCIO] Contingência falhou:", fallbackError);
      }
    } else if (
      ctx?.acaoCriticaExecutada &&
      !ctx.respostaEnviada &&
      pendencia.numero_destino &&
      execucaoId
    ) {
      try {
        await enviarMensagem({
          empresaId: pendencia.empresa_id,
          conversaId: pendencia.conversa_id,
          agenteId: pendencia.agente_id,
          execucaoId,
          numeroDestino: pendencia.numero_destino,
          texto:
            "O pedido foi processado, mas tive uma instabilidade para concluir a resposta. O pagamento não foi confirmado por esta etapa.",
        });
      } catch {}
    }

    const agora = new Date().toISOString();
    if (execucaoId) {
      await supabaseAdmin
        .from("agente_ia_execucoes")
        .update({
          status: ctx?.acaoCriticaExecutada ? "erro" : "fallback",
          erro: mensagemErro,
          ferramentas_json: ctx?.ferramentasExecutadas || [],
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          tokens_total: tokensTotal,
          latencia_ms: Date.now() - inicio,
          finished_at: agora,
          updated_at: agora,
          metadata_json: { runtime: "negocio", contingencia },
        })
        .eq("id", execucaoId);
    }
    await finalizarPendencia({
      pendencia,
      lockToken,
      status: ctx?.acaoCriticaExecutada ? "erro" : "processado",
      erro: mensagemErro,
    }).catch(() => null);

    return {
      tratado: true,
      resultado: {
        ok: ctx?.acaoCriticaExecutada ? false : true,
        processado: true,
        fallback: !ctx?.acaoCriticaExecutada,
        error: mensagemErro,
      },
    };
  }
}
