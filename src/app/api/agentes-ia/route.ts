import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const FERRAMENTAS_VALIDAS = new Set([
  "consultar_conhecimento",
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
  "consultar_contato",
  "transferir_humano",
]);

function idsString(valor: unknown) {
  if (!Array.isArray(valor)) return [] as string[];
  return Array.from(new Set(valor.map((item) => String(item || "").trim()).filter(Boolean)));
}

function ferramentasBody(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => {
      if (typeof item === "string") return { tipo: item, ativo: true, config_json: {} };
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      return {
        tipo: String(obj.tipo || "").trim(),
        ativo: obj.ativo !== false,
        config_json:
          obj.config_json && typeof obj.config_json === "object" && !Array.isArray(obj.config_json)
            ? obj.config_json
            : {},
      };
    })
    .filter((item): item is { tipo: string; ativo: boolean; config_json: object } => !!item && FERRAMENTAS_VALIDAS.has(item.tipo));
}

function escoposConflitam(a: string[], b: string[]) {
  if (!a.length || !b.length) return true;
  const conjunto = new Set(b);
  return a.some((id) => conjunto.has(id));
}

async function contextoEmpresa() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status }) };
  if (!resultado.usuario.empresa_id) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 }) };
  return { ok: true as const, usuario: resultado.usuario, empresaId: resultado.usuario.empresa_id };
}

async function carregarAgentes(empresaId: string) {
  const [{ data: agentes, error }, { data: ferramentas }, { data: conhecimentos }] = await Promise.all([
    supabaseAdmin.from("agentes_ia").select("*").eq("empresa_id", empresaId).neq("status", "arquivado").order("created_at", { ascending: true }),
    supabaseAdmin.from("agente_ia_ferramentas").select("id, agente_id, tipo, ativo, config_json").eq("empresa_id", empresaId).order("tipo", { ascending: true }),
    supabaseAdmin.from("agente_ia_conhecimentos").select("id, agente_id, titulo, categoria, conteudo, palavras_chave, prioridade, ativo, created_at, updated_at").eq("empresa_id", empresaId).order("prioridade", { ascending: false }).order("updated_at", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);

  return (agentes || []).map((agente) => ({
    ...agente,
    ferramentas: (ferramentas || []).filter((item) => item.agente_id === agente.id),
    conhecimentos: (conhecimentos || []).filter((item) => item.agente_id === agente.id),
  }));
}

export async function GET() {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;

    const [agentes, integracoesResult, fluxosResult, setoresResult] = await Promise.all([
      carregarAgentes(contexto.empresaId),
      supabaseAdmin.from("integracoes_whatsapp").select("id, nome_conexao, numero, phone_number_display_name, verified_name, status").eq("empresa_id", contexto.empresaId).order("posicao", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
      supabaseAdmin.from("automacao_fluxos").select("id, nome, status").eq("empresa_id", contexto.empresaId).eq("status", "ativo").order("nome", { ascending: true }),
      supabaseAdmin.from("setores").select("id, nome, status, ativo").eq("empresa_id", contexto.empresaId).order("ordem_exibicao", { ascending: true }),
    ]);

    return NextResponse.json({
      ok: true,
      agentes,
      opcoes: {
        integracoes: integracoesResult.data || [],
        fluxos: fluxosResult.data || [],
        setores: (setoresResult.data || []).filter((item) => item.ativo !== false && item.status !== "inativo"),
      },
    });
  } catch (error) {
    console.error("[AGENTES_IA_API] GET:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao listar agentes." }, { status: 500 });
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
        status: "rascunho",
        modelo: String(body.modelo || "gpt-5.4-mini").trim() || "gpt-5.4-mini",
        prompt_sistema: String(body.prompt_sistema || "").trim(),
        tom_voz: "Natural, profissional e direto",
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
    await supabaseAdmin.from("agente_ia_ferramentas").insert(ferramentasPadrao);

    return NextResponse.json({ ok: true, agente }, { status: 201 });
  } catch (error) {
    console.error("[AGENTES_IA_API] POST:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao criar agente." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });

    const { data: atual } = await supabaseAdmin.from("agentes_ia").select("*").eq("empresa_id", contexto.empresaId).eq("id", id).maybeSingle();
    if (!atual) return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });

    const acao = String(body.acao || "salvar");
    if (acao === "adicionar_conhecimento") {
      const titulo = String(body.titulo || "").trim();
      const conteudo = String(body.conteudo || "").trim();
      if (!titulo || !conteudo) return NextResponse.json({ ok: false, error: "Título e conteúdo são obrigatórios." }, { status: 400 });
      const palavras = Array.isArray(body.palavras_chave)
        ? idsString(body.palavras_chave)
        : String(body.palavras_chave || "").split(",").map((item) => item.trim()).filter(Boolean);
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
      if (!conhecimentoId) return NextResponse.json({ ok: false, error: "conhecimento_id é obrigatório." }, { status: 400 });
      const { error } = await supabaseAdmin.from("agente_ia_conhecimentos").delete().eq("empresa_id", contexto.empresaId).eq("agente_id", id).eq("id", conhecimentoId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    const status = ["rascunho", "ativo", "inativo"].includes(String(body.status || "")) ? String(body.status) : atual.status;
    const integracoes = idsString(body.integracoes_whatsapp_ids);

    if (status === "ativo") {
      const { data: outros } = await supabaseAdmin
        .from("agentes_ia")
        .select("id, nome, integracoes_whatsapp_ids")
        .eq("empresa_id", contexto.empresaId)
        .eq("status", "ativo")
        .neq("id", id);
      const conflito = (outros || []).find((item) => escoposConflitam(integracoes, idsString(item.integracoes_whatsapp_ids)));
      if (conflito) {
        return NextResponse.json({ ok: false, code: "ESCOPO_AGENTE_CONFLITANTE", error: `O agente “${conflito.nome}” já está ativo para o mesmo escopo de WhatsApp.` }, { status: 409 });
      }
    }

    const maxContexto = Math.min(40, Math.max(4, Number(body.max_mensagens_contexto || atual.max_mensagens_contexto || 12)));
    const debounce = Math.min(10000, Math.max(250, Number(body.debounce_ms || atual.debounce_ms || 1200)));
    const update = {
      nome: String(body.nome ?? atual.nome).trim() || atual.nome,
      descricao: String(body.descricao ?? atual.descricao ?? "").trim() || null,
      status,
      modelo: String(body.modelo ?? atual.modelo ?? "gpt-5.4-mini").trim() || "gpt-5.4-mini",
      prompt_sistema: String(body.prompt_sistema ?? atual.prompt_sistema ?? "").trim(),
      tom_voz: String(body.tom_voz ?? atual.tom_voz ?? "").trim() || null,
      instrucoes: String(body.instrucoes ?? atual.instrucoes ?? "").trim() || null,
      max_mensagens_contexto: maxContexto,
      debounce_ms: debounce,
      fallback_fluxo_id: String(body.fallback_fluxo_id || "").trim() || null,
      integracoes_whatsapp_ids: integracoes,
      updated_by: contexto.usuario.id,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabaseAdmin.from("agentes_ia").update(update).eq("empresa_id", contexto.empresaId).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    if (Array.isArray(body.ferramentas)) {
      const ferramentas = ferramentasBody(body.ferramentas);
      await supabaseAdmin.from("agente_ia_ferramentas").delete().eq("empresa_id", contexto.empresaId).eq("agente_id", id);
      if (ferramentas.length) {
        const { error: ferramentasError } = await supabaseAdmin.from("agente_ia_ferramentas").insert(
          ferramentas.map((item) => ({ empresa_id: contexto.empresaId, agente_id: id, tipo: item.tipo, ativo: item.ativo, config_json: item.config_json }))
        );
        if (ferramentasError) throw new Error(ferramentasError.message);
      }
    }

    return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
  } catch (error) {
    console.error("[AGENTES_IA_API] PATCH:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao salvar agente." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("agentes_ia")
      .update({ status: "arquivado", updated_by: contexto.usuario.id, updated_at: new Date().toISOString() })
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Erro ao arquivar agente." }, { status: 500 });
  }
}
