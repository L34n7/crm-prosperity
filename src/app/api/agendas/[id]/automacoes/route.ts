/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TYPES = new Set([
  "confirmacao",
  "lembrete",
  "aviso_responsavel",
  "pos_atendimento",
]);
const CHANNELS = new Set(["whatsapp", "email", "sistema", "fluxo"]);

type NormalizedRule = {
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

function boundedInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function uuidOrNull(value: unknown) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text
  )
    ? text
    : null;
}

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function templateButtons(payload: unknown) {
  const components = Array.isArray((payload as any)?.components)
    ? (payload as any).components
    : [];
  const component = components.find(
    (item: any) => String(item?.type || "").toUpperCase() === "BUTTONS"
  );
  return Array.isArray(component?.buttons)
    ? component.buttons
        .filter(
          (item: any) => String(item?.type || "").toUpperCase() === "QUICK_REPLY"
        )
        .map((item: any) => normalize(item?.text))
        .filter(Boolean)
    : [];
}

function confirmationTemplateCompatible(payload: unknown) {
  const buttons = templateButtons(payload);
  return ["confirm", "cancel", "reagend"].every((action) =>
    buttons.some((button: string) => button.includes(action))
  );
}

async function agendaContext(id: string) {
  const result = await getUsuarioContexto();
  if (!result.ok) return result;
  if (!result.usuario.empresa_id) {
    return {
      ok: false as const,
      error: "Usuario sem empresa vinculada.",
      status: 400,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: agenda, error } = await supabase
    .from("agenda_calendarios")
    .select("id")
    .eq("empresa_id", result.usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (error || !agenda) {
    return { ok: false as const, error: "Agenda nao encontrada.", status: 404 };
  }

  return {
    ok: true as const,
    companyId: result.usuario.empresa_id,
    supabase,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const context = await agendaContext(id);
    if (!context.ok) {
      return NextResponse.json(
        { ok: false, error: context.error },
        { status: context.status }
      );
    }

    const { data, error } = await context.supabase
      .from("agenda_automacao_regras")
      .select("*")
      .eq("empresa_id", context.companyId)
      .eq("agenda_id", id)
      .order("tipo", { ascending: true })
      .order("ordem", { ascending: true })
      .order("canal", { ascending: true });

    if (error) {
      throw new Error(`Erro ao buscar configurações: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      regras: data || [],
      execucao_automatica_ativa: true,
    });
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
    const context = await agendaContext(id);
    if (!context.ok) {
      return NextResponse.json(
        { ok: false, error: context.error },
        { status: context.status }
      );
    }

    const body = await request.json();
    const input: any[] = Array.isArray(body?.regras) ? body.regras : [];
    if (input.length > 30) {
      return NextResponse.json(
        { ok: false, error: "Uma agenda pode possuir no máximo 30 regras." },
        { status: 400 }
      );
    }

    const rules: NormalizedRule[] = input.map((item: any, index: number) => {
      const type = String(item?.tipo || "").trim();
      const channel = String(item?.canal || "").trim();
      if (!TYPES.has(type) || !CHANNELS.has(channel)) {
        throw new Error(`Regra ${index + 1} possui tipo ou canal inválido.`);
      }

      const configuration =
        item?.configuracao_json &&
        typeof item.configuracao_json === "object" &&
        !Array.isArray(item.configuracao_json)
          ? item.configuracao_json
          : {};

      return {
        tipo: type,
        canal: channel,
        ativo: item?.ativo === true,
        antecedencia_minutos: boundedInteger(
          item?.antecedencia_minutos,
          0,
          525600
        ),
        momento_referencia:
          type === "pos_atendimento" ? "apos_fim" : "antes_inicio",
        ordem: boundedInteger(item?.ordem, 0, 50),
        integracao_whatsapp_id: uuidOrNull(item?.integracao_whatsapp_id),
        whatsapp_template_id: uuidOrNull(item?.whatsapp_template_id),
        fluxo_id: uuidOrNull(item?.fluxo_id),
        configuracao_json: {
          ...configuration,
          etapa: 3,
          execucao_habilitada: true,
        },
      };
    });

    for (const [index, rule] of rules.entries()) {
      if (!rule.ativo) continue;
      if (rule.canal === "whatsapp") {
        if (!rule.integracao_whatsapp_id || !rule.whatsapp_template_id) {
          return NextResponse.json(
            {
              ok: false,
              error: `Regra ${index + 1}: selecione a integração e o template Utility.`,
            },
            { status: 400 }
          );
        }
      }
      if (rule.canal === "fluxo" && !rule.fluxo_id) {
        return NextResponse.json(
          {
            ok: false,
            error: `Regra ${index + 1}: selecione o fluxo de pós-atendimento.`,
          },
          { status: 400 }
        );
      }
    }

    const integrationIds = Array.from(
      new Set(
        rules
          .map((item) => item.integracao_whatsapp_id)
          .filter((item): item is string => Boolean(item))
      )
    );
    const templateIds = Array.from(
      new Set(
        rules
          .map((item) => item.whatsapp_template_id)
          .filter((item): item is string => Boolean(item))
      )
    );
    const flowIds = Array.from(
      new Set(
        rules
          .map((item) => item.fluxo_id)
          .filter((item): item is string => Boolean(item))
      )
    );

    const [integrations, templates, flows] = await Promise.all([
      integrationIds.length
        ? context.supabase
            .from("integracoes_whatsapp")
            .select("id")
            .eq("empresa_id", context.companyId)
            .eq("status", "ativa")
            .in("id", integrationIds)
        : Promise.resolve({ data: [], error: null }),
      templateIds.length
        ? context.supabase
            .from("whatsapp_templates")
            .select("id, integracao_whatsapp_id, categoria, status, payload")
            .eq("empresa_id", context.companyId)
            .ilike("categoria", "utility")
            .ilike("status", "approved")
            .in("id", templateIds)
        : Promise.resolve({ data: [], error: null }),
      flowIds.length
        ? context.supabase
            .from("automacao_fluxos")
            .select("id")
            .eq("empresa_id", context.companyId)
            .eq("status", "ativo")
            .in("id", flowIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (integrations.error || templates.error || flows.error) {
      throw new Error("Não foi possível validar as opções selecionadas.");
    }
    if ((integrations.data || []).length !== integrationIds.length) {
      return NextResponse.json(
        { ok: false, error: "Uma integração selecionada não está ativa." },
        { status: 400 }
      );
    }
    if ((templates.data || []).length !== templateIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "Um template selecionado não é Utility aprovado ou não pertence à empresa.",
        },
        { status: 400 }
      );
    }
    if ((flows.data || []).length !== flowIds.length) {
      return NextResponse.json(
        { ok: false, error: "Um fluxo selecionado não está ativo." },
        { status: 400 }
      );
    }

    const templatesById = new Map<string, any>(
      (templates.data || []).map((item: any) => [String(item.id), item])
    );
    for (const rule of rules) {
      if (!rule.whatsapp_template_id) continue;
      const template = templatesById.get(rule.whatsapp_template_id);
      if (
        rule.integracao_whatsapp_id &&
        String(template?.integracao_whatsapp_id || "") !==
          rule.integracao_whatsapp_id
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "O template selecionado não pertence à integração escolhida.",
          },
          { status: 400 }
        );
      }
      if (
        rule.ativo &&
        rule.tipo === "confirmacao" &&
        rule.canal === "whatsapp" &&
        !confirmationTemplateCompatible(template?.payload)
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "O template de confirmação precisa ter botões rápidos para Confirmar, Cancelar e Reagendar.",
          },
          { status: 400 }
        );
      }
    }

    const { data, error } = await context.supabase.rpc(
      "agenda_automacao_regras_substituir",
      {
        p_empresa_id: context.companyId,
        p_agenda_id: id,
        p_regras: rules,
      }
    );
    if (error) {
      throw new Error(`Erro ao salvar configurações: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      regras: data || [],
      execucao_automatica_ativa: true,
      mensagem:
        "Configurações salvas e automações replanejadas. As regras ativas serão executadas automaticamente.",
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
