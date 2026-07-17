import { NextResponse } from "next/server";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import {
  aplicarClassificacaoLeadContato,
  CLASSIFICACOES_LEAD,
  CLASSIFICACAO_LEAD_LABEL,
  classificacaoLeadValida,
  normalizarClassificacaoLead,
  type ClassificacaoLead,
} from "@/lib/leads/classificacao";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const LIMITE_PADRAO_POR_COLUNA = 80;
const LIMITE_MAXIMO_POR_COLUNA = 200;

type ContatoKanban = {
  id: string;
  nome: string | null;
  whatsapp_profile_name: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  campanha: string | null;
  classificacao: string | null;
  classificacao_atualizada_em: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function podeGerenciarKanban(usuario: UsuarioContexto) {
  const perfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);

  return (
    perfis.includes("Administrador") ||
    perfis.includes("Supervisor") ||
    perfis.includes("Atendente")
  );
}

function montarColunasVazias() {
  return CLASSIFICACOES_LEAD.map((classificacao) => ({
    id: classificacao,
    titulo: CLASSIFICACAO_LEAD_LABEL[classificacao],
    total: 0,
    contatos: [] as ContatoKanban[],
  }));
}

export async function GET(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarKanban(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar o Kanban." },
      { status: 403 }
    );
  }

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const busca = searchParams.get("busca")?.trim() || "";
  const limite = Math.max(
    1,
    Math.min(
      LIMITE_MAXIMO_POR_COLUNA,
      Number(searchParams.get("limite") || LIMITE_PADRAO_POR_COLUNA)
    )
  );
  const supabase = getSupabaseAdmin();
  const colunas = montarColunasVazias();

  let colunasComDados;

  try {
    colunasComDados = await Promise.all(
      colunas.map(async (coluna) => {
        let query = supabase
          .from("contatos")
          .select(
            `
              id,
              nome,
              whatsapp_profile_name,
              telefone,
              email,
              origem,
              campanha,
              classificacao,
              classificacao_atualizada_em,
              created_at,
              updated_at
            `,
            { count: "exact" }
          )
          .eq("empresa_id", usuario.empresa_id)
          .eq("classificacao", coluna.id)
          .order("classificacao_atualizada_em", {
            ascending: false,
            nullsFirst: false,
          })
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(limite);

        if (busca) {
          query = query.or(
            `nome.ilike.%${busca}%,whatsapp_profile_name.ilike.%${busca}%,email.ilike.%${busca}%,telefone.ilike.%${busca}%,origem.ilike.%${busca}%,campanha.ilike.%${busca}%`
          );
        }

        const { data, error, count } = await query;

        if (error) {
          throw new Error(error.message);
        }

        return {
          ...coluna,
          total: count ?? 0,
          contatos: (data || []) as ContatoKanban[],
        };
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar o Kanban.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    colunas: colunasComDados,
    limite_por_coluna: limite,
  });
}

export async function PATCH(request: Request) {
  const resultado = await getUsuarioContexto();
  const auditMeta = getRequestAuditMetadata(request);

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!podeGerenciarKanban(usuario)) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para mover leads no Kanban." },
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

  const contatoId = String(body.contato_id || "").trim();
  const classificacaoEntrada = body.classificacao;

  if (!contatoId) {
    return NextResponse.json(
      { ok: false, error: "Contato é obrigatório." },
      { status: 400 }
    );
  }

  if (!classificacaoLeadValida(classificacaoEntrada)) {
    return NextResponse.json(
      { ok: false, error: "Classificação inválida." },
      { status: 400 }
    );
  }

  const classificacao = normalizarClassificacaoLead(
    classificacaoEntrada
  ) as ClassificacaoLead;
  const supabase = getSupabaseAdmin();
  const { data: contatoAtual, error: contatoError } = await supabase
    .from("contatos")
    .select("id, nome, telefone, classificacao, status_lead")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", contatoId)
    .maybeSingle();

  if (contatoError) {
    return NextResponse.json(
      { ok: false, error: contatoError.message },
      { status: 500 }
    );
  }

  if (!contatoAtual) {
    return NextResponse.json(
      { ok: false, error: "Contato não encontrado." },
      { status: 404 }
    );
  }

  const classificacaoAnterior = normalizarClassificacaoLead(
    contatoAtual.classificacao || contatoAtual.status_lead
  );

  await aplicarClassificacaoLeadContato({
    empresaId: usuario.empresa_id,
    contatoId,
    classificacao,
    origem: "kanban",
  });

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: contatoId,
    acao: "contato_classificacao_alterada_kanban",
    descricao: `Contato ${
      contatoAtual.nome || contatoAtual.telefone || contatoId
    } movido no Kanban para ${CLASSIFICACAO_LEAD_LABEL[classificacao]}`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: {
      classificacao: classificacaoAnterior,
    },
    depois: {
      classificacao,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    message: "Lead movido com sucesso.",
    contato_id: contatoId,
    classificacao,
  });
}
