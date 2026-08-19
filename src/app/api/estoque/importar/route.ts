import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { IMPORTACAO_PRODUTOS_LIMITE_LINHAS } from "@/lib/estoque/importacao-produtos";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

const CAMPOS_PERMITIDOS = [
  "linha", "codigo", "nome", "descricao", "tipo", "unidade", "sku",
  "codigo_barras", "categoria", "marca", "estoque_minimo", "custo_unitario",
  "preco_venda", "controla_lote", "controla_validade", "controla_serie",
  "saldo_inicial", "deposito_id", "localizacao_id", "lote", "fabricado_em",
  "validade", "numero_serie",
] as const;

function erro(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function mensagemBanco(message: string) {
  if (message.includes("estoque_itens_empresa_codigo_uk")) {
    return "Um código da planilha já está vinculado a outro produto ativo.";
  }
  if (message.includes("invalid input syntax")) {
    return "A planilha contém um valor inválido. Gere a pré-visualização novamente.";
  }
  return message;
}

export async function POST(request: Request) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) return erro(contexto.error, contexto.status);
  if (!contexto.usuario.empresa_id) return erro("Usuário sem empresa vinculada.");
  if (!can(contexto.usuario.permissoes, "estoque.gerenciar")) {
    return erro("Sem permissão para importar produtos.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return erro("Corpo da requisição inválido.");
  }

  const linhasOriginais = Array.isArray(body.linhas) ? body.linhas : [];
  if (!linhasOriginais.length) return erro("Nenhum produto foi enviado para importação.");
  if (linhasOriginais.length > IMPORTACAO_PRODUTOS_LIMITE_LINHAS) {
    return erro(`A importação pode ter no máximo ${IMPORTACAO_PRODUTOS_LIMITE_LINHAS} produtos.`);
  }

  const linhas = linhasOriginais.map((entrada) => {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
    const original = entrada as Record<string, unknown>;
    return Object.fromEntries(CAMPOS_PERMITIDOS.map((campo) => [campo, original[campo] ?? null]));
  });
  if (linhas.some((linha) => linha === null)) return erro("Uma linha da importação é inválida.");

  const idempotencyKey = String(body.idempotency_key ?? "").trim();
  if (!idempotencyKey || idempotencyKey.length > 200) return erro("Identificador da importação inválido.");

  const { data, error } = await supabase.rpc("estoque_importar_produtos", {
    p_empresa_id: contexto.usuario.empresa_id,
    p_itens: linhas,
    p_usuario_id: contexto.usuario.id,
    p_atualizar_existentes: body.atualizar_existentes !== false,
    p_arquivo_nome: String(body.arquivo ?? "").trim().slice(0, 255) || null,
    p_idempotency_key: idempotencyKey,
  });

  if (error) return erro(mensagemBanco(error.message));

  const resultado = data as {
    criados?: number;
    atualizados?: number;
    ignorados?: number;
    documento_id?: string | null;
  } | null;
  const criados = Number(resultado?.criados ?? 0);
  const atualizados = Number(resultado?.atualizados ?? 0);
  const ignorados = Number(resultado?.ignorados ?? 0);

  return NextResponse.json({
    ok: true,
    resultado,
    message: `${criados} produto${criados === 1 ? " criado" : "s criados"}, ${atualizados} atualizado${atualizados === 1 ? "" : "s"}${ignorados ? ` e ${ignorados} ignorado${ignorados === 1 ? "" : "s"}` : ""}.`,
  });
}
