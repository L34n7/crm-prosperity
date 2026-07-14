import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  podeCriarUsuarios,
  podeEditarUsuarios,
  podeVisualizarUsuarios,
} from "@/lib/auth/authorization";
import { can } from "@/lib/permissoes/frontend";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  buscarSetorPrincipalDoUsuario,
  definirSetoresDoUsuario,
  listarIdsSetoresDoUsuario,
} from "@/lib/usuarios/setores";
import { definirPerfilDinamicoPorIdDoUsuario } from "@/lib/permissoes/sync-usuarios-perfis";
import {
  obterLimitesPlanoPorIdentificador,
} from "@/lib/planos/limites";

const supabaseAdmin = getSupabaseAdmin();
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type UsuarioPayload = {
  nome?: string;
  email?: string;
  perfil_empresa_id?: string | null;
  setor_ids?: string[] | null;
  setor_principal_id?: string | null;
  telefone?: string | null;
};

type PerfilDinamicoRow = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo?: boolean;
};

type UsuarioPerfilRow = {
  perfil_empresa_id: string;
  perfis_empresa: PerfilDinamicoRow | PerfilDinamicoRow[] | null;
};

type PlanoRelacionadoRow = {
  id?: string;
  nome?: string | null;
  slug?: string | null;
  limite_usuarios?: number | null;
};

type PlanoEmpresaRow = {
  id: string;
  limite_usuarios?: number | null;
  planos: PlanoRelacionadoRow | PlanoRelacionadoRow[] | null;
};

type EmpresaConviteRow = {
  nome_fantasia?: string | null;
  razao_social?: string | null;
};

function escaparHtml(valor: string) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textoCabecalhoSeguro(valor: string) {
  return String(valor || "")
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function buscarNomeEmpresaConvite(empresaId: string) {
  const { data, error } = await supabaseAdmin
    .from("empresas")
    .select("nome_fantasia, razao_social")
    .eq("id", empresaId)
    .maybeSingle<EmpresaConviteRow>();

  if (error) {
    throw new Error(`Erro ao buscar empresa do convite: ${error.message}`);
  }

  return (
    String(data?.nome_fantasia || "").trim() ||
    String(data?.razao_social || "").trim() ||
    "sua empresa"
  );
}

async function enviarEmailConviteUsuario(params: {
  email: string;
  nome: string;
  empresaNome: string;
  link: string;
}) {
  if (!resend) {
    throw new Error("Envio de email nao configurado.");
  }

  const empresaCabecalho =
    textoCabecalhoSeguro(params.empresaNome) || "sua empresa";

  const { error } = await resend.emails.send({
    from: "CRM Prosperity <no-reply@crmprosperity.com>",
    to: params.email,
    subject: `Convite para acessar ${empresaCabecalho} no CRM Prosperity`,
    text: [
      `Ola, ${params.nome}.`,
      `${params.empresaNome} convidou voce para acessar o ambiente da empresa no CRM Prosperity.`,
      "Para aceitar o convite, crie sua senha pelo link abaixo:",
      params.link,
      "Se voce nao esperava este convite, pode ignorar este email.",
    ].join("\n"),
    html: getConviteUsuarioTemplate({
      nome: params.nome,
      empresaNome: params.empresaNome,
      link: params.link,
    }),
  });

  if (error) {
    console.error("[USUARIOS_CONVITE_EMAIL] Erro ao enviar email:", error);
    throw new Error("Erro ao enviar email de convite.");
  }
}

function getConviteUsuarioTemplate({
  nome,
  empresaNome,
  link,
}: {
  nome: string;
  empresaNome: string;
  link: string;
}) {
  const siteUrlBruto =
    process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com";
  const siteUrl =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(siteUrlBruto)
      ? "https://crmprosperity.com"
      : siteUrlBruto.replace(/\/$/, "");
  const logoUrl = `${siteUrl}/logo.png`;
  const nomeSeguro = escaparHtml(nome || "colaborador");
  const empresaSeguro = escaparHtml(empresaNome || "sua empresa");
  const linkSeguro = escaparHtml(link);

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Convite de acesso</title>
    </head>

    <body style="margin:0; padding:0; background:#eef3ff; font-family:Arial, Helvetica, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef3ff; padding:40px 16px;">
        <tr>
          <td align="center">

            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px; background:#ffffff; border-radius:24px; overflow:hidden; box-shadow:0 20px 60px rgba(15, 23, 42, 0.14);">

              <tr>
                <td style="
                  background: linear-gradient(135deg, #04254d 0%, #0b1526 25%, #0b1526 75%, #082d29 100%);
                  padding: 34px 32px 38px 32px;
                  text-align: center;
                  position: relative;
                ">

                  <div style="
                    position:absolute;
                    inset:0;
                    background:
                      radial-gradient(circle at top left, rgba(59,130,246,0.18), transparent 40%),
                      radial-gradient(circle at bottom right, rgba(16,185,129,0.12), transparent 40%);
                    opacity:0.6;
                  "></div>

                  <div style="position:relative; z-index:1;">

                    <img
                      src="${logoUrl}"
                      alt="CRM Prosperity"
                      width="96"
                      style="display:block; margin:0 auto 18px auto; max-width:96px; height:auto;"
                    />

                    <h1 style="margin:0; color:#ffffff; font-size:25px; line-height:1.3; font-weight:700;">
                      Convite para acessar ${empresaSeguro}
                    </h1>

                    <p style="margin:10px 0 0 0; color:#cbd5f5; font-size:15px; line-height:1.6;">
                      Acesse o ambiente da empresa e crie sua senha de acesso.
                    </p>

                  </div>

                </td>
              </tr>

              <tr>
                <td style="padding:40px 34px 32px 34px;">
                  <p style="margin:0 0 18px 0; color:#0f172a; font-size:18px; line-height:1.6; font-weight:700;">
                    Ol&aacute;, ${nomeSeguro}!
                  </p>

                  <p style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Voc&ecirc; recebeu um convite para colaborar com a equipe da <strong>${empresaSeguro}</strong>.
                  </p>

                  <p style="margin:0 0 18px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Para aceitar o convite, clique no bot&atilde;o abaixo e crie sua senha com seguran&ccedil;a.
                  </p>

                  <p style="margin:0 0 28px 0; color:#475569; font-size:15px; line-height:1.7;">
                    Ap&oacute;s concluir o cadastro, voc&ecirc; poder&aacute; acessar o ambiente da empresa de acordo com as permiss&otilde;es definidas pela <strong>${empresaSeguro}</strong>.
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px 0;">
                        <a
                          href="${linkSeguro}"
                          style="display:inline-block; background: linear-gradient(135deg, #0f509a 10%, #0b2551 100%); color:#ffffff; text-decoration:none; padding:16px 30px; border-radius:999px; font-size:15px; font-weight:700; box-shadow:0 10px 24px rgba(37,99,235,0.35);"
                        >
                          Aceitar convite e criar senha
                        </a>
                      </td>
                    </tr>
                  </table>

                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:18px 20px; margin-bottom:26px;">
                    <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6;">
                      Se o bot&atilde;o n&atilde;o funcionar, copie e cole este link no seu navegador:
                    </p>

                    <p style="margin:10px 0 0 0; color:#0b5ebd; font-size:12px; line-height:1.6; word-break:break-all;">
                      ${linkSeguro}
                    </p>
                  </div>

                  <p style="margin:0; color:#64748b; font-size:13px; line-height:1.7;">
                    Se voc&ecirc; n&atilde;o reconhece este convite, pode ignorar este email com seguran&ccedil;a.
                  </p>
                </td>
              </tr>

              <tr>
                <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:24px 32px; text-align:center;">
                  <p style="margin:0 0 8px 0; color:#0f172a; font-size:14px; font-weight:700;">
                    CRM Prosperity
                  </p>

                  <p style="margin:0; color:#94a3b8; font-size:12px; line-height:1.6;">
                    &copy; ${new Date().getFullYear()} CRM Prosperity. Todos os direitos reservados.
                  </p>
                </td>
              </tr>

            </table>

          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function normalizarSetoresEntrada(body: UsuarioPayload) {
  const setorIdsBrutos = Array.isArray(body?.setor_ids) ? body.setor_ids : [];
  const setorPrincipalInformado = body?.setor_principal_id ?? null;

  const setorIds = Array.from(
    new Set(
      setorIdsBrutos
        .filter(Boolean)
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );

  const setorPrincipalId =
    setorPrincipalInformado && setorIds.includes(setorPrincipalInformado)
      ? setorPrincipalInformado
      : setorIds[0] ?? null;

  return {
    setorIds,
    setorPrincipalId,
  };
}

async function validarSetoresDaEmpresa(empresaId: string, setorIds: string[]) {
  if (setorIds.length === 0) {
    return { ok: true as const };
  }

  const { data, error } = await supabaseAdmin
    .from("setores")
    .select("id, empresa_id")
    .in("id", setorIds);

  if (error) {
    return {
      ok: false as const,
      error: `Erro ao validar setores: ${error.message}`,
      status: 500 as const,
    };
  }

  const setores = data ?? [];

  if (setores.length !== setorIds.length) {
    return {
      ok: false as const,
      error: "Um ou mais setores não foram encontrados",
      status: 404 as const,
    };
  }

  const existeSetorDeOutraEmpresa = setores.some(
    (setor) => setor.empresa_id !== empresaId
  );

  if (existeSetorDeOutraEmpresa) {
    return {
      ok: false as const,
      error: "Um ou mais setores não pertencem à empresa selecionada",
      status: 400 as const,
    };
  }

  return { ok: true as const };
}

async function perfilEhAdministrador(params: {
  empresaId: string;
  perfilEmpresaId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id, nome")
    .eq("id", params.perfilEmpresaId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar perfil: ${error.message}`);
  }

  return data?.nome === "Administrador";
}

function normalizarPerfisDinamicos(rows: UsuarioPerfilRow[] | null | undefined) {
  return (rows ?? [])
    .map((item) => {
      const perfil = Array.isArray(item.perfis_empresa)
        ? item.perfis_empresa[0]
        : item.perfis_empresa;

      if (!perfil) return null;

      return {
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao ?? null,
        ativo: perfil.ativo,
      };
    })
    .filter(Boolean);
}

function obterLimitesPlanoEmpresa(plano: PlanoEmpresaRow["planos"]) {
  const planoNormalizado = Array.isArray(plano) ? plano[0] : plano;

  if (!planoNormalizado) return null;

  return (
    obterLimitesPlanoPorIdentificador(planoNormalizado.slug) ??
    obterLimitesPlanoPorIdentificador(planoNormalizado.nome)
  );
}

function obterPlanoRelacionado(plano: PlanoEmpresaRow["planos"]) {
  return Array.isArray(plano) ? plano[0] ?? null : plano;
}

async function validarLimiteUsuariosDoPlano(empresaId: string) {
  const { data: empresaData, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .select(
      `
      id,
      limite_usuarios,
      planos (
        id,
        nome,
        slug,
        limite_usuarios
      )
    `
    )
    .eq("id", empresaId)
    .maybeSingle();

  if (empresaError) {
    return {
      ok: false as const,
      error: `Erro ao validar limite de usuários: ${empresaError.message}`,
      status: 500 as const,
    };
  }

  if (!empresaData) {
    return {
      ok: false as const,
      error: "Empresa não encontrada",
      status: 404 as const,
    };
  }

  const empresa = empresaData as PlanoEmpresaRow;
  const planoRelacionado = obterPlanoRelacionado(empresa.planos);

  const limitesFixosDoCodigo = obterLimitesPlanoEmpresa(empresa.planos);

  const limiteUsuariosDoPlano =
    planoRelacionado?.limite_usuarios ??
    limitesFixosDoCodigo?.limiteUsuarios ??
    null;

  const limiteUsuariosEfetivo =
    empresa.limite_usuarios ??
    limiteUsuariosDoPlano;

  /*
   * Se nenhum limite foi definido no banco nem no código,
   * permite criar o usuário.
   */
  if (limiteUsuariosEfetivo === null) {
    return {
      ok: true as const,
      limiteUsuariosEfetivo: null,
      limiteUsuariosDoPlano,
      limiteUsuariosPersonalizado: empresa.limite_usuarios ?? null,
    };
  }

  const { count, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("status", "ativo");

  if (usuariosError) {
    return {
      ok: false as const,
      error: `Erro ao contar usuários ativos: ${usuariosError.message}`,
      status: 500 as const,
    };
  }

  const quantidadeUsuariosAtivos = count ?? 0;

  if (quantidadeUsuariosAtivos >= limiteUsuariosEfetivo) {
    const usaLimitePersonalizado =
      empresa.limite_usuarios !== null &&
      empresa.limite_usuarios !== undefined;

    return {
      ok: false as const,
      error: usaLimitePersonalizado
        ? `Limite de usuários atingido. Esta empresa permite no máximo ${limiteUsuariosEfetivo} usuários ativos.`
        : `Limite do plano atingido. O plano atual permite no máximo ${limiteUsuariosEfetivo} usuários ativos.`,
      status: 403 as const,
    };
  }

  return {
    ok: true as const,
    limiteUsuariosEfetivo,
    limiteUsuariosDoPlano,
    limiteUsuariosPersonalizado: empresa.limite_usuarios ?? null,
  };
}

export async function GET() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  

  if (!(await podeVisualizarUsuarios(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para listar usuários" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios")
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      status,
      telefone,
      avatar_url,
      ultimo_acesso,
      empresa_id,
      created_at,
      updated_at
    `)
    .eq("empresa_id", usuario.empresa_id)
    .order("nome", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const usuariosBase = data ?? [];
  const { data: empresaData, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .select(
      `
      id,
      limite_usuarios,
      planos (
        id,
        nome,
        slug,
        limite_usuarios
      )
    `
    )
    .eq("id", usuario.empresa_id)
    .maybeSingle();

  if (empresaError) {
    return NextResponse.json(
      { ok: false, error: `Erro ao carregar plano da empresa: ${empresaError.message}` },
      { status: 500 }
    );
  }

  const empresa = empresaData
    ? (empresaData as PlanoEmpresaRow)
    : null;

  const planoRelacionado = empresa
    ? obterPlanoRelacionado(empresa.planos)
    : null;

  const limitesFixosDoCodigo = empresa
    ? obterLimitesPlanoEmpresa(empresa.planos)
    : null;

  const limiteUsuariosDoPlano =
    planoRelacionado?.limite_usuarios ??
    limitesFixosDoCodigo?.limiteUsuarios ??
    null;

  const limiteUsuariosPersonalizado =
    empresa?.limite_usuarios ?? null;

  const limiteUsuariosEfetivo =
    limiteUsuariosPersonalizado ??
    limiteUsuariosDoPlano;

  const quantidadeUsuariosAtivos = usuariosBase.filter(
    (item) => item.status === "ativo"
  ).length;

  const usuariosEnriquecidos = await Promise.all(
    usuariosBase.map(async (item) => {
      const [setoresIds, setorPrincipal, perfisUsuarioResult] = await Promise.all([
        listarIdsSetoresDoUsuario(item.id),
        buscarSetorPrincipalDoUsuario(item.id),
        supabaseAdmin
          .from("usuarios_perfis")
          .select(`
            perfil_empresa_id,
            perfis_empresa (
              id,
              nome,
              descricao,
              ativo
            )
          `)
          .eq("usuario_id", item.id),
      ]);

      const perfis_dinamicos = normalizarPerfisDinamicos(
        (perfisUsuarioResult.data ?? []) as UsuarioPerfilRow[]
      );

      return {
        ...item,
        setor_principal_id: setorPrincipal?.setor_id ?? null,
        setor_ids: setoresIds,
        usuarios_setores: setoresIds.map((setorId) => ({
          usuario_id: item.id,
          setor_id: setorId,
        })),
        perfis_dinamicos,
        perfil_dinamico_principal: perfis_dinamicos[0] ?? null,
      };
    })
  );

  const usuarioPodeEditarOutros = await podeEditarUsuarios(usuario);

  const usuariosFiltrados = usuarioPodeEditarOutros
    ? usuariosEnriquecidos
    : usuariosEnriquecidos.filter((item) => item.id === usuario.id);

  return NextResponse.json({
    ok: true,
    usuarios: usuariosFiltrados,
    quantidade_usuarios_ativos: quantidadeUsuariosAtivos,

    // Limite original definido pelo plano.
    limite_usuarios_plano: limiteUsuariosDoPlano,

    // Limite especial definido diretamente para esta empresa.
    limite_usuarios_personalizado: limiteUsuariosPersonalizado,

    // Limite que realmente deve aparecer e ser utilizado.
    limite_usuarios_efetivo: limiteUsuariosEfetivo,
  });
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!(await podeCriarUsuarios(usuario))) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para criar usuários" },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as UsuarioPayload;
  const auditMeta = getRequestAuditMetadata(request);

  const nome = body?.nome?.trim();
  const email = body?.email?.trim()?.toLowerCase();
  const perfil_empresa_id = body?.perfil_empresa_id || null;
  const telefone = body?.telefone?.trim() || null;

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Nome é obrigatório" },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Email é obrigatório" },
      { status: 400 }
    );
  }

  if (!perfil_empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Perfil dinâmico é obrigatório" },
      { status: 400 }
    );
  }

  const promovendoAdministrador = await perfilEhAdministrador({
    empresaId: usuario.empresa_id,
    perfilEmpresaId: perfil_empresa_id,
  });

  if (
    promovendoAdministrador &&
    !can(usuario.permissoes, "usuarios.promover_admin")
  ) {
    return NextResponse.json(
      { ok: false, error: "Sem permissao para promover usuario a administrador" },
      { status: 403 }
    );
  }

  const { data: usuarioExistente } = await supabaseAdmin
    .from("usuarios")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (usuarioExistente) {
    return NextResponse.json(
      { ok: false, error: "Já existe um usuário com esse email" },
      { status: 409 }
    );
  }

  const validacaoLimitePlano = await validarLimiteUsuariosDoPlano(
    usuario.empresa_id
  );

  if (!validacaoLimitePlano.ok) {
    return NextResponse.json(
      { ok: false, error: validacaoLimitePlano.error },
      { status: validacaoLimitePlano.status }
    );
  }

  const setoresEntrada = normalizarSetoresEntrada(body);
  const setorIds = promovendoAdministrador ? [] : setoresEntrada.setorIds;
  const setorPrincipalId = promovendoAdministrador
    ? null
    : setoresEntrada.setorPrincipalId;

  const validacaoSetores = await validarSetoresDaEmpresa(
    usuario.empresa_id,
    setorIds
  );

  if (!validacaoSetores.ok) {
    return NextResponse.json(
      { ok: false, error: validacaoSetores.error },
      { status: validacaoSetores.status }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://crmprosperity.com";

  const redirectTo = `${siteUrl}/auth/callback?next=/definir-senha`;

  if (!resend) {
    return NextResponse.json(
      { ok: false, error: "Envio de email nao configurado." },
      { status: 500 }
    );
  }

  let empresaNome: string;

  try {
    empresaNome = await buscarNomeEmpresaConvite(usuario.empresa_id);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar empresa do convite.",
      },
      { status: 500 }
    );
  }

  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo,
        data: {
          nome,
          empresa_id: usuario.empresa_id,
          telefone,
        },
      },
    });

  if (inviteError) {
    return NextResponse.json(
      { ok: false, error: inviteError.message },
      { status: 500 }
    );
  }

  const authUserId = inviteData.user?.id;

  if (!authUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Convite enviado, mas o auth_user_id não foi retornado",
      },
      { status: 500 }
    );
  }

  const inviteLink = inviteData.properties?.action_link;

  if (!inviteLink) {
    return NextResponse.json(
      {
        ok: false,
        error: "Nao foi possivel gerar o link do convite",
      },
      { status: 500 }
    );
  }

  try {
    await enviarEmailConviteUsuario({
      email,
      nome,
      empresaNome,
      link: inviteLink,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao enviar email de convite.",
      },
      { status: 500 }
    );
  }

  const setorPrincipalFinal = setorPrincipalId ?? null;

  const { data: novoUsuario, error } = await supabaseAdmin
    .from("usuarios")
    .insert([
      {
        empresa_id: usuario.empresa_id,
        auth_user_id: authUserId,
        nome,
        email,
        status: "ativo",
        telefone,
      },
    ])
    .select(`
      id,
      auth_user_id,
      nome,
      email,
      status,
      telefone,
      empresa_id
    `)
    .single();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  await definirSetoresDoUsuario(novoUsuario.id, setorIds, setorPrincipalFinal);

  await definirPerfilDinamicoPorIdDoUsuario({
    usuarioId: novoUsuario.id,
    empresaId: usuario.empresa_id,
    perfilEmpresaId: perfil_empresa_id,
  });

  const setorIdsSalvos = await listarIdsSetoresDoUsuario(novoUsuario.id);

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "usuarios",
    entidade: "usuario",
    entidade_id: novoUsuario.id,
    acao: promovendoAdministrador ? "usuario_admin_criado" : "usuario_criado",
    descricao: `Usuário ${nome} convidado`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    depois: {
      id: novoUsuario.id,
      nome,
      email,
      perfil_empresa_id,
      setor_ids: setorIdsSalvos,
      telefone,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: "Usuário convidado com sucesso. O email de convite foi enviado.",
    usuario: {
      ...novoUsuario,
      setor_ids: setorIdsSalvos,
      setor_principal_id: setorPrincipalFinal,
    },
  });
}
