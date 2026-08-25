import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();

function servidorMercadoPagoConfigurado() {
  return Boolean(
    process.env.MERCADOPAGO_CLIENT_ID?.trim() &&
      process.env.MERCADOPAGO_CLIENT_SECRET?.trim() &&
      process.env.MERCADOPAGO_REDIRECT_URI?.trim()
  );
}

async function obterContextoAdmin() {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }

  if (!isAdministrador(resultado.usuario)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Apenas administradores podem gerenciar o Mercado Pago." },
        { status: 403 }
      ),
    };
  }

  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

export async function GET() {
  const contexto = await obterContextoAdmin();
  if (!contexto.ok) return contexto.response;

  try {
    const { data, error } = await supabase
      .from("mercado_pago_integracoes")
      .select(
        "id, mercado_pago_user_id, status, live_mode, expires_at, conectado_em, ultimo_refresh_em, ultimo_erro"
      )
      .eq("empresa_id", contexto.empresaId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      configurado_servidor: servidorMercadoPagoConfigurado(),
      conectado: data?.status === "ativa",
      integracao: data
        ? {
            id: data.id,
            mercado_pago_user_id: data.mercado_pago_user_id,
            status: data.status,
            live_mode: data.live_mode,
            expires_at: data.expires_at,
            conectado_em: data.conectado_em,
            ultimo_refresh_em: data.ultimo_refresh_em,
            ultimo_erro: data.ultimo_erro,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao consultar a integração com Mercado Pago.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const contexto = await obterContextoAdmin();
  if (!contexto.ok) return contexto.response;

  try {
    const { data: integracao, error: consultaError } = await supabase
      .from("mercado_pago_integracoes")
      .select("id, mercado_pago_user_id, status, live_mode, conectado_em")
      .eq("empresa_id", contexto.empresaId)
      .maybeSingle();

    if (consultaError) throw new Error(consultaError.message);

    if (!integracao) {
      return NextResponse.json({
        ok: true,
        message: "Nenhuma conta do Mercado Pago estava conectada.",
      });
    }

    const { error: deleteError } = await supabase
      .from("mercado_pago_integracoes")
      .delete()
      .eq("empresa_id", contexto.empresaId);

    if (deleteError) throw new Error(deleteError.message);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: contexto.empresaId,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: contexto.empresaId,
      acao: "mercado_pago_desconectado",
      descricao: "A integração da empresa com o Mercado Pago foi desconectada.",
      usuario_id: contexto.usuario.id,
      usuario_nome: contexto.usuario.nome,
      usuario_email: contexto.usuario.email,
      antes: integracao,
      depois: null,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Mercado Pago desconectado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao desconectar o Mercado Pago.",
      },
      { status: 500 }
    );
  }
}
