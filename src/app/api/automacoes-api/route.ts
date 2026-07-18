import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabase = getSupabaseAdmin();

async function contexto() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return resultado;
  if (!resultado.usuario.empresa_id) {
    return { ok: false as const, status: 403 as const, error: "Usuário sem empresa vinculada." };
  }
  return { ok: true as const, usuario: resultado.usuario, empresaId: resultado.usuario.empresa_id };
}

export async function GET() {
  const ctx = await contexto();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const [integracoesResult, rotinasResult, execucoesResult, templatesResult] = await Promise.all([
    supabase
      .from("integracoes_api_externas")
      .select("id,nome,tipo,base_url,codigo_empresa,status,ultimo_teste_em,ultimo_erro,created_at")
      .eq("empresa_id", ctx.empresaId)
      .order("created_at", { ascending: false }),
    supabase
      .from("automacoes_api_rotinas")
      .select("id,nome,consulta_chave,endpoint,metodo,template_id,frequencia,horario,status,proxima_execucao_em,ultima_execucao_em,ultimo_erro,total_processados,integracao_id,created_at")
      .eq("empresa_id", ctx.empresaId)
      .order("created_at", { ascending: false }),
    supabase
      .from("automacoes_api_execucoes")
      .select("status,mensagens_enviadas,iniciada_em")
      .eq("empresa_id", ctx.empresaId)
      .gte("iniciada_em", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("whatsapp_templates")
      .select("id,nome,status")
      .eq("empresa_id", ctx.empresaId)
      .eq("status", "APPROVED")
      .order("nome"),
  ]);

  const erro = integracoesResult.error || rotinasResult.error || execucoesResult.error || templatesResult.error;
  if (erro) return NextResponse.json({ ok: false, error: erro.message }, { status: 500 });

  const execucoes = execucoesResult.data || [];
  const concluidas = execucoes.filter((item) => item.status !== "executando");
  const sucessos = concluidas.filter((item) => item.status === "sucesso").length;

  return NextResponse.json({
    ok: true,
    integracoes: integracoesResult.data || [],
    rotinas: rotinasResult.data || [],
    templates: templatesResult.data || [],
    metricas: {
      total_rotinas: rotinasResult.data?.length || 0,
      rotinas_ativas: rotinasResult.data?.filter((item) => item.status === "ativa").length || 0,
      com_erro: rotinasResult.data?.filter((item) => item.status === "erro").length || 0,
      enviados_30_dias: execucoes.reduce((total, item) => total + Number(item.mensagens_enviadas || 0), 0),
      taxa_execucao: concluidas.length ? Number(((sucessos / concluidas.length) * 100).toFixed(1)) : null,
    },
  });
}

export async function POST(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const acao = String(body?.acao || "");

  if (acao === "criar_integracao") {
    const nome = String(body?.nome || "").trim();
    const baseUrl = String(body?.base_url || "").trim().replace(/\/$/, "");
    if (!nome || !baseUrl) return NextResponse.json({ ok: false, error: "Informe nome e URL base." }, { status: 400 });
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      return NextResponse.json({ ok: false, error: "Use uma URL HTTPS válida." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("integracoes_api_externas")
      .insert({
        empresa_id: ctx.empresaId,
        nome,
        base_url: baseUrl,
        codigo_empresa: String(body?.codigo_empresa || "").trim() || null,
        status: "nao_testada",
      })
      .select("id,nome,tipo,base_url,codigo_empresa,status,created_at")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, integracao: data });
  }

  if (acao === "criar_rotina") {
    const integracaoId = String(body?.integracao_id || "");
    const nome = String(body?.nome || "").trim();
    const endpoint = String(body?.endpoint || "").trim();
    const consultaChave = String(body?.consulta_chave || "personalizada").trim();
    if (!integracaoId || !nome || !endpoint.startsWith("/")) {
      return NextResponse.json({ ok: false, error: "Informe integração, nome e endpoint iniciado por /." }, { status: 400 });
    }

    const { data: integracao } = await supabase
      .from("integracoes_api_externas")
      .select("id")
      .eq("id", integracaoId)
      .eq("empresa_id", ctx.empresaId)
      .maybeSingle();
    if (!integracao) return NextResponse.json({ ok: false, error: "Integração inválida." }, { status: 404 });

    const { data, error } = await supabase
      .from("automacoes_api_rotinas")
      .insert({
        empresa_id: ctx.empresaId,
        integracao_id: integracaoId,
        nome,
        consulta_chave: consultaChave,
        endpoint,
        metodo: body?.metodo === "POST" ? "POST" : "GET",
        template_id: body?.template_id || null,
        frequencia: ["diaria", "semanal", "mensal"].includes(body?.frequencia) ? body.frequencia : "diaria",
        horario: String(body?.horario || "09:00"),
        status: "pausada",
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rotina: data });
  }

  return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
}

export async function PATCH(request: NextRequest) {
  const ctx = await contexto();
  if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await request.json();
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!id || !["ativa", "pausada"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Dados inválidos." }, { status: 400 });
  }
  const { error } = await supabase
    .from("automacoes_api_rotinas")
    .update({ status, updated_at: new Date().toISOString(), ultimo_erro: null })
    .eq("id", id)
    .eq("empresa_id", ctx.empresaId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}