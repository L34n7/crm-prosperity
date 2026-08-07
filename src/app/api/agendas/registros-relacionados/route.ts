import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();

type ContatoRow = {
  id: string;
  pessoa_id: string | null;
};

type PacienteRow = {
  id: string;
  pessoa_id: string;
  numero_prontuario: string | null;
  convenio: string | null;
  pessoa: {
    nome: string;
  } | null;
};

function relacaoUnica<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
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

  const { searchParams } = new URL(request.url);
  const contatoId = String(searchParams.get("contato_id") ?? "").trim();

  if (!contatoId) {
    return NextResponse.json(
      { ok: false, error: "Selecione o paciente do agendamento." },
      { status: 400 }
    );
  }

  try {
    const nicho = await buscarNichoEmpresa(usuario.empresa_id);

    if (nicho.grupo !== "saude") {
      return NextResponse.json(
        {
          ok: false,
          error: "Registros clínicos não estão disponíveis para este nicho.",
        },
        { status: 403 }
      );
    }

    const { data: contato, error: contatoError } = await supabase
      .from("contatos")
      .select("id, pessoa_id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", contatoId)
      .maybeSingle<ContatoRow>();

    if (contatoError) {
      throw new Error(`Erro ao localizar o paciente: ${contatoError.message}`);
    }

    if (!contato?.pessoa_id) {
      return NextResponse.json({
        ok: true,
        registros: [],
        aviso:
          "O contato selecionado ainda não está vinculado a um cadastro de paciente.",
      });
    }

    const { data: pacienteRaw, error: pacienteError } = await supabase
      .from("pacientes")
      .select("id, pessoa_id, numero_prontuario, convenio, pessoa:pessoas!inner(nome)")
      .eq("empresa_id", usuario.empresa_id)
      .eq("pessoa_id", contato.pessoa_id)
      .maybeSingle();

    if (pacienteError) {
      throw new Error(`Erro ao carregar o paciente: ${pacienteError.message}`);
    }

    if (!pacienteRaw) {
      return NextResponse.json({
        ok: true,
        registros: [],
        aviso: "O contato selecionado não possui cadastro de paciente.",
      });
    }

    const paciente = {
      ...(pacienteRaw as Omit<PacienteRow, "pessoa"> & {
        pessoa: PacienteRow["pessoa"] | PacienteRow["pessoa"][];
      }),
      pessoa: relacaoUnica(pacienteRaw.pessoa),
    };
    const nomePaciente = paciente.pessoa?.nome || "Paciente";
    const registros: Array<{
      entidade_tipo: string;
      entidade_id: string;
      papel: string;
      titulo: string;
      subtitulo: string;
      imagem_url: string;
      principal: boolean;
      dados_json: Record<string, string>;
    }> = [];

    if (
      nicho.modulos.includes("saude.prontuarios") &&
      can(usuario.permissoes, "prontuarios.visualizar")
    ) {
      const { data: prontuario, error: prontuarioError } = await supabase
        .from("prontuarios")
        .select("id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", paciente.id)
        .neq("status", "arquivado")
        .maybeSingle();

      if (prontuarioError) {
        throw new Error(
          `Erro ao carregar o prontuário: ${prontuarioError.message}`
        );
      }

      if (prontuario) {
        registros.push({
          entidade_tipo: "prontuario",
          entidade_id: prontuario.id,
          papel: "paciente",
          titulo: `Prontuario de ${nomePaciente}`,
          subtitulo: [paciente.numero_prontuario, paciente.convenio]
            .filter(Boolean)
            .join(" · "),
          imagem_url: "",
          principal: registros.length === 0,
          dados_json: {
            origem: "sistema",
            paciente_id: paciente.id,
            pessoa_id: paciente.pessoa_id,
            numero_prontuario: paciente.numero_prontuario ?? "",
            href: `/prontuarios?paciente_id=${paciente.id}`,
          },
        });
      }
    }

    if (
      nicho.modulos.includes("saude.odontograma") &&
      can(usuario.permissoes, "odontograma.visualizar")
    ) {
      const { count, error: odontogramaError } = await supabase
        .from("odontograma_dentes")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", usuario.empresa_id)
        .eq("paciente_id", paciente.id);

      if (odontogramaError) {
        throw new Error(`Erro ao carregar o odontograma: ${odontogramaError.message}`);
      }

      registros.push({
        entidade_tipo: "odontograma",
        entidade_id: paciente.id,
        papel: "paciente",
        titulo: `Odontograma de ${nomePaciente}`,
        subtitulo: `${paciente.numero_prontuario || "Paciente cadastrado"} · ${count ?? 0} dente(s) registrado(s)`,
        imagem_url: "",
        principal: registros.length === 0,
        dados_json: {
          origem: "sistema",
          paciente_id: paciente.id,
          pessoa_id: paciente.pessoa_id,
          numero_prontuario: paciente.numero_prontuario ?? "",
          href: `/odontograma?paciente_id=${paciente.id}`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      registros,
      aviso:
        registros.length === 0
          ? "Nenhum prontuário disponível para o paciente selecionado."
          : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao carregar registros relacionados.",
      },
      { status: 500 }
    );
  }
}
