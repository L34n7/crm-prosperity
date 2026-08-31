import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const MODELO_PADRAO = "gpt-5.4-mini";
const LIMITE_CARACTERISTICAS = 5;

const FERRAMENTAS_VALIDAS = new Set([
  "consultar_conhecimento",
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
  "consultar_contato",
  "transferir_humano",
]);
const FERRAMENTAS_AGENDA = new Set([
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
]);

type FerramentaBody = {
  tipo: string;
  ativo: boolean;
  config_json: Record<string, unknown>;
};

function idsString(valor: unknown) {
  if (!Array.isArray(valor)) return [] as string[];
  return Array.from(new Set(valor.map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizarCaracteristicas(valor: unknown) {
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const bruto of String(valor || "").split(",")) {
    const item = bruto.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!item) continue;
    const chave = item.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(item);
    if (itens.length >= LIMITE_CARACTERISTICAS) break;
  }
  return itens.length ? itens.join(", ") : null;
}

function ferramentasBody(valor: unknown): FerramentaBody[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => {
      if (typeof item === "string") {
        return { tipo: item, ativo: true, config_json: {} as Record<string, unknown> };
      }
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      return {
        tipo: String(obj.tipo || "").trim(),
        ativo: obj.ativo !== false,
        config_json:
          obj.config_json && typeof obj.config_json === "object" && !Array.isArray(obj.config_json)
            ? (obj.config_json as Record<string, unknown>)
            : {},
      };
    })
    .filter((item): item is FerramentaBody => !!item && FERRAMENTAS_VALIDAS.has(item.tipo));
}

function escoposConflitam(a: string[], b: string[]) {
  if (!a.length || !b.length) return true;
  const conjunto = new Set(b);
  return a.some((id) => conjunto.has(id));
}

function agendaConfiguradaNasFerramentas(ferramentas: FerramentaBody[]) {
  const ferramentasAgendaAtivas = ferramentas.filter(
    (item) => item.ativo && FERRAMENTAS_AGENDA.has(item.tipo)
  );
  if (!ferramentasAgendaAtivas.length) {
    return { usaAgenda: false, agendaId: null as string | null };
  }

  const ids = ferramentasAgendaAtivas.map((item) =>
    String(item.config_json?.agenda_id || "").trim()
  );
  if (ids.some((id) => !id)) {
    return { usaAgenda: true, agendaId: null as string | null };
  }

  const unicos = Array.from(new Set(ids));
  return {
    usaAgenda: true,
    agendaId: unicos.length === 1 ? unicos[0] : null,
  };
}

function normalizarAgendaNasFerramentas(ferramentas: FerramentaBody[], agendaId: string | null) {
  if (!agendaId) return ferramentas;
  return ferramentas.map((item) =>
    FERRAMENTAS_AGENDA.has(item.tipo)
      ? { ...item, config_json: { ...(item.config_json || {}), agenda_id: agendaId } }
      : item
  );
}

async function validarAgendaObrigatoria(empresaId: string, ferramentas: FerramentaBody[]) {
  const configuracao = agendaConfiguradaNasFerramentas(ferramentas);
  if (!configuracao.usaAgenda) {
    return { ok: true as const, agendaId: null as string | null };
  }
  if (!configuracao.agendaId) {
    return {
      ok: false as const,
      error: "Selecione uma única agenda obrigatória para usar as ferramentas de agenda.",
    };
  }

  const { data: agenda, error } = await supabaseAdmin
    .from("calendarios")
    .select("id, nome, status")
    .eq("empresa_id", empresaId)
    .eq("id", configuracao.agendaId)
    .eq("status", "ativo")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agenda) {
    return {
      ok: false as const,
      error: "A agenda configurada não existe, está inativa ou não pertence à empresa.",
    };
  }

  return { ok: true as const, agendaId: agenda.id };
}

async function carregarFerramentasAgente(empresaId: string, agenteId: string) {
  const { data, error } = await supabaseAdmin
    .from("agente_ia_ferramentas")
    .select("tipo, ativo, config_json")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId);
  if (error) throw new Error(error.message);
  return (data || []).map((item) => ({
    tipo: String(item.tipo || ""),
    ativo: item.ativo !== false,
    config_json: (item.config_json || {}) as Record<string, unknown>,
  }));
}

async function contextoEmpresa() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }
  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }
  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

async function carregarAgentes(empresaId: string) {
  const [{ data: agentes, error }, { data: ferramentas }, { data: conhecimentos }] = await Promise.all([
    supabaseAdmin
      .from("agentes_ia")
      .select("*")
      .eq("empresa_id", empresaId)
      .neq("status", "arquivado")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("agente_ia_ferramentas")
      .select("id, agente_id, tipo, ativo, config_json")
      .eq("empresa_id", empresaId)
      .order("tipo", { ascending: true }),
    supabaseAdmin
      .from("agente_ia_conhecimentos")
      .select("id, agente_id, titulo, categoria, conteudo, palavras_chave, prioridade, ativo, created_at, updated_at")
      .eq("empresa_id", empresaId)
      .order("prioridade", { ascending: false })
      .order("updated_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);

  return (agentes || []).map((agente) => ({
    ...agente,
    modelo: MODELO_PADRAO,
    status: agente.status === "ativo" ? "ativo" : "inativo",
    ferramentas: (ferramentas || []).filter((item) => item.agente_id === agente.id),
    conhecimentos: (conhecimentos || []).filter((item) => item.agente_id === agente.id),
  }));
}

async function validarEscopoAtivacao(
  empresaId: string,
  agenteId: string,
  integracoes: string[]
) {
  const { data: outros, error } = await supabaseAdmin
    .from("agentes_ia")
    .select("id, nome, integracoes_whatsapp_ids")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .neq("id", agenteId);
  if (error) throw new Error(error.message);

  return (outros || []).find((item) =>
    escoposConflitam(integracoes, idsString(item.integracoes_whatsapp_ids))
  );
}

export async function GET() {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;

    const [agentes, integracoesResult, fluxosResult, setoresResult, agendasResult] = await Promise.all([
      carregarAgentes(contexto.empresaId),
      supabaseAdmin
        .from("integracoes_whatsapp")
        .select("id, nome_conexao, numero, phone_number_display_name, verified_name, status")
        .eq("empresa_id", contexto.empresaId)
        .order("posicao", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("automacao_fluxos")
        .select("id, nome, status")
        .eq("empresa_id", contexto.empresaId)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
      supabaseAdmin
        .from("setores")
        .select("id, nome, status, ativo")
        .eq("empresa_id", contexto.empresaId)
        .order("ordem_exibicao", { ascending: true }),
      supabaseAdmin
        .from("calendarios")
        .select("id, nome, timezone, duracao_minutos, status")
        .eq("empresa_id", contexto.empresaId)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
    ]);

    return NextResponse.json({
      ok: true,
      agentes,
      opcoes: {
        integracoes: integracoesResult.data || [],
        fluxos: fluxosResult.data || [],
        setores: (setoresResult.data || []).filter(
          (item) => item.ativo !== false && item.status !== "inativo"
        ),
        agendas: agendasResult.data || [],
      },
    });
  } catch (error) {
    console.error("[AGENTES_IA_API] GET:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao listar agentes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const body = (await request.json()) as Record<string, unknown>;
    const nome = String(body.nome || "Novo agente").trim() || "Novo agente";

    const { data: agente, error } = await supabaseAdmin
      .from("agentes_ia")
      .insert({
        empresa_id: contexto.empresaId,
        nome,
        descricao: String(body.descricao || "").trim() || null,
        status: "inativo",
        modelo: MODELO_PADRAO,
        prompt_sistema: String(body.prompt_sistema || "").trim(),
        tom_voz: null,
        instrucoes: "",
        max_mensagens_contexto: 12,
        debounce_ms: 1200,
        integracoes_whatsapp_ids: [],
        created_by: contexto.usuario.id,
        updated_by: contexto.usuario.id,
      })
      .select("*")
      .single();
    if (error || !agente) throw new Error(error?.message || "Erro ao criar agente.");

    const ferramentasPadrao = ["consultar_conhecimento", "consultar_contato"].map((tipo) => ({
      empresa_id: contexto.empresaId,
      agente_id: agente.id,
      tipo,
      ativo: true,
      config_json: {},
    }));
    const { error: ferramentasError } = await supabaseAdmin
      .from("agente_ia_ferramentas")
      .insert(ferramentasPadrao);
    if (ferramentasError) throw new Error(ferramentasError.message);

    return NextResponse.json(
      { ok: true, agente: { ...agente, modelo: MODELO_PADRAO, status: "inativo" } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[AGENTES_IA_API] POST:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao criar agente." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }

    const { data: atual, error: atualError } = await supabaseAdmin
      .from("agentes_ia")
      .select("*")
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id)
      .maybeSingle();
    if (atualError) throw new Error(atualError.message);
    if (!atual || atual.status === "arquivado") {
      return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });
    }

    const acao = String(body.acao || "salvar");

    if (acao === "ativar") {
      if (atual.status === "ativo") {
        return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
      }

      const ferramentasAtuais = await carregarFerramentasAgente(contexto.empresaId, id);
      const validacaoAgenda = await validarAgendaObrigatoria(contexto.empresaId, ferramentasAtuais);
      if (!validacaoAgenda.ok) {
        return NextResponse.json(
          { ok: false, code: "AGENDA_AGENTE_OBRIGATORIA", error: validacaoAgenda.error },
          { status: 409 }
        );
      }

      const integracoes = idsString(atual.integracoes_whatsapp_ids);
      const conflito = await validarEscopoAtivacao(contexto.empresaId, id, integracoes);
      if (conflito) {
        return NextResponse.json(
          {
            ok: false,
            code: "ESCOPO_AGENTE_CONFLITANTE",
            error: `O agente “${conflito.nome}” já está ativo para o mesmo escopo de WhatsApp.`,
          },
          { status: 409 }
        );
      }
      const { error } = await supabaseAdmin
        .from("agentes_ia")
        .update({
          status: "ativo",
          modelo: MODELO_PADRAO,
          updated_by: contexto.usuario.id,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", contexto.empresaId)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao === "pausar") {
      const { error } = await supabaseAdmin
        .from("agentes_ia")
        .update({
          status: "inativo",
          modelo: MODELO_PADRAO,
          updated_by: contexto.usuario.id,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", contexto.empresaId)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao === "adicionar_conhecimento") {
      const titulo = String(body.titulo || "").trim();
      const conteudo = String(body.conteudo || "").trim();
      if (!titulo || !conteudo) {
        return NextResponse.json(
          { ok: false, error: "Título e conteúdo são obrigatórios." },
          { status: 400 }
        );
      }
      const palavras = Array.isArray(body.palavras_chave)
        ? idsString(body.palavras_chave)
        : String(body.palavras_chave || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
      const { error } = await supabaseAdmin.from("agente_ia_conhecimentos").insert({
        empresa_id: contexto.empresaId,
        agente_id: id,
        titulo,
        categoria: String(body.categoria || "").trim() || null,
        conteudo,
        palavras_chave: palavras,
        prioridade: Number.isFinite(Number(body.prioridade)) ? Number(body.prioridade) : 0,
        ativo: true,
        created_by: contexto.usuario.id,
        updated_by: contexto.usuario.id,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao === "excluir_conhecimento") {
      const conhecimentoId = String(body.conhecimento_id || "").trim();
      if (!conhecimentoId) {
        return NextResponse.json(
          { ok: false, error: "conhecimento_id é obrigatório." },
          { status: 400 }
        );
      }
      const { error } = await supabaseAdmin
        .from("agente_ia_conhecimentos")
        .delete()
        .eq("empresa_id", contexto.empresaId)
        .eq("agente_id", id)
        .eq("id", conhecimentoId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao !== "salvar") {
      return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    }

    const integracoes = idsString(body.integracoes_whatsapp_ids);
    if (atual.status === "ativo") {
      const conflito = await validarEscopoAtivacao(contexto.empresaId, id, integracoes);
      if (conflito) {
        return NextResponse.json(
          {
            ok: false,
            code: "ESCOPO_AGENTE_CONFLITANTE",
            error: `O agente “${conflito.nome}” já está ativo para o mesmo escopo de WhatsApp.`,
          },
          { status: 409 }
        );
      }
    }

    let ferramentasNormalizadas: FerramentaBody[] | null = null;
    if (Array.isArray(body.ferramentas)) {
      const ferramentas = ferramentasBody(body.ferramentas);
      const validacaoAgenda = await validarAgendaObrigatoria(contexto.empresaId, ferramentas);
      if (!validacaoAgenda.ok) {
        return NextResponse.json(
          { ok: false, code: "AGENDA_AGENTE_OBRIGATORIA", error: validacaoAgenda.error },
          { status: 400 }
        );
      }
      ferramentasNormalizadas = normalizarAgendaNasFerramentas(
        ferramentas,
        validacaoAgenda.agendaId
      );
    }

    const maxContexto = Math.min(
      40,
      Math.max(4, Number(body.max_mensagens_contexto || atual.max_mensagens_contexto || 12))
    );
    const debounce = Math.min(
      10000,
      Math.max(250, Number(body.debounce_ms || atual.debounce_ms || 1200))
    );
    const update = {
      nome: String(body.nome ?? atual.nome).trim() || atual.nome,
      descricao: String(body.descricao ?? atual.descricao ?? "").trim() || null,
      modelo: MODELO_PADRAO,
      prompt_sistema: String(body.prompt_sistema ?? atual.prompt_sistema ?? "").trim(),
      tom_voz: normalizarCaracteristicas(body.tom_voz ?? atual.tom_voz),
      instrucoes: String(body.instrucoes ?? atual.instrucoes ?? "").trim() || null,
      max_mensagens_contexto: maxContexto,
      debounce_ms: debounce,
      fallback_fluxo_id: String(body.fallback_fluxo_id || "").trim() || null,
      integracoes_whatsapp_ids: integracoes,
      updated_by: contexto.usuario.id,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabaseAdmin
      .from("agentes_ia")
      .update(update)
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    if (ferramentasNormalizadas) {
      const { error: deleteFerramentasError } = await supabaseAdmin
        .from("agente_ia_ferramentas")
        .delete()
        .eq("empresa_id", contexto.empresaId)
        .eq("agente_id", id);
      if (deleteFerramentasError) throw new Error(deleteFerramentasError.message);
      if (ferramentasNormalizadas.length) {
        const { error: ferramentasError } = await supabaseAdmin
          .from("agente_ia_ferramentas")
          .insert(
            ferramentasNormalizadas.map((item) => ({
              empresa_id: contexto.empresaId,
              agente_id: id,
              tipo: item.tipo,
              ativo: item.ativo,
              config_json: item.config_json,
            }))
          );
        if (ferramentasError) throw new Error(ferramentasError.message);
      }
    }

    return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
  } catch (error) {
    console.error("[AGENTES_IA_API] PATCH:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao salvar agente." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }

    const { data: agente, error: agenteError } = await supabaseAdmin
      .from("agentes_ia")
      .select("id, status")
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id)
      .maybeSingle();
    if (agenteError) throw new Error(agenteError.message);
    if (!agente || agente.status === "arquivado") {
      return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });
    }
    if (agente.status === "ativo") {
      return NextResponse.json(
        { ok: false, code: "AGENTE_ATIVO", error: "Pause o agente antes de apagá-lo definitivamente." },
        { status: 409 }
      );
    }
    if (!["inativo", "rascunho"].includes(agente.status)) {
      return NextResponse.json(
        { ok: false, error: "Somente agentes pausados podem ser apagados." },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from("agentes_ia")
      .delete()
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[AGENTES_IA_API] DELETE:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao apagar agente." },
      { status: 500 }
    );
  }
}
