import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  bloquearSemPermissao,
  usuarioTemPermissao,
} from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabase = getSupabaseAdmin();

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

function statusEtapa(job: {
  status: string;
  cancelamento_solicitado_em?: string | null;
  depende_de_job_id?: string | null;
}) {
  if (job.cancelamento_solicitado_em) return "cancelamento_solicitado";
  return job.status;
}

export async function GET(
  _request: Request,
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

  const { data: execucoes, error: execucoesError } = await supabase
    .from("rotina_automacao_execucoes")
    .select(
      "id,automacao_id,gatilho_id,evento_chave,entidade_tipo,entidade_id,status,contexto_json,resultado_json,erro,iniciada_em,finalizada_em,cancelado_em,motivo_cancelamento,created_at,updated_at",
    )
    .eq("empresa_id", usuario.empresa_id)
    .eq("automacao_id", id)
    .order("iniciada_em", { ascending: false })
    .limit(100);

  if (execucoesError) {
    return NextResponse.json(
      { ok: false, error: execucoesError.message },
      { status: 500 },
    );
  }

  const execucaoIds = (execucoes || []).map((item) => item.id);
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

  const acoesPorId = new Map((acoes || []).map((acao) => [acao.id, acao]));
  const jobsPorExecucao = new Map<string, typeof jobsLista>();
  for (const job of jobsLista) {
    if (!job.execucao_id) continue;
    const atuais = jobsPorExecucao.get(job.execucao_id) || [];
    atuais.push(job);
    jobsPorExecucao.set(job.execucao_id, atuais);
  }

  const execucoesNormalizadas = (execucoes || []).map((execucao) => {
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

    return {
      ...execucao,
      referencia: referenciaExecucao(
        execucao.contexto_json as Record<string, unknown> | null,
      ),
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

  const todosJobs = jobsLista;
  const ativos = todosJobs.filter((item) =>
    ["pendente", "processando"].includes(item.status),
  );

  return NextResponse.json({
    ok: true,
    pode_gerenciar: usuarioTemPermissao(usuario, "automacoes_api.gerenciar"),
    automacao,
    resumo: {
      execucoes: execucoesNormalizadas.length,
      em_andamento: execucoesNormalizadas.filter((item) =>
        ["iniciada", "processando"].includes(item.status),
      ).length,
      concluidas: execucoesNormalizadas.filter((item) => item.status === "concluida")
        .length,
      com_erro: execucoesNormalizadas.filter((item) => item.status === "erro").length,
      canceladas: execucoesNormalizadas.filter((item) => item.status === "cancelada")
        .length,
      etapas_ativas: ativos.length,
      etapas_pendentes: ativos.filter((item) => item.status === "pendente").length,
      etapas_processando: ativos.filter((item) => item.status === "processando").length,
    },
    execucoes: execucoesNormalizadas,
  });
}
