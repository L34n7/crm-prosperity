import { NextRequest, NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const LIMITE_PALAVRAS_POR_LOTE = 30;
const LIMITE_CARACTERES_PALAVRA = 160;

type RouteParams = {
  params: Promise<{ id: string }>;
};

function mensagemErro(error: unknown) {
  return error instanceof Error ? error.message : "Erro interno.";
}

function normalizarPalavras(body: Record<string, unknown>) {
  const origem = Array.isArray(body.valores)
    ? body.valores
    : [String(body.valor || "")];

  const palavras = origem
    .flatMap((item) => String(item || "").split(/[,;\n]+/))
    .map((item) => item.trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean)
    .map((item) => item.slice(0, LIMITE_CARACTERES_PALAVRA));

  return Array.from(new Set(palavras)).slice(0, LIMITE_PALAVRAS_POR_LOTE);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: fluxoId } = await params;
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
      "fluxos.gerenciar_gatilhos",
      "Você não tem permissão para gerenciar gatilhos de fluxos.",
    );
    if (bloqueio) return bloqueio;
    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const condicao = String(body.condicao || "contem").trim();
    const condicoesPermitidas = ["contem", "exata", "inicia_com"];

    if (!condicoesPermitidas.includes(condicao)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Para cadastrar várias palavras-chave, use as condições Contém, Igual exatamente ou Começa com.",
        },
        { status: 400 }
      );
    }

    const palavras = normalizarPalavras(body);
    if (palavras.length < 2) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Informe pelo menos duas palavras-chave separadas por vírgula ou ponto e vírgula.",
        },
        { status: 400 }
      );
    }

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id, nome")
      .eq("id", fluxoId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const { data: existentes, error: existentesError } = await supabaseAdmin
      .from("automacao_gatilhos")
      .select("valor, fluxo_id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("tipo_gatilho", "palavra_chave")
      .in("valor", palavras);

    if (existentesError) {
      throw new Error(
        `Erro ao validar palavras-chave: ${existentesError.message}`
      );
    }

    if ((existentes || []).length > 0) {
      const conflitos = Array.from(
        new Set((existentes || []).map((item) => String(item.valor || "")))
      );

      return NextResponse.json(
        {
          ok: false,
          code: "PALAVRAS_CHAVE_DUPLICADAS",
          error: `Estas palavras-chave já estão cadastradas: ${conflitos.join(", ")}. Remova-as do lote e tente novamente.`,
          conflitos,
        },
        { status: 409 }
      );
    }

    const registros = palavras.map((valor) => ({
      empresa_id: usuario.empresa_id,
      fluxo_id: fluxoId,
      tipo_gatilho: "palavra_chave",
      valor,
      condicao,
      ativo: true,
    }));

    const { data, error } = await supabaseAdmin
      .from("automacao_gatilhos")
      .insert(registros)
      .select("*");

    if (error?.code === "23505") {
      return NextResponse.json(
        {
          ok: false,
          code: "PALAVRA_CHAVE_DUPLICADA",
          error:
            "Uma das palavras-chave foi cadastrada em outro fluxo durante esta operação. Nenhuma palavra deste lote foi criada.",
        },
        { status: 409 }
      );
    }

    if (error) {
      throw new Error(`Erro ao criar palavras-chave: ${error.message}`);
    }

    const auditMeta = getRequestAuditMetadata(req);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: fluxoId,
      acao: "fluxo_gatilhos_criados_em_lote",
      descricao: `${palavras.length} palavras-chave criadas: ${palavras.join(", ")}`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: data || [],
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      gatilho: data?.[0] || null,
      gatilhos: data || [],
      total: data?.length || 0,
      mensagem: `${data?.length || 0} palavras-chave cadastradas com sucesso.`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: mensagemErro(error) },
      { status: 500 }
    );
  }
}
