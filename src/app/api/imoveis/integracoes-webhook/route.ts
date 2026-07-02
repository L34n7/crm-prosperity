import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { obterAcessoImoveis } from "@/lib/imoveis/acesso";
import { criarSegredoWebhook } from "@/lib/imoveis/webhook";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const runtime = "nodejs";

const supabase = getSupabaseAdmin();

type IntegracaoWebhook = {
  id: string;
  empresa_id: string;
  nome: string;
  canal_codigo: string;
  token_hint: string;
  status: "ativo" | "inativo";
  ultimo_evento_em: string | null;
  created_at: string;
  updated_at: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function urlWebhook(request: Request, integracaoId: string) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;

  return new URL(
    `/api/webhooks/imoveis/${integracaoId}`,
    base.endsWith("/") ? base : `${base}/`
  ).toString();
}

function respostaIntegracao(request: Request, integracao: IntegracaoWebhook) {
  return {
    id: integracao.id,
    nome: integracao.nome,
    canal_codigo: integracao.canal_codigo,
    status: integracao.status,
    token_hint: integracao.token_hint,
    ultimo_evento_em: integracao.ultimo_evento_em,
    created_at: integracao.created_at,
    updated_at: integracao.updated_at,
    webhook_url: urlWebhook(request, integracao.id),
  };
}

export async function GET(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.importar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { data, error } = await supabase
    .from("imobiliario_integracoes_webhook")
    .select(
      "id, empresa_id, nome, canal_codigo, token_hint, status, ultimo_evento_em, created_at, updated_at"
    )
    .eq("empresa_id", acesso.usuario.empresa_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      integracoes: ((data ?? []) as IntegracaoWebhook[]).map((integracao) =>
        respostaIntegracao(request, integracao)
      ),
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function POST(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.importar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const integracaoId = texto(body.integracao_id);
    const nome = texto(body.nome);

    if (!integracaoId && (nome.length < 2 || nome.length > 120)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Informe o nome do parceiro com 2 a 120 caracteres.",
        },
        { status: 400 }
      );
    }

    const credencial = criarSegredoWebhook();
    let integracao: IntegracaoWebhook | null = null;
    let acao = "integracao_webhook_criada";

    if (integracaoId) {
      const { data: existente, error: buscaError } = await supabase
        .from("imobiliario_integracoes_webhook")
        .select(
          "id, empresa_id, nome, canal_codigo, token_hint, status, ultimo_evento_em, created_at, updated_at"
        )
        .eq("empresa_id", acesso.usuario.empresa_id)
        .eq("id", integracaoId)
        .maybeSingle<IntegracaoWebhook>();

      if (buscaError) {
        throw new Error(buscaError.message);
      }

      if (!existente) {
        return NextResponse.json(
          { ok: false, error: "Integracao nao encontrada." },
          { status: 404 }
        );
      }

      const { data, error } = await supabase
        .from("imobiliario_integracoes_webhook")
        .update({
          nome: nome || existente.nome,
          token_hash: credencial.hash,
          token_hint: credencial.hint,
          status: "ativo",
          updated_by: acesso.usuario.id,
        })
        .eq("empresa_id", acesso.usuario.empresa_id)
        .eq("id", integracaoId)
        .select(
          "id, empresa_id, nome, canal_codigo, token_hint, status, ultimo_evento_em, created_at, updated_at"
        )
        .single<IntegracaoWebhook>();

      if (error) throw new Error(error.message);

      integracao = data;
      acao = "integracao_webhook_segredo_rotacionado";
    } else {
      const id = randomUUID();
      const canalCodigo = `webhook_${id.replace(/-/g, "").slice(0, 16)}`;

      const { data, error } = await supabase
        .from("imobiliario_integracoes_webhook")
        .insert({
          id,
          empresa_id: acesso.usuario.empresa_id,
          nome,
          canal_codigo: canalCodigo,
          token_hash: credencial.hash,
          token_hint: credencial.hint,
          status: "ativo",
          created_by: acesso.usuario.id,
          updated_by: acesso.usuario.id,
        })
        .select(
          "id, empresa_id, nome, canal_codigo, token_hint, status, ultimo_evento_em, created_at, updated_at"
        )
        .single<IntegracaoWebhook>();

      if (error) throw new Error(error.message);
      integracao = data;
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: acesso.usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel_externo",
      entidade_id: integracao.id,
      acao,
      descricao: `${integracao.nome}: credencial do webhook configurada`,
      usuario_id: acesso.usuario.id,
      usuario_nome: acesso.usuario.nome,
      usuario_email: acesso.usuario.email,
      metadata: {
        integracao_id: integracao.id,
        canal_codigo: integracao.canal_codigo,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: integracaoId
          ? "Segredo do webhook rotacionado."
          : "Webhook criado com sucesso.",
        integracao: respostaIntegracao(request, integracao),
        secret: credencial.segredo,
        secret_visible_once: true,
      },
      {
        status: integracaoId ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao configurar o webhook.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const acesso = await obterAcessoImoveis("imoveis.importar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const integracaoId = texto(body.integracao_id);

    if (!integracaoId) {
      return NextResponse.json(
        { ok: false, error: "Informe a integracao." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("imobiliario_integracoes_webhook")
      .update({
        status: "inativo",
        updated_by: acesso.usuario.id,
      })
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("id", integracaoId)
      .select("id, nome, canal_codigo")
      .maybeSingle<{
        id: string;
        nome: string;
        canal_codigo: string;
      }>();

    if (error) throw new Error(error.message);

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Integracao nao encontrada." },
        { status: 404 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: acesso.usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel_externo",
      entidade_id: data.id,
      acao: "integracao_webhook_desativada",
      descricao: `${data.nome}: webhook de imoveis desativado`,
      usuario_id: acesso.usuario.id,
      usuario_nome: acesso.usuario.nome,
      usuario_email: acesso.usuario.email,
      metadata: {
        integracao_id: data.id,
        canal_codigo: data.canal_codigo,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Webhook desativado.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao desativar o webhook.",
      },
      { status: 500 }
    );
  }
}
