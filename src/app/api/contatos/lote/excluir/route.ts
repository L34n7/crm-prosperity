import { NextResponse } from "next/server";
import {
  getUsuarioContexto,
  type UsuarioContexto,
} from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const MAX_CONTATOS_POR_LOTE = 500;

type CorpoExclusao = {
  ids: string[];
  confirmarExclusaoConversas: boolean;
};

type ContextoPreparado = {
  usuario: UsuarioContexto;
  corpo: CorpoExclusao;
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  contatos: Array<{ id: string; nome: string | null; telefone: string | null }>;
  conversas: Array<{ id: string; contato_id: string | null }>;
  contatosComConversa: Set<string>;
};

type ResultadoPreparacao =
  | { ok: true; contexto: ContextoPreparado }
  | { ok: false; resposta: NextResponse };

async function lerCorpo(request: Request): Promise<
  | { ok: true; corpo: CorpoExclusao }
  | { ok: false; resposta: NextResponse }
> {
  let body: Record<string, unknown>;

  try {
    const parsedBody: unknown = await request.json();

    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return {
        ok: false,
        resposta: NextResponse.json(
          { ok: false, error: "Corpo da requisição inválido." },
          { status: 400 }
        ),
      };
    }

    body = parsedBody as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: "Corpo da requisição inválido." },
        { status: 400 }
      ),
    };
  }

  const ids = Array.from(
    new Set(
      (Array.isArray(body.ids) ? body.ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: "Selecione ao menos um contato." },
        { status: 400 }
      ),
    };
  }

  if (ids.length > MAX_CONTATOS_POR_LOTE) {
    return {
      ok: false,
      resposta: NextResponse.json(
        {
          ok: false,
          error: `Exclua no máximo ${MAX_CONTATOS_POR_LOTE} contatos por vez.`,
        },
        { status: 400 }
      ),
    };
  }

  return {
    ok: true,
    corpo: {
      ids,
      confirmarExclusaoConversas: body.confirmar_exclusao_conversas === true,
    },
  };
}

async function prepararContexto(request: Request): Promise<ResultadoPreparacao> {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.editar",
    "Sem permissão para excluir contatos."
  );

  if (bloqueio) return { ok: false, resposta: bloqueio };

  if (!usuario.empresa_id) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }

  const resultadoCorpo = await lerCorpo(request);
  if ("resposta" in resultadoCorpo) {
    return { ok: false, resposta: resultadoCorpo.resposta };
  }

  const corpo = resultadoCorpo.corpo;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: contatos, error: contatosError } = await supabaseAdmin
    .from("contatos")
    .select("id, nome, telefone")
    .eq("empresa_id", usuario.empresa_id)
    .in("id", corpo.ids);

  if (contatosError) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: contatosError.message },
        { status: 500 }
      ),
    };
  }

  if ((contatos || []).length !== corpo.ids.length) {
    return {
      ok: false,
      resposta: NextResponse.json(
        {
          ok: false,
          error: "Um ou mais contatos selecionados não foram encontrados nesta empresa.",
        },
        { status: 404 }
      ),
    };
  }

  const { data: conversas, error: conversasError } = await supabaseAdmin
    .from("conversas")
    .select("id, contato_id")
    .eq("empresa_id", usuario.empresa_id)
    .in("contato_id", corpo.ids);

  if (conversasError) {
    return {
      ok: false,
      resposta: NextResponse.json(
        { ok: false, error: "Erro ao consultar as conversas dos contatos." },
        { status: 500 }
      ),
    };
  }

  const conversasNormalizadas = (conversas || []) as Array<{
    id: string;
    contato_id: string | null;
  }>;
  const contatosComConversa = new Set<string>(
    conversasNormalizadas
      .map((conversa) => conversa.contato_id)
      .filter((id): id is string => Boolean(id))
  );

  return {
    ok: true,
    contexto: {
      usuario,
      corpo,
      supabaseAdmin,
      contatos: contatos || [],
      conversas: conversasNormalizadas,
      contatosComConversa,
    },
  };
}

export async function POST(request: Request) {
  const resultado = await prepararContexto(request);
  if ("resposta" in resultado) return resultado.resposta;

  const { contatos, conversas, contatosComConversa } = resultado.contexto;

  return NextResponse.json({
    ok: true,
    total: contatos.length,
    contatos_com_conversa: contatosComConversa.size,
    conversas: conversas.length,
    exige_confirmacao: contatosComConversa.size > 0,
  });
}

export async function DELETE(request: Request) {
  const resultado = await prepararContexto(request);
  if ("resposta" in resultado) return resultado.resposta;

  const {
    usuario,
    corpo,
    supabaseAdmin,
    contatos,
    conversas,
    contatosComConversa,
  } = resultado.contexto;

  if (contatosComConversa.size > 0 && !corpo.confirmarExclusaoConversas) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Há contatos selecionados com conversa vinculada. Confirme a responsabilidade para continuar.",
        total: contatos.length,
        contatos_com_conversa: contatosComConversa.size,
        conversas: conversas.length,
        exige_confirmacao: true,
      },
      { status: 409 }
    );
  }

  const [agendamentosResult, analisesResult] = await Promise.all([
    supabaseAdmin
      .from("agenda_agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .in("contato_id", corpo.ids),
    supabaseAdmin
      .from("automacao_arquivo_analises")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .in("contato_id", corpo.ids),
  ]);

  if (agendamentosResult.error || analisesResult.error) {
    return NextResponse.json(
      { ok: false, error: "Erro ao validar vínculos dos contatos." },
      { status: 500 }
    );
  }

  if ((agendamentosResult.count || 0) > 0 || (analisesResult.count || 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Um ou mais contatos possuem vínculos que impedem a exclusão. Remova esses vínculos antes de excluir os contatos.",
      },
      { status: 409 }
    );
  }

  const conversaIds = conversas.map((conversa) => conversa.id);

  if (conversaIds.length > 0) {
    const { error: mensagensError } = await supabaseAdmin
      .from("mensagens")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .in("conversa_id", conversaIds);

    if (mensagensError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao excluir as mensagens dos contatos." },
        { status: 500 }
      );
    }

    const { error: conversasDeleteError } = await supabaseAdmin
      .from("conversas")
      .delete()
      .eq("empresa_id", usuario.empresa_id)
      .in("id", conversaIds);

    if (conversasDeleteError) {
      return NextResponse.json(
        { ok: false, error: "Erro ao excluir as conversas dos contatos." },
        { status: 500 }
      );
    }
  }

  const { data: excluidos, error: contatosDeleteError } = await supabaseAdmin
    .from("contatos")
    .delete()
    .eq("empresa_id", usuario.empresa_id)
    .in("id", corpo.ids)
    .select("id");

  if (contatosDeleteError) {
    return NextResponse.json(
      { ok: false, error: "Erro ao excluir os contatos selecionados." },
      { status: 500 }
    );
  }

  const contatosExcluidos = excluidos || [];
  const auditMeta = getRequestAuditMetadata(request);

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id!,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: contatosExcluidos[0]?.id || corpo.ids[0],
    acao: "contatos_excluidos_em_massa",
    descricao: `${contatosExcluidos.length} contato(s) excluído(s) em massa`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    metadata: {
      contatos_ids: contatosExcluidos.map((contato) => contato.id),
      contatos_com_conversa: contatosComConversa.size,
      conversas_excluidas: conversaIds.length,
      responsabilidade_confirmada: corpo.confirmarExclusaoConversas,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    excluidos: contatosExcluidos.length,
    conversas_excluidas: conversaIds.length,
    message: `${contatosExcluidos.length} contato(s) excluído(s) com sucesso.`,
  });
}
