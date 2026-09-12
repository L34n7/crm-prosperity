import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function normalizarPalavrasChave(valor: unknown) {
  const itens = Array.isArray(valor)
    ? valor
    : String(valor || "").split(",");
  const vistos = new Set<string>();
  const saida: string[] = [];

  for (const bruto of itens) {
    const item = String(bruto || "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!item) continue;
    const chave = item.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(item);
    if (saida.length >= 20) break;
  }
  return saida;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conhecimentoId: string }> }
) {
  try {
    const auth = await getUsuarioContexto();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const empresaId = auth.usuario.empresa_id;
    if (!empresaId) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { conhecimentoId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const agenteId = String(body.agente_id || "").trim();
    const titulo = String(body.titulo || "").trim().slice(0, 160);
    const conteudo = String(body.conteudo || "").trim().slice(0, 850);
    const categoria = String(body.categoria || "").trim().slice(0, 100) || null;

    if (!conhecimentoId || !agenteId) {
      return NextResponse.json(
        { ok: false, error: "Agente e conhecimento são obrigatórios." },
        { status: 400 }
      );
    }
    if (!titulo || !conteudo) {
      return NextResponse.json(
        { ok: false, error: "Título e conteúdo são obrigatórios." },
        { status: 400 }
      );
    }

    const [{ data: agente, error: agenteError }, { data: conhecimento, error: conhecimentoError }] =
      await Promise.all([
        supabaseAdmin
          .from("agentes_ia")
          .select("id")
          .eq("empresa_id", empresaId)
          .eq("id", agenteId)
          .neq("status", "arquivado")
          .maybeSingle(),
        supabaseAdmin
          .from("agente_ia_conhecimentos")
          .select("id, prioridade")
          .eq("empresa_id", empresaId)
          .eq("agente_id", agenteId)
          .eq("id", conhecimentoId)
          .maybeSingle(),
      ]);

    if (agenteError) throw new Error(agenteError.message);
    if (conhecimentoError) throw new Error(conhecimentoError.message);
    if (!agente || !conhecimento) {
      return NextResponse.json(
        { ok: false, error: "Conhecimento não encontrado para este agente." },
        { status: 404 }
      );
    }

    const prioridadeInformada = Number(body.prioridade);
    const prioridade = Number.isFinite(prioridadeInformada)
      ? prioridadeInformada
      : Number(conhecimento.prioridade || 0);

    const { data: atualizado, error: updateError } = await supabaseAdmin
      .from("agente_ia_conhecimentos")
      .update({
        titulo,
        categoria,
        conteudo,
        palavras_chave: normalizarPalavrasChave(body.palavras_chave),
        prioridade,
        updated_by: auth.usuario.id,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId)
      .eq("agente_id", agenteId)
      .eq("id", conhecimentoId)
      .select("id, titulo, categoria, conteudo, palavras_chave, prioridade")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!atualizado) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível atualizar o conhecimento." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, conhecimento: atualizado });
  } catch (error) {
    console.error("[AGENTES_IA_CONHECIMENTO_PATCH]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao atualizar conhecimento.",
      },
      { status: 500 }
    );
  }
}
