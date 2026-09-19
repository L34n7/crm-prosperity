import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabaseAdmin = getSupabaseAdmin();

type AnaliseExclusaoLista = {
  ok?: boolean;
  erro?: string;
  lista_id?: string;
  nome?: string;
  total_contatos?: number;
  contatos_exclusivos?: number;
  contatos_compartilhados?: number;
  contatos_com_conversa?: number;
  conversas?: number;
  agendamentos_bloqueadores?: number;
  analises_arquivo_bloqueadoras?: number;
  exclusao_bloqueada?: boolean;
};

type ResultadoExclusaoLista = {
  ok?: boolean;
  erro?: string;
  lista_id?: string;
  nome?: string;
  total_contatos_lista?: number;
  contatos_exclusivos_excluidos?: number;
  contatos_compartilhados_preservados?: number;
  contatos_com_conversa?: number;
  conversas_excluidas?: number;
  agendamentos_bloqueadores?: number;
  analises_arquivo_bloqueadoras?: number;
};

async function obterContextoLista(
  id: string,
  mensagemPermissao: string
) {
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

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.editar",
    mensagemPermissao
  );

  if (bloqueio) {
    return {
      ok: false as const,
      response: bloqueio,
    };
  }

  if (!usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }

  const { data: lista, error } = await supabaseAdmin
    .from("contatos_listas")
    .select("id, nome, created_at")
    .eq("id", id)
    .eq("empresa_id", usuario.empresa_id)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      ),
    };
  }

  if (!lista) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Lista não encontrada." },
        { status: 404 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario,
    lista,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const contexto = await obterContextoLista(
    id,
    "Sem permissão para gerenciar listas de contatos."
  );

  if (!contexto.ok) return contexto.response;

  const { usuario } = contexto;
  const { data, error } = await supabaseAdmin.rpc(
    "analisar_exclusao_lista_contatos",
    {
      p_empresa_id: usuario.empresa_id,
      p_lista_id: id,
    }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const analise = (data || {}) as AnaliseExclusaoLista;

  if (analise.ok !== true) {
    return NextResponse.json(
      { ok: false, error: analise.erro || "Não foi possível analisar a lista." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    analise,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const contexto = await obterContextoLista(
    id,
    "Sem permissão para editar listas de contatos."
  );

  if (!contexto.ok) return contexto.response;

  const { usuario, lista } = contexto;
  const auditMeta = getRequestAuditMetadata(request);

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    body = {};
  }

  const nome = String(body.nome || "").trim();

  if (!nome) {
    return NextResponse.json(
      { ok: false, error: "Informe o nome da lista." },
      { status: 400 }
    );
  }

  if (nome.length > 160) {
    return NextResponse.json(
      { ok: false, error: "O nome da lista deve ter no máximo 160 caracteres." },
      { status: 400 }
    );
  }

  if (nome === lista.nome) {
    return NextResponse.json({
      ok: true,
      lista,
      message: "Nome da lista mantido.",
    });
  }

  const { data: listaAtualizada, error } = await supabaseAdmin
    .from("contatos_listas")
    .update({
      nome,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("empresa_id", usuario.empresa_id)
    .select("id, nome, created_at")
    .single();

  if (error) {
    const nomeDuplicado = error.code === "23505";

    return NextResponse.json(
      {
        ok: false,
        error: nomeDuplicado
          ? "Já existe uma lista com esse nome."
          : error.message || "Não foi possível atualizar a lista.",
      },
      { status: nomeDuplicado ? 409 : 500 }
    );
  }

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contatos_lista",
    entidade_id: id,
    acao: "lista_contatos_renomeada",
    descricao: `Lista "${lista.nome}" renomeada para "${nome}"`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: lista,
    depois: listaAtualizada,
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    lista: listaAtualizada,
    message: "Nome da lista atualizado com sucesso.",
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const contexto = await obterContextoLista(
    id,
    "Sem permissão para excluir listas de contatos."
  );

  if (!contexto.ok) return contexto.response;

  const { usuario, lista } = contexto;
  const auditMeta = getRequestAuditMetadata(request);

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();
    body =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    body = {};
  }

  if (body.confirmar_exclusao !== true) {
    return NextResponse.json(
      {
        ok: false,
        error: "Confirme a exclusão da lista para continuar.",
      },
      { status: 400 }
    );
  }

  const { data: analiseData, error: analiseError } = await supabaseAdmin.rpc(
    "analisar_exclusao_lista_contatos",
    {
      p_empresa_id: usuario.empresa_id,
      p_lista_id: id,
    }
  );

  if (analiseError) {
    return NextResponse.json(
      { ok: false, error: analiseError.message },
      { status: 500 }
    );
  }

  const analise = (analiseData || {}) as AnaliseExclusaoLista;

  if (analise.ok !== true) {
    return NextResponse.json(
      { ok: false, error: analise.erro || "Não foi possível analisar a lista." },
      { status: 404 }
    );
  }

  if (analise.exclusao_bloqueada === true) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Há contatos exclusivos com vínculos que impedem a exclusão. Remova esses vínculos antes de excluir a lista.",
        analise,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    "excluir_lista_contatos_com_exclusivos",
    {
      p_empresa_id: usuario.empresa_id,
      p_lista_id: id,
      p_confirmar_exclusao: true,
    }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const resultadoExclusao = (data || {}) as ResultadoExclusaoLista;

  if (resultadoExclusao.ok !== true) {
    return NextResponse.json(
      {
        ok: false,
        error:
          resultadoExclusao.erro || "Não foi possível excluir a lista.",
        resultado: resultadoExclusao,
      },
      { status: 409 }
    );
  }

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contatos_lista",
    entidade_id: id,
    acao: "lista_contatos_excluida",
    descricao: `Lista "${lista.nome}" excluída`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: {
      lista,
      analise,
    },
    metadata: {
      contatos_exclusivos_excluidos:
        resultadoExclusao.contatos_exclusivos_excluidos || 0,
      contatos_compartilhados_preservados:
        resultadoExclusao.contatos_compartilhados_preservados || 0,
      contatos_com_conversa:
        resultadoExclusao.contatos_com_conversa || 0,
      conversas_excluidas:
        resultadoExclusao.conversas_excluidas || 0,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    resultado: resultadoExclusao,
    message: `Lista "${lista.nome}" excluída com sucesso.`,
  });
}
