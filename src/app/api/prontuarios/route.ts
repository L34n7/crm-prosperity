import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getRequestAuditMetadata, registrarLogAuditoriaSeguro } from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

const DENTES_ADULTOS = new Set([
  "18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38",
]);
const STATUS_ODONTOGRAMA = new Set([
  "saudavel", "atencao", "carie", "restauracao", "canal", "extraido", "implante", "planejado", "realizado",
]);

type PacienteRow = {
  id: string;
  empresa_id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio?: string | null;
  responsavel_nome?: string | null;
  created_at?: string;
};
type PessoaRow = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  data_nascimento: string | null;
  status: string;
};
type OdontogramaAlteracao = {
  dente: string;
  status: string;
  procedimento: string;
  observacoes: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}
function sanitizarBusca(valor: string) {
  return valor.replace(/[%_,()]/g, " ").trim().toLowerCase();
}
function normalizarDataAtendimento(valor: unknown) {
  const entrada = texto(valor);
  if (!entrada) return new Date().toISOString();
  const data = new Date(entrada);
  if (Number.isNaN(data.getTime())) throw new Error("Data do atendimento inválida.");
  return data.toISOString();
}
function sanitizarAlteracoesOdontograma(valor: unknown) {
  if (valor === undefined || valor === null) {
    return { alteracoes: [] as OdontogramaAlteracao[], error: "" };
  }
  if (!Array.isArray(valor)) {
    return { alteracoes: [] as OdontogramaAlteracao[], error: "Alterações do odontograma inválidas." };
  }
  if (valor.length > 32) {
    return { alteracoes: [] as OdontogramaAlteracao[], error: "Um atendimento pode alterar no máximo 32 dentes." };
  }

  const porDente = new Map<string, OdontogramaAlteracao>();
  for (const item of valor) {
    const dente = texto(item?.dente);
    const status = texto(item?.status) || "saudavel";
    if (!DENTES_ADULTOS.has(dente)) {
      return { alteracoes: [] as OdontogramaAlteracao[], error: "Dente inválido para o odontograma." };
    }
    if (!STATUS_ODONTOGRAMA.has(status)) {
      return { alteracoes: [] as OdontogramaAlteracao[], error: "Status inválido para o dente " + dente + "." };
    }
    porDente.set(dente, {
      dente,
      status,
      procedimento: texto(item?.procedimento).slice(0, 500),
      observacoes: texto(item?.observacoes).slice(0, 4000),
    });
  }
  return { alteracoes: Array.from(porDente.values()), error: "" };
}

async function garantirAcessoSaude(permissoes: string[], permissao: string, empresaId: string) {
  if (!can(permissoes, permissao)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Sem permissão para acessar prontuários." }, { status: 403 }),
    };
  }
  const nicho = await buscarNichoEmpresa(empresaId);
  if (!nicho.modulos.includes("saude.prontuarios")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Prontuário não está disponível para este nicho." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, nicho };
}

async function carregarPacientes(empresaId: string, buscaOriginal: string, pessoaIdFiltro = "") {
  const busca = sanitizarBusca(buscaOriginal);
  let pessoasPermitidas: PessoaRow[] | null = null;

  if (busca) {
    const { data, error } = await supabase
      .from("pessoas")
      .select("id, nome, cpf_cnpj, email, data_nascimento, status")
      .eq("empresa_id", empresaId)
      .neq("status", "arquivado")
      .or("nome.ilike.%" + busca + "%,cpf_cnpj.ilike.%" + busca + "%,email.ilike.%" + busca + "%")
      .order("nome", { ascending: true })
      .limit(200);
    if (error) throw new Error("Erro ao buscar pacientes: " + error.message);
    pessoasPermitidas = (data ?? []) as PessoaRow[];
    if (pessoasPermitidas.length === 0) return [];
  }

  let pacientesQuery = supabase
    .from("pacientes")
    .select("id, empresa_id, pessoa_id, numero_prontuario, convenio, responsavel_nome, created_at")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (pessoaIdFiltro) pacientesQuery = pacientesQuery.eq("pessoa_id", pessoaIdFiltro);
  if (pessoasPermitidas) {
    pacientesQuery = pacientesQuery.in("pessoa_id", pessoasPermitidas.map((pessoa) => pessoa.id));
  }

  const { data: pacientesData, error: pacientesError } = await pacientesQuery;
  if (pacientesError) throw new Error("Erro ao carregar pacientes: " + pacientesError.message);
  const pacientes = (pacientesData ?? []) as PacienteRow[];
  if (pacientes.length === 0) return [];

  const pessoas =
    pessoasPermitidas ??
    ((await supabase
      .from("pessoas")
      .select("id, nome, cpf_cnpj, email, data_nascimento, status")
      .eq("empresa_id", empresaId)
      .in("id", pacientes.map((paciente) => paciente.pessoa_id))
      .neq("status", "arquivado")).data ?? []) as PessoaRow[];
  const pessoasPorId = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa]));
  return pacientes
    .map((paciente) => ({ ...paciente, pessoa: pessoasPorId.get(paciente.pessoa_id) ?? null }))
    .filter((paciente) => paciente.pessoa)
    .sort((a, b) => String(a.pessoa?.nome ?? "").localeCompare(String(b.pessoa?.nome ?? "")));
}

async function buscarPacienteEmpresa(empresaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, empresa_id, pessoa_id, numero_prontuario")
    .eq("empresa_id", empresaId)
    .eq("id", pacienteId)
    .maybeSingle<PacienteRow>();
  if (error) throw new Error("Erro ao buscar paciente: " + error.message);
  return data;
}

export async function GET(request: Request) {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  }
  const { usuario } = resultado;
  if (!usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
  }

  try {
    const acesso = await garantirAcessoSaude(usuario.permissoes, "prontuarios.visualizar", usuario.empresa_id);
    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const busca = searchParams.get("busca") ?? "";
    const pacienteIdParam = searchParams.get("paciente_id") ?? "";
    const contatoIdParam = searchParams.get("contato_id") ?? "";
    let pessoaIdContato = "";
    let pessoaContato: Record<string, unknown> | null = null;

    if (contatoIdParam) {
      const { data: contato, error: contatoError } = await supabase
        .from("contatos")
        .select("pessoa_id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("id", contatoIdParam)
        .maybeSingle();
      if (contatoError) throw new Error("Erro ao buscar vínculo do contato: " + contatoError.message);
      pessoaIdContato = texto(contato?.pessoa_id);

      if (pessoaIdContato) {
        const { data: pessoa, error: pessoaError } = await supabase
          .from("pessoas")
          .select("id, tipo_pessoa, nome, nome_social, razao_social, cpf_cnpj, data_nascimento, email, cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, dados_personalizados, status")
          .eq("empresa_id", usuario.empresa_id)
          .eq("id", pessoaIdContato)
          .maybeSingle();
        if (pessoaError) throw new Error("Erro ao carregar pessoa do contato: " + pessoaError.message);
        pessoaContato = pessoa;
      }
    }

    const pacientes = contatoIdParam && !pessoaIdContato
      ? []
      : await carregarPacientes(usuario.empresa_id, busca, pessoaIdContato);
    const selecionado =
      (pacienteIdParam ? pacientes.find((paciente) => paciente.id === pacienteIdParam) : pacientes[0]) ?? null;

    let prontuario = null;
    let atendimentos: Array<Record<string, unknown>> = [];

    if (selecionado) {
      const odontogramaDisponivel =
        acesso.nicho.modulos.includes("saude.odontograma") &&
        can(usuario.permissoes, "odontograma.visualizar");
      const [prontuarioRes, atendimentosRes, evolucoesRes] = await Promise.all([
        supabase
          .from("prontuarios").select("*")
          .eq("empresa_id", usuario.empresa_id)
          .eq("paciente_id", selecionado.id)
          .neq("status", "arquivado")
          .maybeSingle(),
        supabase
          .from("prontuario_atendimentos").select("*")
          .eq("empresa_id", usuario.empresa_id)
          .eq("paciente_id", selecionado.id)
          .order("data_atendimento", { ascending: false })
          .limit(80),
        odontogramaDisponivel
          ? supabase
              .from("odontograma_evolucoes").select("*")
              .eq("empresa_id", usuario.empresa_id)
              .eq("paciente_id", selecionado.id)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (prontuarioRes.error) throw new Error(prontuarioRes.error.message);
      if (atendimentosRes.error) throw new Error(atendimentosRes.error.message);
      if (evolucoesRes.error) throw new Error(evolucoesRes.error.message);

      const evolucoesPorAtendimento = new Map<string, unknown[]>();
      for (const evolucao of (evolucoesRes.data ?? []) as Array<Record<string, unknown>>) {
        const atendimentoId = String(evolucao.atendimento_id ?? "");
        const lista = evolucoesPorAtendimento.get(atendimentoId) ?? [];
        lista.push(evolucao);
        evolucoesPorAtendimento.set(atendimentoId, lista);
      }
      prontuario = prontuarioRes.data;
      atendimentos = (atendimentosRes.data ?? []).map((atendimento) => ({
        ...atendimento,
        odontograma_evolucoes: evolucoesPorAtendimento.get(String(atendimento.id)) ?? [],
      }));
    }

    return NextResponse.json({
      ok: true,
      contexto: { nicho: acesso.nicho },
      pacientes,
      selecionado,
      pessoa_contato: pessoaContato,
      prontuario,
      atendimentos,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro interno ao carregar prontuários." },
      { status: 500 },
    );
  }
}

async function salvarAtendimento(request: Request, atualizar: boolean) {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) {
    return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
  }
  const { usuario } = resultado;
  if (!usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
  }

  try {
    const acesso = await garantirAcessoSaude(
      usuario.permissoes,
      atualizar ? "prontuarios.editar" : "prontuarios.criar",
      usuario.empresa_id,
    );
    if (!acesso.ok) return acesso.response;

    const body = await request.json();
    const pacienteId = texto(body?.paciente_id);
    const atendimentoId = texto(body?.atendimento_id);
    if (!pacienteId) {
      return NextResponse.json({ ok: false, error: "Selecione um paciente." }, { status: 400 });
    }
    if (atualizar && !atendimentoId) {
      return NextResponse.json({ ok: false, error: "Atendimento não informado." }, { status: 400 });
    }

    const odontograma = sanitizarAlteracoesOdontograma(body?.odontograma_alteracoes);
    if (odontograma.error) {
      return NextResponse.json({ ok: false, error: odontograma.error }, { status: 400 });
    }
    if (
      odontograma.alteracoes.length > 0 &&
      (!can(usuario.permissoes, "odontograma.editar") ||
        !acesso.nicho.modulos.includes("saude.odontograma"))
    ) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para registrar alterações no odontograma." },
        { status: 403 },
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);
    if (!paciente) {
      return NextResponse.json({ ok: false, error: "Paciente não encontrado." }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("salvar_atendimento_clinico", {
      p_empresa_id: usuario.empresa_id,
      p_paciente_id: paciente.id,
      p_pessoa_id: paciente.pessoa_id,
      p_usuario_id: usuario.id,
      p_atendimento_id: atualizar ? atendimentoId : null,
      p_data_atendimento: normalizarDataAtendimento(body?.data_atendimento),
      p_tipo: texto(body?.tipo) || "consulta",
      p_queixa_principal: texto(body?.queixa_principal) || null,
      p_anamnese: texto(body?.anamnese) || null,
      p_diagnostico: texto(body?.diagnostico) || null,
      p_conduta: texto(body?.conduta) || null,
      p_prescricao: texto(body?.prescricao) || null,
      p_observacoes: texto(body?.observacoes) || null,
      p_odontograma_alteracoes: odontograma.alteracoes,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    const registro = (data ?? {}) as {
      prontuario_id?: string;
      atendimento?: Record<string, unknown>;
    };
    const atendimento = registro.atendimento;
    if (!registro.prontuario_id || !atendimento?.id) {
      throw new Error("O atendimento não foi retornado após a gravação.");
    }

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "prontuario",
      entidade_id: registro.prontuario_id,
      acao: atualizar ? "atendimento_atualizado" : "atendimento_criado",
      descricao: atualizar ? "Atendimento atualizado no prontuário" : "Atendimento registrado no prontuário",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        paciente_id: paciente.id,
        pessoa_id: paciente.pessoa_id,
        atendimento_id: atendimento.id,
        tipo: atendimento.tipo,
        odontograma_alteracoes: odontograma.alteracoes.length,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: atualizar
          ? "Atendimento atualizado com sucesso."
          : "Atendimento e evolução clínica registrados no prontuário.",
        prontuario_id: registro.prontuario_id,
        atendimento,
      },
      { status: atualizar ? 200 : 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : atualizar
            ? "Erro interno ao atualizar atendimento."
            : "Erro interno ao salvar prontuário.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  return salvarAtendimento(request, false);
}
export async function PUT(request: Request) {
  return salvarAtendimento(request, true);
}
