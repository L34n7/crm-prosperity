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

const LADOS_PERMITIDOS = new Set(["esquerdo", "direito"]);
const REGIOES_PERMITIDAS = new Set([
  "halux",
  "outros_dedos",
  "antepe",
  "mediape",
  "calcanhar",
]);
const STATUS_PERMITIDOS = new Set([
  "sem_alteracao",
  "atencao",
  "calosidade",
  "fissura",
  "lesao",
  "inflamacao",
  "infeccao",
  "tratamento",
]);

type PacienteRow = {
  id: string;
  empresa_id: string;
  pessoa_id: string;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

async function garantirAcessoMapaPodal(
  permissoes: string[],
  permissao: string,
  empresaId: string,
) {
  if (!can(permissoes, permissao)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Sem permissão para acessar prontuários." },
        { status: 403 },
      ),
    };
  }

  const nicho = await buscarNichoEmpresa(empresaId);

  if (
    nicho.codigo !== "podologia" ||
    !nicho.modulos.includes("saude.prontuarios")
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Mapa podal não está disponível para este nicho." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, nicho };
}

async function buscarPacienteEmpresa(empresaId: string, pacienteId: string) {
  const { data, error } = await supabase
    .from("pacientes")
    .select("id, empresa_id, pessoa_id")
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
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoMapaPodal(
      usuario.permissoes,
      "prontuarios.visualizar",
      usuario.empresa_id,
    );

    if (!acesso.ok) return acesso.response;

    const { searchParams } = new URL(request.url);
    const pacienteId = texto(searchParams.get("paciente_id"));

    if (!pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um paciente." },
        { status: 400 },
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);

    if (!paciente) {
      return NextResponse.json(
        { ok: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("mapa_podal_regioes")
      .select("*")
      .eq("empresa_id", usuario.empresa_id)
      .eq("paciente_id", paciente.id)
      .order("lado", { ascending: true })
      .order("regiao", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      contexto: { nicho: acesso.nicho },
      paciente,
      registros: data ?? [],
      regioes_permitidas: Array.from(REGIOES_PERMITIDAS),
      status_permitidos: Array.from(STATUS_PERMITIDOS),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar mapa podal.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status },
    );
  }

  const { usuario } = resultado;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 },
    );
  }

  try {
    const acesso = await garantirAcessoMapaPodal(
      usuario.permissoes,
      "prontuarios.editar",
      usuario.empresa_id,
    );

    if (!acesso.ok) return acesso.response;

    const body = await request.json();
    const pacienteId = texto(body?.paciente_id);
    const lado = texto(body?.lado);
    const regiao = texto(body?.regiao);
    const status = texto(body?.status) || "sem_alteracao";

    if (!pacienteId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um paciente." },
        { status: 400 },
      );
    }

    if (!LADOS_PERMITIDOS.has(lado)) {
      return NextResponse.json(
        { ok: false, error: "Lado inválido para o mapa podal." },
        { status: 400 },
      );
    }

    if (!REGIOES_PERMITIDAS.has(regiao)) {
      return NextResponse.json(
        { ok: false, error: "Região inválida para o mapa podal." },
        { status: 400 },
      );
    }

    if (!STATUS_PERMITIDOS.has(status)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido para o mapa podal." },
        { status: 400 },
      );
    }

    const paciente = await buscarPacienteEmpresa(usuario.empresa_id, pacienteId);

    if (!paciente) {
      return NextResponse.json(
        { ok: false, error: "Paciente não encontrado." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("mapa_podal_regioes")
      .upsert(
        {
          empresa_id: usuario.empresa_id,
          paciente_id: paciente.id,
          pessoa_id: paciente.pessoa_id,
          lado,
          regiao,
          status,
          procedimento: texto(body?.procedimento) || null,
          observacoes: texto(body?.observacoes) || null,
          updated_by: usuario.id,
        },
        { onConflict: "empresa_id,paciente_id,lado,regiao" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    const auditMeta = getRequestAuditMetadata(request);

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "saude",
      entidade: "mapa_podal",
      entidade_id: data.id,
      acao: "regiao_atualizada",
      descricao: `Região ${regiao} do pé ${lado} atualizada no mapa podal`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      metadata: {
        paciente_id: paciente.id,
        pessoa_id: paciente.pessoa_id,
        lado,
        regiao,
        status,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Mapa podal atualizado.",
      registro: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao salvar mapa podal.",
      },
      { status: 400 },
    );
  }
}
