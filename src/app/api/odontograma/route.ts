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

const DENTES_ADULTOS = new Set([
  "18",
  "17",
  "16",
  "15",
  "14",
  "13",
  "12",
  "11",
  "21",
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "48",
  "47",
  "46",
  "45",
  "44",
  "43",
  "42",
  "41",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
  "38",
]);

const STATUS_PERMITIDOS = new Set([
  "saudavel",
  "atencao",
  "carie",
  "restauracao",
  "canal",
  "extraido",
  "implante",
  "planejado",
  "realizado",
]);

type PacienteRow = {
  id: string;
  empresa_id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio: string | null;
};

type PessoaRow = {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  status: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function sanitizarBusca(valor: string) {
  return valor.replace(/[%_,()]/g, " ").trim().toLowerCase();
}

async function garantirAcessoOdontograma(
  permissoes: string[],
  permissao: string,
  empresaId: string
) {
  if (!can(permissoes, permissao)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para acessar odontograma." },
        { status: 403 }
      ),
    };
  }

  const nicho = await buscarNichoEmpresa(empresaId);

  if (!nicho.modulos.includes("saude.odontograma")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Odontograma não está disponível para este nicho." },
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
      .select("id, nome, cpf_cnpj, email, status")
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
    .select("id, empresa_id, pessoa_id, numero_prontuario, convenio")
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
      .select("id, nome, cpf_cnpj, email, status")
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
    const acesso = await garantirAcessoOdontograma(
      usuario.permissoes,
      "odontograma.visualizar",
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

    let dentes: unknown[] = [];

    if (selecionado) {
      const { data, error } = await supabase
        .from("odontograma_dentes")
        .select("*")
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", selecionado.id)
        .order("dente", { ascending: true });

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      dentes = data ?? [];
    }

    return NextResponse.json({
      ok: true,
      contexto: {
        nicho: acesso.nicho,
      },
      pacientes,
      selecionado,
      dentes,
      dentes_padrao: Array.from(DENTES_ADULTOS),
      status_permitidos: Array.from(STATUS_PERMITIDOS),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar odontograma.",
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
    const acesso = await garantirAcessoOdontograma(
      usuario.permissoes,
      "odontograma.editar",
      usuario.empresa_id
    );

    if (!acesso.ok) return acesso.response;

    const body = await request.json();
    const pacienteId = texto(body?.paciente_id);
    const dente = texto(body?.dente);
    const status = texto(body?.status) || "saudavel";

    if (!pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um paciente." },
        { status: 400 }
      );
    }

    if (!DENTES_ADULTOS.has(dente)) {
      return NextResponse.json(
        { ok: false, error: "Dente inválido para o odontograma." },
        { status: 400 }
      );
    }

    if (!STATUS_PERMITIDOS.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido para o dente." },
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

    const { data, error } = await supabase
      .from("odontograma_dentes")
      .upsert(
        {
          empresa_id: usuario.empresa_id,
          paciente_id: paciente.id,
          pessoa_id: paciente.pessoa_id,
          dente,
          status,
          procedimento: texto(body?.procedimento) || null,
          observacoes: texto(body?.observacoes) || null,
          updated_by: usuario.id,
        },
        { onConflict: "empresa_id,paciente_id,dente" }
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
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "odontograma",
      entidade_id: data.id,
      acao: "dente_atualizado",
      descricao: `Dente ${dente} atualizado no odontograma`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        paciente_id: paciente.id,
        pessoa_id: paciente.pessoa_id,
        dente,
        status,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Odontograma atualizado.",
      dente: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao salvar odontograma.",
      },
      { status: 400 }
    );
  }
}
