import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import {
  sanitizarHtmlEmail,
  textoParaHtml,
} from "@/lib/email-marketing/conteudo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { gerarHtmlEmailVisual, normalizarDocumentoEmail } from "@/lib/email-marketing/editor-visual";

const supabaseAdmin = getSupabaseAdmin();

async function obterTemplateAcessivel(id: string, empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .select("id, empresa_id, escopo, nome, assunto, html, texto, design_json, status")
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
  const acesso = await validarAcessoEmailMarketing("email_marketing.templates");

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

  if (body?.acao === "restaurar") {
    if (atual.status !== "arquivado") {
      return NextResponse.json({ ok: false, error: "Somente templates arquivados podem ser restaurados." }, { status: 409 });
    }
    const { data, error } = await supabaseAdmin
      .from("email_templates")
      .update({ status: "ativo", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("status", "arquivado")
      .select("id, empresa_id, escopo, nome, assunto, html, texto, design_json, status, created_at, updated_at")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "O status do template mudou. Atualize a página." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, template: data, message: "Template restaurado com sucesso." });
  }

  if (atual.status === "arquivado") {
    return NextResponse.json({ ok: false, error: "Restaure o template antes de editá-lo." }, { status: 409 });
  }

  const nome = String(body?.nome ?? atual.nome).trim();
  const assunto = String(body?.assunto ?? atual.assunto).trim();
  const texto = String(body?.texto ?? atual.texto ?? "").trim();
  const htmlEntrada = String(body?.html ?? atual.html).trim();
  const editorEntrada = body && Object.prototype.hasOwnProperty.call(body, "design_json")
    ? body.design_json : atual.design_json;
  const editor = editorEntrada == null ? null : normalizarDocumentoEmail(editorEntrada);
  if (editorEntrada != null && !editor) {
    return NextResponse.json({ ok: false, error: "Estrutura do editor visual inválida." }, { status: 400 });
  }
  const html = editor
    ? sanitizarHtmlEmail(gerarHtmlEmailVisual(editor))
    : sanitizarHtmlEmail(htmlEntrada || textoParaHtml(texto));

  if (!nome || !assunto || !html || nome.length > 160 || assunto.length > 250) {
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
      design_json: editor,
      texto: texto || null,
      status: body?.status === "rascunho" ? "rascunho" : "ativo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .select(
      "id, empresa_id, escopo, nome, assunto, html, texto, design_json, status, created_at, updated_at"
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
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.templates");

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

  const excluirDefinitivamente = new URL(request.url).searchParams.get("definitivo") === "1";

  if (excluirDefinitivamente) {
    if (atual.status !== "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Somente templates arquivados podem ser excluídos definitivamente." },
        { status: 409 }
      );
    }
    // Não desfazemos vínculos históricos com campanhas existentes.
    const { count, error: erroCampanhas } = await supabaseAdmin
      .from("email_campanhas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("template_id", id);
    if (erroCampanhas) {
      return NextResponse.json({ ok: false, error: erroCampanhas.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { ok: false, error: "Este template está vinculado a campanhas anteriores e não pode ser excluído definitivamente. Ele pode permanecer arquivado." },
        { status: 409 }
      );
    }
    const { data, error } = await supabaseAdmin
      .from("email_templates")
      .delete()
      .eq("id", id)
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("status", "arquivado")
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.code === "23503" ? 409 : 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "O template não está mais arquivado. Atualize a página." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, message: "Template excluído definitivamente." });
  }

  if (atual.status === "arquivado") {
    return NextResponse.json({ ok: true, message: "Template já está arquivado." });
  }

  const { error } = await supabaseAdmin
    .from("email_templates")
    .update({
      status: "arquivado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("empresa_id", acesso.usuario.empresa_id)
    .neq("status", "arquivado");

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
