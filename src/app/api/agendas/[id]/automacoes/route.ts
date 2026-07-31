/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ALLOWED_TEMPLATE_FORMATS,
  ALLOWED_TEMPLATE_SOURCES,
  asRecord,
  extractTemplateQuickReplyButtons,
  extractTemplateVariablePositions,
  normalizeButtonMappings,
  normalizeText,
  normalizeVariableMappings,
} from "@/lib/agendas/template-mapping";

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

function validateVariableMapping(payload: unknown, configuration: Record<string, unknown>) {
  const expected = extractTemplateVariablePositions(payload);
  const mappings = normalizeVariableMappings(configuration.template_variaveis);
  const received = mappings.map((item) => item.posicao).sort((a, b) => a - b);
  if (expected.join(",") !== received.join(",")) {
    return `Mapeie todas as variáveis do template: ${expected
      .map((item) => `{{${item}}}`)
      .join(", ") || "nenhuma"}.`;
  }
  for (const mapping of mappings) {
    if (!ALLOWED_TEMPLATE_SOURCES.has(mapping.fonte as never)) {
      return `A fonte de {{${mapping.posicao}}} é inválida.`;
    }
    if (!ALLOWED_TEMPLATE_FORMATS.has(mapping.formato as never)) {
      return `O formato de {{${mapping.posicao}}} é inválido.`;
    }
    if (mapping.fonte === "texto_fixo" && !String(mapping.valor_fixo || "").trim()) {
      return `Informe o texto fixo de {{${mapping.posicao}}}.`;
    }
  }
  return "";
}

function validateButtonMapping(payload: unknown, configuration: Record<string, unknown>) {
  const buttons = extractTemplateQuickReplyButtons(payload);
  const mappings = normalizeButtonMappings(configuration.template_botoes);
  const available = new Set(buttons.map((item) => item.indice));
  for (const mapping of mappings) {
    if (!available.has(mapping.indice)) {
      return `O mapeamento do botão ${mapping.indice + 1} não corresponde ao template atual.`;
    }
  }
  const actions = new Set(
    mappings.filter((item) => item.acao !== "ignorar").map((item) => item.acao)
  );
  for (const action of ["confirmar", "cancelar", "reagendar"] as const) {
    if (!actions.has(action)) {
      return `Associe um botão do template à ação “${action}”.`;
    }
    const mapping = mappings.find((item) => item.acao === action);
    if (!mapping?.fluxo_id) {
      return `Selecione o fluxo que será iniciado ao ${action}.`;
    }
  }
  return "";
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
      const configuration = asRecord(item?.configuracao_json);
      return {
        tipo: type,
        canal: channel,
        ativo: item?.ativo === true,
        antecedencia_minutos: boundedInteger(item?.antecedencia_minutos, 0, 525600),
        momento_referencia: type === "pos_atendimento" ? "apos_fim" : "antes_inicio",
        ordem: boundedInteger(item?.ordem, 0, 50),
        integracao_whatsapp_id: uuidOrNull(item?.integracao_whatsapp_id),
        whatsapp_template_id: uuidOrNull(item?.whatsapp_template_id),
        fluxo_id: uuidOrNull(item?.fluxo_id),
        configuracao_json: {
          ...configuration,
          template_variaveis: normalizeVariableMappings(configuration.template_variaveis),
          template_botoes: normalizeButtonMappings(configuration.template_botoes).map(
            (mapping) => ({ ...mapping, fluxo_id: uuidOrNull(mapping.fluxo_id) })
          ),
          etapa: 4,
          execucao_habilitada: true,
        },
      };
    });

    for (const [index, rule] of rules.entries()) {
      if (!rule.ativo) continue;
      if (rule.canal === "whatsapp" && (!rule.integracao_whatsapp_id || !rule.whatsapp_template_id)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Regra ${index + 1}: selecione a integração e o template aprovado.`,
          },
          { status: 400 }
        );
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
      new Set(rules.map((item) => item.integracao_whatsapp_id).filter(Boolean) as string[])
    );
    const templateIds = Array.from(
      new Set(rules.map((item) => item.whatsapp_template_id).filter(Boolean) as string[])
    );
    const mappedFlowIds = rules.flatMap((rule) =>
      normalizeButtonMappings(asRecord(rule.configuracao_json).template_botoes)
        .map((item) => uuidOrNull(item.fluxo_id))
        .filter(Boolean) as string[]
    );
    const flowIds = Array.from(
      new Set([
        ...(rules.map((item) => item.fluxo_id).filter(Boolean) as string[]),
        ...mappedFlowIds,
      ])
    );

    const [integrations, templates, flows] = await Promise.all([
      integrationIds.length
        ? context.supabase
            .from("integracoes_whatsapp")
            .select("id, status, coex_status")
            .eq("empresa_id", context.companyId)
            .in("id", integrationIds)
        : Promise.resolve({ data: [], error: null }),
      templateIds.length
        ? context.supabase
            .from("whatsapp_templates")
            .select("id, integracao_whatsapp_id, categoria, status, payload")
            .eq("empresa_id", context.companyId)
            .in("status", ["approved", "APPROVED", "aprovado"])
            .in("id", templateIds)
        : Promise.resolve({ data: [], error: null }),
      flowIds.length
        ? context.supabase
            .from("automacao_fluxos")
            .select("id, status")
            .eq("empresa_id", context.companyId)
            .in("id", flowIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (integrations.error || templates.error || flows.error) {
      throw new Error("Não foi possível validar as opções selecionadas.");
    }
    const activeIntegrationIds = new Set(
      (integrations.data || [])
        .filter((item: any) => item.status === "ativa" || item.coex_status === "ativo")
        .map((item: any) => String(item.id))
    );
    if (integrationIds.some((item) => !activeIntegrationIds.has(item))) {
      return NextResponse.json(
        { ok: false, error: "Uma integração selecionada não está ativa." },
        { status: 400 }
      );
    }
    if ((templates.data || []).length !== templateIds.length) {
      return NextResponse.json(
        { ok: false, error: "Um template selecionado não está aprovado ou não pertence à empresa." },
        { status: 400 }
      );
    }
    const activeFlowIds = new Set(
      (flows.data || [])
        .filter((item: any) => item.status === "ativo")
        .map((item: any) => String(item.id))
    );
    if (flowIds.some((item) => !activeFlowIds.has(item))) {
      return NextResponse.json(
        { ok: false, error: "Todos os fluxos selecionados precisam estar ativos." },
        { status: 400 }
      );
    }

    const templatesById = new Map<string, any>(
      (templates.data || []).map((item: any) => [String(item.id), item])
    );
    for (const rule of rules) {
      if (!rule.whatsapp_template_id || rule.canal !== "whatsapp") continue;
      const template = templatesById.get(rule.whatsapp_template_id);
      if (
        rule.integracao_whatsapp_id &&
        String(template?.integracao_whatsapp_id || "") !== rule.integracao_whatsapp_id
      ) {
        return NextResponse.json(
          { ok: false, error: "O template selecionado não pertence à integração escolhida." },
          { status: 400 }
        );
      }
      const category = normalizeText(template?.categoria);
      if (!["utility", "marketing"].includes(category)) {
        return NextResponse.json(
          { ok: false, error: "O template precisa estar aprovado como Utility ou Marketing." },
          { status: 400 }
        );
      }
      if (!rule.ativo) continue;
      if (category === "marketing" && rule.configuracao_json.marketing_aceito !== true) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Confirme que o template foi classificado pela Meta como Marketing e seguirá as regras e cobranças dessa categoria.",
          },
          { status: 400 }
        );
      }
      const variableError = validateVariableMapping(template?.payload, rule.configuracao_json);
      if (variableError) {
        return NextResponse.json({ ok: false, error: variableError }, { status: 400 });
      }
      if (rule.tipo === "confirmacao") {
        const buttonError = validateButtonMapping(template?.payload, rule.configuracao_json);
        if (buttonError) {
          return NextResponse.json({ ok: false, error: buttonError }, { status: 400 });
        }
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
        "Configurações salvas, mapeamentos validados e automações replanejadas.",
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
