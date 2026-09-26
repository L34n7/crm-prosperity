import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const OPERACOES = new Set([
  "listar",
  "buscar_contatos",
  "salvar_tipo",
  "salvar_agendamento",
]);

function permissaoDaOperacao(operacao: string) {
  if (operacao === "listar" || operacao === "buscar_contatos") {
    return "agendas.visualizar";
  }

  if (operacao === "salvar_agendamento" || operacao === "salvar_tipo") {
    return "agendas.editar";
  }

  return "agendas.visualizar";
}

export async function POST(request: NextRequest) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status },
      );
    }

    const { usuario } = resultado;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const operacao = String(body?.operacao || "").trim().toLowerCase();

    if (!OPERACOES.has(operacao)) {
      return NextResponse.json(
        { ok: false, error: "Operacao de agenda invalida." },
        { status: 400 },
      );
    }

    const bloqueio = bloquearSemPermissao(
      usuario,
      permissaoDaOperacao(operacao),
    );
    if (bloqueio) return bloqueio;

    const argumentos =
      body?.argumentos &&
      typeof body.argumentos === "object" &&
      !Array.isArray(body.argumentos)
        ? body.argumentos
        : {};

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc(
      "agenda_executar_rpc_contextual",
      {
        p_usuario_id: usuario.id,
        p_empresa_id: usuario.empresa_id,
        p_operacao: operacao,
        p_argumentos: argumentos,
      },
    );

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message || "Erro ao executar operacao da agenda.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data,
        acesso_temporario: Boolean(usuario.acesso_temporario?.ativo),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao executar operacao da agenda.",
      },
      { status: 500 },
    );
  }
}
