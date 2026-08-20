import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { emitirFocusNfce, focusNfceConfigurada, formaPagamentoFocus } from "@/lib/fiscal/focus-nfce";

const supabase = getSupabaseAdmin();

function texto(valor: unknown) { return String(valor ?? "").trim(); }
function numero(valor: unknown, padrao = 0) {
  const n = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(n) ? n : padrao;
}
function erro(message: string, status = 400) { return NextResponse.json({ ok: false, error: message }, { status }); }
function mensagemBanco(error: { message?: string } | null | undefined) {
  const message = error?.message || "Erro desconhecido.";
  if (message.includes("estoque_embalagens_codigo_barras_uk")) return "Este código de barras já está vinculado a outra embalagem.";
  if (message.includes("estoque_embalagens_padrao_compra_uk")) return "Já existe uma embalagem padrão de compra para este produto.";
  if (message.includes("estoque_embalagens_padrao_venda_uk")) return "Já existe uma embalagem padrão de venda para este produto.";
  return message;
}
async function contextoComEmpresa() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return { ok: false as const, response: erro(contexto.error, contexto.status) };
  if (!contexto.usuario.empresa_id) return { ok: false as const, response: erro("Usuário sem empresa vinculada.") };
  return { ok: true as const, usuario: contexto.usuario, empresaId: contexto.usuario.empresa_id };
}

export async function GET() {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;
  const permissoes = contexto.usuario.permissoes;
  if (!can(permissoes, "pdv.visualizar") && !can(permissoes, "financeiro.contas_pagar") && !can(permissoes, "estoque.visualizar")) {
    return erro("Sem permissão para acessar a operação ERP.", 403);
  }
  const [itens, saldos, embalagens, depositos, contas, baixas, parceiros, fiscal, fiscais] = await Promise.all([
    supabase.from("estoque_itens").select("id,codigo,nome,unidade,preco_venda,codigo_barras,ncm,cest,origem_mercadoria,cfop_venda,csosn_cst,aliquota_icms,aliquota_pis,aliquota_cofins,ativo").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("nome"),
    supabase.from("estoque_saldos").select("estoque_item_id,deposito_id,saldo_fisico,saldo_reservado").eq("empresa_id", contexto.empresaId),
    supabase.from("estoque_embalagens").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("nome"),
    supabase.from("estoque_depositos").select("id,codigo,nome,principal").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("principal", { ascending: false }),
    supabase.from("financeiro_contas_pagar").select("*").eq("empresa_id", contexto.empresaId).neq("status", "cancelada").order("vencimento_em"),
    supabase.from("financeiro_contas_pagar_baixas").select("*").eq("empresa_id", contexto.empresaId).order("pago_em", { ascending: false }).limit(500),
    supabase.from("comercial_parceiros").select("id,nome,nome_fantasia,documento,tipo,ativo").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("nome"),
    supabase.from("fiscal_configuracoes").select("*").eq("empresa_id", contexto.empresaId).maybeSingle(),
    supabase.from("fiscal_documentos").select("*,comercial_documentos(numero,total,created_at)").eq("empresa_id", contexto.empresaId).order("created_at", { ascending: false }).limit(100),
  ]);
  const falha = [itens.error,saldos.error,embalagens.error,depositos.error,contas.error,baixas.error,parceiros.error,fiscal.error,fiscais.error].find(Boolean);
  if (falha) return erro(`Erro ao carregar operação ERP: ${mensagemBanco(falha)}`, 500);
  const baixasData = baixas.data ?? [];
  return NextResponse.json({
    ok: true,
    itens: (itens.data ?? []).map((item) => ({
      ...item,
      saldo_disponivel: (saldos.data ?? []).filter((saldo) => saldo.estoque_item_id === item.id)
        .reduce((total, saldo) => total + Number(saldo.saldo_fisico) - Number(saldo.saldo_reservado), 0),
    })),
    embalagens: embalagens.data ?? [],
    depositos: depositos.data ?? [],
    contas: (contas.data ?? []).map((conta) => ({ ...conta, baixas: baixasData.filter((baixa) => baixa.conta_id === conta.id) })),
    parceiros: parceiros.data ?? [],
    fiscal: fiscal.data ? { ...fiscal.data, token_configurado: focusNfceConfigurada(fiscal.data.ambiente) } : null,
    documentos_fiscais: fiscais.data ?? [],
  });
}

async function emitirDocumentoFiscal(empresaId: string, fiscalId: string) {
  const { data: fiscal, error: fiscalError } = await supabase.from("fiscal_documentos").select("*").eq("empresa_id", empresaId).eq("id", fiscalId).single();
  if (fiscalError || !fiscal) throw new Error("Documento fiscal não encontrado.");
  if (fiscal.status === "autorizada") return { autorizada: true, fiscal };
  const [{ data: config }, { data: venda }, { data: itens }, { data: pagamentos }] = await Promise.all([
    supabase.from("fiscal_configuracoes").select("*").eq("empresa_id", empresaId).eq("ativo", true).single(),
    supabase.from("comercial_documentos").select("*").eq("empresa_id", empresaId).eq("id", fiscal.comercial_documento_id).single(),
    supabase.from("comercial_documento_itens").select("*,estoque_itens(codigo,ncm,cest,origem_mercadoria,cfop_venda,csosn_cst,aliquota_icms,aliquota_pis,aliquota_cofins)").eq("empresa_id", empresaId).eq("documento_id", fiscal.comercial_documento_id).order("created_at"),
    supabase.from("comercial_pagamentos").select("forma,valor").eq("empresa_id", empresaId).eq("documento_id", fiscal.comercial_documento_id).eq("status", "confirmado"),
  ]);
  if (!config || !venda || !itens?.length) throw new Error("Venda ou configuração fiscal incompleta.");
  const produtos = itens.map((item, indice) => {
    const produto = Array.isArray(item.estoque_itens) ? item.estoque_itens[0] : item.estoque_itens;
    const ncm = texto(produto?.ncm).replace(/\D/g, "");
    if (ncm.length !== 8) throw new Error(`Informe o NCM válido do produto ${item.descricao}.`);
    const situacao = texto(produto?.csosn_cst) || config.csosn_cst_padrao;
    return {
      numero_item: indice + 1,
      codigo_produto: texto(produto?.codigo) || String(indice + 1),
      descricao: item.descricao,
      codigo_ncm: ncm,
      codigo_cest: texto(produto?.cest).replace(/\D/g, "") || undefined,
      cfop: texto(produto?.cfop_venda) || config.cfop_padrao,
      unidade_comercial: item.unidade,
      quantidade_comercial: Number(item.quantidade),
      valor_unitario_comercial: Number(item.valor_unitario),
      valor_bruto: Number(item.total),
      unidade_tributavel: item.unidade,
      quantidade_tributavel: Number(item.quantidade),
      valor_unitario_tributavel: Number(item.valor_unitario),
      icms_origem: Number(produto?.origem_mercadoria ?? 0),
      icms_situacao_tributaria: situacao,
      pis_situacao_tributaria: config.regime_tributario === "normal" ? "01" : "49",
      cofins_situacao_tributaria: config.regime_tributario === "normal" ? "01" : "49",
    };
  });
  const payload = {
    cnpj_emitente: texto(config.cnpj_emitente).replace(/\D/g, ""),
    data_emissao: new Date().toISOString(),
    modalidade_frete: "9",
    local_destino: "1",
    presenca_comprador: "1",
    natureza_operacao: config.natureza_operacao,
    serie: config.serie_nfce || undefined,
    items: produtos,
    formas_pagamento: (pagamentos ?? []).map((pagamento) => ({ forma_pagamento: formaPagamentoFocus(pagamento.forma), valor_pagamento: Number(pagamento.valor) })),
  };
  await supabase.from("fiscal_documentos").update({ status: "processando", tentativas: fiscal.tentativas + 1, ultima_tentativa_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", fiscal.id);
  try {
    const resultado = await emitirFocusNfce(config.ambiente, fiscal.referencia, payload);
    const resposta = resultado.resposta;
    const autorizada = ["autorizado", "autorizada"].includes(texto(resposta.status).toLowerCase()) || texto(resposta.status_sefaz) === "100";
    const status = autorizada ? "autorizada" : resultado.ok ? "rejeitada" : "erro";
    const mensagem = texto(resposta.mensagem_sefaz || resposta.mensagem || resposta.status) || `Retorno fiscal HTTP ${resultado.statusHttp}`;
    const atualizacao = {
      status, mensagem, resposta,
      chave: texto(resposta.chave_nfe) || null,
      numero: texto(resposta.numero) || null,
      serie: texto(resposta.serie) || config.serie_nfce || null,
      protocolo: texto(resposta.protocolo) || null,
      url_danfe: texto(resposta.caminho_danfe) || null,
      url_xml: texto(resposta.caminho_xml_nota_fiscal) || null,
      autorizado_em: autorizada ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("fiscal_documentos").update(atualizacao).eq("id", fiscal.id);
    return { autorizada, fiscal: { ...fiscal, ...atualizacao } };
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "Falha na comunicação fiscal.";
    await supabase.from("fiscal_documentos").update({ status: "erro", mensagem, updated_at: new Date().toISOString() }).eq("id", fiscal.id);
    throw new Error(mensagem);
  }
}

export async function POST(request: Request) {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return erro("Corpo da requisição inválido."); }
  const acao = texto(body.acao);
  try {
    if (acao === "salvar_embalagem") {
      if (!can(contexto.usuario.permissoes, "estoque.embalagens")) return erro("Sem permissão para gerenciar embalagens.", 403);
      const id = texto(body.id); const itemId = texto(body.estoque_item_id); const nome = texto(body.nome); const sigla = texto(body.sigla);
      if (!itemId || !nome || !sigla || numero(body.fator_conversao) <= 0) return erro("Informe produto, nome, sigla e fator de conversão.");
      const payload = { empresa_id: contexto.empresaId, estoque_item_id: itemId, nome, sigla, fator_conversao: numero(body.fator_conversao), codigo_barras: texto(body.codigo_barras).replace(/\D/g, "") || null, preco_venda: texto(body.preco_venda) ? numero(body.preco_venda) : null, permite_compra: body.permite_compra !== false, permite_venda: body.permite_venda !== false, padrao_compra: body.padrao_compra === true, padrao_venda: body.padrao_venda === true, updated_at: new Date().toISOString() };
      const query = id ? supabase.from("estoque_embalagens").update(payload).eq("empresa_id", contexto.empresaId).eq("id", id) : supabase.from("estoque_embalagens").insert({ ...payload, created_by: contexto.usuario.id });
      const { error } = await query;
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Conversão de embalagem salva." });
    }
    if (acao === "arquivar_embalagem") {
      if (!can(contexto.usuario.permissoes, "estoque.embalagens")) return erro("Sem permissão para gerenciar embalagens.", 403);
      const { error } = await supabase.from("estoque_embalagens").update({ ativo: false, padrao_compra: false, padrao_venda: false, updated_at: new Date().toISOString() }).eq("empresa_id", contexto.empresaId).eq("id", texto(body.id));
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Embalagem arquivada." });
    }
    if (acao === "criar_conta") {
      if (!can(contexto.usuario.permissoes, "financeiro.contas_pagar")) return erro("Sem permissão para contas a pagar.", 403);
      const descricao = texto(body.descricao); const vencimento = texto(body.vencimento_em); const valor = numero(body.valor_original);
      if (!descricao || !vencimento || valor <= 0) return erro("Informe descrição, vencimento e valor da conta.");
      const { error } = await supabase.from("financeiro_contas_pagar").insert({ empresa_id: contexto.empresaId, parceiro_id: texto(body.parceiro_id) || null, descricao, numero_documento: texto(body.numero_documento) || null, competencia: texto(body.competencia) || new Date().toISOString().slice(0,10), vencimento_em: vencimento, valor_original: valor, categoria: texto(body.categoria) || null, observacao: texto(body.observacao) || null, created_by: contexto.usuario.id, updated_by: contexto.usuario.id });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Conta a pagar cadastrada." });
    }
    if (acao === "baixar_conta") {
      if (!can(contexto.usuario.permissoes, "financeiro.contas_pagar")) return erro("Sem permissão para contas a pagar.", 403);
      const { error } = await supabase.rpc("financeiro_baixar_conta_pagar", { p_empresa_id: contexto.empresaId, p_conta_id: texto(body.id), p_valor: numero(body.valor), p_forma: texto(body.forma) || "outro", p_pago_em: texto(body.pago_em) || new Date().toISOString(), p_referencia: texto(body.referencia) || null, p_observacao: texto(body.observacao) || null, p_idempotency_key: texto(body.idempotency_key) || crypto.randomUUID(), p_usuario_id: contexto.usuario.id });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Pagamento confirmado." });
    }
    if (acao === "salvar_fiscal") {
      if (!can(contexto.usuario.permissoes, "fiscal.configurar")) return erro("Sem permissão para configurar a emissão fiscal.", 403);
      const ambiente = texto(body.ambiente) === "producao" ? "producao" : "homologacao";
      const cnpj = texto(body.cnpj_emitente).replace(/\D/g, "");
      if (body.ativo === true && cnpj.length !== 14) return erro("Informe um CNPJ válido para ativar a emissão.");
      const { error } = await supabase.from("fiscal_configuracoes").upsert({ empresa_id: contexto.empresaId, provedor: "focus_nfe", ambiente, cnpj_emitente: cnpj || null, inscricao_estadual: texto(body.inscricao_estadual) || null, regime_tributario: ["simples_nacional","simples_excesso","normal"].includes(texto(body.regime_tributario)) ? texto(body.regime_tributario) : "simples_nacional", serie_nfce: texto(body.serie_nfce) || null, natureza_operacao: texto(body.natureza_operacao) || "VENDA AO CONSUMIDOR", cfop_padrao: texto(body.cfop_padrao) || "5102", csosn_cst_padrao: texto(body.csosn_cst_padrao) || "102", ativo: body.ativo === true, updated_by: contexto.usuario.id, updated_at: new Date().toISOString() });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: ambiente === "producao" ? "Configuração fiscal de produção salva." : "Configuração de homologação salva." });
    }
    if (acao === "salvar_fiscal_produto") {
      if (!can(contexto.usuario.permissoes, "fiscal.configurar")) return erro("Sem permissão para configurar produtos fiscais.", 403);
      const id = texto(body.id); const ncm = texto(body.ncm).replace(/\D/g, "");
      if (!id || ncm.length !== 8) return erro("Informe um NCM válido com 8 dígitos.");
      const { error } = await supabase.from("estoque_itens").update({ ncm, cest: texto(body.cest).replace(/\D/g, "") || null, origem_mercadoria: Math.max(0, Math.min(8, Math.trunc(numero(body.origem_mercadoria)))), cfop_venda: texto(body.cfop_venda) || null, csosn_cst: texto(body.csosn_cst) || null, aliquota_icms: Math.max(0, numero(body.aliquota_icms)), aliquota_pis: Math.max(0, numero(body.aliquota_pis)), aliquota_cofins: Math.max(0, numero(body.aliquota_cofins)), updated_by: contexto.usuario.id, updated_at: new Date().toISOString() }).eq("empresa_id", contexto.empresaId).eq("id", id);
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Tributação do produto atualizada." });
    }
    if (acao === "finalizar_venda") {
      if (!can(contexto.usuario.permissoes, "pdv.operar")) return erro("Sem permissão para operar o PDV.", 403);
      const emitir = body.emitir_nfce === true;
      if (emitir && !can(contexto.usuario.permissoes, "fiscal.emitir")) return erro("Sem permissão para emitir NFC-e.", 403);
      const { data, error } = await supabase.rpc("erp_finalizar_venda_pdv", { p_empresa_id: contexto.empresaId, p_deposito_id: texto(body.deposito_id), p_cliente_id: texto(body.cliente_id) || null, p_contato_id: texto(body.contato_id) || null, p_itens: Array.isArray(body.itens) ? body.itens : [], p_pagamentos: Array.isArray(body.pagamentos) ? body.pagamentos : [], p_cpf_cnpj: texto(body.cpf_cnpj) || null, p_observacao: texto(body.observacao) || null, p_emitir_nfce: emitir, p_idempotency_key: texto(body.idempotency_key) || crypto.randomUUID(), p_usuario_id: contexto.usuario.id });
      if (error) return erro(mensagemBanco(error));
      let fiscal = null;
      if (emitir && data?.fiscal_documento_id) fiscal = await emitirDocumentoFiscal(contexto.empresaId, data.fiscal_documento_id);
      return NextResponse.json({ ok: true, message: fiscal?.autorizada ? "Venda concluída e NFC-e autorizada." : emitir ? "Venda concluída. Verifique o retorno fiscal." : "Venda concluída e estoque atualizado.", venda: data, fiscal });
    }
    if (acao === "reemitir_nfce") {
      if (!can(contexto.usuario.permissoes, "fiscal.emitir")) return erro("Sem permissão para emitir NFC-e.", 403);
      const fiscal = await emitirDocumentoFiscal(contexto.empresaId, texto(body.id));
      return NextResponse.json({ ok: true, message: fiscal.autorizada ? "NFC-e autorizada." : "A NFC-e não foi autorizada. Confira a rejeição.", fiscal });
    }
    return erro("Ação ERP inválida.");
  } catch (error) {
    return erro(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
