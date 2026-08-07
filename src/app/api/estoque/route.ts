import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

type AcaoEstoque =
  | "salvar_item"
  | "arquivar_item"
  | "movimentar"
  | "salvar_catalogo"
  | "arquivar_catalogo"
  | "registrar_baixa"
  | "salvar_deposito"
  | "salvar_lote"
  | "salvar_configuracoes"
  | "movimentar_documento";

type ComposicaoPayload = {
  estoque_item_id?: unknown;
  quantidade?: unknown;
};

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
  const message = error?.message ?? "Erro desconhecido.";

  if (message.includes("estoque_itens_empresa_codigo_uk")) {
    return "Já existe um item ativo com este código.";
  }

  if (message.includes("catalogo_servicos_empresa_codigo_uk")) {
    return "Já existe um item ativo do catálogo com este código.";
  }

  return message;
}

async function contextoComEmpresa() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return { ok: false as const, response: erro(resultado.error, resultado.status) };
  }

  if (!resultado.usuario.empresa_id) {
    return { ok: false as const, response: erro("Usuário sem empresa vinculada.") };
  }

  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

export async function GET(request: Request) {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;

  if (!can(contexto.usuario.permissoes, "estoque.visualizar")) {
    return erro("Sem permissão para visualizar o estoque.", 403);
  }

  const url = new URL(request.url);
  const pagina = Math.max(1, numero(url.searchParams.get("pagina"), 1));
  const limite = Math.min(100, Math.max(10, numero(url.searchParams.get("limite"), 50)));
  const inicio = (pagina - 1) * limite;

  const [itensResultado, catalogoResultado, composicaoResultado, movimentosResultado,
    depositosResultado, saldosResultado, lotesResultado, reservasResultado,
    documentosResultado, configuracoesResultado] =
    await Promise.all([
      supabase
        .from("estoque_itens")
        .select("*")
        .eq("empresa_id", contexto.empresaId)
        .eq("ativo", true)
        .order("nome", { ascending: true }),
      supabase
        .from("catalogo_servicos")
        .select("*")
        .eq("empresa_id", contexto.empresaId)
        .eq("ativo", true)
        .order("nome", { ascending: true }),
      supabase
        .from("catalogo_servico_insumos")
        .select("id, catalogo_servico_id, estoque_item_id, quantidade")
        .eq("empresa_id", contexto.empresaId),
      supabase
        .from("estoque_movimentacoes")
        .select(
          "id, estoque_item_id, catalogo_servico_id, tipo, quantidade, saldo_anterior, saldo_posterior, origem_id, observacao, created_at",
        )
        .eq("empresa_id", contexto.empresaId)
        .order("created_at", { ascending: false })
        .range(inicio, inicio + limite - 1),
      supabase.from("estoque_depositos").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("principal", { ascending: false }),
      supabase.from("estoque_saldos").select("*").eq("empresa_id", contexto.empresaId),
      supabase.from("estoque_lotes").select("*").eq("empresa_id", contexto.empresaId).order("validade", { ascending: true, nullsFirst: false }),
      supabase.from("estoque_reservas").select("*").eq("empresa_id", contexto.empresaId).eq("status", "ativa").order("created_at", { ascending: false }),
      supabase.from("estoque_documentos").select("id,numero,tipo,status,origem_tipo,origem_id,observacao,confirmado_em,created_at").eq("empresa_id", contexto.empresaId).order("created_at", { ascending: false }).limit(100),
      supabase.from("estoque_configuracoes").select("*").eq("empresa_id", contexto.empresaId).maybeSingle(),
    ]);

  const falha = [
    itensResultado.error,
    catalogoResultado.error,
    composicaoResultado.error,
    movimentosResultado.error,
    depositosResultado.error,
    saldosResultado.error,
    lotesResultado.error,
    reservasResultado.error,
    documentosResultado.error,
    configuracoesResultado.error,
  ].find(Boolean);

  if (falha) {
    return erro(`Erro ao carregar o estoque: ${mensagemBanco(falha)}`, 500);
  }

  const itens = itensResultado.data ?? [];
  const catalogo = (catalogoResultado.data ?? []).map((item) => ({
    ...item,
    composicao: (composicaoResultado.data ?? []).filter(
      (componente) => componente.catalogo_servico_id === item.id,
    ),
  }));
  const itensPorId = new Map(itens.map((item) => [item.id, item]));
  const catalogoPorId = new Map(catalogo.map((item) => [item.id, item]));
  const movimentacoes = (movimentosResultado.data ?? []).map((movimento) => ({
    ...movimento,
    item: itensPorId.get(movimento.estoque_item_id) ?? null,
    catalogo_item: movimento.catalogo_servico_id
      ? catalogoPorId.get(movimento.catalogo_servico_id) ?? null
      : null,
  }));

  const itensBaixos = itens.filter(
    (item) => {
      const saldos = (saldosResultado.data ?? []).filter((saldo) => saldo.estoque_item_id === item.id);
      const disponivel = saldos.reduce((total, saldo) => total + Number(saldo.saldo_fisico) - Number(saldo.saldo_reservado), 0);
      return disponivel <= Number(item.estoque_minimo);
    },
  ).length;
  const valorTotal = (saldosResultado.data ?? []).reduce((total, saldo) => total + Number(saldo.saldo_fisico) * Number(saldo.custo_medio), 0);

  return NextResponse.json({
    ok: true,
    itens,
    catalogo,
    movimentacoes,
    depositos: depositosResultado.data ?? [],
    saldos: saldosResultado.data ?? [],
    lotes: lotesResultado.data ?? [],
    reservas: reservasResultado.data ?? [],
    documentos: documentosResultado.data ?? [],
    configuracoes: configuracoesResultado.data ?? null,
    paginacao: { pagina, limite, tem_mais: (movimentosResultado.data ?? []).length === limite },
    resumo: {
      itens_ativos: itens.length,
      itens_estoque_baixo: itensBaixos,
      valor_total: valorTotal,
      catalogo_ativo: catalogo.length,
    },
  });
}

export async function POST(request: Request) {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  const acao = texto(body.acao) as AcaoEstoque;
  const exigeGerenciamento = [
    "salvar_item",
    "arquivar_item",
    "salvar_catalogo",
    "arquivar_catalogo",
    "salvar_deposito",
    "salvar_lote",
    "salvar_configuracoes",
  ].includes(acao);
  const exigeMovimentacao = ["movimentar", "registrar_baixa", "movimentar_documento"].includes(acao);

  if (exigeGerenciamento && !can(contexto.usuario.permissoes, "estoque.gerenciar")) {
    return erro("Sem permissão para gerenciar o estoque.", 403);
  }

  if (exigeMovimentacao && !can(contexto.usuario.permissoes, "estoque.movimentar")) {
    return erro("Sem permissão para movimentar o estoque.", 403);
  }

  try {
    if (acao === "salvar_deposito") {
      if (!can(contexto.usuario.permissoes, "estoque.configurar")) return erro("Sem permissão para configurar depósitos.", 403);
      const id = texto(body.id);
      const nome = texto(body.nome);
      const codigo = texto(body.codigo).toUpperCase();
      if (!nome || !codigo) return erro("Informe o código e o nome do depósito.");
      const payload = { empresa_id: contexto.empresaId, nome, codigo, descricao: texto(body.descricao) || null, principal: Boolean(body.principal), updated_at: new Date().toISOString() };
      if (payload.principal) await supabase.from("estoque_depositos").update({ principal: false }).eq("empresa_id", contexto.empresaId);
      const query = id
        ? supabase.from("estoque_depositos").update(payload).eq("id", id).eq("empresa_id", contexto.empresaId)
        : supabase.from("estoque_depositos").insert({ ...payload, created_by: contexto.usuario.id });
      const { error } = await query;
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Depósito salvo com sucesso." });
    }

    if (acao === "salvar_lote") {
      const itemId = texto(body.estoque_item_id);
      const codigo = texto(body.codigo);
      if (!itemId || !codigo) return erro("Informe o item e o código do lote.");
      const { error } = await supabase.from("estoque_lotes").insert({ empresa_id: contexto.empresaId, estoque_item_id: itemId, codigo, fabricado_em: texto(body.fabricado_em) || null, validade: texto(body.validade) || null, fabricante: texto(body.fabricante) || null });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Lote cadastrado." });
    }

    if (acao === "salvar_configuracoes") {
      if (!can(contexto.usuario.permissoes, "estoque.configurar")) return erro("Sem permissão para configurar o estoque.", 403);
      const payload = { empresa_id: contexto.empresaId, modo: texto(body.modo) === "avancado" ? "avancado" : "simples", metodo_custo: texto(body.metodo_custo) === "fifo" ? "fifo" : "medio", bloquear_negativo: body.bloquear_negativo !== false, exigir_justificativa_ajuste: body.exigir_justificativa_ajuste !== false, selecionar_lote_fefo: body.selecionar_lote_fefo !== false, dias_alerta_validade: Math.max(0, numero(body.dias_alerta_validade, 60)), updated_by: contexto.usuario.id, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("estoque_configuracoes").upsert(payload, { onConflict: "empresa_id" });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Configurações salvas." });
    }

    if (acao === "movimentar_documento") {
      const itemId = texto(body.estoque_item_id);
      const depositoOrigem = texto(body.deposito_origem_id) || null;
      const depositoDestino = texto(body.deposito_destino_id) || null;
      const tipo = texto(body.tipo);
      const quantidadeMovimento = numero(body.quantidade, -1);
      const justificativa = texto(body.observacao);
      if (!itemId || quantidadeMovimento <= 0 || !["entrada", "saida", "transferencia", "ajuste"].includes(tipo)) return erro("Dados da operação inválidos.");
      if ((tipo === "saida" || tipo === "ajuste") && !justificativa) return erro("A justificativa é obrigatória para esta operação.");
      const idempotencyKey = texto(body.idempotency_key) || crypto.randomUUID();
      const { data: documento, error: documentoError } = await supabase.from("estoque_documentos").insert({ empresa_id: contexto.empresaId, tipo, idempotency_key: idempotencyKey, observacao: justificativa || null, created_by: contexto.usuario.id }).select("id").single();
      if (documentoError) return erro(mensagemBanco(documentoError));
      const { error: itemError } = await supabase.from("estoque_documento_itens").insert({ empresa_id: contexto.empresaId, documento_id: documento.id, estoque_item_id: itemId, deposito_origem_id: depositoOrigem, deposito_destino_id: depositoDestino, lote_id: texto(body.lote_id) || null, quantidade: quantidadeMovimento, custo_unitario: Math.max(0, numero(body.custo_unitario)) });
      if (itemError) return erro(mensagemBanco(itemError));
      const { error: confirmarError } = await supabase.rpc("estoque_confirmar_documento", { p_empresa_id: contexto.empresaId, p_documento_id: documento.id, p_usuario_id: contexto.usuario.id });
      if (confirmarError) return erro(mensagemBanco(confirmarError));
      return NextResponse.json({ ok: true, message: "Operação confirmada e auditada.", documento_id: documento.id });
    }

    if (acao === "salvar_item") {
      const id = texto(body.id);
      const nome = texto(body.nome);
      const tipo = texto(body.tipo) || "produto";
      const unidade = texto(body.unidade) || "un";

      if (!nome) return erro("Informe o nome do item.");
      if (!["produto", "material", "insumo"].includes(tipo)) {
        return erro("Tipo de item inválido.");
      }

      const payload = {
        empresa_id: contexto.empresaId,
        codigo: texto(body.codigo) || null,
        nome,
        descricao: texto(body.descricao) || null,
        tipo,
        unidade,
        estoque_minimo: Math.max(0, numero(body.estoque_minimo)),
        custo_unitario: Math.max(0, numero(body.custo_unitario)),
        preco_venda: texto(body.preco_venda)
          ? Math.max(0, numero(body.preco_venda))
          : null,
        updated_by: contexto.usuario.id,
      };

      if (id) {
        const { data, error } = await supabase
          .from("estoque_itens")
          .update(payload)
          .eq("id", id)
          .eq("empresa_id", contexto.empresaId)
          .select("id")
          .maybeSingle();

        if (error) return erro(mensagemBanco(error));
        if (!data) return erro("Item não encontrado.", 404);
      } else {
        const { error } = await supabase.from("estoque_itens").insert({
          ...payload,
          saldo: Math.max(0, numero(body.saldo_inicial)),
          created_by: contexto.usuario.id,
        });

        if (error) return erro(mensagemBanco(error));
      }

      return NextResponse.json({ ok: true, message: "Item salvo com sucesso." });
    }

    if (acao === "arquivar_item") {
      const id = texto(body.id);
      if (!id) return erro("Item não informado.");

      const { data, error } = await supabase
        .from("estoque_itens")
        .update({ ativo: false, updated_by: contexto.usuario.id })
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .select("id")
        .maybeSingle();

      if (error) return erro(mensagemBanco(error));
      if (!data) return erro("Item não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Item arquivado." });
    }

    if (acao === "movimentar") {
      const itemId = texto(body.estoque_item_id);
      const tipo = texto(body.tipo);
      const quantidade = numero(body.quantidade, -1);

      if (!itemId || !["entrada", "saida", "ajuste"].includes(tipo)) {
        return erro("Dados da movimentação inválidos.");
      }

      const { error } = await supabase.rpc("estoque_movimentar", {
        p_empresa_id: contexto.empresaId,
        p_estoque_item_id: itemId,
        p_tipo: tipo,
        p_quantidade: quantidade,
        p_usuario_id: contexto.usuario.id,
        p_observacao: texto(body.observacao) || null,
      });

      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Movimentação registrada." });
    }

    if (acao === "salvar_catalogo") {
      const id = texto(body.id);
      const nome = texto(body.nome);
      const tipo = texto(body.tipo) || "servico";
      const estoqueItemId = texto(body.estoque_item_id) || null;
      const composicaoEntrada = Array.isArray(body.composicao)
        ? (body.composicao as ComposicaoPayload[])
        : [];

      if (!nome) return erro("Informe o nome do produto ou serviço.");
      if (!["produto", "servico", "procedimento", "imovel"].includes(tipo)) {
        return erro("Tipo de catálogo inválido.");
      }
      if (tipo === "produto" && !estoqueItemId) {
        return erro("Vincule o produto ao item que terá baixa no estoque.");
      }

      const composicaoNormalizada = composicaoEntrada
        .map((componente) => ({
          estoque_item_id: texto(componente.estoque_item_id),
          quantidade: numero(componente.quantidade),
        }))
        .filter((componente) => componente.estoque_item_id && componente.quantidade > 0);
      const idsEstoque = tipo === "produto"
        ? [estoqueItemId as string]
        : composicaoNormalizada.map((componente) => componente.estoque_item_id);
      const idsUnicos = new Set(idsEstoque);

      if (idsUnicos.size !== idsEstoque.length) {
        return erro("Cada insumo deve aparecer apenas uma vez na composição.");
      }

      if (idsEstoque.length > 0) {
        const { data: itensValidos, error: validacaoError } = await supabase
          .from("estoque_itens")
          .select("id")
          .eq("empresa_id", contexto.empresaId)
          .eq("ativo", true)
          .in("id", idsEstoque);

        if (validacaoError) return erro(mensagemBanco(validacaoError));
        if ((itensValidos ?? []).length !== idsUnicos.size) {
          return erro("Um dos insumos selecionados não pertence ao estoque da empresa.");
        }
      }

      const payload = {
        empresa_id: contexto.empresaId,
        codigo: texto(body.codigo) || null,
        nome,
        descricao: texto(body.descricao) || null,
        tipo,
        preco: Math.max(0, numero(body.preco)),
        estoque_item_id: tipo === "produto" ? estoqueItemId : null,
        imovel_id: tipo === "imovel" ? texto(body.imovel_id) || null : null,
        updated_by: contexto.usuario.id,
      };

      let catalogoId = id;

      if (catalogoId) {
        const { data, error } = await supabase
          .from("catalogo_servicos")
          .update(payload)
          .eq("id", catalogoId)
          .eq("empresa_id", contexto.empresaId)
          .select("id")
          .maybeSingle();

        if (error) return erro(mensagemBanco(error));
        if (!data) return erro("Item do catálogo não encontrado.", 404);
      } else {
        const { data, error } = await supabase
          .from("catalogo_servicos")
          .insert({ ...payload, created_by: contexto.usuario.id })
          .select("id")
          .single();

        if (error) return erro(mensagemBanco(error));
        catalogoId = data.id;
      }

      const composicao = composicaoNormalizada.map((componente) => ({
          empresa_id: contexto.empresaId,
          catalogo_servico_id: catalogoId,
          ...componente,
        }));

      const { error: exclusaoError } = await supabase
        .from("catalogo_servico_insumos")
        .delete()
        .eq("empresa_id", contexto.empresaId)
        .eq("catalogo_servico_id", catalogoId);

      if (exclusaoError) return erro(mensagemBanco(exclusaoError));

      if (composicao.length > 0) {
        const { error: composicaoError } = await supabase
          .from("catalogo_servico_insumos")
          .insert(composicao);
        if (composicaoError) return erro(mensagemBanco(composicaoError));
      }

      return NextResponse.json({ ok: true, message: "Catálogo salvo com sucesso." });
    }

    if (acao === "arquivar_catalogo") {
      const id = texto(body.id);
      if (!id) return erro("Item do catálogo não informado.");

      const { data, error } = await supabase
        .from("catalogo_servicos")
        .update({ ativo: false, updated_by: contexto.usuario.id })
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .select("id")
        .maybeSingle();

      if (error) return erro(mensagemBanco(error));
      if (!data) return erro("Item do catálogo não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Item do catálogo arquivado." });
    }

    if (acao === "registrar_baixa") {
      const catalogoId = texto(body.catalogo_servico_id);
      const quantidade = numero(body.quantidade, -1);
      if (!catalogoId || quantidade <= 0) {
        return erro("Informe o item e uma quantidade maior que zero.");
      }

      const { error } = await supabase.rpc("estoque_registrar_baixa_catalogo", {
        p_empresa_id: contexto.empresaId,
        p_catalogo_servico_id: catalogoId,
        p_quantidade: quantidade,
        p_usuario_id: contexto.usuario.id,
        p_origem_id: texto(body.origem_id) || null,
        p_observacao: texto(body.observacao) || null,
      });

      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({
        ok: true,
        message: "Baixa automática registrada com sucesso.",
      });
    }

    return erro("Ação de estoque inválida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return erro(message, 500);
  }
}
