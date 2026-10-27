import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import {
  sanitizarHtmlEmail,
  textoParaHtml,
} from "@/lib/email-marketing/conteudo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

async function obterTemplateAcessivel(id: string, empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .select("id, empresa_id, escopo, nome, assunto, html, texto, status")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data || data.empresa_id !== empresaId) {
    return null;
  }

  return data;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  if (!acesso.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const atual = await obterTemplateAcessivel(id, acesso.usuario.empresa_id);

  if (!atual) {
    return NextResponse.json(
      { ok: false, error: "Template não encontrado." },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const nome = String(body?.nome ?? atual.nome).trim();
  const assunto = String(body?.assunto ?? atual.assunto).trim();
  const texto = String(body?.texto ?? atual.texto ?? "").trim();
  const htmlEntrada = String(body?.html ?? atual.html).trim();
  const html = sanitizarHtmlEmail(htmlEntrada || textoParaHtml(texto));

  if (!nome || !assunto || !html) {
    return NextResponse.json(
      { ok: false, error: "Informe nome, assunto e conteúdo do template." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .update({
      nome,
      assunto,
      html,
      texto: texto || null,
      status: body?.status === "rascunho" ? "rascunho" : "ativo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .select(
      "id, empresa_id, escopo, nome, assunto, html, texto, status, created_at, updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    template: data,
    message: "Template atualizado com sucesso.",
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await validarAcessoEmailMarketing();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  if (!acesso.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário administrador sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { id } = await context.params;
  const atual = await obterTemplateAcessivel(id, acesso.usuario.empresa_id);

  if (!atual) {
    return NextResponse.json(
      { ok: false, error: "Template não encontrado." },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("email_templates")
    .update({
      status: "arquivado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("empresa_id", acesso.usuario.empresa_id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Template arquivado.",
  });
}
