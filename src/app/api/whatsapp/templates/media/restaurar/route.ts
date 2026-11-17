import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/frontend";
import { usuarioPodeAcessarIntegracaoWhatsapp } from "@/lib/whatsapp/integracoes-multiplas";
import { atribuirUrlImagemTemplate } from "@/lib/whatsapp/template-media-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_VALIDOS = new Set(["image/png", "image/jpeg"]);
const LIMITE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const auth = await getUsuarioContexto();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    const usuario = auth.usuario;
    if (!usuario.empresa_id) {
      return NextResponse.json({ ok: false, error: "Usuário sem empresa." }, { status: 400 });
    }
    if (
      !can(usuario.permissoes, "whatsapp_templates.criar") &&
      !can(usuario.permissoes, "whatsapp_templates.sincronizar")
    ) {
      return NextResponse.json({ ok: false, error: "Sem permissão para restaurar imagens de templates." }, { status: 403 });
    }

    const form = await req.formData();
    const templateId = String(form.get("template_id") || "").trim();
    const arquivo = form.get("file");
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) {
      return NextResponse.json({ ok: false, error: "Template inválido." }, { status: 400 });
    }
    if (!(arquivo instanceof File) || arquivo.size === 0 || arquivo.size > LIMITE_BYTES ||
        !MIME_VALIDOS.has(String(arquivo.type || "").toLowerCase())) {
      return NextResponse.json({ ok: false, error: "Envie uma imagem JPG ou PNG de até 5 MB." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: template, error: erroConsulta } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("id, empresa_id, integracao_whatsapp_id, meta_template_id, payload")
      .eq("id", templateId)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (erroConsulta || !template) {
      return NextResponse.json({ ok: false, error: "Template não encontrado." }, { status: 404 });
    }

    const permitido = await usuarioPodeAcessarIntegracaoWhatsapp({
      usuario,
      empresaId: usuario.empresa_id,
      integracaoId: template.integracao_whatsapp_id,
    });
    if (!permitido) {
      return NextResponse.json({ ok: false, error: "Sem acesso à integração WhatsApp." }, { status: 403 });
    }

    const payload = template.payload as { components?: Array<{ type?: string; format?: string }> } | null;
    if (!payload?.components?.some((item) =>
      String(item.type || "").toUpperCase() === "HEADER" &&
      String(item.format || "").toUpperCase() === "IMAGE"
    )) {
      return NextResponse.json({ ok: false, error: "Este template não utiliza cabeçalho com imagem." }, { status: 400 });
    }

    const extensao = arquivo.type === "image/png" ? "png" : "jpg";
    const caminho = [
      "whatsapp-templates",
      usuario.empresa_id,
      template.integracao_whatsapp_id,
      "restored",
      `${template.id}-${randomUUID()}.${extensao}`,
    ].join("/");

    const { error: erroUpload } = await supabaseAdmin.storage
      .from("midias")
      .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), {
        contentType: arquivo.type,
        cacheControl: "3600",
        upsert: false,
      });
    if (erroUpload) {
      throw new Error(`Não foi possível armazenar a imagem: ${erroUpload.message}`);
    }

    const imagemUrl = supabaseAdmin.storage.from("midias").getPublicUrl(caminho).data.publicUrl;
    const { error: erroAtualizacao } = await supabaseAdmin.from("whatsapp_templates")
      .update({ payload: atribuirUrlImagemTemplate(template.payload, imagemUrl) })
      .eq("id", template.id)
      .eq("empresa_id", usuario.empresa_id);
    if (erroAtualizacao) {
      throw new Error(`Não foi possível vincular a imagem ao template: ${erroAtualizacao.message}`);
    }

    return NextResponse.json({ ok: true, preview_url: imagemUrl });
  } catch (error) {
    console.error("[TEMPLATES] Falha ao restaurar imagem:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível restaurar a imagem." },
      { status: 500 }
    );
  }
}
