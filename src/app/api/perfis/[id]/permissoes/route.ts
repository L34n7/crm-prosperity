import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";

const supabaseAdmin = getSupabaseAdmin();

function getGrupoFromCodigo(codigo: string) {
  const prefixo = codigo.split(".")[0] || "outros";

  switch (prefixo) {
    case "conversas":
      return "Conversas";
    case "mensagens":
      return "Mensagens";
    case "usuarios":
      return "Usuários";
    case "setores":
      return "Setores";
    case "perfis":
      return "Perfis";
    case "relatorios":
      return "Relatórios";
    case "sistema":
      return "Sistema";
    default:
      return "Outros";
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!isAdministrador(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Apenas administradores podem acessar permissões de perfil" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfis_empresa")
      .select("id, nome, descricao, ativo, empresa_id")
      .eq("id", id)
      .maybeSingle();

    if (perfilError) {
      return NextResponse.json(
        { ok: false, error: perfilError.message },
        { status: 500 }
      );
    }

    if (!perfil) {
      return NextResponse.json(
        { ok: false, error: "Perfil não encontrado" },
        { status: 404 }
      );
    }

    if (perfil.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode acessar este perfil" },
        { status: 403 }
      );
    }

    const [{ data: permissoes }, { data: perfilPermissoes }] = await Promise.all([
      supabaseAdmin.from("permissoes").select("codigo, descricao").order("codigo"),
      supabaseAdmin
        .from("perfil_permissoes")
        .select("permissao_codigo")
        .eq("perfil_empresa_id", id),
    ]);

    const marcadas = new Set(
      (perfilPermissoes || []).map((item: any) => item.permissao_codigo)
    );

    const lista = (permissoes || []).map((item: any) => ({
      codigo: item.codigo,
      descricao: item.descricao,
      grupo: getGrupoFromCodigo(item.codigo),
      marcada: marcadas.has(item.codigo),
    }));

    return NextResponse.json({
      ok: true,
      perfil: {
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao,
        ativo: perfil.ativo,
      },
      permissoes: lista,
    });
  } catch (error) {
    console.error("Erro ao carregar permissões do perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao carregar permissões do perfil" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!isAdministrador(usuario)) {
      return NextResponse.json(
        { ok: false, error: "Apenas administradores podem alterar permissões de perfil" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfis_empresa")
      .select("id, empresa_id")
      .eq("id", id)
      .maybeSingle();

    if (perfilError) {
      return NextResponse.json(
        { ok: false, error: perfilError.message },
        { status: 500 }
      );
    }

    if (!perfil) {
      return NextResponse.json(
        { ok: false, error: "Perfil não encontrado" },
        { status: 404 }
      );
    }

    if (perfil.empresa_id !== usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Você não pode alterar este perfil" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const permissoes = Array.isArray(body?.permissoes) ? body.permissoes : [];

    const permissoesValidas = Array.from(
      new Set(
        permissoes
          .filter((item: unknown) => typeof item === "string")
          .map((item: string) => item.trim())
          .filter(Boolean)
      )
    );

    const { data: catalogoPermissoes, error: catalogoError } = await supabaseAdmin
      .from("permissoes")
      .select("codigo");

    if (catalogoError) {
      return NextResponse.json(
        { ok: false, error: catalogoError.message },
        { status: 500 }
      );
    }

    const codigosValidos = new Set(
      (catalogoPermissoes || []).map((item: any) => item.codigo)
    );

    const contemCodigoInvalido = permissoesValidas.some(
      (codigo) => !codigosValidos.has(codigo)
    );

    if (contemCodigoInvalido) {
      return NextResponse.json(
        { ok: false, error: "Uma ou mais permissões são inválidas" },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("perfil_permissoes")
      .delete()
      .eq("perfil_empresa_id", id);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      );
    }

    if (permissoesValidas.length > 0) {
      const payload = permissoesValidas.map((codigo) => ({
        perfil_empresa_id: id,
        permissao_codigo: codigo,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("perfil_permissoes")
        .insert(payload);

      if (insertError) {
        return NextResponse.json(
          { ok: false, error: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Permissões do perfil salvas com sucesso",
    });
  } catch (error) {
    console.error("Erro ao salvar permissões do perfil:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao salvar permissões do perfil" },
      { status: 500 }
    );
  }
}