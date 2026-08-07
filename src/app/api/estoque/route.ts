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
  | "registrar_baixa";

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

export async function GET() {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;

  if (!can(contexto.usuario.permissoes, "estoque.visualizar")) {
    return erro("Sem permissão para visualizar o estoque.", 403);
  }

  const [itensResultado, catalogoResultado, composicaoResultado, movimentosResultado] =
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
        .limit(150),
    ]);

  const falha = [
    itensResultado.error,
    catalogoResultado.error,
    composicaoResultado.error,
    movimentosResultado.error,
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
    (item) => Number(item.saldo) <= Number(item.estoque_minimo),
  ).length;
  const valorTotal = itens.reduce(
    (total, item) => total + Number(item.saldo) * Number(item.custo_unitario),
    0,
  );

  return NextResponse.json({
    ok: true,
    itens,
    catalogo,
    movimentacoes,
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
  ].includes(acao);
  const exigeMovimentacao = ["movimentar", "registrar_baixa"].includes(acao);

  if (exigeGerenciamento && !can(contexto.usuario.permissoes, "estoque.gerenciar")) {
    return erro("Sem permissão para gerenciar o estoque.", 403);
  }

  if (exigeMovimentacao && !can(contexto.usuario.permissoes, "estoque.movimentar")) {
    return erro("Sem permissão para movimentar o estoque.", 403);
  }

  try {
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
