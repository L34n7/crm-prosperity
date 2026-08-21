import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { analisarXmlNfe } from "@/lib/compras/nfe";

const supabase = getSupabaseAdmin();

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numero(valor: unknown, padrao = 0) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : padrao;
  const entrada = texto(valor).replace(/[^\d,.-]/g, "");
  if (!entrada) return padrao;
  const normalizado = entrada.includes(",")
    ? entrada.replace(/\./g, "").replace(",", ".")
    : entrada;
  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado : padrao;
}

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mensagemBanco(error: { message?: string } | null | undefined) {
  const message = error?.message || "Erro desconhecido.";
  if (message.includes("comercial_parceiros_documento_uk")) return "Já existe um fornecedor ativo com este documento.";
  if (message.includes("comercial_recebimentos_nfe_chave_uk")) return "Esta NF-e já foi recebida.";
  if (message.includes("comercial_documentos_empresa_id_idempotency_key_key")) return "Esta operação já foi processada.";
  if (message.includes("estoque_marcas_empresa_nome_normalizado_uk") || message.includes("estoque_marcas_empresa_id_nome_key")) return "Já existe uma marca com este nome.";
  if (message.includes("estoque_categorias_empresa_nome_normalizado_uk") || message.includes("estoque_categorias_empresa_id_nome_key")) return "Já existe uma categoria com este nome.";
  if (message.includes("estoque_itens_empresa_codigo_barras_uk")) return "Este código de barras já pertence a outro produto.";
  return message;
}

async function contextoComEmpresa() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return { ok: false as const, response: erro(resultado.error, resultado.status) };
  if (!resultado.usuario.empresa_id) return { ok: false as const, response: erro("Usuário sem empresa vinculada.") };
  return { ok: true as const, usuario: resultado.usuario, empresaId: resultado.usuario.empresa_id };
}

export async function GET() {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;
  if (!can(contexto.usuario.permissoes, "compras.visualizar")) return erro("Sem permissão para visualizar compras.", 403);

  const [fornecedores, documentos, fornecedorItens, embalagens] = await Promise.all([
    supabase.from("comercial_parceiros").select("*").eq("empresa_id", contexto.empresaId).in("tipo", ["fornecedor", "ambos"]).eq("ativo", true).order("nome"),
    supabase.from("comercial_documentos").select("*").eq("empresa_id", contexto.empresaId).eq("tipo", "pedido_compra").order("created_at", { ascending: false }).limit(200),
    supabase.from("comercial_fornecedor_itens").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true),
    supabase.from("estoque_embalagens").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("nome"),
  ]);
  const falhaInicial = [fornecedores.error, documentos.error, fornecedorItens.error, embalagens.error].find(Boolean);
  if (falhaInicial) return erro(`Erro ao carregar compras: ${mensagemBanco(falhaInicial)}`, 500);

  const documentosData = documentos.data ?? [];
  const documentosIds = documentosData.map((documento) => documento.id);
  if (!documentosIds.length) {
    return NextResponse.json({ ok: true, fornecedores: fornecedores.data ?? [], fornecedor_itens: fornecedorItens.data ?? [], embalagens: embalagens.data ?? [], pedidos: [] });
  }

  const [itensDocumento, contasPagar, recebimentos] = await Promise.all([
    supabase.from("comercial_documento_itens").select("*").eq("empresa_id", contexto.empresaId).in("documento_id", documentosIds),
    supabase.from("financeiro_contas_pagar").select("id,documento_id,parceiro_id,descricao,numero_documento,vencimento_em,valor_original,valor_pago,status").eq("empresa_id", contexto.empresaId).in("documento_id", documentosIds).neq("status", "cancelada"),
    supabase.from("comercial_recebimentos_compra").select("id,numero,pedido_compra_id,parceiro_id,deposito_id,estoque_documento_id,status,origem,nfe_chave,nfe_numero,nfe_serie,nfe_emissao,subtotal,frete,total,observacao,recebido_por,recebido_em").eq("empresa_id", contexto.empresaId).in("pedido_compra_id", documentosIds).order("recebido_em", { ascending: false }),
  ]);
  const falha = [itensDocumento.error, contasPagar.error, recebimentos.error].find(Boolean);
  if (falha) return erro(`Erro ao carregar compras: ${mensagemBanco(falha)}`, 500);

  const contasData = contasPagar.data ?? [];
  const contasIds = contasData.map((conta) => conta.id);
  const recebimentosData = recebimentos.data ?? [];
  const recebimentosIds = recebimentosData.map((recebimento) => recebimento.id);
  const [recebimentoItens, baixas] = await Promise.all([
    recebimentosIds.length
      ? supabase.from("comercial_recebimento_compra_itens").select("*").eq("empresa_id", contexto.empresaId).in("recebimento_id", recebimentosIds)
      : Promise.resolve({ data: [], error: null }),
    contasIds.length
      ? supabase.from("financeiro_contas_pagar_baixas").select("id,conta_id,valor,forma,pago_em,referencia,observacao,created_at").eq("empresa_id", contexto.empresaId).in("conta_id", contasIds).order("pago_em", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (recebimentoItens.error || baixas.error) return erro(`Erro ao carregar compras: ${mensagemBanco(recebimentoItens.error || baixas.error)}`, 500);

  const itens = itensDocumento.data ?? [];
  const baixasData = baixas.data ?? [];
  const recebimentoItensData = recebimentoItens.data ?? [];
  return NextResponse.json({
    ok: true,
    fornecedores: fornecedores.data ?? [],
    fornecedor_itens: fornecedorItens.data ?? [],
    embalagens: embalagens.data ?? [],
    pedidos: documentosData.map((documento) => {
      const conta = contasData.find((registro) => registro.documento_id === documento.id);
      return {
        ...documento,
        conta_pagar_id: conta?.id ?? null,
        conta_pagar_status: conta?.status ?? null,
        valor_pago: conta?.valor_pago ?? documento.valor_pago,
        itens: itens.filter((item) => item.documento_id === documento.id),
        pagamentos: conta ? baixasData.filter((baixa) => baixa.conta_id === conta.id).map((baixa) => ({
          ...baixa,
          status: "confirmado",
          vencimento_em: conta.vencimento_em,
          confirmado_em: baixa.pago_em,
        })) : [],
        recebimentos: recebimentosData
          .filter((recebimento) => recebimento.pedido_compra_id === documento.id)
          .map((recebimento) => ({
            ...recebimento,
            itens: recebimentoItensData.filter((item) => item.recebimento_id === recebimento.id),
          })),
      };
    }),
  });
}

export async function POST(request: Request) {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  const acao = texto(body.acao);
  const podeGerenciar = can(contexto.usuario.permissoes, "compras.gerenciar");
  const podeAprovar = can(contexto.usuario.permissoes, "compras.aprovar");
  const podeFinanceiro = can(contexto.usuario.permissoes, "financeiro.operacional");

  try {
    if (acao === "analisar_xml") {
      if (!podeGerenciar && !podeAprovar) return erro("Sem permissão para importar compras.", 403);
      const xml = texto(body.xml);
      const nfe = analisarXmlNfe(xml);
      const documento = nfe.fornecedor.documento;
      const { data: fornecedorExistente, error: fornecedorError } = documento
        ? await supabase.from("comercial_parceiros").select("id,nome,documento").eq("empresa_id", contexto.empresaId).eq("ativo", true).eq("documento", documento).maybeSingle()
        : { data: null, error: null };
      if (fornecedorError) return erro(mensagemBanco(fornecedorError));

      const [{ data: itensEstoque, error: itensError }, { data: vinculos, error: vinculosError }] = await Promise.all([
        supabase.from("estoque_itens").select("id,codigo,sku,codigo_barras,nome,unidade,controla_lote,controla_validade,controla_serie").eq("empresa_id", contexto.empresaId).eq("ativo", true),
        fornecedorExistente?.id
          ? supabase.from("comercial_fornecedor_itens").select("estoque_item_id,codigo_fornecedor,ean").eq("empresa_id", contexto.empresaId).eq("parceiro_id", fornecedorExistente.id).eq("ativo", true)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (itensError || vinculosError) return erro(mensagemBanco(itensError || vinculosError));

      const estoque = itensEstoque ?? [];
      const mapeamentos = vinculos ?? [];
      const itensComVinculo = nfe.itens.map((item) => {
        const vinculo = mapeamentos.find((registro) =>
          (item.codigo_fornecedor && registro.codigo_fornecedor === item.codigo_fornecedor) ||
          (item.ean && registro.ean === item.ean));
        const correspondencia = vinculo
          ? estoque.find((registro) => registro.id === vinculo.estoque_item_id)
          : estoque.find((registro) =>
            (item.ean && registro.codigo_barras?.replace(/\D/g, "") === item.ean) ||
            (item.codigo_fornecedor && [registro.codigo, registro.sku].includes(item.codigo_fornecedor)));
        return { ...item, estoque_item_id: correspondencia?.id ?? "", correspondencia: correspondencia ? "automatica" : "pendente" };
      });
      return NextResponse.json({ ok: true, nfe: { ...nfe, fornecedor: { ...nfe.fornecedor, id: fornecedorExistente?.id ?? "" }, itens: itensComVinculo } });
    }

    if (acao === "salvar_fornecedor") {
      if (!podeGerenciar) return erro("Sem permissão para gerenciar fornecedores.", 403);
      const id = texto(body.id);
      const nome = texto(body.nome);
      if (!nome) return erro("Informe o nome ou razão social do fornecedor.");
      const documento = texto(body.documento).replace(/[^0-9A-Za-z]/g, "") || null;
      const payload = {
        empresa_id: contexto.empresaId,
        tipo: texto(body.tipo) === "ambos" ? "ambos" : "fornecedor",
        tipo_pessoa: texto(body.tipo_pessoa) === "fisica" ? "fisica" : "juridica",
        nome,
        nome_fantasia: texto(body.nome_fantasia) || null,
        documento,
        inscricao_estadual: texto(body.inscricao_estadual) || null,
        email: texto(body.email) || null,
        telefone: texto(body.telefone) || null,
        cep: texto(body.cep).replace(/\D/g, "") || null,
        endereco: texto(body.endereco) || null,
        numero: texto(body.numero) || null,
        complemento: texto(body.complemento) || null,
        bairro: texto(body.bairro) || null,
        cidade: texto(body.cidade) || null,
        estado: texto(body.estado).toUpperCase().slice(0, 2) || null,
        prazo_entrega_dias: Math.max(0, Math.trunc(numero(body.prazo_entrega_dias))),
        observacao: texto(body.observacao) || null,
        updated_by: contexto.usuario.id,
        updated_at: new Date().toISOString(),
      };
      const query = id
        ? supabase.from("comercial_parceiros").update({ ...payload, versao: numero(body.versao, 1) + 1 }).eq("empresa_id", contexto.empresaId).eq("id", id).eq("versao", numero(body.versao, 1)).select("id").maybeSingle()
        : supabase.from("comercial_parceiros").insert({ ...payload, created_by: contexto.usuario.id }).select("id").single();
      const { data, error } = await query;
      if (error) return erro(mensagemBanco(error));
      if (!data) return erro("O fornecedor foi alterado por outro usuário. Atualize a página e tente novamente.", 409);
      return NextResponse.json({ ok: true, message: "Fornecedor salvo com sucesso.", fornecedor_id: data.id });
    }

    if (acao === "arquivar_fornecedor") {
      if (!podeGerenciar) return erro("Sem permissão para gerenciar fornecedores.", 403);
      const id = texto(body.id);
      const { data, error } = await supabase.from("comercial_parceiros").update({ ativo: false, updated_by: contexto.usuario.id, updated_at: new Date().toISOString() }).eq("empresa_id", contexto.empresaId).eq("id", id).select("id").maybeSingle();
      if (error) return erro(mensagemBanco(error));
      if (!data) return erro("Fornecedor não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Fornecedor arquivado." });
    }

    if (acao === "salvar_pedido") {
      if (!podeGerenciar) return erro("Sem permissão para gerenciar pedidos de compra.", 403);
      const parceiroId = texto(body.parceiro_id);
      const depositoId = texto(body.deposito_id);
      const itens = Array.isArray(body.itens) ? body.itens as Array<Record<string, unknown>> : [];
      if (!parceiroId || !depositoId || !itens.length) return erro("Informe fornecedor, depósito e ao menos um item.");
      const itensNormalizados = itens.map((item) => ({
        estoque_item_id: texto(item.estoque_item_id),
        embalagem_id: texto(item.embalagem_id) || null,
        descricao: texto(item.descricao),
        unidade: texto(item.unidade) || "un",
        quantidade: numero(item.quantidade),
        valor_unitario: numero(item.valor_unitario),
        desconto: Math.max(0, numero(item.desconto)),
        deposito_id: depositoId,
        observacao: texto(item.observacao) || null,
      }));
      if (itensNormalizados.some((item) => !item.estoque_item_id || item.quantidade <= 0 || item.valor_unitario < 0)) return erro("Revise os itens do pedido.");
      if (new Set(itensNormalizados.map((item) => item.estoque_item_id)).size !== itensNormalizados.length) return erro("Cada item de estoque deve aparecer apenas uma vez no pedido.");
      const { data, error } = await supabase.rpc("comercial_salvar_pedido_compra", {
        p_empresa_id: contexto.empresaId,
        p_documento_id: texto(body.id) || null,
        p_parceiro_id: parceiroId,
        p_deposito_id: depositoId,
        p_data_emissao: texto(body.data_emissao) || new Date().toISOString().slice(0, 10),
        p_previsao_em: texto(body.previsao_em) || null,
        p_desconto: Math.max(0, numero(body.desconto)),
        p_acrescimo: Math.max(0, numero(body.acrescimo)),
        p_frete: Math.max(0, numero(body.frete)),
        p_observacao: texto(body.observacao) || null,
        p_itens: itensNormalizados,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Pedido de compra salvo.", pedido_id: data });
    }

    if (acao === "aprovar_pedido" || acao === "cancelar_pedido") {
      if (!podeAprovar) return erro("Sem permissão para aprovar ou cancelar compras.", 403);
      const funcao = acao === "aprovar_pedido" ? "comercial_aprovar_pedido_compra" : "comercial_cancelar_pedido_compra";
      const { error } = await supabase.rpc(funcao, { p_empresa_id: contexto.empresaId, p_documento_id: texto(body.id), p_usuario_id: contexto.usuario.id });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: acao === "aprovar_pedido" ? "Pedido aprovado para recebimento." : "Pedido cancelado." });
    }

    if (acao === "receber_pedido") {
      if (!podeAprovar) return erro("Sem permissão para receber compras.", 403);
      const itens = Array.isArray(body.itens) ? body.itens : [];
      const { data, error } = await supabase.rpc("comercial_receber_compra", {
        p_empresa_id: contexto.empresaId,
        p_documento_id: texto(body.id),
        p_deposito_id: texto(body.deposito_id) || null,
        p_itens: itens,
        p_usuario_id: contexto.usuario.id,
        p_idempotency_key: texto(body.idempotency_key) || crypto.randomUUID(),
        p_origem: "manual",
        p_nfe: null,
        p_observacao: texto(body.observacao) || null,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Recebimento confirmado e estoque atualizado.", ...data });
    }

    if (acao === "receber_xml") {
      if (!podeAprovar) return erro("Sem permissão para importar e receber compras.", 403);
      const xml = texto(body.xml);
      const nfe = analisarXmlNfe(xml);
      const itensEntrada = Array.isArray(body.itens) ? body.itens as Array<Record<string, unknown>> : [];
      if (itensEntrada.length !== nfe.itens.length) return erro("Todos os itens da NF-e precisam ser conferidos.");
      const itens = itensEntrada.map((item, indice) => {
        const origem = nfe.itens[indice];
        const fatorConversao = Math.max(1, numero(item.fator_conversao, 1));
        const criarItem = item.criar_item === true;
        const novoItemEntrada = item.novo_item && typeof item.novo_item === "object"
          ? item.novo_item as Record<string, unknown>
          : {};
        return {
          ...origem,
          quantidade: origem.quantidade * fatorConversao,
          custo_unitario: origem.custo_unitario / fatorConversao,
          embalagem_id: texto(item.embalagem_id) || null,
          quantidade_comercial: origem.quantidade,
          unidade_comercial: origem.unidade,
          fator_conversao: fatorConversao,
          valor_unitario_comercial: origem.custo_unitario,
          estoque_item_id: criarItem ? "" : texto(item.estoque_item_id),
          criar_item: criarItem,
          novo_item: criarItem ? {
            nome: texto(novoItemEntrada.nome) || origem.descricao,
            codigo: origem.codigo_fornecedor || null,
            sku: origem.codigo_fornecedor || null,
            codigo_barras: origem.ean || null,
            descricao: origem.ncm ? `NCM ${origem.ncm}` : null,
            ncm: origem.ncm || null,
            tipo: "produto",
            unidade: origem.unidade || "un",
            estoque_minimo: 0,
            custo_unitario: Math.max(0, origem.custo_unitario),
            preco_venda: null,
            categoria_id: texto(novoItemEntrada.categoria_id) || null,
            categoria_nome: texto(novoItemEntrada.categoria_nome) || null,
            marca_id: texto(novoItemEntrada.marca_id) || null,
            marca_nome: texto(novoItemEntrada.marca_nome) || null,
            controla_lote: novoItemEntrada.controla_lote === true,
            controla_validade: novoItemEntrada.controla_validade === true,
            controla_serie: false,
          } : null,
          localizacao_id: texto(item.localizacao_id) || null,
          lote_codigo: texto(item.lote_codigo || origem.lote_codigo) || null,
          fabricado_em: texto(item.fabricado_em || origem.fabricado_em) || null,
          validade: texto(item.validade || origem.validade) || null,
          numero_serie: texto(item.numero_serie) || null,
        };
      });
      if (itens.some((item) => !item.estoque_item_id && (!item.criar_item || !texto(item.novo_item?.nome)))) {
        return erro("Vincule ou cadastre todos os produtos da NF-e.");
      }
      const { data, error } = await supabase.rpc("comercial_importar_receber_xml_com_itens", {
        p_empresa_id: contexto.empresaId,
        p_fornecedor: { ...nfe.fornecedor, id: texto(body.fornecedor_id) || null },
        p_deposito_id: texto(body.deposito_id),
        p_itens: itens,
        p_nfe: { chave: nfe.chave, numero: nfe.numero, serie: nfe.serie, emissao: nfe.emissao, frete: nfe.frete, total: nfe.total, xml },
        p_usuario_id: contexto.usuario.id,
        p_idempotency_key: `nfe:${nfe.chave}`,
        p_observacao: texto(body.observacao) || null,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "NF-e importada, compra registrada e estoque recebido.", ...data });
    }

    if (acao === "registrar_pagamento") {
      if (!podeFinanceiro) return erro("Sem permissão para registrar pagamentos.", 403);
      if (body.confirmar === false) return erro("Pagamentos de compras devem ser baixados pela conta a pagar vinculada.");
      const documentoId = texto(body.id);
      const { data: conta, error: contaError } = await supabase
        .from("financeiro_contas_pagar")
        .select("id,valor_original,valor_pago,status")
        .eq("empresa_id", contexto.empresaId)
        .eq("documento_id", documentoId)
        .neq("status", "cancelada")
        .maybeSingle();
      if (contaError) return erro(mensagemBanco(contaError), 500);
      if (!conta) return erro("O pedido não possui uma conta a pagar vinculada. Aprove o pedido e atualize a tela antes de registrar o pagamento.", 409);
      const valor = numero(body.valor);
      const saldo = Number(conta.valor_original) - Number(conta.valor_pago);
      if (valor <= 0 || valor > saldo) return erro("O valor do pagamento deve ser maior que zero e não pode exceder o saldo da conta a pagar.");
      const dataPagamento = texto(body.vencimento_em);
      const { data, error } = await supabase.rpc("financeiro_baixar_conta_pagar", {
        p_empresa_id: contexto.empresaId,
        p_conta_id: conta.id,
        p_valor: valor,
        p_forma: texto(body.forma) || "outro",
        p_pago_em: dataPagamento ? `${dataPagamento}T12:00:00Z` : new Date().toISOString(),
        p_referencia: texto(body.referencia) || null,
        p_observacao: texto(body.observacao) || null,
        p_idempotency_key: texto(body.idempotency_key) || crypto.randomUUID(),
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Pagamento baixado na conta a pagar vinculada.", pagamento_id: data, conta_pagar_id: conta.id });
    }

    return erro("Ação de compras inválida.");
  } catch (error) {
    return erro(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
