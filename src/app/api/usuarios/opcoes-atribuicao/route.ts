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

    const { searchParams } = new URL(request.url);
    const setorId = searchParams.get("setor_id");

    if (!setorId) {
      return NextResponse.json(
        { ok: false, error: "setor_id é obrigatório" },
        { status: 400 }
      );
    }

    if (!isAdministrador(usuario)) {
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

      for (const administrador of usuariosAdmin || []) {
        usuariosPorId.set(administrador.id, {
          id: administrador.id,
          nome: administrador.nome,
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
