
import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { enviarPrimeiroAcesso } from "@/lib/auth/enviar-primeiro-acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buscarWhiteLabelAdminPorUsuario } from "@/lib/white-label/acesso";

const supabaseAdmin = getSupabaseAdmin();

async function obterAdmin() {
  const contexto = await getUsuarioContexto({ ignorarAcessoTemporario: true });

  if (!contexto.ok) return contexto;

  const admin =
    contexto.usuario.white_label_admin ||
    (await buscarWhiteLabelAdminPorUsuario(contexto.usuario));

  if (!admin) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "Acesso disponível apenas para administradores White Label.",
    };
  }

  return {
    ok: true as const,
    usuario: contexto.usuario,
    admin,
  };
}

export async function GET() {
  const acesso = await obterAdmin();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { admin } = acesso;
  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select(
      "id, nome_fantasia, razao_social, email, telefone, nome_responsavel, status, created_at, nicho_id, limite_integracoes_whatsapp, limite_total_numeros_whatsapp, limite_usuarios, nichos(nome, codigo)"
    )
    .eq("white_label_id", admin.white_label_id)
    .eq("white_label_tipo", "cliente")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const usadas = (data ?? []).filter(
    (empresa) => empresa.status !== "cancelada"
  ).length;

  return NextResponse.json({
    ok: true,
    white_label: {
      ...admin.white_label,
      licencas_usadas: usadas,
      licencas_disponiveis: Math.max(
        admin.white_label.licencas_contratadas - usadas,
        0
      ),
    },
    clientes: data ?? [],
  });
}

export async function POST(request: Request) {
  const acesso = await obterAdmin();

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { admin } = acesso;
  const body = await request.json().catch(() => null);
  const nomeFantasia = String(body?.nome_fantasia || "").trim();
  const razaoSocial = String(body?.razao_social || "").trim() || null;
  const email = String(body?.email || "").trim().toLowerCase();
  const telefone = String(body?.telefone || "").trim() || null;
  const nomeResponsavel = String(body?.nome_responsavel || "").trim();
  const timezone = String(body?.timezone || "America/Sao_Paulo").trim();

  if (!nomeFantasia || !email || !nomeResponsavel) {
    return NextResponse.json(
      {
        ok: false,
        error: "Preencha empresa, responsável e e-mail.",
      },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Informe um e-mail válido." },
      { status: 400 }
    );
  }

  const [{ data: usuarioComEmail }, { data: empresaComEmail }] =
    await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id")
        .ilike("email", email)
        .limit(1),
      supabaseAdmin
        .from("empresas")
        .select("id")
        .ilike("email", email)
        .limit(1),
    ]);

  if (usuarioComEmail?.length || empresaComEmail?.length) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Este e-mail já está vinculado a outro acesso do CRM. Use um e-mail exclusivo para este cliente.",
      },
      { status: 409 }
    );
  }

  const { count } = await supabaseAdmin
    .from("empresas")
    .select("id", { count: "exact", head: true })
    .eq("white_label_id", admin.white_label_id)
    .eq("white_label_tipo", "cliente")
    .neq("status", "cancelada");

  if ((count ?? 0) >= admin.white_label.licencas_contratadas) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Todas as licenças estão em uso. Adquira uma nova licença antes de cadastrar outro cliente.",
      },
      { status: 409 }
    );
  }

  const [
    { data: planoBasico, error: planoBasicoError },
    { data: nichoComercial, error: nichoComercialError },
  ] = await Promise.all([
    supabaseAdmin
      .from("planos")
      .select("id")
      .eq("slug", "basico")
      .eq("status", "ativo")
      .maybeSingle<{ id: string }>(),
    supabaseAdmin
      .from("nichos")
      .select("id")
      .eq("codigo", "comercio")
      .eq("ativo", true)
      .maybeSingle<{ id: string }>(),
  ]);

  if (planoBasicoError || !planoBasico) {
    return NextResponse.json(
      {
        ok: false,
        error: "O Plano Básico não está disponível. Verifique a configuração dos planos.",
      },
      { status: 500 }
    );
  }

  if (nichoComercialError || !nichoComercial) {
    return NextResponse.json(
      {
        ok: false,
        error: "O nicho Comercial não está disponível. Verifique a configuração de nichos.",
      },
      { status: 500 }
    );
  }

  const agora = new Date().toISOString();
  const { data: empresa, error } = await supabaseAdmin
    .from("empresas")
    .insert({
      plano_id: planoBasico.id,
      nicho_id: nichoComercial.id,
      nome_fantasia: nomeFantasia,
      razao_social: razaoSocial,
      email,
      telefone,
      nome_responsavel: nomeResponsavel,
      status: "ativa",
      timezone,
      logo_url: admin.white_label.logo_url,
      limite_integracoes_whatsapp: 1,
      limite_total_numeros_whatsapp: 6,
      limite_usuarios: 2,
      observacoes: "Cliente cadastrado pelo White Label " + admin.white_label.nome_marca + ".",
      white_label_id: admin.white_label_id,
      white_label_tipo: "cliente",
      assinatura_status: "ativa",
      assinatura_inicio_em: agora,
      assinatura_vencimento_em: null,
      assinatura_bloqueio_em: null,
      assinatura_gateway: "white_label_client",
      assinatura_referencia: null,
      assinatura_metadata_json: {
        origem: "white_label",
        white_label_id: admin.white_label_id,
        plano_slug: "basico",
        sem_mensalidade_propria: true,
        cobranca_responsavel: "white_label_gestora",
      },
    })
    .select("id, nome_fantasia, email, nome_responsavel")
    .single();

  if (error || !empresa) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Não foi possível cadastrar o cliente.",
      },
      { status: 500 }
    );
  }

  let emailEnviado = true;
  let warning: string | null = null;

  try {
    await enviarPrimeiroAcesso({
      email,
      nome: nomeResponsavel,
      empresaId: empresa.id,
      telefone,
    });
  } catch (emailError) {
    emailEnviado = false;
    warning =
      emailError instanceof Error
        ? "Cliente cadastrado, mas o e-mail de ativação falhou: " +
          emailError.message
        : "Cliente cadastrado, mas o e-mail de ativação falhou.";
  }

  return NextResponse.json(
    {
      ok: true,
      message: emailEnviado
        ? "Cliente cadastrado e e-mail de ativação enviado."
        : "Cliente cadastrado com aviso no envio do e-mail.",
      warning,
      cliente: empresa,
      email_enviado: emailEnviado,
    },
    { status: 201 }
  );
}
