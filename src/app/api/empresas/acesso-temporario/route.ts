import { NextResponse } from "next/server";
import {
  ACESSO_TEMPORARIO_EMPRESA_COOKIE,
  criarAcessoTemporarioEmpresa,
  encerrarAcessoTemporarioEmpresaAtual,
  getAcessoTemporarioEmpresaCookieOptions,
  obterAcessoTemporarioEmpresaAtual,
} from "@/lib/auth/acesso-temporario-empresa";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/can";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const supabaseAdmin = getSupabaseAdmin();

async function validarOperadorInterno() {
  const contexto = await getUsuarioContexto({
    ignorarAcessoTemporario: true,
  });

  if (!contexto.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: contexto.error },
        { status: contexto.status }
      ),
    };
  }

  const permitido = await can(
    contexto.usuario.id,
    PERMISSAO_INTERNA_EMPRESAS
  );

  if (!permitido) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          error: "Sem permissão para iniciar uma sessão de suporte.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, usuario: contexto.usuario };
}

async function buscarAdministradorAtivo(empresaId: string) {
  const { data: perfis, error: perfisError } = await supabaseAdmin
    .from("perfis_empresa")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .ilike("nome", "Administrador")
    .limit(10);

  if (perfisError) {
    throw new Error(perfisError.message);
  }

  const perfilIds = (perfis ?? [])
    .map((item) => String(item.id || "").trim())
    .filter(Boolean);

  if (perfilIds.length === 0) return null;

  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("usuarios_perfis")
    .select("usuario_id")
    .in("perfil_empresa_id", perfilIds)
    .limit(100);

  if (vinculosError) {
    throw new Error(vinculosError.message);
  }

  const usuarioIds = Array.from(
    new Set(
      (vinculos ?? [])
        .map((item) => String(item.usuario_id || "").trim())
        .filter(Boolean)
    )
  );

  if (usuarioIds.length === 0) return null;

  const { data: usuarios, error: usuariosError } = await supabaseAdmin
    .from("usuarios")
    .select("id, auth_user_id, nome, email, empresa_id, status")
    .eq("empresa_id", empresaId)
    .eq("status", "ativo")
    .in("id", usuarioIds)
    .not("auth_user_id", "is", null)
    .limit(10);

  if (usuariosError) {
    throw new Error(usuariosError.message);
  }

  return (usuarios ?? [])[0] ?? null;
}

export async function POST(request: Request) {
  const operador = await validarOperadorInterno();

  if (!operador.ok) return operador.response;

  try {
    const body = await request.json();
    const empresaId = String(body?.empresa_id || "").trim();

    if (!UUID_REGEX.test(empresaId)) {
      return NextResponse.json(
        { ok: false, error: "Empresa inválida." },
        { status: 400 }
      );
    }

    if (empresaId === operador.usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você já está no ambiente dessa empresa." },
        { status: 400 }
      );
    }

    const sessaoExistente = await obterAcessoTemporarioEmpresaAtual({
      authUserId: operador.usuario.auth_user_id,
      operadorUsuarioId: operador.usuario.id,
    });

    if (sessaoExistente) {
      await encerrarAcessoTemporarioEmpresaAtual({
        authUserId: operador.usuario.auth_user_id,
        operadorUsuarioId: operador.usuario.id,
      });
    }

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .select("id, nome_fantasia")
      .eq("id", empresaId)
      .maybeSingle<{ id: string; nome_fantasia: string }>();

    if (empresaError) {
      throw new Error(empresaError.message);
    }

    if (!empresa) {
      return NextResponse.json(
        { ok: false, error: "Empresa não encontrada." },
        { status: 404 }
      );
    }

    const usuarioAlvo = await buscarAdministradorAtivo(empresa.id);

    if (!usuarioAlvo) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A empresa não possui um administrador ativo para a sessão de suporte.",
        },
        { status: 409 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);
    const sessao = await criarAcessoTemporarioEmpresa({
      operador: {
        id: operador.usuario.id,
        auth_user_id: operador.usuario.auth_user_id,
        empresa_id: operador.usuario.empresa_id,
        nome: operador.usuario.nome,
        email: operador.usuario.email,
      },
      empresa: {
        id: empresa.id,
        nome: empresa.nome_fantasia,
      },
      usuarioAlvo: {
        id: String(usuarioAlvo.id),
        nome: usuarioAlvo.nome,
        email: usuarioAlvo.email,
      },
      ip: auditMeta.ip,
      userAgent: auditMeta.user_agent,
    });

    await registrarLogAuditoriaSeguro({
      empresa_id: empresa.id,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: empresa.id,
      acao: "acesso_temporario_administrativo_iniciado",
      descricao: `${
        operador.usuario.nome ||
        operador.usuario.email ||
        "Administrador interno"
      } iniciou uma sessão temporária de suporte em ${empresa.nome_fantasia}.`,
      usuario_id: operador.usuario.id,
      usuario_nome: operador.usuario.nome,
      usuario_email: operador.usuario.email,
      detalhes: {
        sessao_suporte_id: sessao.sessao_id,
        expira_em: sessao.expira_em,
        usuario_administrador_alvo_id: usuarioAlvo.id,
        usuario_administrador_alvo_email: usuarioAlvo.email,
      },
      ...auditMeta,
    });

    const response = NextResponse.json({
      ok: true,
      message: `Sessão temporária iniciada para ${empresa.nome_fantasia}.`,
      expira_em: sessao.expira_em,
      redirect: "/painel/ao-vivo",
    });

    response.cookies.set(
      ACESSO_TEMPORARIO_EMPRESA_COOKIE,
      sessao.token,
      getAcessoTemporarioEmpresaCookieOptions()
    );

    return response;
  } catch (error) {
    console.error("[EMPRESAS ACESSO TEMPORARIO POST]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível iniciar a sessão de suporte.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const operador = await validarOperadorInterno();

  if (!operador.ok) return operador.response;

  try {
    let sessaoIdEsperada = "";
    let motivo: "manual" | "expiracao" = "manual";

    try {
      const body = await request.json();
      sessaoIdEsperada = String(body?.sessao_id || "").trim();
      motivo = body?.motivo === "expiracao" ? "expiracao" : "manual";
    } catch {
      // Compatibilidade com chamadas antigas sem body.
    }

    const acessoAtual = await obterAcessoTemporarioEmpresaAtual({
      authUserId: operador.usuario.auth_user_id,
      operadorUsuarioId: operador.usuario.id,
    });

    if (
      sessaoIdEsperada &&
      acessoAtual &&
      acessoAtual.sessao_id !== sessaoIdEsperada
    ) {
      return NextResponse.json({
        ok: true,
        sessao_substituida: true,
        message:
          "Esta aba pertence a uma sessão de suporte anterior. A sessão atual foi preservada.",
      });
    }

    const acesso = acessoAtual
      ? await encerrarAcessoTemporarioEmpresaAtual({
          authUserId: operador.usuario.auth_user_id,
          operadorUsuarioId: operador.usuario.id,
        })
      : null;

    if (acesso) {
      const auditMeta = getRequestAuditMetadata(request);
      const operadorLabel =
        operador.usuario.nome ||
        operador.usuario.email ||
        "Administrador interno";
      const acaoDescricao =
        motivo === "expiracao"
          ? "teve a sessão temporária expirada"
          : "encerrou a sessão temporária de suporte";

      await registrarLogAuditoriaSeguro({
        empresa_id: acesso.empresa_id,
        categoria: "sistema",
        entidade: "empresa",
        entidade_id: acesso.empresa_id,
        acao:
          motivo === "expiracao"
            ? "acesso_temporario_administrativo_expirado"
            : "acesso_temporario_administrativo_encerrado",
        descricao:
          operadorLabel +
          " " +
          acaoDescricao +
          " em " +
          acesso.empresa_nome +
          ".",
        usuario_id: operador.usuario.id,
        usuario_nome: operador.usuario.nome,
        usuario_email: operador.usuario.email,
        detalhes: {
          sessao_suporte_id: acesso.sessao_id,
          motivo,
          iniciado_em: acesso.criado_em,
          encerrado_em: new Date().toISOString(),
          expiraria_em: acesso.expira_em,
        },
        ...auditMeta,
      });
    }

    const response = NextResponse.json({
      ok: true,
      sessao_substituida: false,
      message:
        motivo === "expiracao"
          ? "Sessão temporária expirada."
          : "Sessão temporária encerrada.",
    });

    response.cookies.set(ACESSO_TEMPORARIO_EMPRESA_COOKIE, "", {
      ...getAcessoTemporarioEmpresaCookieOptions(),
      maxAge: 0,
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("[EMPRESAS ACESSO TEMPORARIO DELETE]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível encerrar a sessão de suporte.",
      },
      { status: 500 }
    );
  }
}
