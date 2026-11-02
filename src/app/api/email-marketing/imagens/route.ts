import { NextResponse } from "next/server";
import { validarAcessoEmailMarketing } from "@/lib/email-marketing/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "email-marketing";
const LIMITE = 3 * 1024 * 1024;
const FORMATOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function assinaturaValida(buffer: Buffer, mime: string) {
  if (mime === "image/jpeg") return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/gif") return buffer.subarray(0, 6).toString("ascii") === "GIF89a" || buffer.subarray(0, 6).toString("ascii") === "GIF87a";
  if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export async function POST(request: Request) {
  const acesso = await validarAcessoEmailMarketing("email_marketing.templates");
  if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });
  if (!acesso.usuario.empresa_id) return NextResponse.json({ ok: false, error: "Empresa não identificada." }, { status: 403 });

  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("imagem");
  if (!(arquivo instanceof File)) return NextResponse.json({ ok: false, error: "Selecione uma imagem." }, { status: 400 });
  if (!FORMATOS[arquivo.type] || !arquivo.size || arquivo.size > LIMITE) {
    return NextResponse.json({ ok: false, error: "Envie JPG, PNG, WebP ou GIF de até 3 MB." }, { status: 400 });
  }
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  if (!assinaturaValida(buffer, arquivo.type)) {
    return NextResponse.json({ ok: false, error: "O conteúdo não corresponde a uma imagem válida." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const caminho = acesso.usuario.empresa_id + "/" + crypto.randomUUID() + "." + FORMATOS[arquivo.type];
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, buffer, {
    contentType: arquivo.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return NextResponse.json({ ok: false, error: "Não foi possível armazenar a imagem." }, { status: 500 });
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
