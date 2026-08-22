import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizarTermoConsultaEstoque } from "@/lib/estoque/consultar-estoque-produto";

const supabaseAdmin = getSupabaseAdmin();

export async function GET(request: NextRequest) {
  const contexto = await getUsuarioContexto();

  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status }
    );
  }

  const { usuario } = contexto;
  const bloqueio = bloquearSemPermissao(
    usuario,
    "fluxos.editar",
    "Você não tem permissão para configurar fluxos."
  );
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const q = String(request.nextUrl.searchParams.get("q") || "").trim();
  const produtoId = String(
    request.nextUrl.searchParams.get("produto_id") || ""
  ).trim();
  const termo = normalizarTermoConsultaEstoque(q);

  const depositosPromise = supabaseAdmin
    .from("estoque_depositos")
    .select("id,codigo,nome,principal")
    .eq("empresa_id", usuario.empresa_id)
    .eq("ativo", true)
    .order("principal", { ascending: false })
    .order("nome", { ascending: true });

  const produtosPromise = termo
    ? supabaseAdmin.rpc("estoque_buscar_produtos_automacao", {
        p_empresa_id: usuario.empresa_id,
        p_termo: termo,
        p_modo: "automatico",
        p_limite: 10,
      })
    : supabaseAdmin
        .from("estoque_itens")
        .select("id,codigo,sku,codigo_barras,nome,unidade,preco_venda")
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true)
        .order("nome", { ascending: true })
        .limit(20);

  const produtoSelecionadoPromise = produtoId
    ? supabaseAdmin
        .from("estoque_itens")
        .select("id,codigo,sku,codigo_barras,nome,unidade,preco_venda")
        .eq("empresa_id", usuario.empresa_id)
        .eq("id", produtoId)
        .eq("ativo", true)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [depositosResultado, produtosResultado, produtoSelecionadoResultado] =
    await Promise.all([
      depositosPromise,
      produtosPromise,
      produtoSelecionadoPromise,
    ]);

  if (depositosResultado.error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Erro ao carregar depósitos: ${depositosResultado.error.message}`,
      },
      { status: 500 }
    );
  }

  if (produtosResultado.error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Erro ao carregar produtos: ${produtosResultado.error.message}`,
      },
      { status: 500 }
    );
  }

  if (produtoSelecionadoResultado.error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Erro ao carregar produto selecionado: ${produtoSelecionadoResultado.error.message}`,
      },
      { status: 500 }
    );
  }

  const produtosBase = Array.isArray(produtosResultado.data)
    ? [...produtosResultado.data]
    : [];
  const produtoSelecionado = produtoSelecionadoResultado.data as
    | Record<string, unknown>
    | null;

  if (
    produtoSelecionado &&
    !produtosBase.some(
      (produto: any) => String(produto.id) === String(produtoSelecionado.id)
    )
  ) {
    produtosBase.unshift(produtoSelecionado as any);
  }

  const produtos = produtosBase.map((produto: any) => ({
    id: String(produto.id),
    codigo: String(produto.codigo || ""),
    sku: String(produto.sku || ""),
    codigo_barras: String(produto.codigo_barras || ""),
    nome: String(produto.nome || ""),
    unidade: String(produto.unidade || "un"),
    preco_venda:
      produto.preco_venda === null || produto.preco_venda === undefined
        ? null
        : Number(produto.preco_venda),
  }));

  return NextResponse.json({
    ok: true,
    produtos,
    depositos: depositosResultado.data || [],
  });
}
