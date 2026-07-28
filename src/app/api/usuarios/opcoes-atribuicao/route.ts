import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  isAdministrador,
  podeAtribuirConversas,
} from "@/lib/auth/authorization";
import { usuarioPertenceAoSetor } from "@/lib/usuarios/setores";
import { listarIdsUsuariosAdministradoresDaEmpresa } from "@/lib/usuarios/administradores";

const supabaseAdmin = getSupabaseAdmin();

type UsuarioSetorComUsuario = {
  usuario: {
    id: string;
    nome: string | null;
    status: string;
    empresa_id: string;
  } | null;
};

async function listarSetoresPermitidos(params: {
  usuarioId: string;
  empresaId: string;
  administrador: boolean;
}) {
  let setorIdsPermitidos: string[] | null = null;

  if (!params.administrador) {
    const { data: vinculos, error: vinculosError } = await supabaseAdmin
      .from("usuarios_setores")
      .select("setor_id")
      .eq("usuario_id", params.usuarioId);

    if (vinculosError) {
      throw vinculosError;
    }

    setorIdsPermitidos = Array.from(
      new Set(
        (vinculos || [])
          .map((vinculo) => String(vinculo.setor_id || "").trim())
          .filter(Boolean)
      )
    );

    if (setorIdsPermitidos.length === 0) {
      return [];
    }
  }

  let query = supabaseAdmin
    .from("setores")
    .select("id, nome")
    .eq("empresa_id", params.empresaId)
    .eq("ativo", true)
    .order("ordem_exibicao", { ascending: true })
    .order("nome", { ascending: true });

  if (setorIdsPermitidos) {
    query = query.in("id", setorIdsPermitidos);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

export async function GET(request: Request) {
  try {
    const resultado = await getUsuarioContexto();

    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      );
    }

    const { usuario } = resultado;

    if (!(await podeAtribuirConversas(usuario))) {
      return NextResponse.json(
        { ok: false, error: "Sem permissão para atribuir conversas" },
        { status: 403 }
      );
    }

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada" },
        { status: 400 }
      );
    }

    const administrador = isAdministrador(usuario);
    const { searchParams } = new URL(request.url);
    const setorId = String(searchParams.get("setor_id") || "").trim();

    if (!setorId) {
      const setores = await listarSetoresPermitidos({
        usuarioId: usuario.id,
        empresaId: usuario.empresa_id,
        administrador,
      });

      return NextResponse.json({
        ok: true,
        setores,
      });
    }

    if (!administrador) {
      const usuarioLogadoPertenceAoSetor = await usuarioPertenceAoSetor(
        usuario.id,
        setorId
      );

      if (!usuarioLogadoPertenceAoSetor) {
        return NextResponse.json(
          {
            ok: false,
            error: "Você só pode listar usuários dos setores aos quais pertence",
          },
          { status: 403 }
        );
      }
    }

    const [{ data, error }, administradorIds] = await Promise.all([
      supabaseAdmin
        .from("usuarios_setores")
        .select(`
          usuario:usuarios (
            id,
            nome,
            status,
            empresa_id
          )
        `)
        .eq("setor_id", setorId),
      listarIdsUsuariosAdministradoresDaEmpresa(usuario.empresa_id),
    ]);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as UsuarioSetorComUsuario[];
    const administradores = new Set(administradorIds);
    const usuariosPorId = new Map<
      string,
      { id: string; nome: string | null; is_administrador: boolean }
    >();

    rows
      .map((item) => item.usuario)
      .filter(
        (
          item
        ): item is {
          id: string;
          nome: string | null;
          status: string;
          empresa_id: string;
        } =>
          !!item &&
          item.status === "ativo" &&
          item.empresa_id === usuario.empresa_id
      )
      .forEach((item) => {
        usuariosPorId.set(item.id, {
          id: item.id,
          nome: item.nome,
          is_administrador: administradores.has(item.id),
        });
      });

    if (administradorIds.length > 0) {
      const { data: usuariosAdmin, error: usuariosAdminError } = await supabaseAdmin
        .from("usuarios")
        .select("id, nome")
        .eq("empresa_id", usuario.empresa_id)
        .eq("status", "ativo")
        .in("id", administradorIds);

      if (usuariosAdminError) {
        return NextResponse.json(
          { ok: false, error: usuariosAdminError.message },
          { status: 500 }
        );
      }

      for (const administradorUsuario of usuariosAdmin || []) {
        usuariosPorId.set(administradorUsuario.id, {
          id: administradorUsuario.id,
          nome: administradorUsuario.nome,
          is_administrador: true,
        });
      }
    }

    const usuarios = Array.from(usuariosPorId.values()).sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
    );

    return NextResponse.json({
      ok: true,
      usuarios,
    });
  } catch (error) {
    console.error("Erro ao listar opções de atribuição:", error);

    return NextResponse.json(
      { ok: false, error: "Erro interno ao listar opções de atribuição" },
      { status: 500 }
    );
  }
}
