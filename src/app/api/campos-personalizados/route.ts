import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { can } from "@/lib/permissoes/frontend";
import { buscarNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import { getCamposPadraoNicho } from "@/lib/cadastros/form-schema";

const supabase = getSupabaseAdmin();
const TIPOS_PERMITIDOS = new Set([
  "texto",
  "texto_longo",
  "numero",
  "data",
  "booleano",
  "select",
]);
const CHAVES_RESERVADAS = new Set([
  "id",
  "empresa_id",
  "tipo_pessoa",
  "nome",
  "nome_social",
  "razao_social",
  "cpf_cnpj",
  "data_nascimento",
  "email",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "observacoes",
  "status",
  "numero_prontuario",
  "convenio",
  "numero_carteirinha",
  "responsavel_nome",
]);

function gerarChave(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63);
}

function normalizarOpcoes(valor: unknown) {
  const opcoes = Array.isArray(valor)
    ? valor
    : String(valor ?? "")
        .split("\n")
        .map((item) => item.trim());

  return Array.from(
    new Set(opcoes.map((item) => String(item).trim()).filter(Boolean))
  ).slice(0, 100);
}

export async function GET() {
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

  if (!can(usuario.permissoes, "pessoas.visualizar")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para visualizar campos." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("campos_personalizados")
    .select("*")
    .eq("empresa_id", usuario.empresa_id)
    .order("escopo", { ascending: true })
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, campos: data ?? [] });
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

  if (!can(usuario.permissoes, "pessoas.campos_personalizados")) {
    return NextResponse.json(
      { ok: false, error: "Sem permissão para personalizar campos." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const nicho = await buscarNichoEmpresa(usuario.empresa_id);
    const nome = String(body?.nome ?? "").trim();
    const chave = gerarChave(String(body?.chave || nome));
    const tipo = String(body?.tipo ?? "texto");
    const escopo =
      body?.escopo === "paciente" && nicho.grupo === "saude"
        ? "paciente"
        : "pessoa";
    const opcoes = normalizarOpcoes(body?.opcoes);

    if (!nome || chave.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Informe um nome válido para o campo." },
        { status: 400 }
      );
    }

    if (!TIPOS_PERMITIDOS.has(tipo)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de campo inválido." },
        { status: 400 }
      );
    }

    const chavesPadrao = new Set([
      ...CHAVES_RESERVADAS,
      ...getCamposPadraoNicho(nicho.codigo).map((campo) => campo.chave),
    ]);

    if (chavesPadrao.has(chave)) {
      return NextResponse.json(
        { ok: false, error: "Essa chave já pertence a um campo do sistema." },
        { status: 409 }
      );
    }

    if (tipo === "select" && opcoes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe ao menos uma opção para o campo." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("campos_personalizados")
      .insert({
        empresa_id: usuario.empresa_id,
        escopo,
        chave,
        nome,
        tipo,
        obrigatorio: body?.obrigatorio === true,
        opcoes,
        ordem: Number.isFinite(Number(body?.ordem))
          ? Math.trunc(Number(body.ordem))
          : 0,
        ativo: true,
        created_by: usuario.id,
      })
      .select("*")
      .single();

    if (error) {
      const status = error.message.includes("duplicate") ? 409 : 400;
      return NextResponse.json(
        { ok: false, error: error.message },
        { status }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Campo personalizado criado com sucesso.",
        campo: data,
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
            : "Erro interno ao criar campo.",
      },
      { status: 400 }
    );
  }
}

