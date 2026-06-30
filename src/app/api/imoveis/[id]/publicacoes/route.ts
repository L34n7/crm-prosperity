import { NextResponse } from "next/server";
import {
  getCanalImobiliario,
  montarPayloadPublicacao,
  validarImovelParaPublicacao,
  type StatusPublicacaoImovel,
} from "@/lib/imoveis/publicacao";
import { obterAcessoImoveis } from "@/lib/imoveis/acesso";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

type ImovelRow = {
  id: string;
  empresa_id: string;
  status: string | null;
  titulo: string | null;
  codigo: string | null;
  tipo: string | null;
  finalidade: string | null;
  valor: number | string | null;
  valor_condominio: number | string | null;
  valor_iptu: number | string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | string | null;
  descricao: string | null;
  caracteristicas: Record<string, unknown> | null;
  fotos: unknown[] | null;
};

type AcaoPublicacao = "publicar" | "despublicar" | "marcar_publicado";

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

async function buscarImovel(empresaId: string, id: string) {
  const { data, error } = await supabase
    .from("imoveis")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("id", id)
    .maybeSingle<ImovelRow>();

  if (error) {
    throw new Error(`Erro ao buscar imovel: ${error.message}`);
  }

  return data;
}

function getAcaoPublicacao(valor: unknown): AcaoPublicacao {
  if (valor === "despublicar") return "despublicar";
  if (valor === "marcar_publicado") return "marcar_publicado";
  return "publicar";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await obterAcessoImoveis("imoveis.visualizar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;

  try {
    const imovel = await buscarImovel(acesso.usuario.empresa_id, id);

    if (!imovel || imovel.status === "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Imovel nao encontrado." },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("imovel_publicacoes")
      .select("*")
      .eq("empresa_id", acesso.usuario.empresa_id)
      .eq("imovel_id", id)
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      imovel,
      publicacoes: data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar publicacoes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const acesso = await obterAcessoImoveis("imoveis.publicar");

  if (!acesso.ok) {
    return NextResponse.json(
      { ok: false, error: acesso.error },
      { status: acesso.status }
    );
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const canalCodigo = texto(body?.canal_codigo);
    const canal = getCanalImobiliario(canalCodigo);
    const acao = getAcaoPublicacao(body?.acao);

    if (!canal) {
      return NextResponse.json(
        { ok: false, error: "Canal de publicacao invalido." },
        { status: 400 }
      );
    }

    const imovel = await buscarImovel(acesso.usuario.empresa_id, id);

    if (!imovel || imovel.status === "arquivado") {
      return NextResponse.json(
        { ok: false, error: "Imovel nao encontrado." },
        { status: 404 }
      );
    }

    const validacao = validarImovelParaPublicacao(imovel);
    const agora = new Date().toISOString();
    let status: StatusPublicacaoImovel = "pendente";
    let mensagem = "Publicacao enviada para a fila de integracao.";
    let payload: Record<string, unknown> = montarPayloadPublicacao(
      imovel,
      canal
    );
    let statusHttp = 200;
    let erro: string | null = null;

    if (acao === "despublicar") {
      status = "despublicado";
      mensagem = "Publicacao marcada para despublicacao.";
    } else if (acao === "marcar_publicado") {
      status = "publicado";
      mensagem = "Publicacao marcada como publicada.";
    } else if (!validacao.ok) {
      status = "rejeitado";
      statusHttp = 422;
      erro = validacao.bloqueios.join(" ");
      mensagem = "Corrija os campos obrigatorios antes de publicar.";
    }

    if (acao === "despublicar") {
      payload = {};
    }

    const externalUrl = texto(body?.external_url) || null;
    const externalId = texto(body?.external_id) || null;

    const { data, error } = await supabase
      .from("imovel_publicacoes")
      .upsert(
        {
          empresa_id: acesso.usuario.empresa_id,
          imovel_id: id,
          canal_codigo: canal.codigo,
          canal_nome: canal.nome,
          modo_integracao: canal.modo,
          status,
          payload,
          ultima_validacao: validacao,
          external_id: externalId,
          external_url: externalUrl,
          erro,
          ultimo_envio_em:
            acao === "publicar" && status !== "rejeitado" ? agora : null,
          publicado_em: status === "publicado" ? agora : null,
          despublicado_em: status === "despublicado" ? agora : null,
          updated_by: acesso.usuario.id,
          created_by: acesso.usuario.id,
        },
        { onConflict: "empresa_id,imovel_id,canal_codigo" }
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: acesso.usuario.empresa_id,
      categoria: "imobiliario",
      entidade: "imovel_publicacao",
      entidade_id: data.id,
      acao: `publicacao_${acao}`,
      descricao: `${canal.nome}: ${mensagem}`,
      usuario_id: acesso.usuario.id,
      usuario_nome: acesso.usuario.nome,
      usuario_email: acesso.usuario.email,
      metadata: {
        imovel_id: id,
        canal_codigo: canal.codigo,
        status,
        validacao,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: statusHttp < 400,
        message: mensagem,
        publicacao: data,
        validacao,
      },
      { status: statusHttp }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao processar publicacao.",
      },
      { status: 400 }
    );
  }
}
