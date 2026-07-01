import { NextResponse } from "next/server";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import {
  obterResultadoFluxoEventoManual,
  tipoEventoManualValido,
} from "@/lib/rastreamento/eventos-manuais";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function normalizarValorInformado(valor: unknown) {
  if (valor === "" || valor === null || valor === undefined) {
    return null;
  }

  if (typeof valor === "number") {
    return valor;
  }

  const texto = String(valor)
    .trim()
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  return Number(texto);
}

export async function GET(request: Request) {
  const acesso = await obterAcessoRastreamento("rastreamento.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { searchParams } = new URL(request.url);
  const tipo = String(searchParams.get("tipo") || "").trim();
  const conversaId = String(searchParams.get("conversa_id") || "").trim();
  const contatoId = String(searchParams.get("contato_id") || "").trim();
  const origemRegistro = String(searchParams.get("origem_registro") || "").trim();
  const limite = Math.min(200, Math.max(1, Number(searchParams.get("limite") || 100)));
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("rastreamento_eventos")
    .select(`
      *,
      contatos!rastreamento_eventos_contato_id_fkey (
        id,
        nome,
        telefone
      ),
      conversas ( id ),
      conversa_protocolos!rastreamento_eventos_conversa_protocolo_id_fkey (
        id,
        protocolo
      ),
      rastreamento_origens ( id, nome ),
      rastreamento_campanhas ( id, nome ),
      rastreamento_links ( id, nome, slug )
    `)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .order("ocorrido_em", { ascending: false })
    .limit(limite);

  if (tipo) {
    query = query.eq("tipo", tipo);
  }

  if (conversaId) {
    query = query.eq("conversa_id", conversaId);
  }

  if (contatoId) {
    query = query.eq("contato_id", contatoId);
  }

  if (origemRegistro) {
    query = query.eq("origem_registro", origemRegistro);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventos: data || [] });
}

export async function POST(request: Request) {
  const acesso = await obterAcessoRastreamento("rastreamento.gerenciar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const body = await request.json();
  const tipo = String(body?.tipo || "").trim();
  const contatoId = String(body?.contato_id || "").trim() || null;
  const conversaId = String(body?.conversa_id || "").trim() || null;
  const conversaProtocoloId =
    String(body?.conversa_protocolo_id || "").trim() || null;
  const observacao = String(body?.observacao || "").trim() || null;
  const valorInformado = normalizarValorInformado(body?.valor);

  if (!tipoEventoManualValido(tipo)) {
    return NextResponse.json(
      { ok: false, error: "Tipo de evento manual invalido." },
      { status: 400 }
    );
  }

  if (!contatoId && !conversaId) {
    return NextResponse.json(
      { ok: false, error: "Selecione um contato ou informe uma conversa." },
      { status: 400 }
    );
  }

  if (valorInformado !== null && (!Number.isFinite(valorInformado) || valorInformado < 0)) {
    return NextResponse.json(
      { ok: false, error: "Informe um valor valido." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  let protocolo: { id: string; protocolo: string | null } | null = null;

  if (contatoId) {
    const { data: contato } = await supabase
      .from("contatos")
      .select("id")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", contatoId)
      .maybeSingle();

    if (!contato) {
      return NextResponse.json(
        { ok: false, error: "Contato nao encontrado." },
        { status: 404 }
      );
    }
  }

  if (conversaId) {
    const { data: conversa } = await supabase
      .from("conversas")
      .select("id")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", conversaId)
      .maybeSingle();

    if (!conversa) {
      return NextResponse.json(
        { ok: false, error: "Conversa nao encontrada." },
        { status: 404 }
      );
    }
  }

  if (conversaProtocoloId) {
    if (!conversaId) {
      return NextResponse.json(
        { ok: false, error: "Informe a conversa para vincular um protocolo." },
        { status: 400 }
      );
    }

    const { data } = await supabase
      .from("conversa_protocolos")
      .select("id, protocolo")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("conversa_id", conversaId)
      .eq("id", conversaProtocoloId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Protocolo nao encontrado para esta conversa." },
        { status: 404 }
      );
    }

    protocolo = data;
  }

  const { error } = await supabase.rpc("rastreamento_criar_evento", {
    p_empresa_id: acesso.usuario.empresa_id,
    p_tipo: tipo,
    p_contato_id: contatoId,
    p_conversa_id: conversaId,
    p_valor: valorInformado,
    p_origem_registro: "manual",
    p_metadata_json: {
      origem_interface: body?.origem_interface || "rastreamento",
      conversa_protocolo_id: protocolo?.id || null,
      protocolo: protocolo?.protocolo || null,
      observacao,
      resultado_fluxo: obterResultadoFluxoEventoManual(tipo),
    },
    p_created_by: acesso.usuario.id,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, message: "Evento registrado com sucesso." },
    { status: 201 }
  );
}
