import { NextResponse } from "next/server";
import { getUsuarioContexto, type UsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { validarCaptura } from "@/lib/automacoes/captura-normalizacao";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function podeGerenciarContatos(usuario: UsuarioContexto) {
  const perfis = (usuario.perfis_dinamicos ?? []).map((perfil) => perfil.nome);
  return perfis.includes("Administrador") || perfis.includes("Supervisor") || perfis.includes("Atendente");
}

async function contextoContato(id: string) {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) return { erro: NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status }) };
  if (!resultado.usuario.empresa_id) return { erro: NextResponse.json({ ok: false, error: "Usuário sem empresa vinculada" }, { status: 400 }) };
  if (!podeGerenciarContatos(resultado.usuario)) return { erro: NextResponse.json({ ok: false, error: "Sem permissão para gerenciar informações de captura" }, { status: 403 }) };

  const supabase = getSupabaseAdmin();
  const { data: contato, error } = await supabase.from("contatos").select("id").eq("id", id).eq("empresa_id", resultado.usuario.empresa_id).maybeSingle();
  if (error) return { erro: NextResponse.json({ ok: false, error: error.message }, { status: 500 }) };
  if (!contato) return { erro: NextResponse.json({ ok: false, error: "Contato não encontrado" }, { status: 404 }) };
  return { supabase, usuario: resultado.usuario };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const acesso = await contextoContato(id);
  if ("erro" in acesso) return acesso.erro;

  const { data, error } = await acesso.supabase
    .from("contato_informacoes_captura")
    .select("id, tipo, nome_campo, sequencia, valor, precisao_data, fluxo_id, no_id, execucao_id, variavel_origem, capturado_em, atualizado_em, metadata_json, automacao_fluxos(nome)")
    .eq("empresa_id", acesso.usuario.empresa_id)
    .eq("contato_id", id)
    .eq("ativo", true)
    .order("capturado_em", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, informacoes: data || [] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const acesso = await contextoContato(id);
  if ("erro" in acesso) return acesso.erro;
  const body = await request.json();
  const informacaoId = String(body?.id || "").trim();
  const valor = String(body?.valor || "").trim();
  if (!informacaoId || !valor) return NextResponse.json({ ok: false, error: "Informe a informação e seu valor." }, { status: 400 });

  const { data: atual, error: atualError } = await acesso.supabase
    .from("contato_informacoes_captura").select("id, tipo").eq("id", informacaoId)
    .eq("empresa_id", acesso.usuario.empresa_id).eq("contato_id", id).eq("ativo", true).maybeSingle();
  if (atualError) return NextResponse.json({ ok: false, error: atualError.message }, { status: 500 });
  if (!atual) return NextResponse.json({ ok: false, error: "Informação não encontrada." }, { status: 404 });

  const validacao = validarCaptura(atual.tipo, valor);
  if (!validacao.valido) return NextResponse.json({ ok: false, error: "O valor informado não é válido para este tipo de captura." }, { status: 400 });

  const { error } = await acesso.supabase.from("contato_informacoes_captura").update({
    valor: validacao.valorLimpo,
    valor_normalizado: validacao.valorNormalizado,
    precisao_data: validacao.precisaoData,
    atualizado_por: acesso.usuario.id,
    metadata_json: { valor_formatado: validacao.valorFormatado, formato_data: validacao.formatoData, origem: "edicao_manual" },
  }).eq("id", informacaoId).eq("empresa_id", acesso.usuario.empresa_id).eq("contato_id", id);
  if (error) return NextResponse.json({ ok: false, error: error.code === "23505" ? "Esse valor já está salvo nas informações de captura." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true, message: "Informação atualizada." });
}
