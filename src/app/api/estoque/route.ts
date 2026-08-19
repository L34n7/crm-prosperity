import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

type AcaoEstoque =
  | "salvar_item"
  | "arquivar_item"
  | "restaurar_item"
  | "excluir_item"
  | "movimentar"
  | "salvar_catalogo"
  | "arquivar_catalogo"
  | "restaurar_catalogo"
  | "excluir_catalogo"
  | "registrar_baixa"
  | "salvar_deposito"
  | "salvar_lote"
  | "salvar_configuracoes"
  | "movimentar_documento"
  | "salvar_categoria"
  | "salvar_marca"
  | "salvar_localizacao"
  | "salvar_inventario"
  | "aprovar_inventario";

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

async function localizarVinculos(
  empresaId: string,
  id: string,
  referencias: Array<{ tabela: string; coluna: string; rotulo: string }>,
) {
  const resultados = await Promise.all(referencias.map(async (referencia) => {
    const { count, error } = await supabase
      .from(referencia.tabela)
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq(referencia.coluna, id);
    if (error) throw error;
    return { ...referencia, quantidade: count ?? 0 };
  }));

  return resultados.filter((resultado) => resultado.quantidade > 0);
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
    documentosResultado, configuracoesResultado, localizacoesResultado,
    categoriasResultado, marcasResultado, inventariosResultado,
    inventarioItensResultado, consumosClinicosResultado] =
    await Promise.all([
      supabase
        .from("estoque_itens")
        .select("*")
        .eq("empresa_id", contexto.empresaId)
        .order("nome", { ascending: true }),
      supabase
        .from("catalogo_servicos")
        .select("*")
        .eq("empresa_id", contexto.empresaId)
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
      supabase.from("estoque_localizacoes").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("codigo"),
      supabase.from("estoque_categorias").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("nome"),
      supabase.from("estoque_marcas").select("*").eq("empresa_id", contexto.empresaId).eq("ativo", true).order("nome"),
      supabase.from("estoque_inventarios").select("*").eq("empresa_id", contexto.empresaId).order("created_at", { ascending: false }).limit(100),
      supabase.from("estoque_inventario_itens").select("*").eq("empresa_id", contexto.empresaId),
      supabase.from("estoque_consumos_clinicos").select("id,agendamento_id,estoque_item_id,lote_id,paciente_id,pessoa_id,profissional_id,dente,quantidade,status,consumido_em,estornado_em").eq("empresa_id", contexto.empresaId).order("consumido_em", { ascending: false }).limit(100),
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
    localizacoesResultado.error,
    categoriasResultado.error,
    marcasResultado.error,
    inventariosResultado.error,
    inventarioItensResultado.error,
    consumosClinicosResultado.error,
  ].find(Boolean);

  if (falha) {
    return erro(`Erro ao carregar o estoque: ${mensagemBanco(falha)}`, 500);
  }

  const saldos = saldosResultado.data ?? [];
  const todosItens = (itensResultado.data ?? []).map((item) => {
    const posicoes = saldos.filter((saldo) => saldo.estoque_item_id === item.id);
    return {
      ...item,
      saldo: posicoes.reduce((total, saldo) => total + Number(saldo.saldo_fisico), 0),
      saldo_reservado: posicoes.reduce((total, saldo) => total + Number(saldo.saldo_reservado), 0),
      saldo_disponivel: posicoes.reduce(
        (total, saldo) => total + Number(saldo.saldo_fisico) - Number(saldo.saldo_reservado),
        0,
      ),
    };
  });
  const todoCatalogo = (catalogoResultado.data ?? []).map((item) => ({
    ...item,
    composicao: (composicaoResultado.data ?? []).filter(
      (componente) => componente.catalogo_servico_id === item.id,
    ),
  }));
  const itens = todosItens.filter((item) => item.ativo);
  const itensArquivados = todosItens.filter((item) => !item.ativo);
  const catalogo = todoCatalogo.filter((item) => item.ativo);
  const catalogoArquivado = todoCatalogo.filter((item) => !item.ativo);
  const itensPorId = new Map(todosItens.map((item) => [item.id, item]));
  const catalogoPorId = new Map(todoCatalogo.map((item) => [item.id, item]));
  const movimentacoes = (movimentosResultado.data ?? []).map((movimento) => ({
    ...movimento,
    item: itensPorId.get(movimento.estoque_item_id) ?? null,
    catalogo_item: movimento.catalogo_servico_id
      ? catalogoPorId.get(movimento.catalogo_servico_id) ?? null
      : null,
  }));

  const itensBaixos = itens.filter(
    (item) => {
      const disponivel = Number(item.saldo_disponivel);
      return disponivel <= Number(item.estoque_minimo);
    },
  ).length;
  const valorTotal = saldos.reduce((total, saldo) => total + Number(saldo.saldo_fisico) * Number(saldo.custo_medio), 0);

  const inventarios = (inventariosResultado.data ?? []).map((inventario) => ({
    ...inventario,
    itens: (inventarioItensResultado.data ?? []).filter(
      (item) => item.inventario_id === inventario.id,
    ),
  }));

  return NextResponse.json({
    ok: true,
    itens,
    itens_arquivados: itensArquivados,
    catalogo,
    catalogo_arquivado: catalogoArquivado,
    movimentacoes,
    depositos: depositosResultado.data ?? [],
    saldos,
    lotes: lotesResultado.data ?? [],
    reservas: reservasResultado.data ?? [],
    documentos: documentosResultado.data ?? [],
    configuracoes: configuracoesResultado.data ?? null,
    localizacoes: localizacoesResultado.data ?? [],
    categorias: categoriasResultado.data ?? [],
    marcas: marcasResultado.data ?? [],
    inventarios,
    consumos_clinicos: consumosClinicosResultado.data ?? [],
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
    "restaurar_item",
    "excluir_item",
    "salvar_catalogo",
    "arquivar_catalogo",
    "restaurar_catalogo",
    "excluir_catalogo",
    "salvar_deposito",
    "salvar_lote",
    "salvar_configuracoes",
    "salvar_categoria",
    "salvar_marca",
    "salvar_localizacao",
    "salvar_inventario",
  ].includes(acao);
  const exigeMovimentacao = ["registrar_baixa", "movimentar_documento", "aprovar_inventario"].includes(acao);

  if (exigeGerenciamento && !can(contexto.usuario.permissoes, "estoque.gerenciar")) {
    return erro("Sem permissão para gerenciar o estoque.", 403);
  }

  if (["excluir_item", "excluir_catalogo"].includes(acao) && !can(contexto.usuario.permissoes, "estoque.configurar")) {
    return erro("Sem permissão para excluir registros permanentemente.", 403);
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
      const payload = { empresa_id: contexto.empresaId, nome, codigo, descricao: texto(body.descricao) || null, principal: Boolean(body.principal), permite_saldo_negativo: Boolean(body.permite_saldo_negativo), updated_at: new Date().toISOString() };
      if (payload.principal) await supabase.from("estoque_depositos").update({ principal: false }).eq("empresa_id", contexto.empresaId);
      const query = id
        ? supabase.from("estoque_depositos").update(payload).eq("id", id).eq("empresa_id", contexto.empresaId)
        : supabase.from("estoque_depositos").insert({ ...payload, created_by: contexto.usuario.id });
      const { error } = await query;
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Depósito salvo com sucesso." });
    }

    if (acao === "salvar_categoria" || acao === "salvar_marca") {
      if (!can(contexto.usuario.permissoes, "estoque.configurar")) return erro("Sem permissão para configurar o estoque.", 403);
      const nome = texto(body.nome);
      if (!nome) return erro("Informe o nome.");
      const tabela = acao === "salvar_categoria" ? "estoque_categorias" : "estoque_marcas";
      const id = texto(body.id);
      const payload = { empresa_id: contexto.empresaId, nome };
      const query = id
        ? supabase.from(tabela).update(payload).eq("empresa_id", contexto.empresaId).eq("id", id)
        : supabase.from(tabela).insert(payload);
      const { error } = await query;
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: acao === "salvar_categoria" ? "Categoria salva." : "Marca salva." });
    }

    if (acao === "salvar_localizacao") {
      if (!can(contexto.usuario.permissoes, "estoque.configurar")) return erro("Sem permissão para configurar localizações.", 403);
      const depositoId = texto(body.deposito_id);
      const codigo = texto(body.codigo).toUpperCase();
      const nome = texto(body.nome);
      if (!depositoId || !codigo || !nome) return erro("Informe depósito, código e nome da localização.");
      const { error } = await supabase.from("estoque_localizacoes").insert({
        empresa_id: contexto.empresaId,
        deposito_id: depositoId,
        codigo,
        nome,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Localização salva." });
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
      if (!itemId || quantidadeMovimento < 0 || (tipo !== "ajuste" && quantidadeMovimento === 0) || !["entrada", "saida", "transferencia", "ajuste"].includes(tipo)) return erro("Dados da operação inválidos.");
      if ((tipo === "saida" || tipo === "ajuste") && !justificativa) return erro("A justificativa é obrigatória para esta operação.");
      const idempotencyKey = texto(body.idempotency_key) || crypto.randomUUID();
      const itemDocumento = {
        estoque_item_id: itemId,
        deposito_origem_id: depositoOrigem,
        deposito_destino_id: depositoDestino,
        localizacao_origem_id: texto(body.localizacao_origem_id) || null,
        localizacao_destino_id: texto(body.localizacao_destino_id) || null,
        lote_id: texto(body.lote_id) || null,
        numero_serie: texto(body.numero_serie) || null,
        quantidade: quantidadeMovimento,
        custo_unitario: Math.max(0, numero(body.custo_unitario)),
      };
      const { data, error } = await supabase.rpc("estoque_registrar_documento", {
        p_empresa_id: contexto.empresaId,
        p_tipo: tipo,
        p_itens: [itemDocumento],
        p_usuario_id: contexto.usuario.id,
        p_observacao: justificativa || null,
        p_origem_tipo: "operacao_manual",
        p_origem_id: null,
        p_idempotency_key: idempotencyKey,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Operação confirmada e auditada.", documento_id: data?.documento_id });
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
        sku: texto(body.sku) || null,
        codigo_barras: texto(body.codigo_barras) || null,
        categoria_id: texto(body.categoria_id) || null,
        marca_id: texto(body.marca_id) || null,
        controla_lote: Boolean(body.controla_lote),
        controla_validade: Boolean(body.controla_validade),
        controla_serie: Boolean(body.controla_serie),
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
        const { error } = await supabase.rpc("estoque_criar_item_com_saldo_inicial", {
          p_empresa_id: contexto.empresaId,
          p_dados: {
            ...payload,
          },
          p_saldo_inicial: Math.max(0, numero(body.saldo_inicial)),
          p_deposito_id: texto(body.deposito_inicial_id) || null,
          p_usuario_id: contexto.usuario.id,
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

    if (acao === "restaurar_item") {
      const id = texto(body.id);
      if (!id) return erro("Item não informado.");

      const { data, error } = await supabase
        .from("estoque_itens")
        .update({ ativo: true, updated_by: contexto.usuario.id })
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .eq("ativo", false)
        .select("id")
        .maybeSingle();

      if (error) return erro(mensagemBanco(error));
      if (!data) return erro("Item arquivado não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Item restaurado com sucesso." });
    }

    if (acao === "excluir_item") {
      const id = texto(body.id);
      if (!id) return erro("Item não informado.");

      const { data: item, error: itemError } = await supabase
        .from("estoque_itens")
        .select("id, ativo, saldo")
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .maybeSingle();
      if (itemError) return erro(mensagemBanco(itemError));
      if (!item) return erro("Item não encontrado.", 404);
      if (item.ativo) return erro("Arquive o item antes de excluí-lo permanentemente.", 409);
      if (Number(item.saldo ?? 0) !== 0) return erro("Não é possível excluir um item com saldo registrado.", 409);

      const vinculos = await localizarVinculos(contexto.empresaId, id, [
        { tabela: "catalogo_servicos", coluna: "estoque_item_id", rotulo: "catálogo" },
        { tabela: "catalogo_servico_insumos", coluna: "estoque_item_id", rotulo: "composição de serviços" },
        { tabela: "estoque_movimentacoes", coluna: "estoque_item_id", rotulo: "movimentações" },
        { tabela: "estoque_lotes", coluna: "estoque_item_id", rotulo: "lotes" },
        { tabela: "estoque_saldos", coluna: "estoque_item_id", rotulo: "posições de saldo" },
        { tabela: "estoque_documento_itens", coluna: "estoque_item_id", rotulo: "documentos de estoque" },
        { tabela: "estoque_reservas", coluna: "estoque_item_id", rotulo: "reservas" },
        { tabela: "estoque_custos_historico", coluna: "estoque_item_id", rotulo: "histórico de custos" },
        { tabela: "estoque_consumos_clinicos", coluna: "estoque_item_id", rotulo: "consumos clínicos" },
        { tabela: "estoque_inventario_itens", coluna: "estoque_item_id", rotulo: "inventários" },
        { tabela: "comercial_documento_itens", coluna: "estoque_item_id", rotulo: "documentos comerciais" },
        { tabela: "comercial_fornecedor_itens", coluna: "estoque_item_id", rotulo: "fornecedores" },
        { tabela: "comercial_recebimento_compra_itens", coluna: "estoque_item_id", rotulo: "recebimentos de compra" },
      ]);
      if (vinculos.length) {
        return erro(`Este item possui vínculos com ${vinculos.map((vinculo) => vinculo.rotulo).join(", ")} e não pode ser excluído.`, 409);
      }

      const { data, error } = await supabase
        .from("estoque_itens")
        .delete()
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .eq("ativo", false)
        .select("id")
        .maybeSingle();
      if (error) return erro("O item ganhou um vínculo durante a exclusão e foi preservado.", 409);
      if (!data) return erro("Item arquivado não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Item excluído permanentemente." });
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

    if (acao === "restaurar_catalogo") {
      const id = texto(body.id);
      if (!id) return erro("Item do catálogo não informado.");

      const { data, error } = await supabase
        .from("catalogo_servicos")
        .update({ ativo: true, updated_by: contexto.usuario.id })
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .eq("ativo", false)
        .select("id")
        .maybeSingle();
      if (error) return erro(mensagemBanco(error));
      if (!data) return erro("Item arquivado do catálogo não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Item do catálogo restaurado com sucesso." });
    }

    if (acao === "excluir_catalogo") {
      const id = texto(body.id);
      if (!id) return erro("Item do catálogo não informado.");

      const { data: item, error: itemError } = await supabase
        .from("catalogo_servicos")
        .select("id, ativo")
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .maybeSingle();
      if (itemError) return erro(mensagemBanco(itemError));
      if (!item) return erro("Item do catálogo não encontrado.", 404);
      if (item.ativo) return erro("Arquive o item do catálogo antes de excluí-lo permanentemente.", 409);

      const vinculos = await localizarVinculos(contexto.empresaId, id, [
        { tabela: "agenda_catalogo_itens", coluna: "catalogo_servico_id", rotulo: "agendamentos" },
        { tabela: "comercial_documento_itens", coluna: "catalogo_servico_id", rotulo: "documentos comerciais" },
        { tabela: "estoque_movimentacoes", coluna: "catalogo_servico_id", rotulo: "movimentações" },
      ]);
      if (vinculos.length) {
        return erro(`Este item possui vínculos com ${vinculos.map((vinculo) => vinculo.rotulo).join(", ")} e não pode ser excluído.`, 409);
      }

      const { data, error } = await supabase
        .from("catalogo_servicos")
        .delete()
        .eq("id", id)
        .eq("empresa_id", contexto.empresaId)
        .eq("ativo", false)
        .select("id")
        .maybeSingle();
      if (error) return erro("O item ganhou um vínculo durante a exclusão e foi preservado.", 409);
      if (!data) return erro("Item arquivado do catálogo não encontrado.", 404);
      return NextResponse.json({ ok: true, message: "Item do catálogo excluído permanentemente." });
    }

    if (acao === "registrar_baixa") {
      const catalogoId = texto(body.catalogo_servico_id);
      const quantidade = numero(body.quantidade, -1);
      const depositoId = texto(body.deposito_id);
      if (!catalogoId || !depositoId || quantidade <= 0) {
        return erro("Informe o item, o depósito e uma quantidade maior que zero.");
      }

      const { data, error } = await supabase.rpc("estoque_registrar_baixa_catalogo_documento", {
        p_empresa_id: contexto.empresaId,
        p_catalogo_servico_id: catalogoId,
        p_deposito_id: depositoId,
        p_quantidade: quantidade,
        p_usuario_id: contexto.usuario.id,
        p_origem_referencia: texto(body.origem_id) || null,
        p_observacao: texto(body.observacao) || null,
        p_idempotency_key: texto(body.idempotency_key) || crypto.randomUUID(),
      });

      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({
        ok: true,
        message: "Baixa registrada em documento de consumo.",
        documento_id: data?.documento_id,
      });
    }

    if (acao === "salvar_inventario") {
      const depositoId = texto(body.deposito_id);
      const itens = Array.isArray(body.itens) ? body.itens : [];
      if (!depositoId || !texto(body.descricao) || itens.length === 0) {
        return erro("Informe depósito, descrição e ao menos um item contado.");
      }
      const { data, error } = await supabase.rpc("estoque_salvar_inventario", {
        p_empresa_id: contexto.empresaId,
        p_inventario_id: texto(body.id) || null,
        p_deposito_id: depositoId,
        p_descricao: texto(body.descricao),
        p_tipo_contagem: texto(body.tipo_contagem) === "cega" ? "cega" : "aberta",
        p_itens: itens,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Inventário enviado para aprovação.", inventario_id: data });
    }

    if (acao === "aprovar_inventario") {
      const inventarioId = texto(body.id);
      if (!inventarioId) return erro("Inventário não informado.");
      const { data, error } = await supabase.rpc("estoque_aprovar_inventario", {
        p_empresa_id: contexto.empresaId,
        p_inventario_id: inventarioId,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(mensagemBanco(error));
      return NextResponse.json({ ok: true, message: "Inventário aprovado e ajuste documentado.", documento_id: data?.documento_id });
    }

    return erro("Ação de estoque inválida.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return erro(message, 500);
  }
}
