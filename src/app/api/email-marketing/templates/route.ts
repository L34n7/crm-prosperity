import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import {
  sanitizarHtmlEmail,
  textoParaHtml,
} from "@/lib/email-marketing/conteudo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

function normalizarTemplate(body: Record<string, unknown> | null) {
  const nome = String(body?.nome || "").trim();
  const assunto = String(body?.assunto || "").trim();
  const texto = String(body?.texto || "").trim();
  const htmlEntrada = String(body?.html || "").trim();
  const html = sanitizarHtmlEmail(htmlEntrada || textoParaHtml(texto));

  return { nome, assunto, texto: texto || null, html };
}

export async function GET() {
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

  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .select(
      "id, empresa_id, escopo, nome, assunto, html, texto, status, created_at, updated_at"
    )
    .or(
      "empresa_id.eq." +
        acesso.usuario.empresa_id +
        ",and(empresa_id.is.null,escopo.eq.sistema)"
    )
    .neq("status", "arquivado")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, templates: data ?? [] });
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const template = normalizarTemplate(body);

  if (!template.nome || !template.assunto || !template.html) {
    return NextResponse.json(
      {
        ok: false,
        error: "Informe nome, assunto e conteúdo do template.",
      },
      { status: 400 }
    );
  }

  if (template.nome.length > 160 || template.assunto.length > 250) {
    return NextResponse.json(
      {
        ok: false,
        error: "Nome ou assunto excede o limite permitido.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("email_templates")
    .insert({
      empresa_id: acesso.usuario.empresa_id,
      escopo: "empresa",
      nome: template.nome,
      assunto: template.assunto,
      html: template.html,
      texto: template.texto,
      status: "ativo",
      criado_por_usuario_id: acesso.usuario.id,
    })
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

  return NextResponse.json(
    {
      ok: true,
      template: data,
      message: "Template criado com sucesso.",
    },
    { status: 201 }
  );
}
