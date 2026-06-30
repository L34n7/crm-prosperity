import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { isAdministrador } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { invalidarCacheNichoEmpresa } from "@/lib/nichos/empresa-nicho";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const supabase = getSupabaseAdmin();

type NichoRow = {
  id: string;
  codigo: string;
  nome: string;
  grupo: "comercial" | "saude";
  rotulo_cadastro_singular: string;
  rotulo_cadastro_plural: string;
};

type EmpresaNichoRow = {
  id: string;
  nome_fantasia: string;
  nicho_id: string;
  nichos: NichoRow | NichoRow[] | null;
};

function normalizarRelacao<T>(relacao: T | T[] | null | undefined) {
  return Array.isArray(relacao) ? relacao[0] ?? null : relacao ?? null;
}

async function carregarContextoNicho(empresaId: string) {
  const [
    { data: empresa, error: empresaError },
    { data: nichos, error: nichosError },
  ] = await Promise.all([
    supabase
      .from("empresas")
      .select(
        `
          id,
          nome_fantasia,
          nicho_id,
          nichos (
            id,
            codigo,
            nome,
            grupo,
            rotulo_cadastro_singular,
            rotulo_cadastro_plural
          )
        `
      )
      .eq("id", empresaId)
      .maybeSingle(),
    supabase
      .from("nichos")
      .select(
        "id, codigo, nome, grupo, rotulo_cadastro_singular, rotulo_cadastro_plural"
      )
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
  ]);

  if (empresaError) throw new Error(empresaError.message);
  if (nichosError) throw new Error(nichosError.message);
  if (!empresa) throw new Error("Empresa não encontrada.");

  const empresaTipada = empresa as EmpresaNichoRow;

  return {
    empresa: {
      id: empresaTipada.id,
      nome_fantasia: empresaTipada.nome_fantasia,
      nicho_id: empresaTipada.nicho_id,
      nicho: normalizarRelacao(empresaTipada.nichos),
    },
    nichos: (nichos ?? []) as NichoRow[],
  };
}

function respostaSemAcesso(
  resultado: Awaited<ReturnType<typeof getUsuarioContexto>>
) {
  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  if (!isAdministrador(resultado.usuario)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Apenas administradores podem alterar o nicho da empresa.",
      },
      { status: 403 }
    );
  }

  if (!resultado.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  return null;
}

export async function GET() {
  const resultado = await getUsuarioContexto();
  const semAcesso = respostaSemAcesso(resultado);

  if (semAcesso) return semAcesso;
  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  try {
    const contexto = await carregarContextoNicho(resultado.usuario.empresa_id);
    return NextResponse.json({ ok: true, ...contexto });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar o nicho da empresa.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const resultado = await getUsuarioContexto();
  const semAcesso = respostaSemAcesso(resultado);

  if (semAcesso) return semAcesso;
  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const { usuario } = resultado;
  const empresaId = usuario.empresa_id;

  if (!empresaId) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as { nicho_id?: unknown };
    const nichoId = String(body.nicho_id ?? "").trim();

    if (!nichoId) {
      return NextResponse.json(
        { ok: false, error: "Selecione um nicho." },
        { status: 400 }
      );
    }

    const contextoAtual = await carregarContextoNicho(empresaId);
    const nichoAtual = contextoAtual.empresa.nicho;
    const novoNicho =
      contextoAtual.nichos.find((nicho) => nicho.id === nichoId) ?? null;

    if (!novoNicho) {
      return NextResponse.json(
        { ok: false, error: "Nicho não encontrado ou inativo." },
        { status: 404 }
      );
    }

    if (contextoAtual.empresa.nicho_id === novoNicho.id) {
      return NextResponse.json({
        ok: true,
        message: "Este nicho já está ativo.",
        empresa: contextoAtual.empresa,
      });
    }

    const { error: updateError } = await supabase
      .from("empresas")
      .update({ nicho_id: novoNicho.id })
      .eq("id", empresaId);

    if (updateError) throw new Error(updateError.message);

    invalidarCacheNichoEmpresa(empresaId);

    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: empresaId,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: empresaId,
      acao: "nicho_alterado",
      descricao: `Nicho alterado de ${nichoAtual?.nome ?? "não definido"} para ${novoNicho.nome}`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: nichoAtual
        ? { nicho_id: nichoAtual.id, codigo: nichoAtual.codigo }
        : null,
      depois: { nicho_id: novoNicho.id, codigo: novoNicho.codigo },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: `Nicho alterado para ${novoNicho.nome}.`,
      empresa: {
        ...contextoAtual.empresa,
        nicho_id: novoNicho.id,
        nicho: novoNicho,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao alterar o nicho da empresa.",
      },
      { status: 500 }
    );
  }
}
