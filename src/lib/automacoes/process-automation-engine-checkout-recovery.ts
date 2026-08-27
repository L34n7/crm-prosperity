import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enviarMensagemAutomacao } from "./process-automation-engine-agenda";

const supabaseAdmin = getSupabaseAdmin();
const STATUS_AGUARDANDO = "aguardando_pagamento";

const MENSAGEM_RECUPERACAO_PADRAO = `Vi que o pagamento do seu pedido ainda está pendente.

Se quiser concluir agora, seu link continua disponível:
{{checkout_url}}

*Total:* {{pagamento_valor_formatado}}

Assim que o Mercado Pago confirmar o pagamento, eu sigo automaticamente por aqui.`;

function objeto(valor: unknown): Record<string, any> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, any>)
    : {};
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function interpolarMensagem(
  mensagem: string,
  variaveis: Record<string, string>
) {
  return mensagem.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, chave: string) => {
    return variaveis[chave] ?? `{{${chave}}}`;
  });
}

async function carregarNumeroDestino(transacao: any) {
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

async function registrarLog(params: {
  transacao: any;
  descricao: string;
  saida?: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from("automacao_execucao_logs").insert({
    empresa_id: params.transacao.empresa_id,
    execucao_id: params.transacao.execucao_id,
    fluxo_id: params.transacao.fluxo_id,
    no_id: params.transacao.no_id,
    conexao_id: null,
    tipo_evento: "checkout_recuperacao_enviada",
    descricao: params.descricao,
    entrada_json: {},
    saida_json: params.saida || {},
  });

  if (error) {
    console.error("[CHECKOUT_RECUPERACAO] Erro ao registrar log:", error);
  }
}

async function tentarEnviarRecuperacao(transacao: any) {
  const { data: no, error: noError } = await supabaseAdmin
    .from("automacao_nos")
    .select("id,configuracao_json,ativo")
    .eq("id", transacao.no_id)
    .eq("empresa_id", transacao.empresa_id)
    .maybeSingle();

  if (noError || !no || no.ativo !== true) {
    return { elegivel: false, enviado: false };
  }

  const configuracao = objeto(no.configuracao_json);
  if (configuracao.recuperacao_ativa !== true) {
    return { elegivel: false, enviado: false };
  }

  const aposMinutos = Math.max(
    1,
    Math.floor(Number(configuracao.recuperacao_apos_minutos || 10))
  );
  const criadoEm = new Date(transacao.created_at).getTime();
  const expiraEm = new Date(transacao.expira_em).getTime();
  const agoraMs = Date.now();
  const recuperacaoEm = criadoEm + aposMinutos * 60 * 1000;

  if (
    !Number.isFinite(criadoEm) ||
    !Number.isFinite(expiraEm) ||
    agoraMs < recuperacaoEm ||
    agoraMs >= expiraEm
  ) {
    return { elegivel: false, enviado: false };
  }

  const agora = new Date().toISOString();
  const { data: claim, error: claimError } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .update({ recuperacao_enviada_em: agora, updated_at: agora })
    .eq("id", transacao.id)
    .eq("empresa_id", transacao.empresa_id)
    .eq("status", STATUS_AGUARDANDO)
    .is("recuperacao_enviada_em", null)
    .select("*")
    .maybeSingle();

  if (claimError) {
    throw new Error(`Erro ao reservar envio de recuperacao: ${claimError.message}`);
  }

  if (!claim) {
    return { elegivel: true, enviado: false };
  }

  try {
    const { data: atual } = await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .select("status")
      .eq("id", claim.id)
      .eq("empresa_id", claim.empresa_id)
      .maybeSingle();

    if (atual?.status !== STATUS_AGUARDANDO) {
      return { elegivel: true, enviado: false };
    }

    const { data: execucao, error: execucaoError } = await supabaseAdmin
      .from("automacao_execucoes")
      .select("id,metadata_json")
      .eq("id", claim.execucao_id)
      .eq("empresa_id", claim.empresa_id)
      .maybeSingle();

    if (execucaoError || !execucao) {
      throw new Error(
        `Execucao do checkout nao encontrada: ${execucaoError?.message || "sem retorno"}`
      );
    }

    const metadata = objeto(execucao.metadata_json);
    const variaveisContexto = objeto(metadata.variaveis);
    const payload = objeto(claim.payload_json);
    const variaveis: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(variaveisContexto).map(([chave, valor]) => [
          chave,
          String(valor ?? ""),
        ])
      ),
      checkout_url: texto(claim.checkout_url),
      pagamento_id: texto(claim.id),
      pagamento_status: STATUS_AGUARDANDO,
      pagamento_valor: String(Number(claim.valor || 0)),
      pagamento_valor_formatado: formatarMoeda(Number(claim.valor || 0)),
      estoque_produto_nome: texto(
        variaveisContexto.estoque_produto_nome || payload.produto_nome
      ),
    };

    const mensagemBase =
      texto(configuracao.mensagem_recuperacao) || MENSAGEM_RECUPERACAO_PADRAO;
    const mensagem = interpolarMensagem(mensagemBase, variaveis);
    const numeroDestino = await carregarNumeroDestino(claim);

    if (!numeroDestino) {
      throw new Error("Contato do checkout sem numero de WhatsApp para recuperacao");
    }

    const envio = await enviarMensagemAutomacao({
      empresaId: claim.empresa_id,
      conversaId: claim.conversa_id,
      numeroDestino,
      conteudo: mensagem,
      execucaoId: claim.execucao_id,
      noId: claim.no_id,
    });

    if (envio?.ok === false || String(envio?.status_envio || "") === "falha") {
      throw new Error("Nao foi possivel enviar a mensagem de recuperacao do checkout");
    }

    await registrarLog({
      transacao: claim,
      descricao: "Mensagem de recuperacao enviada para checkout ainda pendente.",
      saida: {
        transacao_id: claim.id,
        recuperacao_apos_minutos: aposMinutos,
        recuperacao_enviada_em: agora,
      },
    });

    return { elegivel: true, enviado: true };
  } catch (error) {
    const mensagemErro = error instanceof Error ? error.message : String(error);

    await supabaseAdmin
      .from("pagamento_gateway_transacoes")
      .update({
        recuperacao_enviada_em: null,
        ultimo_erro: `Recuperacao: ${mensagemErro}`.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id)
      .eq("empresa_id", claim.empresa_id)
      .eq("status", STATUS_AGUARDANDO);

    throw error;
  }
}

export async function processarRecuperacoesCheckoutPendentes(limite = 50) {
  const quantidadeBusca = Math.min(300, Math.max(20, limite * 4));
  const { data, error } = await supabaseAdmin
    .from("pagamento_gateway_transacoes")
    .select("*")
    .eq("status", STATUS_AGUARDANDO)
    .is("recuperacao_enviada_em", null)
    .order("created_at", { ascending: true })
    .limit(quantidadeBusca);

  if (error) {
    throw new Error(`Erro ao buscar checkouts para recuperacao: ${error.message}`);
  }

  let elegiveis = 0;
  let enviados = 0;
  let erros = 0;

  for (const transacao of data || []) {
    if (elegiveis >= limite) break;

    try {
      const resultado = await tentarEnviarRecuperacao(transacao);
      if (resultado.elegivel) elegiveis += 1;
      if (resultado.enviado) enviados += 1;
    } catch (errorItem) {
      erros += 1;
      console.error("[CHECKOUT_RECUPERACAO] Erro:", {
        transacaoId: transacao.id,
        error: errorItem,
      });
    }
  }

  return {
    encontrados: data?.length || 0,
    elegiveis,
    enviados,
    erros,
  };
}
