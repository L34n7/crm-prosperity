import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import {
  getBuyerEmailSuggestion,
  isValidBuyerEmail,
} from "@/lib/checkout/buyer-validation";
import { enviarPrimeiroAcesso } from "@/lib/auth/enviar-primeiro-acesso";
import { notificarFalhaEntregaPrimeiroAcesso } from "@/lib/auth/primeiro-acesso-email-contingencia";
import { atualizarEmailClienteAssinaturaProsperityPay } from "@/lib/prosperity-pay/subscriptions";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

function normalizarEmail(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

async function buscarAuthUserIdPorEmail(email: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "obter_auth_user_id_por_email",
    { p_email: email }
  );

  if (error) {
    throw new Error(
      `Erro ao validar o e-mail na autenticação: ${error.message}`
    );
  }

  return typeof data === "string" && data ? data : null;
}

async function tentarRollbackProsperityPay(params: {
  subscriptionId?: string | null;
  email: string;
}) {
  if (!params.subscriptionId) return;

  try {
    await atualizarEmailClienteAssinaturaProsperityPay({
      subscriptionId: params.subscriptionId,
      customerEmail: params.email,
    });
  } catch (error) {
    console.error(
      "[CORRIGIR EMAIL ACESSO] Falha ao reverter e-mail na Prosperity Pay:",
      error
    );
  }
}

async function tentarRollbackAuth(params: {
  authUserId?: string | null;
  email: string;
}) {
  if (!params.authUserId) return;

  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      params.authUserId,
      {
        email: params.email,
        email_confirm: true,
      }
    );

    if (error) {
      console.error(
        "[CORRIGIR EMAIL ACESSO] Falha ao reverter e-mail no Auth:",
        error
      );
    }
  } catch (error) {
    console.error(
      "[CORRIGIR EMAIL ACESSO] Falha inesperada ao reverter Auth:",
      error
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const resultado = await getUsuarioContexto({ sincronizarAssinatura: false });

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (
    !can(usuario.permissoes, PERMISSAO_INTERNA_EMPRESAS) ||
    !can(usuario.permissoes, "empresas.editar")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sem permissão para corrigir o e-mail de acesso de uma empresa.",
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const novoEmail = normalizarEmail(body?.novo_email);
  const confirmouEmailSuspeito = body?.confirmar_email_suspeito === true;

  if (!isValidBuyerEmail(novoEmail)) {
    return NextResponse.json(
      { ok: false, error: "Informe um e-mail válido." },
      { status: 400 }
    );
  }

  const emailSugerido = getBuyerEmailSuggestion(novoEmail);
  if (emailSugerido && !confirmouEmailSuspeito) {
    return NextResponse.json(
      {
        ok: false,
        error: `Confira o e-mail informado. Você quis dizer ${emailSugerido}?`,
        email_sugerido: emailSugerido,
        requer_confirmacao_email: true,
      },
      { status: 409 }
    );
  }

  const { data: empresa, error: empresaError } = await supabaseAdmin
    .from("empresas")
    .select(
      "id,nome_fantasia,nome_responsavel,email,telefone,assinatura_metadata_json"
    )
    .eq("id", id)
    .maybeSingle();

  if (empresaError) {
    return NextResponse.json(
      { ok: false, error: empresaError.message },
      { status: 500 }
    );
  }

  if (!empresa) {
    return NextResponse.json(
      { ok: false, error: "Empresa não encontrada." },
      { status: 404 }
    );
  }

  const emailAnterior = normalizarEmail(empresa.email);

  if (novoEmail === emailAnterior) {
    return NextResponse.json(
      {
        ok: false,
        error: "O novo e-mail é igual ao e-mail atual da empresa.",
      },
      { status: 409 }
    );
  }

  const [
    empresaComEmail,
    usuarioComEmail,
    tokenAtualResult,
    usuarioAtualResult,
    assinaturaResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("empresas")
      .select("id,nome_fantasia")
      .ilike("email", novoEmail)
      .neq("id", id)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("usuarios")
      .select("id,empresa_id,email")
      .ilike("email", novoEmail)
      .neq("empresa_id", id)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("primeiro_acesso_tokens")
      .select("id,auth_user_id,senha_definida_em,created_at")
      .eq("empresa_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("usuarios")
      .select("id,auth_user_id,email,nome")
      .eq("empresa_id", id)
      .ilike("email", emailAnterior)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("prosperity_pay_assinaturas")
      .select("external_subscription_id,customer_email")
      .eq("empresa_id", id)
      .maybeSingle(),
  ]);

  const consultaError =
    empresaComEmail.error ||
    usuarioComEmail.error ||
    tokenAtualResult.error ||
    usuarioAtualResult.error ||
    assinaturaResult.error;

  if (consultaError) {
    return NextResponse.json(
      { ok: false, error: consultaError.message },
      { status: 500 }
    );
  }

  if (empresaComEmail.data || usuarioComEmail.data) {
    return NextResponse.json(
      {
        ok: false,
        error: "O novo e-mail já está vinculado a outra conta do CRM.",
      },
      { status: 409 }
    );
  }

  const authUserId =
    usuarioAtualResult.data?.auth_user_id ||
    tokenAtualResult.data?.auth_user_id ||
    null;

  let authUser:
    | Awaited<
        ReturnType<typeof supabaseAdmin.auth.admin.getUserById>
      >["data"]["user"]
    | null = null;

  if (authUserId) {
    const authAtual = await supabaseAdmin.auth.admin.getUserById(authUserId);

    if (authAtual.error || !authAtual.data.user) {
      return NextResponse.json(
        {
          ok: false,
          error:
            authAtual.error?.message ||
            "Usuário de autenticação da empresa não encontrado.",
        },
        { status: 500 }
      );
    }

    authUser = authAtual.data.user;
  }

  const authExistenteNovoEmail = await buscarAuthUserIdPorEmail(novoEmail);
  if (
    authExistenteNovoEmail &&
    (!authUserId || authExistenteNovoEmail !== authUserId)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "O novo e-mail já possui um usuário de autenticação.",
      },
      { status: 409 }
    );
  }

  const subscriptionId =
    assinaturaResult.data?.external_subscription_id || null;
  let prosperityPayAtualizado = false;
  let authAtualizado = false;

  try {
    if (subscriptionId) {
      await atualizarEmailClienteAssinaturaProsperityPay({
        subscriptionId,
        customerEmail: novoEmail,
      });
      prosperityPayAtualizado = true;
    }

    if (authUserId && authUser) {
      const authUpdate = await supabaseAdmin.auth.admin.updateUserById(
        authUserId,
        {
          email: novoEmail,
          email_confirm: true,
          user_metadata: {
            ...(authUser.user_metadata || {}),
            nome:
              empresa.nome_responsavel ||
              authUser.user_metadata?.nome ||
              empresa.nome_fantasia,
            empresa_id: empresa.id,
            telefone:
              empresa.telefone ??
              authUser.user_metadata?.telefone ??
              null,
          },
        }
      );

      if (authUpdate.error) {
        throw new Error(authUpdate.error.message);
      }

      authAtualizado = true;
    }

    const agora = new Date().toISOString();
    const { data: sincronizacao, error: sincronizacaoError } =
      await supabaseAdmin.rpc("corrigir_email_acesso_empresa", {
        p_empresa_id: empresa.id,
        p_email_antigo: emailAnterior,
        p_email_novo: novoEmail,
        p_auth_user_id: authUserId,
        p_agora: agora,
      });

    if (sincronizacaoError) {
      throw new Error(sincronizacaoError.message);
    }

    const senhaJaDefinida = Boolean(
      authUser?.app_metadata?.primeiro_acesso_senha_definida_em
    );

    let primeiroAcessoEnviado = false;

    if (!senhaJaDefinida) {
      try {
        await enviarPrimeiroAcesso({
          email: novoEmail,
          nome: empresa.nome_responsavel || empresa.nome_fantasia,
          empresaId: empresa.id,
          telefone: empresa.telefone,
        });
        primeiroAcessoEnviado = true;
      } catch (error) {
        const detalhe =
          error instanceof Error
            ? error.message
            : "Falha ao enviar o novo primeiro acesso.";

        const { data: tokenFalho } = await supabaseAdmin
          .from("primeiro_acesso_tokens")
          .select("id,resend_email_id")
          .eq("empresa_id", empresa.id)
          .ilike("email", novoEmail)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        try {
          await notificarFalhaEntregaPrimeiroAcesso({
            empresaId: empresa.id,
            email: novoEmail,
            status: "failed",
            detalhe,
            tokenId: tokenFalho?.id || null,
            resendEmailId: tokenFalho?.resend_email_id || null,
            eventId: tokenFalho?.id
              ? `admin-correction:${tokenFalho.id}`
              : `admin-correction:${empresa.id}:${Date.now()}`,
          });
        } catch (notificationError) {
          console.error(
            "[CORRIGIR EMAIL ACESSO] E-mail corrigido, mas falhou ao acionar contingência:",
            notificationError
          );
        }

        await registrarLogAuditoriaSeguro({
          empresa_id: empresa.id,
          categoria: "sistema",
          entidade: "empresa",
          entidade_id: empresa.id,
          acao: "email_acesso_corrigido_envio_falhou",
          descricao:
            "E-mail de acesso corrigido, porém o novo primeiro acesso não foi entregue.",
          usuario_id: usuario.id,
          usuario_nome: usuario.nome,
          usuario_email: usuario.email,
          antes: { email: emailAnterior },
          depois: { email: novoEmail },
          detalhes: {
            prosperity_pay_sincronizado: prosperityPayAtualizado,
            auth_sincronizado: authAtualizado,
            sincronizacao,
            erro_envio: detalhe,
          },
          ...getRequestAuditMetadata(request),
        });

        return NextResponse.json(
          {
            ok: false,
            email_corrigido: true,
            error:
              "O e-mail foi corrigido nos sistemas, mas o novo primeiro acesso não pôde ser enviado. A contingência foi acionada.",
          },
          { status: 502 }
        );
      }
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: empresa.id,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: empresa.id,
      acao: "email_acesso_corrigido",
      descricao: "E-mail de acesso corrigido e sincronizado.",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: { email: emailAnterior },
      depois: { email: novoEmail },
      detalhes: {
        prosperity_pay_sincronizado: prosperityPayAtualizado,
        auth_sincronizado: authAtualizado,
        sincronizacao,
        primeiro_acesso_enviado: primeiroAcessoEnviado,
        senha_ja_definida: senhaJaDefinida,
      },
      ...getRequestAuditMetadata(request),
    });

    return NextResponse.json({
      ok: true,
      email: novoEmail,
      primeiro_acesso_enviado: primeiroAcessoEnviado,
      senha_ja_definida: senhaJaDefinida,
      prosperity_pay_sincronizado: prosperityPayAtualizado,
      message: senhaJaDefinida
        ? "E-mail corrigido no CRM, autenticação e Prosperity Pay. O usuário já possuía senha e pode entrar com o novo e-mail."
        : "E-mail corrigido no CRM, autenticação e Prosperity Pay. Um novo primeiro acesso foi enviado.",
    });
  } catch (error) {
    if (authAtualizado) {
      await tentarRollbackAuth({
        authUserId,
        email: emailAnterior,
      });
    }

    if (prosperityPayAtualizado) {
      await tentarRollbackProsperityPay({
        subscriptionId,
        email: emailAnterior,
      });
    }

    console.error("[CORRIGIR EMAIL ACESSO]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível corrigir o e-mail de acesso.",
      },
      { status: 500 }
    );
  }
}
