
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import { contarLicencasUsadas } from "@/lib/white-label/acesso";
import { normalizarDominioWhiteLabel } from "@/lib/white-label/branding";
import {
  enviarWhiteLabelAsset,
  removerWhiteLabelAssetPorUrl,
  removerWhiteLabelAssetsPorCaminhos,
  validarWhiteLabelAsset,
} from "@/lib/white-label/assets";

const supabaseAdmin = getSupabaseAdmin();

async function validarAdministradorMestre() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });
  if (!contexto.ok) return contexto;

  const permitido = await can(
    contexto.usuario.id,
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!permitido) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Sem permissão para gerenciar White Labels.",
    };
  }

  return contexto;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await validarAdministradorMestre();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;
  const contentType = request.headers.get("content-type") || "";
  let body: Record<string, unknown> | null = null;
  let logoArquivo: File | null = null;
  let faviconArquivo: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = Object.fromEntries(
      Array.from(formData.entries()).filter(([, valor]) => typeof valor === "string")
    );
    const logoEntrada = formData.get("logo");
    const faviconEntrada = formData.get("favicon");
    logoArquivo =
      logoEntrada && typeof logoEntrada !== "string" && logoEntrada.size > 0
        ? logoEntrada
        : null;
    faviconArquivo =
      faviconEntrada &&
      typeof faviconEntrada !== "string" &&
      faviconEntrada.size > 0
        ? faviconEntrada
        : null;
  } else {
    body = await request.json().catch(() => null);
  }

  try {
    validarWhiteLabelAsset(logoArquivo, "logo");
    validarWhiteLabelAsset(faviconArquivo, "favicon");
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Arquivo inválido.",
      },
      { status: 400 }
    );
  }

  const licencas = Number(body?.licencas_contratadas);
  const valorMensalCentavos = Number(body?.valor_mensal_centavos ?? 0);
  const dominio = normalizarDominioWhiteLabel(String(body?.dominio || ""));
  const nome = String(body?.nome || "").trim();
  const nomeProduto = String(body?.nome_produto || "").trim();
  const logoUrlLegado = String(body?.logo_url || "").trim() || null;
  const faviconUrlLegado = String(body?.favicon_url || "").trim() || null;
  const corPrimaria = String(body?.cor_primaria || "#0f509a").trim();
  const status = body?.status === "inativo" ? "inativo" : "ativo";

  if (
    !id ||
    !nome ||
    !nomeProduto ||
    !dominio ||
    !Number.isInteger(licencas) ||
    licencas < 1
  ) {
    return NextResponse.json(
      { ok: false, error: "Dados do White Label inválidos." },
      { status: 400 }
    );
  }

  if (
    !Number.isInteger(valorMensalCentavos) ||
    valorMensalCentavos < 0 ||
    valorMensalCentavos > 100_000_000
  ) {
    return NextResponse.json(
      { ok: false, error: "Valor mensal do White Label inválido." },
      { status: 400 }
    );
  }

  const dominioValido =
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      dominio
    );

  if (
    !dominioValido ||
    dominio === "crmprosperity.com" ||
    dominio.endsWith(".vercel.app")
  ) {
    return NextResponse.json(
      { ok: false, error: "Informe um domínio próprio válido para o White Label." },
      { status: 400 }
    );
  }

  const usadas = await contarLicencasUsadas(id);
  if (licencas < usadas) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "O White Label possui " +
          usadas +
          " licenças em uso. Cancele clientes antes de reduzir este limite.",
      },
      { status: 409 }
    );
  }

  const { data: planoBasico, error: planoBasicoError } = await supabaseAdmin
    .from("planos")
    .select("id")
    .eq("slug", "basico")
    .eq("status", "ativo")
    .maybeSingle<{ id: string }>();

  if (planoBasicoError || !planoBasico) {
    return NextResponse.json(
      {
        ok: false,
        error: "O Plano Básico não está disponível. Verifique a configuração dos planos.",
      },
      { status: 500 }
    );
  }

  const { data: conflito } = await supabaseAdmin
    .from("white_labels")
    .select("id")
    .ilike("dominio", dominio)
    .neq("id", id)
    .limit(1);

  if (conflito?.length) {
    return NextResponse.json(
      { ok: false, error: "Este domínio já está vinculado a outro White Label." },
      { status: 409 }
    );
  }

  const { data: atual, error: atualError } = await supabaseAdmin
    .from("white_labels")
    .select("logo_url, favicon_url, empresa_gestora_id")
    .eq("id", id)
    .maybeSingle<{
      logo_url: string | null;
      favicon_url: string | null;
      empresa_gestora_id: string | null;
    }>();

  if (atualError || !atual) {
    return NextResponse.json(
      { ok: false, error: atualError?.message || "White Label não encontrado." },
      { status: atualError ? 500 : 404 }
    );
  }

  let logoUrl = atual.logo_url || logoUrlLegado;
  let faviconUrl = atual.favicon_url || faviconUrlLegado;
  const caminhosNovos: string[] = [];

  try {
    if (logoArquivo) {
      const upload = await enviarWhiteLabelAsset({
        whiteLabelId: id,
        arquivo: logoArquivo,
        tipo: "logo",
      });
      logoUrl = upload.url;
      caminhosNovos.push(upload.caminho);
    }

    if (faviconArquivo) {
      const upload = await enviarWhiteLabelAsset({
        whiteLabelId: id,
        arquivo: faviconArquivo,
        tipo: "favicon",
      });
      faviconUrl = upload.url;
      caminhosNovos.push(upload.caminho);
    }
  } catch (error) {
    await removerWhiteLabelAssetsPorCaminhos(caminhosNovos);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível enviar a identidade visual.",
      },
      { status: 500 }
    );
  }

  const { error } = await supabaseAdmin
    .from("white_labels")
    .update({
      nome,
      nome_produto: nomeProduto,
      dominio,
      logo_url: logoUrl,
      favicon_url: faviconUrl,
      cor_primaria: corPrimaria,
      licencas_contratadas: licencas,
      valor_mensal_centavos: valorMensalCentavos,
      plano_padrao_id: planoBasico.id,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    await removerWhiteLabelAssetsPorCaminhos(caminhosNovos);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  if (logoArquivo && atual.logo_url && atual.logo_url !== logoUrl) {
    await removerWhiteLabelAssetPorUrl(atual.logo_url);
  }

  if (faviconArquivo && atual.favicon_url && atual.favicon_url !== faviconUrl) {
    await removerWhiteLabelAssetPorUrl(atual.favicon_url);
  }

  if (logoArquivo && atual.empresa_gestora_id) {
    const { error: gestoraError } = await supabaseAdmin
      .from("empresas")
      .update({ logo_url: logoUrl })
      .eq("id", atual.empresa_gestora_id);

    if (gestoraError) {
      console.error("[WHITE LABEL] Falha ao sincronizar logo da gestora:", gestoraError);
    }
  }

  return NextResponse.json({
    ok: true,
    message: "White Label atualizado com sucesso.",
  });
}
