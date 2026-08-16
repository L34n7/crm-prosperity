import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const supabase = getSupabaseAdmin();

function somenteDigitos(valor: unknown) {
  return String(valor ?? "").replace(/\D/g, "");
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
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

  if (!can(usuario.permissoes, "pessoas.criar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para cadastrar pacientes." },
      { status: 403 },
    );
  }

  if (!can(usuario.permissoes, "contatos.visualizar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para consultar contatos." },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const buscaOriginal = texto(searchParams.get("busca"));
    const busca = somenteDigitos(buscaOriginal);

    if (busca.length < 3) {
      return NextResponse.json({ ok: true, contatos: [] });
    }

    const { data: contatosData, error: contatosError } = await supabase
      .from("contatos")
      .select(
        "id, pessoa_id, nome, whatsapp_profile_name, telefone, email, empresa, origem, campanha, status_lead, classificacao, observacoes, ultima_interacao_at, created_at, updated_at",
      )
      .eq("empresa_id", usuario.empresa_id)
      .ilike("telefone", `%${busca}%`)
      .order("updated_at", { ascending: false })
      .limit(15);

    if (contatosError) {
      throw new Error(`Erro ao buscar contatos: ${contatosError.message}`);
    }

    const contatos = contatosData ?? [];
    const pessoaIds = Array.from(
      new Set(
        contatos
          .map((contato) => texto(contato.pessoa_id))
          .filter(Boolean),
      ),
    );

    const [pessoasRes, pacientesRes] = await Promise.all([
      pessoaIds.length
        ? supabase
            .from("pessoas")
            .select(
              "id, tipo_pessoa, nome, nome_social, razao_social, cpf_cnpj, data_nascimento, email, cep, logradouro, numero, complemento, bairro, cidade, estado, observacoes, dados_personalizados, status",
            )
            .eq("empresa_id", usuario.empresa_id)
            .in("id", pessoaIds)
        : Promise.resolve({ data: [], error: null }),
      pessoaIds.length
        ? supabase
            .from("pacientes")
            .select("pessoa_id")
            .eq("empresa_id", usuario.empresa_id)
            .in("pessoa_id", pessoaIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (pessoasRes.error) {
      throw new Error(`Erro ao carregar dados das pessoas: ${pessoasRes.error.message}`);
    }
    if (pacientesRes.error) {
      throw new Error(`Erro ao validar pacientes existentes: ${pacientesRes.error.message}`);
    }

    const pessoasPorId = new Map(
      (pessoasRes.data ?? []).map((pessoa) => [String(pessoa.id), pessoa]),
    );
    const pessoasComPaciente = new Set(
      (pacientesRes.data ?? []).map((paciente) => String(paciente.pessoa_id)),
    );

    const disponiveis = contatos
      .filter((contato) => {
        const pessoaId = texto(contato.pessoa_id);
        return !pessoaId || !pessoasComPaciente.has(pessoaId);
      })
      .map((contato) => ({
        ...contato,
        pessoa: contato.pessoa_id
          ? pessoasPorId.get(String(contato.pessoa_id)) ?? null
          : null,
      }));

    return NextResponse.json({ ok: true, contatos: disponiveis });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao buscar contatos disponíveis.",
      },
      { status: 500 },
    );
  }
}
