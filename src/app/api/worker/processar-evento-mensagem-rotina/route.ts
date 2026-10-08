import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processarMensagemEnviadaRotinas } from "@/lib/rotinas-automacao/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  let mensagemId = "";
  let empresaId = "";

  try {
    const bodyText = await request.text();
    const valido = await receiver.verify({
      signature: request.headers.get("upstash-signature") || "",
      body: bodyText,
    });
    if (!valido) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida" }, { status: 401 });
    }

    const body = JSON.parse(bodyText) as {
      evento?: string;
      empresaId?: string;
      conversaId?: string;
      mensagemId?: string;
    };
    empresaId = String(body.empresaId || "");
    mensagemId = String(body.mensagemId || "");
    const conversaId = String(body.conversaId || "");

    if (body.evento !== "mensagem.enviada" || !empresaId || !conversaId || !mensagemId) {
      return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
    }

    const { data: mensagem, error } = await supabase
      .from("mensagens")
      .select("id,empresa_id,conversa_id,conteudo,tipo_mensagem,status_envio,remetente_tipo")
      .eq("id", mensagemId)
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .maybeSingle();
    if (error) throw error;

    if (!mensagem || mensagem.status_envio === "falha" || mensagem.remetente_tipo === "contato") {
      await supabase
        .from("rotina_mensagem_saida_outbox")
        .update({ status: "ignorado", processado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("empresa_id", empresaId)
        .eq("mensagem_id", mensagemId);
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const { data: conversa, error: conversaError } = await supabase
      .from("conversas")
      .select("contato_id")
      .eq("id", conversaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (conversaError) throw conversaError;

    const resultado = await processarMensagemEnviadaRotinas({
      empresaId,
      conversaId,
      contatoId: conversa?.contato_id || null,
      mensagemId: mensagem.id,
      mensagemTexto: mensagem.conteudo || "",
      mensagemTipo: mensagem.tipo_mensagem || null,
    });
    if (resultado === null) {
      throw new Error("Não foi possível processar o evento mensagem.enviada.");
    }

    await supabase
      .from("rotina_mensagem_saida_outbox")
      .update({
        status: "processado",
        processado_em: new Date().toISOString(),
        ultimo_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", empresaId)
      .eq("mensagem_id", mensagemId);

    return NextResponse.json({ ok: true, resultado });
  } catch (error) {
    if (empresaId && mensagemId) {
      await supabase
        .from("rotina_mensagem_saida_outbox")
        .update({
          status: "pendente",
          ultimo_erro: error instanceof Error ? error.message : "Erro interno.",
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", empresaId)
        .eq("mensagem_id", mensagemId);
    }
    console.error("[QSTASH ROTINA MENSAGEM] Erro", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
