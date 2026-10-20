
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { enviarPrimeiroAcesso } from "@/lib/auth/enviar-primeiro-acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import {
  contarLicencasUsadas,
} from "@/lib/white-label/acesso";
import { normalizarDominioWhiteLabel } from "@/lib/white-label/branding";
import {
  enviarWhiteLabelAsset,
  removerWhiteLabelAssetsPorCaminhos,
  validarWhiteLabelAsset,
} from "@/lib/white-label/assets";

const supabaseAdmin = getSupabaseAdmin();
const NICHO_PADRAO_ID = "10000000-0000-4000-8000-000000000001";

function criarSlug(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function emailValido(valor: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

async function validarAdministradorMestre() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) {
    return { ok: false as const, status: contexto.status, error: contexto.error };
  }

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

  return { ok: true as const, usuario: contexto.usuario };
}

export async function GET() {
  const acesso = await validarAdministradorMestre();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("white_labels")
    .select(
      "id, nome, slug, dominio, nome_produto, logo_url, favicon_url, cor_primaria, licencas_contratadas, valor_mensal_centavos, plano_padrao_id, empresa_gestora_id, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const administradores = data?.length
    ? await supabaseAdmin
        .from("white_label_administradores")
        .select("white_label_id, email, nome, status")
        .in(
          "white_label_id",
          data.map((item) => item.id)
        )
        .eq("status", "ativo")
    : { data: [], error: null };

  const itens = await Promise.all(
    (data ?? []).map(async (item) => {
      const usadas = await contarLicencasUsadas(item.id);
      const admin = administradores.data?.find(
        (registro) => registro.white_label_id === item.id
      );

      return {
        ...item,
        licencas_usadas: usadas,
        licencas_disponiveis: Math.max(item.licencas_contratadas - usadas, 0),
        administrador: admin
          ? { email: admin.email, nome: admin.nome }
          : null,
      };
    })
  );

  return NextResponse.json({ ok: true, white_labels: itens });
}

export async function POST(request: Request) {
  const acesso = await validarAdministradorMestre();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

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

  const nome = String(body?.nome || "").trim();
  const nomeProduto = String(body?.nome_produto || nome).trim();
  const dominio = normalizarDominioWhiteLabel(String(body?.dominio || ""));
  let logoUrl: string | null = null;
  let faviconUrl: string | null = null;
  const corPrimaria = String(body?.cor_primaria || "#0f509a").trim();
  const administradorNome = String(body?.administrador_nome || "").trim();
  const administradorEmail = String(body?.administrador_email || "")
    .trim()
    .toLowerCase();
  const administradorTelefone =
    String(body?.administrador_telefone || "").trim() || null;
  const licencasContratadas = Number(body?.licencas_contratadas || 5);
  const valorMensalCentavos = Number(body?.valor_mensal_centavos ?? 0);

  if (!nome || !nomeProduto || !dominio || !administradorNome) {
    return NextResponse.json(
      { ok: false, error: "Preencha marca, produto, domínio e responsável." },
      { status: 400 }
    );
  }

  const dominioValido =
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      dominio
    );

  if (!dominioValido) {
    return NextResponse.json(
      { ok: false, error: "Informe um domínio válido, por exemplo crm.marca.com.br." },
      { status: 400 }
    );
  }

  if (!emailValido(administradorEmail)) {
    return NextResponse.json(
      { ok: false, error: "Informe um e-mail válido para o administrador." },
      { status: 400 }
    );
  }

  const [{ data: usuarioComEmail }, { data: empresaComEmail }] =
    await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id")
        .ilike("email", administradorEmail)
        .limit(1),
      supabaseAdmin
        .from("empresas")
        .select("id")
        .ilike("email", administradorEmail)
        .limit(1),
    ]);

  if (usuarioComEmail?.length || empresaComEmail?.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Este e-mail já está vinculado a outro acesso. Use um e-mail exclusivo para o administrador White Label.",
      },
      { status: 409 }
    );
  }

  if (
    !Number.isInteger(licencasContratadas) ||
    licencasContratadas < 1 ||
    licencasContratadas > 10000
  ) {
    return NextResponse.json(
      { ok: false, error: "Quantidade de licenças inválida." },
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

  if (dominio === "crmprosperity.com" || dominio.endsWith(".vercel.app")) {
    return NextResponse.json(
      { ok: false, error: "Use o domínio próprio do parceiro." },
      { status: 400 }
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

  const slugBase = criarSlug(String(body?.slug || nome));
  if (!slugBase) {
    return NextResponse.json(
      { ok: false, error: "Não foi possível gerar o identificador da marca." },
      { status: 400 }
    );
  }

  const { data: conflito } = await supabaseAdmin
    .from("white_labels")
    .select("id")
    .or("slug.ilike." + slugBase + ",dominio.ilike." + dominio)
    .limit(1);

  if (conflito?.length) {
    return NextResponse.json(
      { ok: false, error: "Já existe um White Label com este domínio ou identificador." },
      { status: 409 }
    );
  }

  const agora = new Date().toISOString();
  const vencimentoTecnico = "2099-12-31T23:59:59.000Z";
  const bloqueioTecnico = "2100-01-07T23:59:59.000Z";

  const { data: whiteLabel, error: whiteLabelError } = await supabaseAdmin
    .from("white_labels")
    .insert({
      nome,
      slug: slugBase,
      dominio,
      nome_produto: nomeProduto,
      logo_url: null,
      favicon_url: null,
      cor_primaria: corPrimaria,
      licencas_contratadas: licencasContratadas,
      valor_mensal_centavos: valorMensalCentavos,
      plano_padrao_id: planoBasico.id,
      status: "ativo",
      updated_at: agora,
    })
    .select("id")
    .single();

  if (whiteLabelError || !whiteLabel) {
    return NextResponse.json(
      {
        ok: false,
        error: whiteLabelError?.message || "Não foi possível criar o White Label.",
      },
      { status: 500 }
    );
  }

  const caminhosUploads: string[] = [];

  try {
    if (logoArquivo) {
      const upload = await enviarWhiteLabelAsset({
        whiteLabelId: whiteLabel.id,
        arquivo: logoArquivo,
        tipo: "logo",
      });
      logoUrl = upload.url;
      caminhosUploads.push(upload.caminho);
    }

    if (faviconArquivo) {
      const upload = await enviarWhiteLabelAsset({
        whiteLabelId: whiteLabel.id,
        arquivo: faviconArquivo,
        tipo: "favicon",
      });
      faviconUrl = upload.url;
      caminhosUploads.push(upload.caminho);
    }

    if (logoUrl || faviconUrl) {
      const { error: brandingError } = await supabaseAdmin
        .from("white_labels")
        .update({
          logo_url: logoUrl,
          favicon_url: faviconUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", whiteLabel.id);

      if (brandingError) {
        throw new Error(brandingError.message);
      }
    }
  } catch (error) {
    await removerWhiteLabelAssetsPorCaminhos(caminhosUploads);
    await supabaseAdmin.from("white_labels").delete().eq("id", whiteLabel.id);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar a identidade visual.",
      },
      { status: 500 }
    );
  }

  const { data: empresaGestora, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .insert({
      plano_id: planoBasico.id,
      nicho_id: NICHO_PADRAO_ID,
      nome_fantasia: nome + " - Gestão",
      razao_social: nome,
      email: administradorEmail,
      telefone: administradorTelefone,
      nome_responsavel: administradorNome,
      status: "ativa",
      timezone: "America/Sao_Paulo",
      logo_url: logoUrl,
      observacoes: "Empresa gestora do White Label " + nome + ".",
      white_label_id: whiteLabel.id,
      white_label_tipo: "gestora",
      assinatura_status: "ativa",
      assinatura_inicio_em: agora,
      assinatura_vencimento_em: vencimentoTecnico,
      assinatura_bloqueio_em: bloqueioTecnico,
      assinatura_gateway: "white_label",
      assinatura_referencia: "white-label:" + whiteLabel.id,
      assinatura_metadata_json: {
        origem: "white_label",
        white_label_id: whiteLabel.id,
        tipo: "gestora",
        valor_mensal_centavos: valorMensalCentavos,
      },
    })
    .select("id")
    .single();

  if (empresaError || !empresaGestora) {
    await removerWhiteLabelAssetsPorCaminhos(caminhosUploads);
    await supabaseAdmin.from("white_labels").delete().eq("id", whiteLabel.id);

    return NextResponse.json(
      {
        ok: false,
        error: empresaError?.message || "Não foi possível criar a empresa gestora.",
      },
      { status: 500 }
    );
  }

  const atualizacao = await supabaseAdmin
    .from("white_labels")
    .update({
      empresa_gestora_id: empresaGestora.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", whiteLabel.id);

  if (atualizacao.error) {
    await removerWhiteLabelAssetsPorCaminhos(caminhosUploads);
    await supabaseAdmin.from("empresas").delete().eq("id", empresaGestora.id);
    await supabaseAdmin.from("white_labels").delete().eq("id", whiteLabel.id);

    return NextResponse.json(
      { ok: false, error: atualizacao.error.message },
      { status: 500 }
    );
  }

  const adminInsert = await supabaseAdmin
    .from("white_label_administradores")
    .insert({
      white_label_id: whiteLabel.id,
      email: administradorEmail,
      nome: administradorNome,
      status: "ativo",
    });

  if (adminInsert.error) {
    await removerWhiteLabelAssetsPorCaminhos(caminhosUploads);
    await supabaseAdmin.from("empresas").delete().eq("id", empresaGestora.id);
    await supabaseAdmin.from("white_labels").delete().eq("id", whiteLabel.id);

    return NextResponse.json(
      { ok: false, error: adminInsert.error.message },
      { status: 500 }
    );
  }

  let emailEnviado = true;
  let warning: string | null = null;

  try {
    await enviarPrimeiroAcesso({
      email: administradorEmail,
      nome: administradorNome,
      empresaId: empresaGestora.id,
      telefone: administradorTelefone,
    });
  } catch (error) {
    emailEnviado = false;
    warning =
      error instanceof Error
        ? "White Label criado, mas o e-mail de ativação falhou: " + error.message
        : "White Label criado, mas o e-mail de ativação falhou.";
  }

  return NextResponse.json(
    {
      ok: true,
      message: emailEnviado
        ? "White Label criado e convite do administrador enviado."
        : "White Label criado com aviso no envio do convite.",
      warning,
      white_label_id: whiteLabel.id,
      empresa_gestora_id: empresaGestora.id,
    },
    { status: 201 }
  );
}
