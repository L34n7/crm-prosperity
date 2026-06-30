import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

type PacienteRow = {
  id: string;
  empresa_id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio: string | null;
  responsavel_nome: string | null;
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

function sanitizarBusca(valor: string) {
  return valor.replace(/[%_,()]/g, " ").trim().toLowerCase();
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function normalizarDataAtendimento(valor: unknown) {
  const entrada = texto(valor);

  if (!entrada) return new Date().toISOString();

  const data = new Date(entrada);

  if (Number.isNaN(data.getTime())) {
    throw new Error("Data do atendimento inválida.");
  }

  return data.toISOString();
}

async function garantirAcessoSaude(
  permissoes: string[],
  permissao: string,
  empresaId: string
) {
  if (!can(permissoes, permissao)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para acessar prontuários." },
        { status: 403 }
      ),
    };
  }

  const nicho = await buscarNichoEmpresa(empresaId);

  if (!nicho.modulos.includes("saude.prontuarios")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Prontuário não está disponível para este nicho." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, nicho };
}

async function carregarPacientes(empresaId: string, buscaOriginal: string) {
  const busca = sanitizarBusca(buscaOriginal);
  let pessoasPermitidas: PessoaRow[] | null = null;

  if (busca) {
    const { data, error } = await supabase
      .from("pessoas")
      .select("id, nome, cpf_cnpj, email, data_nascimento, status")
      .eq("empresa_id", empresaId)
      .neq("status", "arquivado")
      .or(
        `nome.ilike.%${busca}%,cpf_cnpj.ilike.%${busca}%,email.ilike.%${busca}%`
      )
      .order("nome", { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(`Erro ao buscar pacientes: ${error.message}`);
    }

    pessoasPermitidas = (data ?? []) as PessoaRow[];

    if (pessoasPermitidas.length === 0) return [];
  }

  let pacientesQuery = supabase
    .from("pacientes")
    .select("id, empresa_id, pessoa_id, numero_prontuario, convenio, responsavel_nome, created_at")
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (pessoasPermitidas) {
    pacientesQuery = pacientesQuery.in(
      "pessoa_id",
      pessoasPermitidas.map((pessoa) => pessoa.id)
    );
  }

  const { data: pacientesData, error: pacientesError } = await pacientesQuery;

  if (pacientesError) {
    throw new Error(`Erro ao carregar pacientes: ${pacientesError.message}`);
  }

  const pacientes = (pacientesData ?? []) as PacienteRow[];

  if (pacientes.length === 0) return [];

  const pessoas =
    pessoasPermitidas ??
    ((await supabase
      .from("pessoas")
      .select("id, nome, cpf_cnpj, email, data_nascimento, status")
      .eq("empresa_id", empresaId)
      .in(
        "id",
        pacientes.map((paciente) => paciente.pessoa_id)
      )
      .neq("status", "arquivado")).data ?? []) as PessoaRow[];

  const pessoasPorId = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa]));

  return pacientes
    .map((paciente) => ({
      ...paciente,
      pessoa: pessoasPorId.get(paciente.pessoa_id) ?? null,
    }))
    .filter((paciente) => paciente.pessoa)
    .sort((a, b) =>
      String(a.pessoa?.nome ?? "").localeCompare(String(b.pessoa?.nome ?? ""))
    );
}

async function buscarPacienteEmpresa(empresaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, empresa_id, pessoa_id, numero_prontuario")
    .eq("empresa_id", empresaId)
    .eq("id", pacienteId)
    .maybeSingle<PacienteRow>();

  if (error) {
    throw new Error(`Erro ao buscar paciente: ${error.message}`);
  }

  return data;
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

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  try {
    const acesso = await garantirAcessoSaude(
      usuario.permissoes,
      "prontuarios.visualizar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const busca = searchParams.get("busca") ?? "";
    const pacienteIdParam = searchParams.get("paciente_id") ?? "";
    const pacientes = await carregarPacientes(usuario.empresa_id, busca);
    const selecionado =
      pacientes.find((paciente) => paciente.id === pacienteIdParam) ??
      pacientes[0] ??
      null;

    let prontuario = null;
    let atendimentos: unknown[] = [];

    if (selecionado) {
      const [{ data: prontuarioData, error: prontuarioError }, atendimentosRes] =
        await Promise.all([
          supabase
            .from("prontuarios")
            .select("*")
            .eq("empresa_id", usuario.empresa_id)
            .eq("paciente_id", selecionado.id)
            .neq("status", "arquivado")
            .maybeSingle(),
          supabase
            .from("prontuario_atendimentos")
            .select("*")
            .eq("empresa_id", usuario.empresa_id)
            .eq("paciente_id", selecionado.id)
            .order("data_atendimento", { ascending: false })
            .limit(80),
        ]);

      if (prontuarioError) {
        return NextResponse.json(
          { ok: false, error: prontuarioError.message },
          { status: 500 }
        );
      }

      if (atendimentosRes.error) {
        return NextResponse.json(
          { ok: false, error: atendimentosRes.error.message },
          { status: 500 }
        );
      }

      prontuario = prontuarioData;
      atendimentos = atendimentosRes.data ?? [];
    }

    return NextResponse.json({
      ok: true,
      contexto: {
        nicho: acesso.nicho,
      },
      pacientes,
      selecionado,
      prontuario,
      atendimentos,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar prontuários.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  try {
    const acesso = await garantirAcessoSaude(
      usuario.permissoes,
      "prontuarios.criar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const body = await request.json();
    const pacienteId = texto(body?.paciente_id);

    if (!pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um paciente." },
        { status: 400 }
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);

    if (!paciente) {
      return NextResponse.json(
        { ok: false, error: "Paciente não encontrado." },
        { status: 404 }
      );
    }

    const tipo = texto(body?.tipo) || "consulta";
    const dataAtendimento = normalizarDataAtendimento(body?.data_atendimento);

    const { data: prontuario, error: prontuarioError } = await supabase
      .from("prontuarios")
      .upsert(
        {
          empresa_id: usuario.empresa_id,
          paciente_id: paciente.id,
          pessoa_id: paciente.pessoa_id,
          status: "ativo",
          updated_by: usuario.id,
          created_by: usuario.id,
        },
        { onConflict: "empresa_id,paciente_id" }
      )
      .select("id")
      .single();

    if (prontuarioError) {
      return NextResponse.json(
        { ok: false, error: prontuarioError.message },
        { status: 400 }
      );
    }

    const { data: atendimento, error: atendimentoError } = await supabase
      .from("prontuario_atendimentos")
      .insert({
        empresa_id: usuario.empresa_id,
        prontuario_id: prontuario.id,
        paciente_id: paciente.id,
        pessoa_id: paciente.pessoa_id,
        data_atendimento: dataAtendimento,
        tipo,
        queixa_principal: texto(body?.queixa_principal) || null,
        anamnese: texto(body?.anamnese) || null,
        diagnostico: texto(body?.diagnostico) || null,
        conduta: texto(body?.conduta) || null,
        prescricao: texto(body?.prescricao) || null,
        observacoes: texto(body?.observacoes) || null,
        anexos: [],
        created_by: usuario.id,
        updated_by: usuario.id,
      })
      .select("*")
      .single();

    if (atendimentoError) {
      return NextResponse.json(
        { ok: false, error: atendimentoError.message },
        { status: 400 }
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "prontuario",
      entidade_id: prontuario.id,
      acao: "atendimento_criado",
      descricao: "Atendimento registrado no prontuário",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        paciente_id: paciente.id,
        pessoa_id: paciente.pessoa_id,
        atendimento_id: atendimento.id,
        tipo,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Atendimento registrado no prontuário.",
        prontuario_id: prontuario.id,
        atendimento,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao salvar prontuário.",
      },
      { status: 400 }
    );
  }
}
