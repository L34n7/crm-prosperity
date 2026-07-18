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

const EMPRESA_SELECT = `
  id,
  nome_fantasia,
  documento,
  email,
  telefone,
  site,
  logo_url,
  endereco,
  cidade,
  estado,
  nicho_id,
  nichos (
    id,
    codigo,
    nome,
    grupo,
    rotulo_cadastro_singular,
    rotulo_cadastro_plural
  )
`;

function normalizarRelacao<T>(valor: T | T[] | null | undefined): T | null {
  return Array.isArray(valor) ? valor[0] ?? null : valor ?? null;
}

function texto(valor: unknown, limite: number) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, limite);
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
      { ok: false, error: "Apenas administradores podem alterar os dados da empresa." },
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

async function carregarEmpresa(empresaId: string) {
  const [{ data: empresa, error: empresaError }, { data: nichos, error: nichosError }] =
    await Promise.all([
      supabase.from("empresas").select(EMPRESA_SELECT).eq("id", empresaId).maybeSingle(),
      supabase
        .from("nichos")
        .select("id, codigo, nome, grupo, rotulo_cadastro_singular, rotulo_cadastro_plural")
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
    ]);

  if (empresaError) throw new Error(empresaError.message);
  if (nichosError) throw new Error(nichosError.message);
  if (!empresa) throw new Error("Empresa não encontrada.");

  return {
    empresa: {
      ...empresa,
      nicho: normalizarRelacao(empresa.nichos),
      nichos: undefined,
    },
    nichos: nichos ?? [],
  };
}

export async function GET() {
  const resultado = await getUsuarioContexto();
  const semAcesso = respostaSemAcesso(resultado);
  if (semAcesso) return semAcesso;
  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
  }

  try {
    const contexto = await carregarEmpresa(resultado.usuario.empresa_id);
    return NextResponse.json({ ok: true, ...contexto });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao carregar a empresa." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const resultado = await getUsuarioContexto();
  const semAcesso = respostaSemAcesso(resultado);
  if (semAcesso) return semAcesso;
  if (!resultado.ok || !resultado.usuario.empresa_id) {
    return NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada." }, { status: 400 });
  }

  const empresaId = resultado.usuario.empresa_id;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const nomeFantasia = texto(body.nome_fantasia, 120);
    const documento = texto(body.documento, 20);
    const email = texto(body.email, 160).toLowerCase();
    const telefone = texto(body.telefone, 30);
    const site = texto(body.site, 240);
    const logoUrl = texto(body.logo_url, 500);
    const endereco = texto(body.endereco, 240);
    const cidade = texto(body.cidade, 120);
    const estado = texto(body.estado, 2).toUpperCase();
    const nichoId = texto(body.nicho_id, 80);

    if (nomeFantasia.length < 2) {
      return NextResponse.json({ ok: false, error: "Informe um nome de empresa válido." }, { status: 400 });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Informe um e-mail comercial válido." }, { status: 400 });
    }
    if (!nichoId) {
      return NextResponse.json({ ok: false, error: "Selecione o nicho da empresa." }, { status: 400 });
    }
    if (estado && estado.length !== 2) {
      return NextResponse.json({ ok: false, error: "Informe o estado usando a sigla com 2 letras." }, { status: 400 });
    }

    const contextoAtual = await carregarEmpresa(empresaId);
    const novoNicho = contextoAtual.nichos.find((nicho) => nicho.id === nichoId);
    if (!novoNicho) {
      return NextResponse.json({ ok: false, error: "Nicho não encontrado ou inativo." }, { status: 404 });
    }

    const atualizacao = {
      nome_fantasia: nomeFantasia,
      documento: documento || null,
      email,
      telefone: telefone || null,
      site: site || null,
      logo_url: logoUrl || null,
      endereco: endereco || null,
      cidade: cidade || null,
      estado: estado || null,
      nicho_id: nichoId,
    };

    const { error: updateError } = await supabase
      .from("empresas")
      .update(atualizacao)
      .eq("id", empresaId);
    if (updateError) throw new Error(updateError.message);

    if (contextoAtual.empresa.nicho_id !== nichoId) {
      invalidarCacheNichoEmpresa(empresaId);
    }

    const contextoNovo = await carregarEmpresa(empresaId);
    const auditMeta = getRequestAuditMetadata(request);
    await registrarLogAuditoriaSeguro({
      empresa_id: empresaId,
      categoria: "sistema",
      entidade: "empresa",
      entidade_id: empresaId,
      acao: "dados_empresa_alterados",
      descricao: "Dados cadastrais e configurações da empresa foram atualizados.",
      usuario_id: resultado.usuario.id,
      usuario_nome: resultado.usuario.nome,
      usuario_email: resultado.usuario.email,
      antes: contextoAtual.empresa,
      depois: contextoNovo.empresa,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      message: "Configurações da empresa atualizadas com sucesso.",
      ...contextoNovo,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro ao atualizar os dados da empresa." },
      { status: 500 }
    );
  }
}
