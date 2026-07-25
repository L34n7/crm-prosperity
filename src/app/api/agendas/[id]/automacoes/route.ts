/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TIPOS = new Set([
  "confirmacao",
  "lembrete",
  "aviso_responsavel",
  "pos_atendimento",
]);
const CANAIS = new Set(["whatsapp", "email", "sistema", "fluxo"]);

type RegraNormalizada = {
  tipo: string;
  canal: string;
  ativo: boolean;
  antecedencia_minutos: number;
  momento_referencia: string;
  ordem: number;
  integracao_whatsapp_id: string | null;
  whatsapp_template_id: string | null;
  fluxo_id: string | null;
  configuracao_json: Record<string, unknown>;
};

function inteiroLimitado(valor: unknown, minimo: number, maximo: number) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return minimo;
  return Math.max(minimo, Math.min(maximo, Math.round(numero)));
}

function uuidOuNulo(valor: unknown) {
  const texto = String(valor || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(texto)
    ? texto
    : null;
}

async function contextoAgenda(id: string) {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return resultado;
  if (!resultado.usuario.empresa_id) {
    return { ok: false as const, error: "Usuario sem empresa vinculada.", status: 400 };
  }

  const supabase = getSupabaseAdmin();
  const { data: agenda, error } = await supabase
    .from("agenda_calendarios")
    .select("id")
    .eq("empresa_id", resultado.usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (error || !agenda) {
    return { ok: false as const, error: "Agenda nao encontrada.", status: 404 };
  }

  return {
    ok: true as const,
    empresaId: resultado.usuario.empresa_id,
    supabase,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contexto = await contextoAgenda(id);
    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const { data, error } = await contexto.supabase
      .from("agenda_automacao_regras")
      .select("*")
      .eq("empresa_id", contexto.empresaId)
      .eq("agenda_id", id)
      .order("tipo", { ascending: true })
      .order("ordem", { ascending: true })
      .order("canal", { ascending: true });

    if (error) {
      throw new Error(`Erro ao buscar configurações: ${error.message}`);
    }

    return NextResponse.json({ ok: true, regras: data || [] });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao consultar automações da agenda.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contexto = await contextoAgenda(id);
    if (!contexto.ok) {
      return NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      );
    }

    const body = await request.json();
    const entrada: any[] = Array.isArray(body?.regras) ? body.regras : [];
    if (entrada.length > 30) {
      return NextResponse.json(
        { ok: false, error: "Uma agenda pode possuir no máximo 30 regras." },
        { status: 400 }
      );
    }

    const regras: RegraNormalizada[] = entrada.map((item: any, indice: number) => {
      const tipo = String(item?.tipo || "").trim();
      const canal = String(item?.canal || "").trim();
      if (!TIPOS.has(tipo) || !CANAIS.has(canal)) {
        throw new Error(`Regra ${indice + 1} possui tipo ou canal inválido.`);
      }

      return {
        tipo,
        canal,
        ativo: item?.ativo === true,
        antecedencia_minutos: inteiroLimitado(
          item?.antecedencia_minutos,
          0,
          525600
        ),
        momento_referencia:
          tipo === "pos_atendimento" ? "apos_fim" : "antes_inicio",
        ordem: inteiroLimitado(item?.ordem, 0, 50),
        integracao_whatsapp_id: uuidOuNulo(item?.integracao_whatsapp_id),
        whatsapp_template_id: uuidOuNulo(item?.whatsapp_template_id),
        fluxo_id: uuidOuNulo(item?.fluxo_id),
        configuracao_json:
          item?.configuracao_json && typeof item.configuracao_json === "object"
            ? item.configuracao_json
            : {},
      };
    });

    const integracaoIds = Array.from(
      new Set(regras.map((item) => item.integracao_whatsapp_id).filter(Boolean))
    ) as string[];
    const templateIds = Array.from(
      new Set(regras.map((item) => item.whatsapp_template_id).filter(Boolean))
    ) as string[];
    const fluxoIds = Array.from(
      new Set(regras.map((item) => item.fluxo_id).filter(Boolean))
    ) as string[];

    const [integracoes, templates, fluxos] = await Promise.all([
      integracaoIds.length
        ? contexto.supabase
            .from("integracoes_whatsapp")
            .select("id")
            .eq("empresa_id", contexto.empresaId)
            .in("id", integracaoIds)
        : Promise.resolve({ data: [], error: null }),
      templateIds.length
        ? contexto.supabase
            .from("whatsapp_templates")
            .select("id, integracao_whatsapp_id")
            .eq("empresa_id", contexto.empresaId)
            .in("id", templateIds)
        : Promise.resolve({ data: [], error: null }),
      fluxoIds.length
        ? contexto.supabase
            .from("automacao_fluxos")
            .select("id")
            .eq("empresa_id", contexto.empresaId)
            .neq("status", "arquivado")
            .in("id", fluxoIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (integracoes.error || templates.error || fluxos.error) {
      throw new Error("Não foi possível validar as opções selecionadas.");
    }
    if ((integracoes.data || []).length !== integracaoIds.length) {
      return NextResponse.json(
        { ok: false, error: "Uma integração selecionada não pertence à empresa." },
        { status: 400 }
      );
    }
    if ((templates.data || []).length !== templateIds.length) {
      return NextResponse.json(
        { ok: false, error: "Um template selecionado não pertence à empresa." },
        { status: 400 }
      );
    }
    if ((fluxos.data || []).length !== fluxoIds.length) {
      return NextResponse.json(
        { ok: false, error: "Um fluxo selecionado não está disponível." },
        { status: 400 }
      );
    }

    const templatePorId = new Map<string, string>(
      (templates.data || []).map((item: any) => [
        String(item.id),
        String(item.integracao_whatsapp_id),
      ])
    );
    for (const regra of regras) {
      if (
        regra.whatsapp_template_id &&
        regra.integracao_whatsapp_id &&
        templatePorId.get(regra.whatsapp_template_id) !== regra.integracao_whatsapp_id
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "O template selecionado não pertence à integração escolhida.",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await contexto.supabase.rpc(
      "agenda_automacao_regras_substituir",
      {
        p_empresa_id: contexto.empresaId,
        p_agenda_id: id,
        p_regras: regras,
      }
    );

    if (error) {
      throw new Error(`Erro ao salvar configurações: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      regras: data || [],
      execucao_automatica_ativa: false,
      mensagem:
        "Configurações salvas. Nenhum disparo será executado até as próximas etapas.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao salvar automações da agenda.",
      },
      { status: 500 }
    );
  }
}
