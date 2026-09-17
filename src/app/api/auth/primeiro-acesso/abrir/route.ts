import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hashTokenPrimeiroAcesso,
  tokenPrimeiroAcessoValido,
} from "@/lib/auth/enviar-primeiro-acesso";

const supabaseAdmin = getSupabaseAdmin();

type ResultadoAbertura = {
  ok: boolean;
  motivo: string;
  email: string | null;
  aberturas: number;
  max_aberturas: number;
  aberturas_restantes: number;
  expira_em: string | null;
};

function respostaInvalida(motivo: string) {
  switch (motivo) {
    case "expirado":
      return {
        status: 410,
        error: "Este link de primeiro acesso expirou após 24 horas.",
      };
    case "limite_aberturas":
      return {
        status: 410,
        error: "Este link já atingiu o limite de 3 aberturas.",
      };
    case "senha_definida":
      return {
        status: 409,
        error: "A senha deste acesso já foi cadastrada. Use a tela de login.",
      };
    case "invalidado":
      return {
        status: 410,
        error: "Este link foi substituído por um acesso mais recente.",
      };
    default:
      return { status: 400, error: "Este link de primeiro acesso é inválido." };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const token = body?.token;

    if (!tokenPrimeiroAcessoValido(token)) {
      return NextResponse.json(
        { ok: false, error: "Link de primeiro acesso inválido." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const tokenHash = hashTokenPrimeiroAcesso(token);
    const rpc = await supabaseAdmin.rpc("registrar_abertura_primeiro_acesso", {
      p_token_hash: tokenHash,
    });

    if (rpc.error) {
      console.error("[PRIMEIRO ACESSO] Erro ao registrar abertura:", rpc.error);
      return NextResponse.json(
        { ok: false, error: "Não foi possível validar o link de primeiro acesso." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    const resultado = data as ResultadoAbertura | null;

    if (!resultado?.ok) {
      const invalida = respostaInvalida(resultado?.motivo || "invalido");
      return NextResponse.json(
        {
          ok: false,
          error: invalida.error,
          motivo: resultado?.motivo || "invalido",
        },
        {
          status: invalida.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        email: resultado.email,
        aberturas: resultado.aberturas,
        max_aberturas: resultado.max_aberturas,
        aberturas_restantes: resultado.aberturas_restantes,
        expira_em: resultado.expira_em,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[PRIMEIRO ACESSO] Erro inesperado ao abrir link:", error);
    return NextResponse.json(
      { ok: false, error: "Não foi possível validar o link de primeiro acesso." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
