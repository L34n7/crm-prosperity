import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  bloquearSemPermissao,
  usuarioTemPermissao,
} from "@/lib/permissoes/servidor";

const supabase = getSupabaseAdmin();

async function contexto() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return resultado;
  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Usuário sem empresa vinculada.",
    };
  }
  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

function erro(error: unknown, status = 500) {
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Erro interno.",
    },
    { status },
  );
}

function agruparPorAutomacao<T extends { automacao_id: string }>(itens: T[]) {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const atuais = mapa.get(item.automacao_id) || [];
    atuais.push(item);
    mapa.set(item.automacao_id, atuais);
  }
  return mapa;
}

export async function GET() {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }

  const bloqueio = bloquearSemPermissao(
    ctx.usuario,
    "automacoes_api.visualizar",
    "Sem permissão para visualizar automações.",
  );
  if (bloqueio) return bloqueio;

  const { data: rotinas, error: rotinasError } = await supabase
    .from("rotina_automacoes")
    .select(
      "id,nome,descricao,categoria,status,origem_tipo,origem_id,configuracao_json,created_at,updated_at",
    )
    .eq("empresa_id", ctx.empresaId)
    .neq("status", "arquivada")
    .order("updated_at", { ascending: false });

  if (rotinasError) return erro(new Error(rotinasError.message));

  const ids = (rotinas || []).map((item) => item.id);
  const vazio = Promise.resolve({ data: [], error: null });

  const [gatilhosResult, condicoesResult, acoesResult, execucoesResult, opcoes] =
    await Promise.all([
      ids.length
        ? supabase
            .from("rotina_automacao_gatilhos")
            .select(
              "id,automacao_id,tipo,evento,entidade_tipo,offset_minutos,offset_referencia,configuracao_json,ativo",
            )
            .eq("empresa_id", ctx.empresaId)
            .in("automacao_id", ids)
            .order("created_at")
        : vazio,
      ids.length
        ? supabase
            .from("rotina_automacao_condicoes")
            .select(
              "id,automacao_id,grupo,ordem,conjuncao,campo,operador,valor_json,configuracao_json",
            )
            .eq("empresa_id", ctx.empresaId)
            .in("automacao_id", ids)
            .order("ordem")
        : vazio,
      ids.length
        ? supabase
            .from("rotina_automacao_acoes")
            .select(
              "id,automacao_id,ordem,tipo_acao,configuracao_json,ativo",
            )
            .eq("empresa_id", ctx.empresaId)
            .in("automacao_id", ids)
            .order("ordem")
        : vazio,
      supabase
        .from("rotina_automacao_execucoes")
        .select("automacao_id,status,iniciada_em")
        .eq("empresa_id", ctx.empresaId)
        .gte(
          "iniciada_em",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        ),
      Promise.all([
        supabase
          .from("agenda_calendarios")
          .select("id,nome,status")
          .eq("empresa_id", ctx.empresaId)
          .eq("status", "ativo")
          .order("nome"),
        supabase
          .from("automacao_fluxos")
          .select("id,nome,status")
          .eq("empresa_id", ctx.empresaId)
          .neq("status", "arquivado")
          .order("nome"),
        supabase
          .from("whatsapp_templates")
          .select("id,nome,status,integracao_whatsapp_id")
          .eq("empresa_id", ctx.empresaId)
          .eq("status", "APPROVED")
          .order("nome"),
        supabase
          .from("integracoes_whatsapp")
          .select("id,nome_conexao,numero,status")
          .eq("empresa_id", ctx.empresaId)
          .order("posicao"),
        supabase
          .from("etiquetas")
          .select("id,nome,ativo")
          .eq("empresa_id", ctx.empresaId)
          .eq("ativo", true)
          .order("ordem"),
        supabase
          .from("setores")
          .select("id,nome,ativo,status")
          .eq("empresa_id", ctx.empresaId)
          .eq("ativo", true)
          .is("archived_at", null)
          .order("ordem_exibicao"),
        supabase
          .from("integracoes_api_externas")
          .select("id,nome,status")
          .eq("empresa_id", ctx.empresaId)
          .neq("status", "inativa")
          .order("nome"),
      ]),
    ]);

  const primeiroErro =
    gatilhosResult.error ||
    condicoesResult.error ||
    acoesResult.error ||
    execucoesResult.error ||
    opcoes.find((resultado) => resultado.error)?.error;
  if (primeiroErro) return erro(new Error(primeiroErro.message));

  const gatilhos = agruparPorAutomacao(gatilhosResult.data || []);
  const condicoes = agruparPorAutomacao(condicoesResult.data || []);
  const acoes = agruparPorAutomacao(acoesResult.data || []);
  const execucoes = execucoesResult.data || [];

  const rotinasCompletas = (rotinas || []).map((rotina) => {
    const execucoesRotina = execucoes.filter(
      (item) => item.automacao_id === rotina.id,
    );
    return {
      ...rotina,
      gatilhos: gatilhos.get(rotina.id) || [],
      condicoes: condicoes.get(rotina.id) || [],
      acoes: acoes.get(rotina.id) || [],
      metricas: {
        execucoes_30_dias: execucoesRotina.length,
        concluidas_30_dias: execucoesRotina.filter(
          (item) => item.status === "concluida",
        ).length,
        erros_30_dias: execucoesRotina.filter((item) => item.status === "erro")
          .length,
      },
    };
  });

  const concluidas = execucoes.filter((item) =>
    ["concluida", "erro", "ignorada", "cancelada"].includes(item.status),
  );
  const sucessos = concluidas.filter((item) => item.status === "concluida").length;

  return NextResponse.json({
    ok: true,
    pode_gerenciar: usuarioTemPermissao(
      ctx.usuario,
      "automacoes_api.gerenciar",
    ),
    rotinas: rotinasCompletas,
    metricas: {
      total_rotinas: rotinasCompletas.length,
      rotinas_ativas: rotinasCompletas.filter((item) => item.status === "ativa")
        .length,
      com_erro: rotinasCompletas.filter(
        (item) => item.status === "erro" || item.metricas.erros_30_dias > 0,
      ).length,
      execucoes_30_dias: execucoes.length,
      taxa_execucao: concluidas.length
        ? Number(((sucessos / concluidas.length) * 100).toFixed(1))
        : null,
    },
    opcoes: {
      calendarios: opcoes[0].data || [],
      fluxos: opcoes[1].data || [],
      templates: opcoes[2].data || [],
      integracoes_whatsapp: opcoes[3].data || [],
      etiquetas: opcoes[4].data || [],
      setores: opcoes[5].data || [],
      integracoes_api: opcoes[6].data || [],
    },
  });
}

export async function POST(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }
  const bloqueio = bloquearSemPermissao(
    ctx.usuario,
    "automacoes_api.gerenciar",
    "Sem permissão para gerenciar automações.",
  );
  if (bloqueio) return bloqueio;

  try {
    const body = await request.json();
    const payload = body?.rotina;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "Configuração da automação inválida." },
        { status: 400 },
      );
    }

    const { data, error: rpcError } = await supabase.rpc(
      "rotina_automacao_salvar",
      {
        p_empresa_id: ctx.empresaId,
        p_usuario_id: ctx.usuario.id,
        p_rotina_id: body?.id || null,
        p_payload: payload,
      },
    );
    if (rpcError) return erro(new Error(rpcError.message), 400);

    return NextResponse.json({ ok: true, id: data });
  } catch (error) {
    return erro(error, 400);
  }
}

export async function PATCH(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }
  const bloqueio = bloquearSemPermissao(
    ctx.usuario,
    "automacoes_api.gerenciar",
    "Sem permissão para gerenciar automações.",
  );
  if (bloqueio) return bloqueio;

  const body = await request.json();
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!id || !["ativa", "pausada"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Automação ou status inválido." },
      { status: 400 },
    );
  }

  const { data, error: rpcError } = await supabase.rpc(
    "rotina_automacao_alterar_estado",
    {
      p_empresa_id: ctx.empresaId,
      p_usuario_id: ctx.usuario.id,
      p_automacao_id: id,
      p_status: status,
      p_cancelar_pendentes: false,
      p_origem_cancelamento: "api_rotinas_automacao",
    },
  );
  if (rpcError) return erro(new Error(rpcError.message), 400);

  return NextResponse.json({ ok: true, resultado: data });
}

export async function DELETE(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) {
    return NextResponse.json(
      { ok: false, error: ctx.error },
      { status: ctx.status },
    );
  }
  const bloqueio = bloquearSemPermissao(
    ctx.usuario,
    "automacoes_api.gerenciar",
    "Sem permissão para arquivar automações.",
  );
  if (bloqueio) return bloqueio;

  const body = await request.json();
  const id = String(body?.id || "");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Identificador inválido." },
      { status: 400 },
    );
  }

  const { data, error: rpcError } = await supabase.rpc(
    "rotina_automacao_alterar_estado",
    {
      p_empresa_id: ctx.empresaId,
      p_usuario_id: ctx.usuario.id,
      p_automacao_id: id,
      p_status: "arquivada",
      p_cancelar_pendentes: true,
      p_origem_cancelamento: "api_rotinas_automacao",
    },
  );
  if (rpcError) return erro(new Error(rpcError.message), 400);

  return NextResponse.json({ ok: true, resultado: data });
}
