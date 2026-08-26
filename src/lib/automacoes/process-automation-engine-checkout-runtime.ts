import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { consultarEstoqueProduto } from "@/lib/estoque/consultar-estoque-produto";
import {
  criarPreferenciaCheckoutMercadoPago,
  type MercadoPagoPayment,
} from "@/lib/mercado-pago/checkout";
import {
  enviarMensagemAutomacao,
  executarNo as executarNoBase,
} from "./process-automation-engine-agenda";
import { continuarConsultasEstoqueAutomacao } from "./process-automation-engine-estoque-runtime";

const supabaseAdmin = getSupabaseAdmin();

export const TIPO_NO_CHECKOUT_PAGAMENTO = "checkout_pagamento";
export const RESULTADO_CHECKOUT_APROVADO = "pagamento_aprovado";
export const RESULTADO_CHECKOUT_SEM_ESTOQUE = "sem_estoque";
export const RESULTADO_CHECKOUT_EXPIRADO = "expirado_cancelado";
export const RESULTADO_CHECKOUT_ERRO = "erro";

const STATUS_AGUARDANDO = "aguardando_pagamento";
const STATUS_PROCESSANDO = "processando";
const MENSAGEM_PADRAO_EDITOR = "Digite a mensagem aqui.";
const EXPIRACAO_PADRAO_MINUTOS = 30;
const GRACA_EXPIRACAO_MINUTOS = 5;

type ContinuarCheckoutParams = {
  empresaId: string;
  conversaId: string;
  numeroDestino: string;
  execucaoId?: string | null;
};

function objeto(valor: unknown): Record<string, any> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numeroPositivo(valor: unknown) {
  const bruto = texto(valor).replace(/\s+/g, "");
  if (!bruto) return null;
  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function normalizarChaveVariavel(valor: unknown, fallback: string) {
  const chave = texto(valor)
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^variaveis\./i, "")
    .trim();
  return chave || fallback;
}

function minutosExpiracao(config: Record<string, any>) {
  const informado = Number(config.expiracao_minutos || EXPIRACAO_PADRAO_MINUTOS);
  if (!Number.isFinite(informado)) return EXPIRACAO_PADRAO_MINUTOS;
  return Math.min(24 * 60, Math.max(5, Math.floor(informado)));
}

function visitaAtual(metadata: Record<string, any>, noId: string) {
  const visitas = objeto(metadata.visitas_nos);
  const valor = Math.floor(Number(visitas[noId] || 1));
  return Number.isFinite(valor) && valor > 0 ? valor : 1;
}

function mensagemCheckout(config: Record<string, any>, variaveis: Record<string, string>) {
  const configurada = texto(config.mensagem);
  const base =
    configurada && configurada !== MENSAGEM_PADRAO_EDITOR
      ? configurada
      : `Seu pedido ficou em *${variaveis.pagamento_valor_formatado}*.\n\nPara concluir a compra, acesse o link seguro do Mercado Pago:\n${variaveis.checkout_url}`;

  return base.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, chave: string) => {
    return variaveis[chave] ?? `{{${chave}}}`;
  });
}

async function registrarLog(params: {
  empresaId: string;
  execucaoId: string;
  fluxoId: string;
  noId: string;
  conexaoId?: string | null;
  tipoEvento: string;
  descricao: string;
  entrada?: Record<string, any>;
  saida?: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from("automacao_execucao_logs").insert({
    empresa_id: params.empresaId,
    execucao_id: params.execucaoId,
    fluxo_id: params.fluxoId,
    no_id: params.noId,
    conexao_id: params.conexaoId || null,
    tipo_evento: params.tipoEvento,
    descricao: params.descricao,
    entrada_json: params.entrada || {},
    saida_json: params.saida || {},
  });

  if (error) console.error("[CHECKOUT_AUTOMACAO] Erro ao registrar log:", error);
}

async function carregarExecucao(params: {
  empresaId: string;
  conversaId: string;
  execucaoId?: string | null;
  status?: string[];
}) {
  let query = supabaseAdmin
    .from("automacao_execucoes")
    .select("id,empresa_id,fluxo_id,contato_id,conversa_id,no_atual_id,status,metadata_json")
    .eq("empresa_id", params.empresaId)
    .eq("conversa_id", params.conversaId)
    .in("status", params.status || ["rodando", "aguardando"]);

  if (params.execucaoId) query = query.eq("id", params.execucaoId);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar execucao do checkout: ${error.message}`);
  return data || null;
}

async function carregarNo(empresaId: string, fluxoId: string, noId: string) {
  const { data, error } = await supabaseAdmin
    .from("automacao_nos")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("fluxo_id", fluxoId)
    .eq("id", noId)
    .eq("ativo", true)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar bloco do checkout: ${error.message}`);
  return data || null;
}

async function carregarTransacao(params: {
  empresaId: string;
  execucaoId: string;
  noId: string;
  visita: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", params.execucaoId)
    .eq("no_id", params.noId)
    .eq("visita", params.visita)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar transacao do checkout: ${error.message}`);
  return data || null;
}

async function salvarVariaveis(params: {
  empresaId: string;
  execucao: any;
  noId: string;
  variaveis: Record<string, string>;
  checkoutPendente?: Record<string, any> | null;
}) {
  const agora = new Date().toISOString();
  const registros = Object.entries(params.variaveis).map(([chave, valor]) => ({
    empresa_id: params.empresaId,
    execucao_id: params.execucao.id,
    contato_id: params.execucao.contato_id,
    chave,
    valor: String(valor ?? ""),
    metadata_json: {
      origem: TIPO_NO_CHECKOUT_PAGAMENTO,
      no_id: params.noId,
    },
    updated_at: agora,
  }));

  if (registros.length > 0) {
    const { error } = await supabaseAdmin
      .from("automacao_variaveis")
      .upsert(registros, { onConflict: "execucao_id,chave" });
    if (error) throw new Error(`Erro ao salvar variaveis do checkout: ${error.message}`);
  }

  const metadata = objeto(params.execucao.metadata_json);
  const variaveisAtuais = objeto(metadata.variaveis);
  const metadataAtualizado: Record<string, any> = {
    ...metadata,
    variaveis: { ...variaveisAtuais, ...params.variaveis },
  };

  if (params.checkoutPendente === null) {
    delete metadataAtualizado.checkout_pendente;
  } else if (params.checkoutPendente) {
    metadataAtualizado.checkout_pendente = params.checkoutPendente;
  }

  const { error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({ metadata_json: metadataAtualizado, updated_at: agora })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId);

  if (execucaoError) {
    throw new Error(`Erro ao atualizar contexto do checkout: ${execucaoError.message}`);
  }

  params.execucao.metadata_json = metadataAtualizado;
}

async function buscarConexaoResultado(params: {
  empresaId: string;
  fluxoId: string;
  noId: string;
  resultado: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_conexoes")
    .select("*")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId)
    .eq("no_origem_id", params.noId)
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  if (error) throw new Error(`Erro ao buscar saida do checkout: ${error.message}`);

  return (
    (data || []).find(
      (conexao) => texto(objeto(conexao.condicao_json).valor) === params.resultado
    ) || null
  );
}

async function marcarExecucaoErro(params: {
  empresaId: string;
  execucao: any;
  noId: string;
  motivo: string;
}) {
  const agora = new Date().toISOString();
  const metadata = objeto(params.execucao.metadata_json);

  await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      status: "erro",
      finished_at: agora,
      updated_at: agora,
      metadata_json: {
        ...metadata,
        checkout_erro: {
          no_id: params.noId,
          motivo: params.motivo,
          ocorrido_em: agora,
        },
      },
    })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId);
}

async function transicionarResultado(params: {
  empresaId: string;
  execucao: any;
  no: any;
  resultado: string;
  numeroDestino: string;
}) {
  const conexao = await buscarConexaoResultado({
    empresaId: params.empresaId,
    fluxoId: params.execucao.fluxo_id,
    noId: params.no.id,
    resultado: params.resultado,
  });

  if (!conexao) {
    const motivo = `Saida ${params.resultado} nao esta conectada no bloco Checkout / pagamento.`;
    await registrarLog({
      empresaId: params.empresaId,
      execucaoId: params.execucao.id,
      fluxoId: params.execucao.fluxo_id,
      noId: params.no.id,
      tipoEvento: "checkout_sem_saida",
      descricao: motivo,
      entrada: { resultado: params.resultado },
    });
    await marcarExecucaoErro({
      empresaId: params.empresaId,
      execucao: params.execucao,
      noId: params.no.id,
      motivo,
    });
    return { ok: false, erro: motivo };
  }

  const proximoNo = await carregarNo(
    params.empresaId,
    params.execucao.fluxo_id,
    conexao.no_destino_id
  );
  if (!proximoNo) {
    const motivo = "Bloco de destino do checkout nao foi encontrado.";
    await marcarExecucaoErro({
      empresaId: params.empresaId,
      execucao: params.execucao,
      noId: params.no.id,
      motivo,
    });
    return { ok: false, erro: motivo };
  }

  const metadata = objeto(params.execucao.metadata_json);
  const visitas = objeto(metadata.visitas_nos);
  const metadataAtualizado = { ...metadata };
  delete metadataAtualizado.checkout_pendente;

  const { data, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      no_atual_id: proximoNo.id,
      status: "rodando",
      metadata_json: {
        ...metadataAtualizado,
        visitas_nos: {
          ...visitas,
          [proximoNo.id]: Number(visitas[proximoNo.id] || 0) + 1,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId)
    .eq("no_atual_id", params.no.id)
    .in("status", ["rodando", "aguardando"])
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Erro ao avancar checkout: ${error.message}`);
  if (!data) return { ok: false, concorrencia: true };

  await registrarLog({
    empresaId: params.empresaId,
    execucaoId: params.execucao.id,
    fluxoId: params.execucao.fluxo_id,
    noId: params.no.id,
    conexaoId: conexao.id,
    tipoEvento: "checkout_conexao_seguida",
    descricao: "Motor seguiu a saida correspondente ao resultado do checkout.",
    entrada: { resultado: params.resultado },
    saida: { proximo_no_id: proximoNo.id, proximo_tipo_no: proximoNo.tipo_no },
  });

  await executarNoBase({
    empresaId: params.empresaId,
    conversaId: params.execucao.conversa_id,
    execucaoId: params.execucao.id,
    fluxoId: params.execucao.fluxo_id,
    no: proximoNo,
    mensagemTexto: params.resultado,
    numeroDestino: params.numeroDestino,
  });

  if (proximoNo.tipo_no === "consultar_estoque") {
    await continuarConsultasEstoqueAutomacao({
      empresaId: params.empresaId,
      conversaId: params.execucao.conversa_id,
      numeroDestino: params.numeroDestino,
      execucaoId: params.execucao.id,
    });
  }

  return { ok: true, proximoNoId: proximoNo.id };
}

async function numeroDestinoTransacao(transacao: any) {
  if (transacao.contato_id) {
    const { data } = await supabaseAdmin
      .from("contatos")
      .select("telefone")
      .eq("id", transacao.contato_id)
      .eq("empresa_id", transacao.empresa_id)
      .maybeSingle();
    if (texto(data?.telefone)) return texto(data?.telefone);
  }

  const { data: conversa } = await supabaseAdmin
    .from("conversas")
    .select("contato_id")
    .eq("id", transacao.conversa_id)
    .eq("empresa_id", transacao.empresa_id)
    .maybeSingle();

  if (!conversa?.contato_id) return "";
  const { data: contato } = await supabaseAdmin
    .from("contatos")
    .select("telefone")
    .eq("id", conversa.contato_id)
    .eq("empresa_id", transacao.empresa_id)
    .maybeSingle();
  return texto(contato?.telefone);
}

async function criarPedidoEReservar(params: {
  empresaId: string;
  execucao: any;
  transacao: any;
  produto: any;
  quantidade: number;
  valorUnitario: number;
  depositoId: string;
}) {
  let documentoId = texto(params.transacao.comercial_documento_id);

  if (!documentoId) {
    const { data, error } = await supabaseAdmin.rpc("comercial_salvar_documento", {
      p_empresa_id: params.empresaId,
      p_documento_id: null,
      p_tipo: "pedido_venda",
      p_parceiro_id: null,
      p_contato_id: params.execucao.contato_id || null,
      p_deposito_id: params.depositoId,
      p_data_emissao: new Date().toISOString().slice(0, 10),
      p_validade_em: null,
      p_previsao_em: null,
      p_desconto: 0,
      p_acrescimo: 0,
      p_frete: 0,
      p_observacao: `Checkout automatico ${params.transacao.id}`,
      p_itens: [
        {
          estoque_item_id: params.produto.id,
          descricao: params.produto.nome,
          unidade: params.produto.unidade,
          quantidade: params.quantidade,
          valor_unitario: params.valorUnitario,
          desconto: 0,
          deposito_id: params.depositoId,
        },
      ],
      p_usuario_id: null,
    });

    if (error || !data) {
      throw new Error(`Erro ao criar pedido de venda: ${error?.message || "sem retorno"}`);
    }

    documentoId = String(data);
    const { error: updateError } = await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .update({ comercial_documento_id: documentoId, updated_at: new Date().toISOString() })
      .eq("id", params.transacao.id)
      .eq("empresa_id", params.empresaId);
    if (updateError) throw new Error(`Erro ao vincular pedido ao checkout: ${updateError.message}`);
    params.transacao.comercial_documento_id = documentoId;
  }

  const { error: reservaError } = await supabaseAdmin.rpc(
    "comercial_reservar_pedido",
    {
      p_empresa_id: params.empresaId,
      p_documento_id: documentoId,
      p_usuario_id: null,
    }
  );

  if (reservaError) {
    throw new Error(`Erro ao reservar estoque do pedido: ${reservaError.message}`);
  }

  const { data: documento, error: documentoError } = await supabaseAdmin
    .from("comercial_documentos")
    .select("id,numero,total,status")
    .eq("id", documentoId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (documentoError || !documento) {
    throw new Error(`Erro ao carregar pedido reservado: ${documentoError?.message || "nao encontrado"}`);
  }

  return documento;
}

async function liberarPedido(transacao: any) {
  if (!transacao?.comercial_documento_id) return;
  const { error } = await supabaseAdmin.rpc("comercial_liberar_pedido", {
    p_empresa_id: transacao.empresa_id,
    p_documento_id: transacao.comercial_documento_id,
    p_usuario_id: null,
    p_cancelar: true,
  });
  if (error) {
    console.error("[CHECKOUT_AUTOMACAO] Erro ao liberar pedido:", {
      transacaoId: transacao.id,
      error,
    });
  }
}

async function prepararCheckout(params: {
  empresaId: string;
  execucao: any;
  no: any;
  numeroDestino: string;
}) {
  const config = objeto(params.no.configuracao_json);
  const metadata = objeto(params.execucao.metadata_json);
  const variaveis = objeto(metadata.variaveis);
  const produtoId = texto(variaveis.estoque_produto_id);
  const chaveQuantidade = normalizarChaveVariavel(
    config.variavel_quantidade,
    "quantidade_desejada"
  );
  const quantidade = numeroPositivo(variaveis[chaveQuantidade]);

  if (!produtoId) throw new Error("Checkout sem produto selecionado no contexto do fluxo");
  if (!quantidade) throw new Error(`Checkout sem quantidade valida em {{${chaveQuantidade}}}`);

  const depositoContexto = texto(variaveis.estoque_deposito_id);
  let consulta = await consultarEstoqueProduto({
    empresaId: params.empresaId,
    produtoId,
    depositoIds: depositoContexto ? [depositoContexto] : [],
    usarEmbalagemVenda: false,
  });

  if (!consulta.produto) {
    return transicionarResultado({
      empresaId: params.empresaId,
      execucao: params.execucao,
      no: params.no,
      resultado: RESULTADO_CHECKOUT_SEM_ESTOQUE,
      numeroDestino: params.numeroDestino,
    });
  }

  let depositoId = depositoContexto;
  if (!depositoId) {
    depositoId =
      consulta.depositos.find((item) => item.quantidade_disponivel >= quantidade)?.id || "";
    if (depositoId) {
      consulta = await consultarEstoqueProduto({
        empresaId: params.empresaId,
        produtoId,
        depositoIds: [depositoId],
        usarEmbalagemVenda: false,
      });
    }
  }

  if (
    !consulta.produto ||
    !depositoId ||
    consulta.resultado !== "disponivel" ||
    consulta.quantidade_disponivel < quantidade
  ) {
    await salvarVariaveis({
      empresaId: params.empresaId,
      execucao: params.execucao,
      noId: params.no.id,
      variaveis: { pagamento_status: "sem_estoque" },
    });
    return transicionarResultado({
      empresaId: params.empresaId,
      execucao: params.execucao,
      no: params.no,
      resultado: RESULTADO_CHECKOUT_SEM_ESTOQUE,
      numeroDestino: params.numeroDestino,
    });
  }

  const valorUnitario = Number(
    consulta.precos?.whatsapp ?? consulta.produto.preco ?? 0
  );
  if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) {
    throw new Error("Produto sem preco WhatsApp valido para gerar checkout");
  }

  const valorTotal = Number((valorUnitario * quantidade).toFixed(2));
  const visita = visitaAtual(metadata, params.no.id);
  let transacao = await carregarTransacao({
    empresaId: params.empresaId,
    execucaoId: params.execucao.id,
    noId: params.no.id,
    visita,
  });

  if (!transacao) {
    const transacaoId = randomUUID();
    const expiraEm = new Date(
      Date.now() + minutosExpiracao(config) * 60 * 1000
    ).toISOString();
    const { data, error } = await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .insert({
        id: transacaoId,
        empresa_id: params.empresaId,
        execucao_id: params.execucao.id,
        fluxo_id: params.execucao.fluxo_id,
        no_id: params.no.id,
        visita,
        conversa_id: params.execucao.conversa_id,
        contato_id: params.execucao.contato_id,
        gateway: "mercado_pago",
        external_reference: transacaoId,
        valor: valorTotal,
        status: "criando",
        expira_em: expiraEm,
        payload_json: {
          produto_id: consulta.produto.id,
          produto_nome: consulta.produto.nome,
          quantidade,
          valor_unitario: valorUnitario,
          deposito_id: depositoId,
        },
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao iniciar transacao do checkout: ${error?.message || "sem retorno"}`);
    }
    transacao = data;
  }

  if (transacao.status === STATUS_AGUARDANDO && transacao.checkout_url) {
    await supabaseAdmin
      .from("automacao_execucoes")
      .update({ status: "aguardando", updated_at: new Date().toISOString() })
      .eq("id", params.execucao.id)
      .eq("empresa_id", params.empresaId)
      .eq("no_atual_id", params.no.id);
    return { processado: true, aguardandoPagamento: true, transacaoId: transacao.id };
  }

  try {
    const documento = await criarPedidoEReservar({
      empresaId: params.empresaId,
      execucao: params.execucao,
      transacao,
      produto: consulta.produto,
      quantidade,
      valorUnitario,
      depositoId,
    });

    if (Math.abs(Number(documento.total) - valorTotal) > 0.009) {
      throw new Error("Total do pedido divergiu do valor calculado para o checkout");
    }

    const preferencia = await criarPreferenciaCheckoutMercadoPago({
      empresaId: params.empresaId,
      transacaoId: transacao.id,
      produtoId: consulta.produto.id,
      titulo: consulta.produto.nome,
      quantidade,
      valorUnitario,
      expiraEm: transacao.expira_em,
    });

    const agora = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .update({
        gateway_preference_id: preferencia.preferenceId,
        checkout_url: preferencia.checkoutUrl,
        status: STATUS_AGUARDANDO,
        payload_json: {
          ...objeto(transacao.payload_json),
          mercado_pago_live_mode: preferencia.liveMode,
          mercado_pago_user_id: preferencia.sellerUserId,
        },
        ultimo_erro: null,
        updated_at: agora,
      })
      .eq("id", transacao.id)
      .eq("empresa_id", params.empresaId);
    if (updateError) throw new Error(`Erro ao salvar checkout gerado: ${updateError.message}`);

    const variaveisCheckout = {
      checkout_url: preferencia.checkoutUrl,
      pedido_id: String(documento.id),
      pedido_numero: String(documento.numero || ""),
      pagamento_id: String(transacao.id),
      pagamento_gateway: "mercado_pago",
      pagamento_status: STATUS_AGUARDANDO,
      pagamento_valor: String(valorTotal),
      pagamento_valor_formatado: formatarMoeda(valorTotal),
      pagamento_metodo: "",
      estoque_produto_nome: consulta.produto.nome,
      estoque_produto_id: consulta.produto.id,
    };

    await salvarVariaveis({
      empresaId: params.empresaId,
      execucao: params.execucao,
      noId: params.no.id,
      variaveis: variaveisCheckout,
      checkoutPendente: {
        transacao_id: transacao.id,
        no_id: params.no.id,
        visita,
        expira_em: transacao.expira_em,
      },
    });

    const mensagem = mensagemCheckout(config, {
      ...Object.fromEntries(
        Object.entries(variaveis).map(([key, value]) => [key, String(value ?? "")])
      ),
      ...variaveisCheckout,
    });

    const envio = await enviarMensagemAutomacao({
      empresaId: params.empresaId,
      conversaId: params.execucao.conversa_id,
      numeroDestino: params.numeroDestino,
      conteudo: mensagem,
      execucaoId: params.execucao.id,
      noId: params.no.id,
    });

    if (envio?.ok === false || String(envio?.status_envio || "") === "falha") {
      throw new Error("Nao foi possivel enviar o link de pagamento no WhatsApp");
    }

    await supabaseAdmin
      .from("automacao_execucoes")
      .update({ status: "aguardando", updated_at: agora })
      .eq("id", params.execucao.id)
      .eq("empresa_id", params.empresaId)
      .eq("no_atual_id", params.no.id);

    await registrarLog({
      empresaId: params.empresaId,
      execucaoId: params.execucao.id,
      fluxoId: params.execucao.fluxo_id,
      noId: params.no.id,
      tipoEvento: "checkout_aguardando_pagamento",
      descricao: "Pedido reservado e Checkout Pro enviado ao cliente.",
      entrada: {
        produto_id: consulta.produto.id,
        quantidade,
        deposito_id: depositoId,
      },
      saida: {
        transacao_id: transacao.id,
        pedido_id: documento.id,
        preference_id: preferencia.preferenceId,
        valor: valorTotal,
        expira_em: transacao.expira_em,
      },
    });

    return { processado: true, aguardandoPagamento: true, transacaoId: transacao.id };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    const semEstoque = /saldo insuficiente|estoque insuficiente/i.test(mensagem);

    await liberarPedido(transacao);
    await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .update({
        status: semEstoque ? "cancelado" : "erro",
        ultimo_erro: mensagem.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", transacao.id)
      .eq("empresa_id", params.empresaId);

    await salvarVariaveis({
      empresaId: params.empresaId,
      execucao: params.execucao,
      noId: params.no.id,
      variaveis: {
        pagamento_id: String(transacao.id),
        pagamento_status: semEstoque ? "sem_estoque" : "erro",
      },
      checkoutPendente: null,
    });

    return transicionarResultado({
      empresaId: params.empresaId,
      execucao: params.execucao,
      no: params.no,
      resultado: semEstoque ? RESULTADO_CHECKOUT_SEM_ESTOQUE : RESULTADO_CHECKOUT_ERRO,
      numeroDestino: params.numeroDestino,
    });
  }
}

export async function continuarCheckoutPagamentoAutomacao(
  params: ContinuarCheckoutParams
) {
  const execucao = await carregarExecucao({
    empresaId: params.empresaId,
    conversaId: params.conversaId,
    execucaoId: params.execucaoId,
    status: ["rodando"],
  });

  if (!execucao?.no_atual_id) return { processado: false };
  const no = await carregarNo(params.empresaId, execucao.fluxo_id, execucao.no_atual_id);
  if (!no || no.tipo_no !== TIPO_NO_CHECKOUT_PAGAMENTO) {
    return { processado: false };
  }

  try {
    return await prepararCheckout({
      empresaId: params.empresaId,
      execucao,
      no,
      numeroDestino: texto(params.numeroDestino),
    });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : String(error);
    console.error("[CHECKOUT_AUTOMACAO] Erro tecnico:", {
      empresaId: params.empresaId,
      execucaoId: execucao.id,
      noId: no.id,
      error,
    });

    await registrarLog({
      empresaId: params.empresaId,
      execucaoId: execucao.id,
      fluxoId: execucao.fluxo_id,
      noId: no.id,
      tipoEvento: "checkout_erro_tecnico",
      descricao: mensagem,
      entrada: no.configuracao_json || {},
    });

    const resultado = await transicionarResultado({
      empresaId: params.empresaId,
      execucao,
      no,
      resultado: RESULTADO_CHECKOUT_ERRO,
      numeroDestino: texto(params.numeroDestino),
    });

    return { processado: true, erro: mensagem, resultado };
  }
}

async function atualizarStatusVariaveisTransacao(
  transacao: any,
  status: string,
  extras?: Record<string, string>
) {
  const { data: execucao } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("*")
    .eq("id", transacao.execucao_id)
    .eq("empresa_id", transacao.empresa_id)
    .maybeSingle();

  if (!execucao) return null;

  await salvarVariaveis({
    empresaId: transacao.empresa_id,
    execucao,
    noId: transacao.no_id,
    variaveis: {
      pagamento_id: String(transacao.id),
      pagamento_status: status,
      pagamento_valor: String(transacao.valor),
      pagamento_valor_formatado: formatarMoeda(Number(transacao.valor || 0)),
      ...(extras || {}),
    },
    checkoutPendente: status === STATUS_AGUARDANDO ? undefined : null,
  });

  return execucao;
}

function formaPagamentoComercial(payment: MercadoPagoPayment) {
  const tipo = texto(payment.payment_type_id).toLowerCase();
  const metodo = texto(payment.payment_method_id).toLowerCase();
  if (metodo === "pix") return "pix";
  if (tipo === "bank_transfer") return "transferencia";
  if (tipo === "credit_card") return "cartao_credito";
  if (tipo === "debit_card") return "cartao_debito";
  if (tipo === "ticket") return "boleto";
  return "outro";
}

async function processarAprovacao(transacao: any, payment: MercadoPagoPayment) {
  const agora = new Date().toISOString();
  const { data: claim, error: claimError } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({ status: STATUS_PROCESSANDO, gateway_payment_id: String(payment.id), updated_at: agora })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id)
    .eq("status", STATUS_AGUARDANDO)
    .select("*")
    .maybeSingle();

  if (claimError) throw new Error(`Erro ao confirmar processamento do pagamento: ${claimError.message}`);
  if (!claim) return { processado: false, concorrencia: true };
  transacao = claim;

  const forma = formaPagamentoComercial(payment);
  const idempotencyPagamento = `checkout:${transacao.id}:pagamento`;
  let pagamentoId = "";
  const { data: pagamentoExistente } = await supabaseAdmin
    .from("comercial_pagamentos")
    .select("id")
    .eq("empresa_id", transacao.empresa_id)
    .eq("idempotency_key", idempotencyPagamento)
    .maybeSingle();

  if (pagamentoExistente?.id) {
    pagamentoId = pagamentoExistente.id;
  } else {
    const { data, error } = await supabaseAdmin.rpc("comercial_registrar_pagamento", {
      p_empresa_id: transacao.empresa_id,
      p_documento_id: transacao.comercial_documento_id,
      p_valor: Number(transacao.valor),
      p_forma: forma,
      p_vencimento: new Date().toISOString().slice(0, 10),
      p_confirmar: true,
      p_referencia: `Mercado Pago ${payment.id}`,
      p_observacao: "Pagamento confirmado automaticamente pelo webhook do Mercado Pago.",
      p_idempotency_key: idempotencyPagamento,
      p_usuario_id: null,
    });
    if (error || !data) {
      throw new Error(`Erro ao registrar pagamento comercial: ${error?.message || "sem retorno"}`);
    }
    pagamentoId = String(data);
  }

  const { error: estoqueError } = await supabaseAdmin.rpc("comercial_atender_documento", {
    p_empresa_id: transacao.empresa_id,
    p_documento_id: transacao.comercial_documento_id,
    p_usuario_id: null,
    p_idempotency_key: `checkout:${transacao.id}:estoque`,
    p_quantidades: null,
  });
  if (estoqueError) {
    throw new Error(`Pagamento aprovado, mas falhou a baixa do estoque: ${estoqueError.message}`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({
      status: "aprovado",
      comercial_pagamento_id: pagamentoId,
      gateway_payment_id: String(payment.id),
      aprovado_em: payment.date_approved || agora,
      payload_json: { ...objeto(transacao.payload_json), ultimo_pagamento: payment },
      ultimo_erro: null,
      updated_at: agora,
    })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id);
  if (updateError) throw new Error(`Erro ao finalizar transacao aprovada: ${updateError.message}`);

  const execucao = await atualizarStatusVariaveisTransacao(transacao, "aprovado", {
    pagamento_metodo: forma,
  });
  if (!execucao) return { processado: true, fluxoContinuado: false };

  const no = await carregarNo(transacao.empresa_id, transacao.fluxo_id, transacao.no_id);
  if (!no) return { processado: true, fluxoContinuado: false };
  const numeroDestino = await numeroDestinoTransacao(transacao);

  const roteamento = await transicionarResultado({
    empresaId: transacao.empresa_id,
    execucao,
    no,
    resultado: RESULTADO_CHECKOUT_APROVADO,
    numeroDestino,
  });

  return { processado: true, aprovado: true, roteamento };
}

async function processarCancelamento(transacao: any, motivo: "cancelado" | "expirado") {
  const agora = new Date().toISOString();
  const { data: claim, error } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({ status: STATUS_PROCESSANDO, updated_at: agora })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id)
    .eq("status", STATUS_AGUARDANDO)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Erro ao bloquear checkout para cancelamento: ${error.message}`);
  if (!claim) return { processado: false, concorrencia: true };
  transacao = claim;

  await liberarPedido(transacao);

  const statusFinal = motivo === "expirado" ? "expirado" : "cancelado";
  await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({
      status: statusFinal,
      cancelado_em: agora,
      updated_at: agora,
    })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id);

  const execucao = await atualizarStatusVariaveisTransacao(transacao, statusFinal);
  if (!execucao) return { processado: true, fluxoContinuado: false };

  const no = await carregarNo(transacao.empresa_id, transacao.fluxo_id, transacao.no_id);
  if (!no) return { processado: true, fluxoContinuado: false };
  const numeroDestino = await numeroDestinoTransacao(transacao);

  const roteamento = await transicionarResultado({
    empresaId: transacao.empresa_id,
    execucao,
    no,
    resultado: RESULTADO_CHECKOUT_EXPIRADO,
    numeroDestino,
  });

  return { processado: true, status: statusFinal, roteamento };
}

export async function processarPagamentoMercadoPagoCheckout(input: {
  empresaId: string;
  payment: MercadoPagoPayment;
}) {
  const referencia = texto(input.payment.external_reference);
  if (!referencia) return { processado: false, motivo: "sem_external_reference" };

  const { data: transacao, error } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .select("*")
    .eq("id", referencia)
    .eq("empresa_id", input.empresaId)
    .eq("gateway", "mercado_pago")
    .maybeSingle();

  if (error) throw new Error(`Erro ao localizar checkout do pagamento: ${error.message}`);
  if (!transacao) return { processado: false, motivo: "checkout_nao_encontrado" };

  const valorRecebido = Number(input.payment.transaction_amount);
  if (!Number.isFinite(valorRecebido) || Math.abs(valorRecebido - Number(transacao.valor)) > 0.009) {
    await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .update({
        ultimo_erro: "Valor retornado pelo Mercado Pago diverge do pedido.",
        payload_json: { ...objeto(transacao.payload_json), ultimo_pagamento: input.payment },
        updated_at: new Date().toISOString(),
      })
      .eq("id", transacao.id);
    throw new Error("Valor do pagamento Mercado Pago diverge do checkout interno");
  }

  if (transacao.status === "aprovado") {
    return { processado: true, idempotente: true, aprovado: true };
  }

  const status = texto(input.payment.status).toLowerCase();
  if (status === "approved") {
    if (transacao.status !== STATUS_AGUARDANDO) {
      await supabaseAdmin
        .from("pagamento_gateway_transacoes")
        .update({
          ultimo_erro: `Pagamento aprovado recebido com checkout em status ${transacao.status}.`,
          gateway_payment_id: String(input.payment.id),
          payload_json: { ...objeto(transacao.payload_json), ultimo_pagamento: input.payment },
          updated_at: new Date().toISOString(),
        })
        .eq("id", transacao.id);
      return { processado: true, requerAtencao: true, statusCheckout: transacao.status };
    }

    try {
      return await processarAprovacao(transacao, input.payment);
    } catch (errorAprovacao) {
      const mensagem = errorAprovacao instanceof Error ? errorAprovacao.message : String(errorAprovacao);
      await supabaseAdmin
        .from("pagamento_gateway_transacoes")
        .update({ status: "erro", ultimo_erro: mensagem.slice(0, 1000), updated_at: new Date().toISOString() })
        .eq("id", transacao.id);

      const transacaoErro = { ...transacao, status: "erro" };
      const execucao = await atualizarStatusVariaveisTransacao(transacaoErro, "erro");
      if (execucao) {
        const no = await carregarNo(transacao.empresa_id, transacao.fluxo_id, transacao.no_id);
        if (no) {
          await transicionarResultado({
            empresaId: transacao.empresa_id,
            execucao,
            no,
            resultado: RESULTADO_CHECKOUT_ERRO,
            numeroDestino: await numeroDestinoTransacao(transacao),
          });
        }
      }

      throw errorAprovacao;
    }
  }

  if (status === "cancelled") {
    if (transacao.status !== STATUS_AGUARDANDO) return { processado: true, idempotente: true };
    return processarCancelamento(transacao, "cancelado");
  }

  await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({
      gateway_payment_id: String(input.payment.id),
      payload_json: { ...objeto(transacao.payload_json), ultimo_pagamento: input.payment },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id);

  return { processado: true, aguardandoPagamento: true, statusPagamento: status };
}

export async function interceptarMensagemCheckoutPendente(input: {
  empresaId: string;
  conversaId: string;
}) {
  const execucao = await carregarExecucao({
    empresaId: input.empresaId,
    conversaId: input.conversaId,
    status: ["aguardando"],
  });
  if (!execucao?.no_atual_id) return null;

  const no = await carregarNo(input.empresaId, execucao.fluxo_id, execucao.no_atual_id);
  if (!no || no.tipo_no !== TIPO_NO_CHECKOUT_PAGAMENTO) return null;

  const visita = visitaAtual(objeto(execucao.metadata_json), no.id);
  const transacao = await carregarTransacao({
    empresaId: input.empresaId,
    execucaoId: execucao.id,
    noId: no.id,
    visita,
  });
  if (!transacao || transacao.status !== STATUS_AGUARDANDO) return null;

  const limiteComGraca = new Date(transacao.expira_em).getTime() + GRACA_EXPIRACAO_MINUTOS * 60 * 1000;
  if (Number.isFinite(limiteComGraca) && limiteComGraca <= Date.now()) {
    await processarCancelamento(transacao, "expirado");
    return { ok: true, status: "checkout_expirado", execucaoId: execucao.id };
  }

  return {
    ok: true,
    status: "checkout_aguardando_pagamento",
    execucaoId: execucao.id,
    transacaoId: transacao.id,
  };
}

export async function processarCheckoutPagamentosExpirados(limite = 50) {
  const agoraComGraca = new Date(
    Date.now() - GRACA_EXPIRACAO_MINUTOS * 60 * 1000
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .select("*")
    .eq("status", STATUS_AGUARDANDO)
    .lte("expira_em", agoraComGraca)
    .order("expira_em", { ascending: true })
    .limit(Math.min(100, Math.max(1, limite)));

  if (error) throw new Error(`Erro ao buscar checkouts expirados: ${error.message}`);

  let processados = 0;
  let erros = 0;
  for (const transacao of data || []) {
    try {
      const resultado = await processarCancelamento(transacao, "expirado");
      if (resultado.processado) processados += 1;
    } catch (errorItem) {
      erros += 1;
      console.error("[CHECKOUT_AUTOMACAO] Erro ao expirar checkout:", {
        transacaoId: transacao.id,
        error: errorItem,
      });
    }
  }

  return { encontrados: data?.length || 0, processados, erros };
}
