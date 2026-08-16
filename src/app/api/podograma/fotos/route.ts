import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  PODOGRAMA_BUCKET_FOTOS,
  PODOGRAMA_FOTO_LIMITE_BYTES,
  PODOGRAMA_MOMENTOS_FOTO,
  valorPermitido,
} from "@/lib/podograma/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();
const MIMES_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXTENSAO_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

async function garantirAcessoFotos(
  permissoes: string[],
  empresaId: string,
) {
  if (!can(permissoes, "prontuarios.editar")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para editar o Podograma." },
        { status: 403 },
      ),
    };
  }

  const nicho = await buscarNichoEmpresa(empresaId);
  if (nicho.codigo !== "podologia") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Fotos do Podograma disponíveis apenas em Podologia." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

async function buscarMarcacao(
  empresaId: string,
  pacienteId: string,
  marcacaoId: string,
) {
  const { data, error } = await supabase
    .from("podograma_marcacoes")
    .select("id, paciente_id, pessoa_id")
    .eq("empresa_id", empresaId)
    .eq("paciente_id", pacienteId)
    .eq("id", marcacaoId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao localizar marcação: ${error.message}`);
  return data;
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;
  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoFotos(usuario.permissoes, usuario.empresa_id);
    if (!acesso.ok) return acesso.response;

    const formData = await request.formData();
    const arquivo = formData.get("arquivo");
    const pacienteId = texto(formData.get("paciente_id"));
    const marcacaoId = texto(formData.get("marcacao_id"));
    const momento = texto(formData.get("momento")) || "registro";
    const legenda = texto(formData.get("legenda")).slice(0, 500) || null;

    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Selecione uma foto clínica." },
        { status: 400 },
      );
    }

    if (!pacienteId || !marcacaoId) {
      return NextResponse.json(
        { ok: false, error: "Marcação do Podograma inválida." },
        { status: 400 },
      );
    }

    if (!MIMES_PERMITIDOS.has(arquivo.type)) {
      return NextResponse.json(
        { ok: false, error: "Formato não permitido. Use JPG, PNG ou WebP." },
        { status: 400 },
      );
    }

    if (arquivo.size <= 0 || arquivo.size > PODOGRAMA_FOTO_LIMITE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "A foto deve ter no máximo 10 MB." },
        { status: 400 },
      );
    }

    if (!valorPermitido(PODOGRAMA_MOMENTOS_FOTO, momento)) {
      return NextResponse.json(
        { ok: false, error: "Momento da foto inválido." },
        { status: 400 },
      );
    }

    const marcacao = await buscarMarcacao(usuario.empresa_id, pacienteId, marcacaoId);
    if (!marcacao) {
      return NextResponse.json(
        { ok: false, error: "Marcação do Podograma não encontrada." },
        { status: 404 },
      );
    }

    const extensao = EXTENSAO_POR_MIME[arquivo.type] ?? "bin";
    const storagePath = `${usuario.empresa_id}/${pacienteId}/${marcacaoId}/${randomUUID()}.${extensao}`;
    const buffer = Buffer.from(await arquivo.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(PODOGRAMA_BUCKET_FOTOS)
      .upload(storagePath, buffer, {
        contentType: arquivo.type,
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(`Erro ao enviar foto clínica: ${uploadError.message}`);
    }

    const { data: foto, error: insertError } = await supabase
      .from("podograma_fotos")
      .insert({
        empresa_id: usuario.empresa_id,
        paciente_id: pacienteId,
        marcacao_id: marcacaoId,
        storage_path: storagePath,
        nome_original: arquivo.name || `foto.${extensao}`,
        mime_type: arquivo.type,
        tamanho_bytes: arquivo.size,
        momento,
        legenda,
        created_by: usuario.id,
      })
      .select(
        "id, empresa_id, paciente_id, marcacao_id, storage_path, nome_original, mime_type, tamanho_bytes, momento, legenda, created_at",
      )
      .single();

    if (insertError) {
      await supabase.storage.from(PODOGRAMA_BUCKET_FOTOS).remove([storagePath]);
      throw new Error(`Erro ao registrar foto clínica: ${insertError.message}`);
    }

    const { data: signed } = await supabase.storage
      .from(PODOGRAMA_BUCKET_FOTOS)
      .createSignedUrl(storagePath, 60 * 60);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "podograma",
      entidade_id: marcacaoId,
      acao: "foto_adicionada",
      descricao: "Foto clínica adicionada ao Podograma",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        paciente_id: pacienteId,
        pessoa_id: marcacao.pessoa_id,
        foto_id: foto.id,
        momento,
        mime_type: arquivo.type,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Foto clínica adicionada.",
      foto: { ...foto, url: signed?.signedUrl ?? null },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao enviar foto clínica.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;
  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoFotos(usuario.permissoes, usuario.empresa_id);
    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const fotoId = texto(searchParams.get("id"));
    const pacienteId = texto(searchParams.get("paciente_id"));

    if (!fotoId || !pacienteId) {
      return NextResponse.json({ ok: false, error: "Foto inválida." }, { status: 400 });
    }

    const { data: foto, error: fotoError } = await supabase
      .from("podograma_fotos")
      .select("id, marcacao_id, storage_path")
      .eq("empresa_id", usuario.empresa_id)
      .eq("paciente_id", pacienteId)
      .eq("id", fotoId)
      .maybeSingle();

    if (fotoError) throw new Error(`Erro ao localizar foto: ${fotoError.message}`);
    if (!foto) {
      return NextResponse.json({ ok: false, error: "Foto não encontrada." }, { status: 404 });
    }

    const { error: storageError } = await supabase.storage
      .from(PODOGRAMA_BUCKET_FOTOS)
      .remove([foto.storage_path]);

    if (storageError) throw new Error(`Erro ao remover arquivo: ${storageError.message}`);

    const { error: deleteError } = await supabase
      .from("podograma_fotos")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .eq("paciente_id", pacienteId)
      .eq("id", fotoId);

    if (deleteError) throw new Error(`Erro ao remover foto: ${deleteError.message}`);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "podograma",
      entidade_id: foto.marcacao_id,
      acao: "foto_removida",
      descricao: "Foto clínica removida do Podograma",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: { paciente_id: pacienteId, foto_id: fotoId },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({ ok: true, message: "Foto removida." });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno ao remover foto.",
      },
      { status: 400 },
    );
  }
}
