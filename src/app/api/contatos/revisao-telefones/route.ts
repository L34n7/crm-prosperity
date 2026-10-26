import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { bloquearSemPermissao } from "@/lib/permissoes/servidor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  analisarTelefoneParaRevisao,
  dddBrasilValido,
  limparTelefoneParaRevisao,
  proporCorrecaoTelefone,
  type AcaoCorrecaoTelefone,
  type TipoProblemaTelefone,
} from "@/lib/contatos/revisao-telefone";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = getSupabaseAdmin();
const MAX_SELECAO = 5000;
const TAMANHO_CHUNK = 200;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContatoRevisaoRow = {
  id: string;
  nome?: string | null;
  telefone: string;
  telefone_revisar?: boolean | null;
  created_at?: string | null;
};

type CorrecaoPreparada = {
  id: string;
  nome: string | null;
  telefone_anterior: string;
  telefone: string;
  telefone_revisar: boolean;
  tipo: TipoProblemaTelefone;
  label: string;
};

function chunk<T>(itens: T[], tamanho = TAMANHO_CHUNK) {
  const resultado: T[][] = [];

  for (let indice = 0; indice < itens.length; indice += tamanho) {
    resultado.push(itens.slice(indice, indice + tamanho));
  }

  return resultado;
}

function normalizarIds(valor: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(valor) ? valor : [])
        .map((id) => String(id || "").trim())
        .filter((id) => UUID_REGEX.test(id))
    )
  );
}

async function buscarContatosPorIds(empresaId: string, ids: string[]) {
  const contatos: ContatoRevisaoRow[] = [];

  for (const lote of chunk(ids)) {
    const { data, error } = await supabaseAdmin
      .from("contatos")
      .select("id,nome,telefone,telefone_revisar,created_at")
      .eq("empresa_id", empresaId)
      .in("id", lote);

    if (error) throw new Error(error.message);
    contatos.push(...((data || []) as ContatoRevisaoRow[]));
  }

  return contatos;
}

async function buscarConflitosTelefones(
  empresaId: string,
  correcoes: CorrecaoPreparada[]
) {
  const telefones = Array.from(
    new Set(correcoes.map((correcao) => correcao.telefone))
  );
  const encontrados: Array<{
    id: string;
    telefone: string;
    nome: string | null;
  }> = [];

  for (const lote of chunk(telefones)) {
    const { data, error } = await supabaseAdmin
      .from("contatos")
      .select("id,telefone,nome")
      .eq("empresa_id", empresaId)
      .in("telefone", lote);

    if (error) throw new Error(error.message);
    encontrados.push(
      ...((data || []) as Array<{
        id: string;
        telefone: string;
        nome: string | null;
      }>)
    );
  }

  return encontrados;
}

function prepararCorrecoes(params: {
  contatos: ContatoRevisaoRow[];
  acao: AcaoCorrecaoTelefone;
  ddd?: string | null;
}) {
  const correcoes: CorrecaoPreparada[] = [];
  const ignorados: Array<{
    id: string;
    nome: string | null;
    telefone: string;
    motivo: string;
  }> = [];

  for (const contato of params.contatos) {
    const analise = analisarTelefoneParaRevisao(
      contato.telefone,
      contato.telefone_revisar === true
    );
    const proposta = proporCorrecaoTelefone({
      analise,
      acao: params.acao,
      ddd: params.ddd,
    });

    if (!proposta) {
      ignorados.push({
        id: contato.id,
        nome: contato.nome || null,
        telefone: contato.telefone,
        motivo:
          params.acao === "aplicar_sugestoes_seguras"
            ? "Este telefone não possui correção automática segura."
            : "A ação escolhida não é compatível com este telefone.",
      });
      continue;
    }

    correcoes.push({
      id: contato.id,
      nome: contato.nome || null,
      telefone_anterior: contato.telefone,
      telefone: proposta.telefone,
      telefone_revisar: proposta.telefone_revisar,
      tipo: analise.tipo,
      label: analise.label,
    });
  }

  return { correcoes, ignorados };
}

async function validarConflitos(
  empresaId: string,
  correcoes: CorrecaoPreparada[],
  listaId: string | null
) {
  const conflitos: Array<{
    id: string;
    nome: string | null;
    telefone_anterior: string;
    telefone_sugerido: string;
    motivo: string;
  }> = [];
  const reaproveitamentos: Array<{
    id: string;
    nome: string | null;
    telefone_anterior: string;
    telefone_sugerido: string;
    contato_existente_id: string;
    contato_existente_nome: string | null;
  }> = [];
  const idsResolvidos = new Set<string>();

  const porTelefone = new Map<string, CorrecaoPreparada[]>();

  for (const correcao of correcoes) {
    const lista = porTelefone.get(correcao.telefone) || [];
    lista.push(correcao);
    porTelefone.set(correcao.telefone, lista);
  }

  const existentes = await buscarConflitosTelefones(empresaId, correcoes);
  const existentesPorTelefone = new Map(
    existentes.map((contato) => [contato.telefone, contato])
  );

  for (const correcao of correcoes) {
    const existente = existentesPorTelefone.get(correcao.telefone);

    if (existente && existente.id !== correcao.id && listaId) {
      idsResolvidos.add(correcao.id);
      reaproveitamentos.push({
        id: correcao.id,
        nome: correcao.nome,
        telefone_anterior: correcao.telefone_anterior,
        telefone_sugerido: correcao.telefone,
        contato_existente_id: existente.id,
        contato_existente_nome: existente.nome || null,
      });
      continue;
    }

    const grupo = porTelefone.get(correcao.telefone) || [];

    if (grupo.length > 1) {
      idsResolvidos.add(correcao.id);
      conflitos.push({
        id: correcao.id,
        nome: correcao.nome,
        telefone_anterior: correcao.telefone_anterior,
        telefone_sugerido: correcao.telefone,
        motivo:
          "Dois ou mais contatos selecionados resultariam no mesmo telefone.",
      });
      continue;
    }

    if (existente && existente.id !== correcao.id) {
      idsResolvidos.add(correcao.id);
      conflitos.push({
        id: correcao.id,
        nome: correcao.nome,
        telefone_anterior: correcao.telefone_anterior,
        telefone_sugerido: correcao.telefone,
        motivo:
          "O telefone corrigido já pertence a outro contato. Nenhuma alteração será feita neste contato.",
      });
    }
  }

  return {
    conflitos,
    reaproveitamentos,
    correcoesSeguras: correcoes.filter(
      (correcao) => !idsResolvidos.has(correcao.id)
    ),
  };
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
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.visualizar",
    "Sem permissão para visualizar contatos."
  );
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const somenteResumo = url.searchParams.get("resumo") === "true";
  const listaId = String(url.searchParams.get("lista_id") || "").trim() || null;

  if (listaId && !UUID_REGEX.test(listaId)) {
    return NextResponse.json(
      { ok: false, error: "Lista de contatos inválida." },
      { status: 400 }
    );
  }

  if (somenteResumo && !listaId) {
    const { count, error } = await supabaseAdmin
      .from("contatos")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", usuario.empresa_id)
      .eq("telefone_revisar", true);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      total_marcados_revisao: count || 0,
    });
  }

  const { data, error } = await supabaseAdmin.rpc(
    "listar_contatos_revisao_telefone",
    {
      p_empresa_id: usuario.empresa_id,
      p_lista_id: listaId,
      p_limite: 50000,
    }
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const itens = ((data || []) as ContatoRevisaoRow[]).map((contato) => {
    const analise = analisarTelefoneParaRevisao(
      contato.telefone,
      contato.telefone_revisar === true
    );

    return {
      id: contato.id,
      nome: contato.nome || null,
      telefone: contato.telefone,
      telefone_revisar: contato.telefone_revisar === true,
      created_at: contato.created_at || null,
      tipo: analise.tipo,
      label: analise.label,
      descricao: analise.descricao,
      telefone_limpo: analise.telefoneLimpo,
      sugestao: analise.sugestao,
      sugestao_segura: analise.sugestaoSegura,
      telefone_revisar_apos_sugestao:
        analise.telefoneRevisarAposSugestao,
    };
  });

  const resumo = itens.reduce<Record<string, number>>(
    (acc, item) => {
      acc.total += 1;
      acc[item.tipo] = (acc[item.tipo] || 0) + 1;
      if (item.sugestao_segura) acc.correcoes_seguras += 1;
      return acc;
    },
    { total: 0, correcoes_seguras: 0 }
  );

  return NextResponse.json({
    ok: true,
    lista_id: listaId,
    resumo,
    itens,
  });
}

export async function PATCH(request: Request) {
  const resultado = await getUsuarioContexto();

  if (!resultado.ok) {
    return NextResponse.json(
      { ok: false, error: resultado.error },
      { status: resultado.status }
    );
  }

  const { usuario } = resultado;
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.editar",
    "Sem permissão para editar contatos."
  );
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }

  const contatoId = String(body.id || "").trim();
  const telefoneInformado = String(body.telefone || "").trim();

  if (!UUID_REGEX.test(contatoId)) {
    return NextResponse.json(
      { ok: false, error: "Contato inválido." },
      { status: 400 }
    );
  }

  const telefoneLimpo = limparTelefoneParaRevisao(telefoneInformado);

  if (telefoneLimpo.length < 8 || telefoneLimpo.length > 15) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Informe um telefone válido, com DDD quando for necessário. Use entre 8 e 15 dígitos.",
      },
      { status: 400 }
    );
  }

  const { data: contatoAtual, error: contatoAtualError } = await supabaseAdmin
    .from("contatos")
    .select("id,nome,telefone,telefone_revisar,created_at")
    .eq("empresa_id", usuario.empresa_id)
    .eq("id", contatoId)
    .maybeSingle();

  if (contatoAtualError) {
    return NextResponse.json(
      { ok: false, error: contatoAtualError.message },
      { status: 500 }
    );
  }

  if (!contatoAtual) {
    return NextResponse.json(
      { ok: false, error: "Contato não encontrado." },
      { status: 404 }
    );
  }

  const analiseInformada = analisarTelefoneParaRevisao(
    telefoneLimpo,
    false
  );

  let telefoneFinal = telefoneLimpo;

  if (analiseInformada.sugestaoSegura && analiseInformada.sugestao) {
    telefoneFinal = analiseInformada.sugestao;
  }

  const analiseFinal = analisarTelefoneParaRevisao(telefoneFinal, false);
  const telefoneRevisar =
    analiseFinal.tipo !== "formato_valido_revisao";

  const { data: conflito, error: conflitoError } = await supabaseAdmin
    .from("contatos")
    .select("id,nome")
    .eq("empresa_id", usuario.empresa_id)
    .eq("telefone", telefoneFinal)
    .neq("id", contatoId)
    .maybeSingle();

  if (conflitoError) {
    return NextResponse.json(
      { ok: false, error: conflitoError.message },
      { status: 500 }
    );
  }

  if (conflito) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "O telefone informado já pertence a outro contato desta empresa.",
        conflito_contato_id: conflito.id,
        conflito_contato_nome: conflito.nome || null,
      },
      { status: 409 }
    );
  }

  const { data: contatoAtualizado, error: atualizarError } =
    await supabaseAdmin
      .from("contatos")
      .update({
        telefone: telefoneFinal,
        telefone_revisar: telefoneRevisar,
        updated_at: new Date().toISOString(),
      })
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", contatoId)
      .select("id,nome,telefone,telefone_revisar,created_at")
      .single();

  if (atualizarError) {
    return NextResponse.json(
      { ok: false, error: atualizarError.message },
      { status: 500 }
    );
  }

  const auditMeta = getRequestAuditMetadata(request);

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: contatoId,
    acao: "telefone_corrigido_manualmente",
    descricao: "Telefone corrigido manualmente pela central de revisão",
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    antes: {
      telefone: contatoAtual.telefone,
      telefone_revisar: contatoAtual.telefone_revisar === true,
    },
    depois: {
      telefone: contatoAtualizado.telefone,
      telefone_revisar: contatoAtualizado.telefone_revisar === true,
    },
    metadata: {
      normalizado_automaticamente: telefoneFinal !== telefoneLimpo,
      tipo_resultante: analiseFinal.tipo,
    },
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    telefone: contatoAtualizado.telefone,
    telefone_revisar: contatoAtualizado.telefone_revisar === true,
    normalizado_automaticamente: telefoneFinal !== telefoneLimpo,
    permanece_em_revisao: telefoneRevisar,
    analise: {
      tipo: analiseFinal.tipo,
      label: analiseFinal.label,
      descricao: analiseFinal.descricao,
      sugestao: analiseFinal.sugestao,
      sugestao_segura: analiseFinal.sugestaoSegura,
    },
    message: telefoneRevisar
      ? "Telefone salvo, mas ainda precisa de revisão."
      : "Telefone corrigido com sucesso.",
  });
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
  const bloqueio = bloquearSemPermissao(
    usuario,
    "contatos.editar",
    "Sem permissão para editar contatos."
  );
  if (bloqueio) return bloqueio;

  if (!usuario.empresa_id) {
    return NextResponse.json(
      { ok: false, error: "Usuário sem empresa vinculada." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corpo da requisição inválido." },
      { status: 400 }
    );
  }

  const modo = body.modo === "aplicar" ? "aplicar" : "preview";
  const ids = normalizarIds(body.contato_ids);
  const acao = String(body.acao || "") as AcaoCorrecaoTelefone;
  const ddd = String(body.ddd || "").replace(/\D/g, "");
  const listaId = String(body.lista_id || "").trim() || null;

  const acoesValidas = new Set<AcaoCorrecaoTelefone>([
    "aplicar_sugestoes_seguras",
    "adicionar_ddd",
    "adicionar_ddd_nono",
    "adicionar_nono",
  ]);

  if (listaId && !UUID_REGEX.test(listaId)) {
    return NextResponse.json(
      { ok: false, error: "Lista de contatos inválida." },
      { status: 400 }
    );
  }

  if (listaId) {
    const { data: lista, error: listaError } = await supabaseAdmin
      .from("contatos_listas")
      .select("id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("id", listaId)
      .maybeSingle();

    if (listaError) {
      return NextResponse.json(
        { ok: false, error: listaError.message },
        { status: 500 }
      );
    }

    if (!lista) {
      return NextResponse.json(
        { ok: false, error: "Lista de contatos não encontrada." },
        { status: 404 }
      );
    }
  }

  if (!acoesValidas.has(acao)) {
    return NextResponse.json(
      { ok: false, error: "Escolha uma ação de correção válida." },
      { status: 400 }
    );
  }

  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Selecione ao menos um contato." },
      { status: 400 }
    );
  }

  if (ids.length > MAX_SELECAO) {
    return NextResponse.json(
      {
        ok: false,
        error: `Revise no máximo ${MAX_SELECAO} contatos por operação.`,
      },
      { status: 400 }
    );
  }

  if (
    (acao === "adicionar_ddd" || acao === "adicionar_ddd_nono") &&
    !dddBrasilValido(ddd)
  ) {
    return NextResponse.json(
      { ok: false, error: "Informe um DDD brasileiro válido." },
      { status: 400 }
    );
  }

  let contatos: ContatoRevisaoRow[];

  try {
    contatos = await buscarContatosPorIds(usuario.empresa_id, ids);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar contatos selecionados.",
      },
      { status: 500 }
    );
  }

  const { correcoes, ignorados } = prepararCorrecoes({
    contatos,
    acao,
    ddd,
  });

  let validacao: Awaited<ReturnType<typeof validarConflitos>>;

  try {
    validacao = await validarConflitos(
      usuario.empresa_id,
      correcoes,
      listaId
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao verificar telefones duplicados.",
      },
      { status: 500 }
    );
  }

  if (modo === "preview") {
    return NextResponse.json({
      ok: true,
      selecionados: ids.length,
      correcoes: validacao.correcoesSeguras,
      reaproveitamentos: validacao.reaproveitamentos,
      conflitos: validacao.conflitos,
      ignorados,
      resumo: {
        selecionados: ids.length,
        corrigiveis:
          validacao.correcoesSeguras.length +
          validacao.reaproveitamentos.length,
        reaproveitados: validacao.reaproveitamentos.length,
        conflitos: validacao.conflitos.length,
        ignorados: ignorados.length,
        permanecem_em_revisao: validacao.correcoesSeguras.filter(
          (item) => item.telefone_revisar
        ).length,
      },
    });
  }

  if (
    validacao.correcoesSeguras.length === 0 &&
    validacao.reaproveitamentos.length === 0
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Nenhum dos contatos selecionados possui uma correção segura para aplicar.",
        conflitos: validacao.conflitos,
        ignorados,
      },
      { status: 409 }
    );
  }

  let atualizados = 0;
  let reaproveitados = 0;

  try {
    for (const lote of chunk(validacao.correcoesSeguras, 500)) {
      const { data, error } = await supabaseAdmin.rpc(
        "aplicar_correcoes_telefones_contatos",
        {
          p_empresa_id: usuario.empresa_id,
          p_correcoes: lote.map((item) => ({
            id: item.id,
            telefone: item.telefone,
            telefone_revisar: item.telefone_revisar,
          })),
        }
      );

      if (error) throw new Error(error.message);
      atualizados += Number(data || 0);
    }

    if (listaId && validacao.reaproveitamentos.length > 0) {
      const membrosExistentes = Array.from(
        new Map(
          validacao.reaproveitamentos.map((item) => [
            item.contato_existente_id,
            {
              lista_id: listaId,
              contato_id: item.contato_existente_id,
            },
          ])
        ).values()
      );

      for (const lote of chunk(membrosExistentes, 500)) {
        const { error } = await supabaseAdmin
          .from("contatos_lista_membros")
          .upsert(lote, {
            onConflict: "lista_id,contato_id",
            ignoreDuplicates: true,
          });

        if (error) throw new Error(error.message);
      }

      for (const lote of chunk(
        validacao.reaproveitamentos.map((item) => item.id),
        500
      )) {
        const { error } = await supabaseAdmin
          .from("contatos_lista_membros")
          .delete()
          .eq("lista_id", listaId)
          .in("contato_id", lote);

        if (error) throw new Error(error.message);
      }

      reaproveitados = validacao.reaproveitamentos.length;
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao aplicar correções de telefone e atualizar a lista.",
      },
      { status: 500 }
    );
  }

  const auditMeta = getRequestAuditMetadata(request);
  const primeiro =
    validacao.correcoesSeguras[0] || validacao.reaproveitamentos[0];

  await registrarLogAuditoriaSeguro({
    empresa_id: usuario.empresa_id,
    categoria: "contatos",
    entidade: "contato",
    entidade_id: primeiro.id,
    acao: "telefones_corrigidos_em_massa",
    descricao:
      reaproveitados > 0
        ? `${atualizados} telefone(s) corrigido(s) e ${reaproveitados} contato(s) existente(s) reaproveitado(s) na lista`
        : `${atualizados} telefone(s) corrigido(s) em massa`,
    usuario_id: usuario.id,
    usuario_nome: usuario.nome,
    usuario_email: usuario.email,
    metadata: {
      acao_correcao: acao,
      ddd: ddd || null,
      contatos_ids: validacao.correcoesSeguras.map((item) => item.id),
      lista_id: listaId,
      contatos_reaproveitados: validacao.reaproveitamentos.map((item) => ({
        contato_importado_id: item.id,
        contato_existente_id: item.contato_existente_id,
      })),
      conflitos: validacao.conflitos.length,
      ignorados: ignorados.length,
    },
    antes: [
      ...validacao.correcoesSeguras.map((item) => ({
        id: item.id,
        telefone: item.telefone_anterior,
      })),
      ...validacao.reaproveitamentos.map((item) => ({
        id: item.id,
        telefone: item.telefone_anterior,
        lista_id: listaId,
      })),
    ],
    depois: [
      ...validacao.correcoesSeguras.map((item) => ({
        id: item.id,
        telefone: item.telefone,
        telefone_revisar: item.telefone_revisar,
      })),
      ...validacao.reaproveitamentos.map((item) => ({
        id: item.contato_existente_id,
        telefone: item.telefone_sugerido,
        lista_id: listaId,
        reaproveitado_na_lista: true,
      })),
    ],
    ip: auditMeta.ip,
    user_agent: auditMeta.user_agent,
  });

  return NextResponse.json({
    ok: true,
    atualizados,
    reaproveitados,
    conflitos: validacao.conflitos,
    ignorados,
    message:
      reaproveitados > 0
        ? atualizados > 0
          ? `${atualizados} telefone(s) corrigido(s) e ${reaproveitados} contato(s) já existente(s) mantido(s) nesta lista, sem duplicar cadastros.`
          : `${reaproveitados} contato(s) já existente(s) foram mantido(s) nesta lista, sem duplicar cadastros.`
        : `${atualizados} telefone(s) corrigido(s) com sucesso.`,
  });
}
