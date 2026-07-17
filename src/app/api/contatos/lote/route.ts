import { NextResponse } from "next/server";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  classificacaoLeadValida,
  normalizarClassificacaoLead,
  statusLeadLegadoDaClassificacao,
} from "@/lib/leads/classificacao";

const MAX_CONTATOS_POR_LOTE = 500;

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const perfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    perfis.includes("Administrador") ||
    perfis.includes("Supervisor") ||
    perfis.includes("Atendente")
  );
}

function obterRelacaoUnica<T>(relacao: T | T[] | null | undefined): T | null {
  return Array.isArray(relacao) ? relacao[0] ?? null : relacao ?? null;
}

export async function PATCH(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarContatos(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para editar contatos." },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsedBody: unknown = await request.json();

    if (
      !parsedBody ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      return NextResponse.json(
        { ok: false, error: "Corpo da requisição inválido." },
        { status: 400 }
      );
    }

    body = parsedBody as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }

  const ids = Array.from(
    new Set(
      (Array.isArray(body.ids) ? body.ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Selecione ao menos um contato." },
      { status: 400 }
    );
  }

  if (ids.length > MAX_CONTATOS_POR_LOTE) {
    return NextResponse.json(
      {
        ok: false,
        error: `Atualize no máximo ${MAX_CONTATOS_POR_LOTE} contatos por vez.`,
      },
      { status: 400 }
    );
  }

  const payload: Record<string, unknown> = {};
  const temCampanha = Object.prototype.hasOwnProperty.call(
    body,
    "rastreamento_campanha_id"
  );
  const temOrigem = Object.prototype.hasOwnProperty.call(body, "origem");
  const temStatus =
    Object.prototype.hasOwnProperty.call(body, "status_lead") ||
    Object.prototype.hasOwnProperty.call(body, "classificacao");
  const supabaseAdmin = getSupabaseAdmin();

  if (temCampanha) {
    const campanhaId =
      String(body.rastreamento_campanha_id || "").trim() || null;

    if (!campanhaId) {
      payload.rastreamento_campanha_id = null;
      payload.rastreamento_origem_id = null;
      payload.campanha = null;
    } else {
      const { data: campanha, error: campanhaError } = await supabaseAdmin
        .from("rastreamento_campanhas")
        .select(
          `
            id,
            nome,
            origem_id,
            rastreamento_origens (
              id,
              nome
            )
          `
        )
        .eq("empresa_id", usuario.empresa_id)
        .eq("id", campanhaId)
        .maybeSingle();

      if (campanhaError) {
        return NextResponse.json(
          { ok: false, error: campanhaError.message },
          { status: 500 }
        );
      }

      if (!campanha) {
        return NextResponse.json(
          { ok: false, error: "Campanha não encontrada." },
          { status: 404 }
        );
      }

      const origemCampanha = obterRelacaoUnica(
        campanha.rastreamento_origens
      );

      payload.rastreamento_campanha_id = campanha.id;
      payload.rastreamento_origem_id = campanha.origem_id;
      payload.campanha = campanha.nome;

      if (origemCampanha?.nome) {
        payload.origem = origemCampanha.nome;
      }
    }
  }

  if (temOrigem) {
    payload.origem = String(body.origem || "").trim() || null;
  }

  if (temStatus) {
    const classificacaoEntrada = body.classificacao ?? body.status_lead;

    if (!classificacaoLeadValida(classificacaoEntrada)) {
      return NextResponse.json(
        { ok: false, error: "Classificação do lead inválida." },
        { status: 400 }
      );
    }

    const classificacaoLead = normalizarClassificacaoLead(
      classificacaoEntrada,
      "novo"
    );

    payload.classificacao = classificacaoLead;
    payload.classificacao_atualizada_em = new Date().toISOString();
    payload.status_lead = statusLeadLegadoDaClassificacao(classificacaoLead);
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Escolha ao menos uma alteração." },
      { status: 400 }
    );
  }

  const { data: contatos, error } = await supabaseAdmin
    .from("contatos")
    .update(payload)
    .eq("empresa_id", usuario.empresa_id)
    .in("id", ids)
    .select("id");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const contatosAtualizados = contatos ?? [];

  if (contatosAtualizados.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nenhum contato selecionado foi encontrado." },
      { status: 404 }
    );
  }

  const auditMeta = getRequestAuditMetadata(request);

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: contatosAtualizados[0].id,
    acao: "contatos_atualizados_em_massa",
    descricao: `${contatosAtualizados.length} contato(s) atualizado(s) em massa`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    metadata: {
      contatos_ids: contatosAtualizados.map((contato) => contato.id),
      alteracoes: payload,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    atualizados: contatosAtualizados.length,
    message: `${contatosAtualizados.length} contato(s) atualizado(s) com sucesso.`,
  });
}
