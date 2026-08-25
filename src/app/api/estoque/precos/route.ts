import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolverPrecosProdutos } from "@/lib/estoque/precos";

const supabase = getSupabaseAdmin();

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function numeroOuNull(valor: unknown) {
  if (valor === null || valor === undefined || texto(valor) === "") return null;
  const numero = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  return Number.isFinite(numero) ? numero : null;
}

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function contextoComEmpresa() {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return { ok: false as const, response: erro(contexto.error, contexto.status) };
  if (!contexto.usuario.empresa_id) return { ok: false as const, response: erro("Usuário sem empresa vinculada.") };
  return { ok: true as const, usuario: contexto.usuario, empresaId: contexto.usuario.empresa_id };
}

function jsonPrecosConfig(rows: Array<{ estoque_item_id: string; canal: string; preco: unknown }>) {
  const mapa: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const valor = Number(row.preco);
    if (!Number.isFinite(valor)) continue;
    mapa[row.estoque_item_id] = { ...(mapa[row.estoque_item_id] || {}), [row.canal]: valor };
  }
  return mapa;
}

function jsonPagamentosProduto(
  rows: Array<{
    estoque_item_id: string | null;
    canal: string | null;
    forma: string;
    parcelas_min: number;
    parcelas_max: number;
    tipo_ajuste: string;
    valor: unknown;
  }>
) {
  const mapa: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!row.estoque_item_id || row.canal !== null || row.parcelas_min !== 1 || row.parcelas_max !== 1 || row.tipo_ajuste !== "preco_fixo") continue;
    const valor = Number(row.valor);
    if (!Number.isFinite(valor)) continue;
    mapa[row.estoque_item_id] = { ...(mapa[row.estoque_item_id] || {}), [row.forma]: valor };
  }
  return mapa;
}

export async function GET() {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;
  if (!can(contexto.usuario.permissoes, "estoque.visualizar")) {
    return erro("Sem permissão para visualizar preços do estoque.", 403);
  }

  const [itens, canais, regras, promocoes, vinculos, categorias, marcas] = await Promise.all([
    supabase
      .from("estoque_itens")
      .select("id,codigo,sku,nome,unidade,custo_unitario,preco_venda,categoria_id,marca_id,ativo")
      .eq("empresa_id", contexto.empresaId)
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("estoque_precos_canais")
      .select("estoque_item_id,canal,preco")
      .eq("empresa_id", contexto.empresaId)
      .eq("ativo", true),
    supabase
      .from("estoque_regras_pagamento")
      .select("id,estoque_item_id,canal,forma,parcelas_min,parcelas_max,tipo_ajuste,valor,ativo,created_at,updated_at")
      .eq("empresa_id", contexto.empresaId)
      .eq("ativo", true)
      .order("forma"),
    supabase
      .from("estoque_promocoes")
      .select("id,nome,tipo_ajuste,valor,inicio_em,fim_em,canais,prioridade,ativo,created_at,updated_at")
      .eq("empresa_id", contexto.empresaId)
      .order("inicio_em", { ascending: false })
      .limit(500),
    supabase
      .from("estoque_promocao_itens")
      .select("promocao_id,estoque_item_id")
      .eq("empresa_id", contexto.empresaId),
    supabase
      .from("estoque_categorias")
      .select("id,nome")
      .eq("empresa_id", contexto.empresaId)
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("estoque_marcas")
      .select("id,nome")
      .eq("empresa_id", contexto.empresaId)
      .eq("ativo", true)
      .order("nome"),
  ]);

  const falha = [itens.error, canais.error, regras.error, promocoes.error, vinculos.error, categorias.error, marcas.error].find(Boolean);
  if (falha) return erro(`Erro ao carregar preços e promoções: ${falha?.message || "falha de banco"}`, 500);

  const itemIds = (itens.data || []).map((item) => item.id);
  const precos = await resolverPrecosProdutos({ empresaId: contexto.empresaId, itemIds });
  const canaisConfig = jsonPrecosConfig((canais.data || []) as Array<{ estoque_item_id: string; canal: string; preco: unknown }>);
  const pagamentosConfig = jsonPagamentosProduto((regras.data || []) as Array<{
    estoque_item_id: string | null;
    canal: string | null;
    forma: string;
    parcelas_min: number;
    parcelas_max: number;
    tipo_ajuste: string;
    valor: unknown;
  }>);
  const produtosPorPromocao = new Map<string, string[]>();
  for (const vinculo of vinculos.data || []) {
    const lista = produtosPorPromocao.get(vinculo.promocao_id) || [];
    lista.push(vinculo.estoque_item_id);
    produtosPorPromocao.set(vinculo.promocao_id, lista);
  }

  return NextResponse.json({
    ok: true,
    agora: new Date().toISOString(),
    produtos: (itens.data || []).map((item) => ({
      ...item,
      precos: precos.get(item.id) || null,
      canais_config: canaisConfig[item.id] || {},
      pagamentos_config: pagamentosConfig[item.id] || {},
    })),
    promocoes: (promocoes.data || []).map((promocao) => ({
      ...promocao,
      produto_ids: produtosPorPromocao.get(promocao.id) || [],
    })),
    regras_pagamento: (regras.data || []).filter((regra) => !regra.estoque_item_id),
    categorias: categorias.data || [],
    marcas: marcas.data || [],
  });
}

export async function POST(request: Request) {
  const contexto = await contextoComEmpresa();
  if (!contexto.ok) return contexto.response;
  if (!can(contexto.usuario.permissoes, "estoque.gerenciar") && !can(contexto.usuario.permissoes, "estoque.configurar")) {
    return erro("Sem permissão para gerenciar preços do estoque.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  const acao = texto(body.acao);

  try {
    if (acao === "salvar_produto") {
      const itemId = texto(body.estoque_item_id);
      if (!itemId) return erro("Informe o produto.");
      const precoBase = numeroOuNull(body.preco_base);
      if (precoBase !== null && precoBase < 0) return erro("Preço-base inválido.");
      const canais = body.canais && typeof body.canais === "object" && !Array.isArray(body.canais) ? body.canais : {};
      const pagamentos = body.pagamentos && typeof body.pagamentos === "object" && !Array.isArray(body.pagamentos) ? body.pagamentos : {};
      const { error } = await supabase.rpc("estoque_precos_salvar_produto", {
        p_empresa_id: contexto.empresaId,
        p_estoque_item_id: itemId,
        p_preco_base: precoBase,
        p_canais: canais,
        p_pagamentos: pagamentos,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(error.message);
      return NextResponse.json({ ok: true, message: "Preços do produto atualizados." });
    }

    if (acao === "aplicar_massa") {
      const itemIds = Array.isArray(body.item_ids) ? Array.from(new Set(body.item_ids.map(texto).filter(Boolean))).slice(0, 500) : [];
      if (!itemIds.length) return erro("Selecione ao menos um produto.");
      const alvo = texto(body.alvo);
      const operacao = texto(body.operacao);
      const valor = numeroOuNull(body.valor);
      const { data, error } = await supabase.rpc("estoque_precos_aplicar_massa", {
        p_empresa_id: contexto.empresaId,
        p_item_ids: itemIds,
        p_alvo: alvo,
        p_operacao: operacao,
        p_valor: valor,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(error.message);
      return NextResponse.json({ ok: true, message: `Alteração aplicada em ${Number(data || itemIds.length)} produto(s).` });
    }

    if (acao === "salvar_promocao") {
      const nome = texto(body.nome);
      const produtoIds = Array.isArray(body.produto_ids) ? Array.from(new Set(body.produto_ids.map(texto).filter(Boolean))).slice(0, 1000) : [];
      const canais = Array.isArray(body.canais) ? Array.from(new Set(body.canais.map(texto).filter(Boolean))) : [];
      const valor = numeroOuNull(body.valor);
      const inicioEm = texto(body.inicio_em);
      const fimEm = texto(body.fim_em);
      if (!nome || !produtoIds.length || !canais.length || valor === null || !inicioEm || !fimEm) {
        return erro("Preencha nome, período com horário, canais, valor e produtos da promoção.");
      }
      const { data, error } = await supabase.rpc("estoque_precos_salvar_promocao", {
        p_empresa_id: contexto.empresaId,
        p_id: texto(body.id) || null,
        p_nome: nome,
        p_tipo_ajuste: texto(body.tipo_ajuste),
        p_valor: valor,
        p_inicio_em: inicioEm,
        p_fim_em: fimEm,
        p_canais: canais,
        p_item_ids: produtoIds,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(error.message);
      return NextResponse.json({ ok: true, id: data, message: "Promoção salva com sucesso." });
    }

    if (acao === "arquivar_promocao") {
      const { error } = await supabase.rpc("estoque_precos_arquivar_promocao", {
        p_empresa_id: contexto.empresaId,
        p_id: texto(body.id),
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(error.message);
      return NextResponse.json({ ok: true, message: "Promoção desativada." });
    }

    if (acao === "salvar_regra_pagamento") {
      const forma = texto(body.forma);
      const parcelasMin = Math.max(1, Number(body.parcelas_min || 1));
      const parcelasMax = Math.max(parcelasMin, Number(body.parcelas_max || parcelasMin));
      const valor = numeroOuNull(body.valor) ?? 0;
      const { data, error } = await supabase.rpc("estoque_precos_salvar_regra_pagamento", {
        p_empresa_id: contexto.empresaId,
        p_id: texto(body.id) || null,
        p_canal: texto(body.canal) || null,
        p_forma: forma,
        p_parcelas_min: parcelasMin,
        p_parcelas_max: parcelasMax,
        p_tipo_ajuste: texto(body.tipo_ajuste) || "nenhum",
        p_valor: valor,
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(error.message);
      return NextResponse.json({ ok: true, id: data, message: "Regra de pagamento salva." });
    }

    if (acao === "arquivar_regra_pagamento") {
      const { error } = await supabase.rpc("estoque_precos_arquivar_regra_pagamento", {
        p_empresa_id: contexto.empresaId,
        p_id: texto(body.id),
        p_usuario_id: contexto.usuario.id,
      });
      if (error) return erro(error.message);
      return NextResponse.json({ ok: true, message: "Regra de pagamento desativada." });
    }

    return erro("Ação de preços não reconhecida.");
  } catch (error) {
    return erro(error instanceof Error ? error.message : "Erro ao processar preços.", 500);
  }
}
