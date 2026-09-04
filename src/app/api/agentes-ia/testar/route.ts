import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarSaldoTokensIa, registrarUsoTokensIa } from "@/lib/ia/tokens";
import {
  carregarFerramentasNegocioAtivas,
  contextoPreconsultadoNegocio,
  preconsultarNegocio,
} from "@/lib/agentes-ia/ferramentas-negocio";

const supabaseAdmin = getSupabaseAdmin();
const MODELO_PADRAO = "gpt-5.6-luna";
const MAX_RESULTADOS_CONHECIMENTO = 2;
const MAX_CARACTERES_TRECHO = 850;

export async function POST(request: Request) {
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

    const body = (await request.json()) as { id?: string; mensagem?: string };
    const id = String(body.id || "").trim();
    const mensagem = String(body.mensagem || "").trim();
    if (!id || !mensagem) {
      return NextResponse.json(
        { ok: false, error: "Agente e mensagem são obrigatórios." },
        { status: 400 }
      );
    }

    const { data: agente } = await supabaseAdmin
      .from("agentes_ia")
      .select("id, nome, modelo, prompt_sistema, tom_voz, instrucoes")
      .eq("empresa_id", empresaId)
      .eq("id", id)
      .neq("status", "arquivado")
      .maybeSingle();
    if (!agente) {
      return NextResponse.json(
        { ok: false, error: "Agente não encontrado." },
        { status: 404 }
      );
    }

    const saldo = await buscarSaldoTokensIa(empresaId);
    if (saldo.limite !== null && Number(saldo.restantes || 0) <= 0) {
      return NextResponse.json(
        { ok: false, error: "Saldo de tokens de IA esgotado para este período." },
        { status: 402 }
      );
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY não configurada." },
        { status: 503 }
      );
    }

    const [conhecimentosResult, ferramentasNegocio] = await Promise.all([
      supabaseAdmin.rpc("agente_ia_buscar_conhecimento", {
        p_empresa_id: empresaId,
        p_agente_id: id,
        p_consulta: mensagem,
        p_limite: MAX_RESULTADOS_CONHECIMENTO,
      }),
      carregarFerramentasNegocioAtivas(empresaId, id),
    ]);

    const conhecimentosCompactos = (conhecimentosResult.data || [])
      .slice(0, MAX_RESULTADOS_CONHECIMENTO)
      .map((item: any) => ({
        titulo: item.titulo,
        categoria: item.categoria,
        trecho: String(item.trecho || "").slice(0, MAX_CARACTERES_TRECHO),
      }));
    const base = conhecimentosCompactos
      .map((item: any) => `# ${item.titulo}\n${item.trecho}`)
      .join("\n\n");

    const preconsultaNegocio = await preconsultarNegocio({
      empresaId,
      agenteId: id,
      ferramentas: ferramentasNegocio,
      mensagem,
      historico: [],
    });
    const contextoNegocio = contextoPreconsultadoNegocio(preconsultaNegocio);

    const instructions = [
      `Você é ${agente.nome}, em modo de teste do CRM Prosperity.`,
      agente.prompt_sistema || "",
      agente.tom_voz ? `Tom: ${agente.tom_voz}` : "",
      agente.instrucoes || "",
      "Responda em português do Brasil, de forma curta.",
      "MODO DE TESTE: não execute nem prometa ações no CRM. Nunca crie pedido, reserva, agendamento, transferência ou alteração de dados.",
      "Para produto, estoque, preço, serviço ou imóvel, use apenas os dados atuais recuperados abaixo. Não invente valores nem disponibilidade.",
      base ? `Conhecimento recuperado:\n${base}` : "Nenhum conhecimento relevante foi recuperado.",
      contextoNegocio || "Nenhum dado operacional de negócio relevante foi recuperado.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const modelo = String(
      agente.modelo || process.env.OPENAI_AGENT_MODEL || MODELO_PADRAO
    ).trim();
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response: any = await openai.responses.create({
      model: modelo,
      instructions,
      input: [{ role: "user", content: mensagem }],
      reasoning: { effort: "none" },
      text: { verbosity: "low" },
    } as any);

    const tokensInput = Number(response.usage?.input_tokens || 0);
    const tokensOutput = Number(response.usage?.output_tokens || 0);
    const tokensTotal = Number(response.usage?.total_tokens || 0);

    if (tokensTotal > 0) {
      await registrarUsoTokensIa({
        empresaId,
        origem: "agente_ia_teste",
        modelo,
        tokensTotal,
        tokensInput,
        tokensOutput,
        usuarioId: auth.usuario.id,
        metadata: {
          agente_id: id,
          ferramentas_negocio_consultadas: preconsultaNegocio.resultados.map(
            (item) => item.ferramenta
          ),
          modo_teste_sem_acoes: true,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      resposta: String(response.output_text || "").trim(),
      conhecimentos_usados: conhecimentosCompactos,
      dados_negocio_usados: preconsultaNegocio.resultados,
      acoes_executadas: [],
      tokens: {
        input: tokensInput,
        output: tokensOutput,
        total: tokensTotal,
      },
    });
  } catch (error) {
    console.error("[AGENTES_IA_TESTE]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao testar agente.",
      },
      { status: 500 }
    );
  }
}
