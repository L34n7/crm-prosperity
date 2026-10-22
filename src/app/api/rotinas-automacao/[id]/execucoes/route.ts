import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  bloquearSemPermissao,
  usuarioTemPermissao,
} from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();
const POR_PAGINA = 10;

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function referenciaExecucao(contexto: Record<string, unknown> | null | undefined) {
  const dados = contexto || {};
  const candidatos = [
    dados.contato_nome,
    dados.nome_cliente,
    dados.paciente_nome,
    dados.cliente_nome,
    dados.titulo,
    dados.assunto,
  ];
  return candidatos.find((valor) => typeof valor === "string" && valor.trim()) || null;
}

function contatoContextoExecucao(execucao: { contexto_json?: unknown }) {
  const contexto = objeto(execucao.contexto_json);
  const contato = objeto(contexto.contato);
  const cliente = objeto(contexto.cliente);

  const nome = String(
    contato.nome ||
    cliente.nome ||
    contexto.contato_nome ||
    contexto.cliente_nome ||
    "",
  ).trim();
  const telefone = String(
    contato.telefone ||
    cliente.telefone ||
    contexto.contato_telefone ||
    contexto.cliente_telefone ||
    "",
  ).trim();

  if (!nome && !telefone) return null;
  return {
    id: String(
      contato.id ||
      cliente.id ||
      contexto.contato_id ||
      contexto.cliente_id ||
      "",
    ).trim() || null,
    nome: nome || null,
    telefone: telefone || null,
  };
}

function contatoIdExecucao(execucao: {
  entidade_tipo?: string | null;
  entidade_id?: string | null;
  contexto_json?: unknown;
}) {
  if (["contato", "contatos"].includes(String(execucao.entidade_tipo || "").toLowerCase())) {
    return String(execucao.entidade_id || "").trim() || null;
  }

  const contexto = objeto(execucao.contexto_json);
  const contato = objeto(contexto.contato);
  const contextoEvento = objeto(contexto.contexto_evento);
  const contatoEvento = objeto(contextoEvento.contato);
  const candidatos = [
    contexto.contato_id,
    contato.id,
    contextoEvento.contato_id,
    contatoEvento.id,
  ];
  const encontrado = candidatos
    .map((valor) => String(valor || "").trim())
    .find(Boolean);
  return encontrado || null;
}

function statusEtapa(job: {
  status: string;
  cancelamento_solicitado_em?: string | null;
}) {
  if (job.cancelamento_solicitado_em) return "cancelamento_solicitado";
  return job.status;
}

function paginaDaRequest(request: Request) {
  const valor = Number(new URL(request.url).searchParams.get("pagina") || 1);
  if (!Number.isFinite(valor)) return 1;
  return Math.max(1, Math.floor(valor));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const contexto = await getUsuarioContexto();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, error: contexto.error },
      { status: contexto.status },
    );
  }

  const { usuario } = contexto;
  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 403 },
    );
  }

  const bloqueio = bloquearSemPermissao(
    usuario,
    "automacoes_api.visualizar",
    "Sem permissão para visualizar execuções de automações.",
  );
  if (bloqueio) return bloqueio;

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Automação não informada." },
      { status: 400 },
    );
  }

  const { data: automacao, error: automacaoError } = await supabase
    .from("rotina_automacoes")
    .select("id,nome,status,categoria,updated_at")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", id)
    .maybeSingle();

  if (automacaoError) {
    return NextResponse.json(
      { ok: false, error: automacaoError.message },
      { status: 500 },
    );
  }
  if (!automacao) {
    return NextResponse.json(
      { ok: false, error: "Automação não encontrada." },
      { status: 404 },
    );
  }

  const paginaSolicitada = paginaDaRequest(request);
  const inicio = (paginaSolicitada - 1) * POR_PAGINA;
  const fim = inicio + POR_PAGINA - 1;

  const baseExecucoes = () =>
    supabase
      .from("rotina_automacao_execucoes")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .eq("automacao_id", id);

  const [
    execucoesResult,
    emAndamentoResult,
    concluidasResult,
    errosResult,
    canceladasResult,
    etapasAtivasResult,
  ] = await Promise.all([
    supabase
      .from("rotina_automacao_execucoes")
      .select(
        "id,automacao_id,gatilho_id,evento_chave,entidade_tipo,entidade_id,status,contexto_json,resultado_json,erro,iniciada_em,finalizada_em,cancelado_em,motivo_cancelamento,created_at,updated_at",
        { count: "exact" },
      )
      .eq("empresa_id", usuario.empresa_id)
      .eq("automacao_id", id)
      .order("iniciada_em", { ascending: false })
      .range(inicio, fim),
    baseExecucoes().in("status", ["iniciada", "processando"]),
    baseExecucoes().eq("status", "concluida"),
    baseExecucoes().eq("status", "erro"),
    baseExecucoes().eq("status", "cancelada"),
    supabase
      .from("rotina_automacao_jobs")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .eq("automacao_id", id)
      .in("status", ["pendente", "processando"]),
  ]);

  const erroMetricas =
    emAndamentoResult.error ||
    concluidasResult.error ||
    errosResult.error ||
    canceladasResult.error ||
    etapasAtivasResult.error;
  if (execucoesResult.error || erroMetricas) {
    return NextResponse.json(
      {
        ok: false,
        error: execucoesResult.error?.message || erroMetricas?.message || "Erro ao carregar execuções.",
      },
      { status: 500 },
    );
  }

  const execucoes = execucoesResult.data || [];
  const totalExecucoes = Number(execucoesResult.count || 0);
  const totalPaginas = totalExecucoes ? Math.ceil(totalExecucoes / POR_PAGINA) : 0;

  const execucaoIds = execucoes.map((item) => item.id);
  const { data: jobs, error: jobsError } = execucaoIds.length
    ? await supabase
        .from("rotina_automacao_jobs")
        .select(
          "id,automacao_id,execucao_id,acao_id,ordem,titulo,canal,depende_de_job_id,entidade_tipo,entidade_id,executar_em,status,tentativas,max_tentativas,proxima_tentativa_em,bloqueado_em,contexto_json,resultado_json,erro,executado_em,cancelado_em,origem_cancelamento,cancelamento_solicitado_em,created_at,updated_at",
        )
        .eq("empresa_id", usuario.empresa_id)
        .eq("automacao_id", id)
        .in("execucao_id", execucaoIds)
        .order("ordem", { ascending: true })
        .order("executar_em", { ascending: true })
    : { data: [], error: null };

  if (jobsError) {
    return NextResponse.json(
      { ok: false, error: jobsError.message },
      { status: 500 },
    );
  }

  const jobsLista = jobs || [];
  const acaoIds = Array.from(
    new Set(jobsLista.map((item) => item.acao_id).filter(Boolean)),
  ) as string[];
  const { data: acoes, error: acoesError } = acaoIds.length
    ? await supabase
        .from("rotina_automacao_acoes")
        .select("id,tipo_acao,ordem,configuracao_json")
        .eq("empresa_id", usuario.empresa_id)
        .eq("automacao_id", id)
        .in("id", acaoIds)
    : { data: [], error: null };

  if (acoesError) {
    return NextResponse.json(
      { ok: false, error: acoesError.message },
      { status: 500 },
    );
  }

  const contatosPorId = new Map<string, { id: string; nome: string | null; telefone: string | null }>();
  if (automacao.categoria === "contatos" && execucoes.length) {
    const contatoIds = Array.from(
      new Set(
        execucoes
          .filter((item) => !contatoContextoExecucao(item))
          .map((item) => contatoIdExecucao(item))
          .filter(Boolean),
      ),
    ) as string[];

    if (contatoIds.length) {
      const { data: contatos, error: contatosError } = await supabase
        .from("contatos")
        .select("id,nome,telefone")
        .eq("empresa_id", usuario.empresa_id)
        .in("id", contatoIds);
      if (contatosError) {
        return NextResponse.json(
          { ok: false, error: contatosError.message },
          { status: 500 },
        );
      }
      for (const contato of contatos || []) {
        contatosPorId.set(String(contato.id), {
          id: String(contato.id),
          nome: contato.nome || null,
          telefone: contato.telefone || null,
        });
      }
    }
  }

  const acoesPorId = new Map((acoes || []).map((acao) => [acao.id, acao]));
  const jobsPorExecucao = new Map<string, typeof jobsLista>();
  for (const job of jobsLista) {
    if (!job.execucao_id) continue;
    const atuais = jobsPorExecucao.get(job.execucao_id) || [];
    atuais.push(job);
    jobsPorExecucao.set(job.execucao_id, atuais);
  }

  const execucoesNormalizadas = execucoes.map((execucao) => {
    const etapas = (jobsPorExecucao.get(execucao.id) || []).map((job) => {
      const acao = job.acao_id ? acoesPorId.get(job.acao_id) : null;
      return {
        ...job,
        status_exibicao: statusEtapa(job),
        tipo_acao: acao?.tipo_acao || null,
        acao_configuracao_json: acao?.configuracao_json || {},
      };
    });

    const pendentes = etapas.filter((item) => item.status === "pendente").length;
    const processando = etapas.filter((item) => item.status === "processando").length;
    const concluidas = etapas.filter((item) => item.status === "concluido").length;
    const canceladas = etapas.filter((item) => item.status === "cancelado").length;
    const erros = etapas.filter((item) => item.status === "erro").length;
    const contatoContexto = contatoContextoExecucao(execucao);
    const contatoId = automacao.categoria === "contatos" ? contatoIdExecucao(execucao) : null;

    return {
      ...execucao,
      referencia: referenciaExecucao(
        execucao.contexto_json as Record<string, unknown> | null,
      ),
      contato: contatoContexto || (contatoId ? contatosPorId.get(contatoId) || null : null),
      etapas,
      resumo: {
        total: etapas.length,
        pendentes,
        processando,
        concluidas,
        canceladas,
        erros,
      },
    };
  });

  return NextResponse.json({
    ok: true,
    pode_gerenciar: usuarioTemPermissao(usuario, "automacoes_api.gerenciar"),
    automacao,
    paginacao: {
      pagina: paginaSolicitada,
      por_pagina: POR_PAGINA,
      total: totalExecucoes,
      total_paginas: totalPaginas,
      tem_anterior: paginaSolicitada > 1,
      tem_proxima: totalPaginas > 0 && paginaSolicitada < totalPaginas,
    },
    resumo: {
      execucoes: totalExecucoes,
      em_andamento: Number(emAndamentoResult.count || 0),
      concluidas: Number(concluidasResult.count || 0),
      com_erro: Number(errosResult.count || 0),
      canceladas: Number(canceladasResult.count || 0),
      etapas_ativas: Number(etapasAtivasResult.count || 0),
    },
    execucoes: execucoesNormalizadas,
  });
}
