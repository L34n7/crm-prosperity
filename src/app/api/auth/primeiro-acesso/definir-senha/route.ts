import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { finalizarCadastroAuthUser } from "@/lib/auth/finalizar-cadastro-usuario";
import {
  hashTokenPrimeiroAcesso,
  tokenPrimeiroAcessoValido,
} from "@/lib/auth/enviar-primeiro-acesso";

const supabaseAdmin = getSupabaseAdmin();

type Reserva = {
  ok: boolean;
  motivo: string;
  auth_user_id: string | null;
  empresa_id: string | null;
  email: string | null;
};

function senhaEhValida(senha: string) {
  const requisitos = [
    senha.length >= 8,
    /[A-Z]/.test(senha),
    /[a-z]/.test(senha),
    /\d/.test(senha),
    /[^A-Za-z0-9]/.test(senha),
  ];

  return requisitos.filter(Boolean).length >= 4;
}

function respostaReservaInvalida(motivo: string) {
  switch (motivo) {
    case "expirado":
      return {
        status: 410,
        error: "Este link de primeiro acesso expirou após 24 horas.",
      };
    case "senha_definida":
      return { status: 409, error: "A senha deste acesso já foi cadastrada." };
    case "invalidado":
      return {
        status: 410,
        error: "Este link foi substituído por um acesso mais recente.",
      };
    case "abertura_necessaria":
      return {
        status: 400,
        error: "Abra o link de primeiro acesso antes de cadastrar a senha.",
      };
    case "processando":
      return {
        status: 409,
        error: "A criação da senha já está sendo processada em outra aba.",
      };
    default:
      return { status: 400, error: "Link de primeiro acesso inválido." };
  }
}

async function encerrarToken(tokenHash: string) {
  const conclusao = await supabaseAdmin.rpc(
    "concluir_definicao_senha_primeiro_acesso",
    { p_token_hash: tokenHash }
  );

  if (!conclusao.error && conclusao.data === true) {
    return;
  }

  const fallback = await supabaseAdmin
    .from("primeiro_acesso_tokens")
    .update({
      senha_definida_em: new Date().toISOString(),
      processando_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("token_hash", tokenHash)
    .is("senha_definida_em", null);

  if (fallback.error) {
    console.error(
      "[PRIMEIRO ACESSO] Senha definida, mas falhou ao encerrar token:",
      conclusao.error || fallback.error
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const senha = typeof body?.senha === "string" ? body.senha : "";

  if (!tokenPrimeiroAcessoValido(token)) {
    return NextResponse.json(
      { ok: false, error: "Link de primeiro acesso inválido." },
      { status: 400 }
    );
  }

  if (!senhaEhValida(senha)) {
    return NextResponse.json(
      { ok: false, error: "A senha não atende aos requisitos de segurança." },
      { status: 400 }
    );
  }

  const tokenHash = hashTokenPrimeiroAcesso(token);
  const reservaRpc = await supabaseAdmin.rpc(
    "reservar_definicao_senha_primeiro_acesso",
    { p_token_hash: tokenHash }
  );

  if (reservaRpc.error) {
    console.error(
      "[PRIMEIRO ACESSO] Erro ao reservar definição de senha:",
      reservaRpc.error
    );
    return NextResponse.json(
      { ok: false, error: "Não foi possível validar este primeiro acesso." },
      { status: 500 }
    );
  }

  const reservaData = Array.isArray(reservaRpc.data)
    ? reservaRpc.data[0]
    : reservaRpc.data;
  const reserva = reservaData as Reserva | null;

  if (!reserva?.ok || !reserva.auth_user_id) {
    const invalida = respostaReservaInvalida(reserva?.motivo || "invalido");
    return NextResponse.json(
      {
        ok: false,
        error: invalida.error,
        motivo: reserva?.motivo || "invalido",
      },
      { status: invalida.status }
    );
  }

  try {
    const authResult = await supabaseAdmin.auth.admin.getUserById(
      reserva.auth_user_id
    );

    if (authResult.error || !authResult.data.user) {
      throw new Error(
        authResult.error?.message || "Usuário de autenticação não encontrado."
      );
    }

    const authUser = authResult.data.user;
    const senhaJaDefinidaNoAuth = Boolean(
      authUser.app_metadata?.primeiro_acesso_senha_definida_em
    );

    if (senhaJaDefinidaNoAuth) {
      await encerrarToken(tokenHash);
      return NextResponse.json(
        { ok: false, error: "A senha deste acesso já foi cadastrada." },
        { status: 409 }
      );
    }

    await finalizarCadastroAuthUser(authUser);

    const agora = new Date().toISOString();
    const senhaResult = await supabaseAdmin.auth.admin.updateUserById(
      reserva.auth_user_id,
      {
        password: senha,
        email_confirm: true,
        app_metadata: {
          ...(authUser.app_metadata || {}),
          primeiro_acesso_senha_definida_em: agora,
        },
      }
    );

    if (senhaResult.error) {
      throw new Error(senhaResult.error.message);
    }

    await encerrarToken(tokenHash);

    return NextResponse.json({
      ok: true,
      email: reserva.email,
      message: "Senha criada com sucesso.",
    });
  } catch (error) {
    await supabaseAdmin.rpc("liberar_reserva_senha_primeiro_acesso", {
      p_token_hash: tokenHash,
    });

    console.error("[PRIMEIRO ACESSO] Erro ao definir senha:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao definir a senha.",
      },
      { status: 500 }
    );
  }
}
