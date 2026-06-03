import { NextResponse } from "next/server";
import { obterAcessoRastreamento } from "@/lib/rastreamento/api";
import {
  gerarCodigoCampanha,
  normalizarCodigoCampanha,
  somenteDigitos,
} from "@/lib/rastreamento/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const acesso = await obterAcessoRastreamento("rastreamento.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("rastreamento_campanhas")
    .select(`
      *,
      rastreamento_origens ( id, nome ),
      integracoes_whatsapp ( id, nome_conexao, numero )
    `)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, campanhas: data || [] });
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
  const nome = String(body?.nome || "").trim();
  const origemId = String(body?.origem_id || "").trim();
  const integracaoWhatsappId =
    String(body?.integracao_whatsapp_id || "").trim() || null;
  const numeroWhatsapp = somenteDigitos(body?.numero_whatsapp || "");
  const codigo =
    normalizarCodigoCampanha(body?.codigo || "") || gerarCodigoCampanha(nome);
  const descricao = String(body?.descricao || "").trim() || null;
  const mensagemInicial =
    String(body?.mensagem_inicial || "").trim() ||
    `Ola, tenho interesse na campanha ${nome}.`;

  if (nome.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome da campanha." },
      { status: 400 }
    );
  }

  if (!origemId) {
    return NextResponse.json(
      { ok: false, error: "Selecione uma origem." },
      { status: 400 }
    );
  }

  if (numeroWhatsapp.length < 10) {
    return NextResponse.json(
      { ok: false, error: "Informe um numero de WhatsApp valido com DDI." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: origem } = await supabase
    .from("rastreamento_origens")
    .select("id")
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("id", origemId)
    .eq("status", "ativo")
    .maybeSingle();

  if (!origem) {
    return NextResponse.json(
      { ok: false, error: "Origem ativa nao encontrada." },
      { status: 404 }
    );
  }

  if (integracaoWhatsappId) {
    const { data: integracao } = await supabase
      .from("integracoes_whatsapp")
      .select("id")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", integracaoWhatsappId)
      .maybeSingle();

    if (!integracao) {
      return NextResponse.json(
        { ok: false, error: "Integracao WhatsApp nao encontrada." },
        { status: 404 }
      );
    }
  }

  const { data, error } = await supabase
    .from("rastreamento_campanhas")
    .insert({
      empresa_id: acesso.usuario.empresa_id,
      origem_id: origemId,
      integracao_whatsapp_id: integracaoWhatsappId,
      nome,
      codigo,
      descricao,
      numero_whatsapp: numeroWhatsapp,
      mensagem_inicial: mensagemInicial,
      created_by: acesso.usuario.id,
      updated_by: acesso.usuario.id,
    })
    .select("*")
    .single();

  if (error) {
    const mensagem =
      error.code === "23505"
        ? "Ja existe uma campanha com esse codigo."
        : error.message;

    return NextResponse.json({ ok: false, error: mensagem }, { status: 400 });
  }

  return NextResponse.json({ ok: true, campanha: data }, { status: 201 });
}
