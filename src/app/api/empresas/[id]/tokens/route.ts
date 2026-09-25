import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";

const supabaseAdmin = getSupabaseAdmin();

type AcaoTokens = "restaurar_mensal" | "adicionar_avulso";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (
    !can(usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS) ||
    !can(usuario.permissoes, "empresas.editar")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para ajustar tokens da empresa." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const acao = String(body?.acao || "") as AcaoTokens;
  const motivo = String(body?.motivo || "").trim().slice(0, 500) || null;

  if (!["restaurar_mensal", "adicionar_avulso"].includes(acao)) {
    return NextResponse.json(
      { ok: false, error: "Ação de tokens inválida." },
      { status: 400 }
    );
  }

  let quantidade: number | null = null;

  if (acao === "adicionar_avulso") {
    quantidade = Number(body?.quantidade);

    if (
      !Number.isSafeInteger(Number(quantidade)) ||
      quantidade <= 0 ||
      quantidade > 1_000_000_000
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Informe uma quantidade inteira entre 1 e 1 bilhão de tokens.",
        },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin.rpc(
    "ajustar_tokens_empresa_admin",
    {
      p_empresa_id: id,
      p_acao: acao,
      p_quantidade: quantidade,
      p_operador_id: usuario.id,
      p_motivo: motivo,
    }
  );

  if (error) {
    const mensagem =
      error.message.includes("assinatura ativa")
        ? "A franquia mensal só pode ser restaurada enquanto a assinatura estiver ativa."
        : error.message;

    return NextResponse.json(
      { ok: false, error: mensagem },
      { status: 400 }
    );
  }

  const resposta = (data || {}) as {
    aplicado?: boolean;
    motivo?: string;
    quantidade_aplicada?: number;
    referencia?: string;
    saldo?: Record<string, unknown>;
  };

  if (
    acao === "restaurar_mensal" &&
    resposta.aplicado === false &&
    resposta.motivo === "saldo_mensal_ja_completo"
  ) {
    return NextResponse.json({
      ok: true,
      aplicado: false,
      message: "O saldo mensal da empresa já está completo.",
      saldo: resposta.saldo || null,
    });
  }

  const quantidadeAplicada = Number(resposta.quantidade_aplicada || 0);
  const quantidadeFormatada = new Intl.NumberFormat("pt-BR").format(
    quantidadeAplicada
  );

  return NextResponse.json({
    ok: true,
    aplicado: true,
    message:
      acao === "restaurar_mensal"
        ? `Franquia mensal restaurada. ${quantidadeFormatada} tokens foram recompostos.`
        : `${quantidadeFormatada} tokens extras adicionados ao saldo avulso.`,
    saldo: resposta.saldo || null,
    referencia: resposta.referencia || null,
  });
}
