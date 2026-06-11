import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";

const supabaseAdmin = getSupabaseAdmin();

const VARIAVEIS_FIXAS = new Set([
  "nome",
  "nome_contato",
  "contato_nome",
  "telefone",
  "numero",
  "numero_contato",
  "contato_numero",
  "email",
  "email_contato",
  "contato_email",
  "campanha",
  "status",
  "status_lead",
  "origem",
]);

function normalizarChaveVariavel(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function getMetadataVariavel(metadata: any) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  return metadata;
}

export async function GET() {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_variaveis")
      .select("id, chave, valor, metadata_json, created_at, updated_at")
      .eq("empresa_id", usuario.empresa_id)
      .is("execucao_id", null)
      .is("contato_id", null)
      .eq("metadata_json->>tipo", "global_empresa")
      .eq("metadata_json->>ativo", "true")
      .order("chave", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar variáveis: ${error.message}` },
        { status: 500 }
      );
    }

    const variaveis = (data || []).map((item) => {
      const metadata = getMetadataVariavel(item.metadata_json);

      return {
        id: item.id,
        chave: item.chave,
        valor: item.valor || "",
        descricao: metadata.descricao || "",
        escopo: metadata.escopo || "global",
        ativo: metadata.ativo !== false,
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    return NextResponse.json({
      ok: true,
      variaveis,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const chave = normalizarChaveVariavel(String(body?.chave || ""));
    const valor = String(body?.valor || "").trim();
    const descricao = String(body?.descricao || "").trim();

    const escopoPermitido = ["global", "disparos", "fluxos"];
    const escopo = escopoPermitido.includes(String(body?.escopo))
      ? String(body?.escopo)
      : "global";

    if (!chave) {
      return NextResponse.json(
        { ok: false, error: "Informe o nome da variável." },
        { status: 400 }
      );
    }

    if (chave.length < 2) {
      return NextResponse.json(
        { ok: false, error: "O nome da variável precisa ter pelo menos 2 caracteres." },
        { status: 400 }
      );
    }

    if (VARIAVEIS_FIXAS.has(chave)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta variável já é fixa do sistema. Use outro nome para a variável personalizada.",
        },
        { status: 400 }
      );
    }

    if (!valor) {
      return NextResponse.json(
        { ok: false, error: "Informe o valor da variável." },
        { status: 400 }
      );
    }

    const empresaId = usuario.empresa_id;
    const agora = new Date().toISOString();

    const { data: existente, error: buscarError } = await supabaseAdmin
      .from("automacao_variaveis")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("chave", chave)
      .is("execucao_id", null)
      .is("contato_id", null)
      .eq("metadata_json->>tipo", "global_empresa")
      .maybeSingle();

    if (buscarError) {
      return NextResponse.json(
        { ok: false, error: `Erro ao verificar variável: ${buscarError.message}` },
        { status: 500 }
      );
    }

    const payload = {
      empresa_id: empresaId,
      execucao_id: null,
      contato_id: null,
      chave,
      valor,
      metadata_json: {
        tipo: "global_empresa",
        escopo,
        descricao,
        ativo: true,
      },
      updated_at: agora,
    };

    if (existente?.id) {
      const { data, error } = await supabaseAdmin
        .from("automacao_variaveis")
        .update(payload)
        .eq("id", existente.id)
        .eq("empresa_id", empresaId)
        .select("id, chave, valor, metadata_json, created_at, updated_at")
        .single();

      if (error) {
        return NextResponse.json(
          { ok: false, error: `Erro ao atualizar variável: ${error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        variavel: data,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_variaveis")
      .insert(payload)
      .select("id, chave, valor, metadata_json, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao salvar variável: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      variavel: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID da variável é obrigatório." },
        { status: 400 }
      );
    }

    const { data: variavel, error: buscarError } = await supabaseAdmin
      .from("automacao_variaveis")
      .select("id, metadata_json")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .is("execucao_id", null)
      .is("contato_id", null)
      .eq("metadata_json->>tipo", "global_empresa")
      .single();

    if (buscarError || !variavel) {
      return NextResponse.json(
        { ok: false, error: "Variável não encontrada." },
        { status: 404 }
      );
    }

    const metadataAtual = getMetadataVariavel(variavel.metadata_json);

    const { error } = await supabaseAdmin
      .from("automacao_variaveis")
      .update({
        metadata_json: {
          ...metadataAtual,
          tipo: "global_empresa",
          ativo: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao remover variável: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro interno." },
      { status: 500 }
    );
  }
}