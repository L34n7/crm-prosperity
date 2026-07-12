import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";
import {
  normalizarConfiguracaoFluxo,
  normalizarEscopoIntegracoesWhatsappFluxo,
  type EscopoIntegracoesWhatsappFluxo,
} from "@/lib/automacoes/normalizar-configuracao-fluxo";
import {
  statusWhatsappMetaBloqueado,
  WHATSAPP_META_BLOCK_DESCRIPTION,
  WHATSAPP_META_BLOCK_HELP_URL,
  WHATSAPP_META_MANAGER_URL,
} from "@/lib/whatsapp/meta-block";
import { listarIntegracoesWhatsappPermitidas } from "@/lib/whatsapp/integracoes-multiplas";

const supabaseAdmin = getSupabaseAdmin();

const CONSTRAINT_PALAVRA_CHAVE_UNICA =
  "automacao_gatilhos_empresa_palavra_chave_unique";

type GatilhoNovoFluxo = {
  tipo_gatilho: string;
  valor: string;
  condicao: string;
  ativo: boolean;
};

type IntegracaoWhatsappMetaRow = {
  id?: string | null;
  status?: string | null;
  phone_number_status?: string | null;
  onboarding_erro?: string | null;
  config_json?: unknown;
};

function obterMensagemErro(error: unknown, fallback = "Erro interno.") {
  return error instanceof Error ? error.message : fallback;
}

function erroDePalavraChaveDuplicada(error: unknown) {
  const erro =
    error && typeof error === "object"
      ? (error as {
          code?: string;
          constraint?: string;
          message?: string;
        })
      : null;

  return (
    erro?.code === "23505" &&
    (erro.constraint === CONSTRAINT_PALAVRA_CHAVE_UNICA ||
      String(erro.message || "").includes("palavra-chave"))
  );
}

function normalizarGatilhosNovoFluxo(valor: unknown): GatilhoNovoFluxo[] {
  if (!Array.isArray(valor)) return [];

  return valor.map((item: unknown) => {
    const gatilho =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};

    return {
      tipo_gatilho: String(
        gatilho.tipo_gatilho || "palavra_chave"
      ).trim(),
      valor: String(gatilho.valor || "").trim().toLowerCase(),
      condicao: String(gatilho.condicao || "contem").trim(),
      ativo: gatilho.ativo !== false,
    };
  });
}

function escoposIntegracaoConflitam(
  atual: EscopoIntegracoesWhatsappFluxo,
  existente: EscopoIntegracoesWhatsappFluxo
) {
  if (atual.modo !== "selecionadas" || existente.modo !== "selecionadas") {
    return true;
  }

  const idsExistentes = new Set(existente.ids);
  return atual.ids.some((id) => idsExistentes.has(id));
}

async function validarEscopoIntegracoesWhatsappFluxo(params: {
  empresaId: string;
  usuario: any;
  configuracao: unknown;
}) {
  const escopo = normalizarEscopoIntegracoesWhatsappFluxo(params.configuracao);

  if (escopo.modo !== "selecionadas") {
    return { ok: true as const, escopo };
  }

  const acesso = await listarIntegracoesWhatsappPermitidas({
    usuario: params.usuario,
    empresaId: params.empresaId,
  });
  const idsPermitidos = new Set(acesso.idsPermitidos);
  const idsInvalidos = escopo.ids.filter((id) => !idsPermitidos.has(id));

  if (idsInvalidos.length > 0) {
    return {
      ok: false as const,
      escopo,
      error:
        "Uma ou mais integrações selecionadas não existem ou não estão liberadas para este usuário.",
    };
  }

  return { ok: true as const, escopo };
}

async function buscarFluxoPadraoConflitante(params: {
  empresaId: string;
  escopo: EscopoIntegracoesWhatsappFluxo;
  excluirFluxoId?: string;
}) {
  let query = supabaseAdmin
    .from("automacao_fluxos")
    .select("id, nome, configuracao_json")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_padrao", true)
    .neq("status", "arquivado");

  if (params.excluirFluxoId) {
    query = query.neq("id", params.excluirFluxoId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Erro ao validar fluxo padrão: ${error.message}`);
  }

  return (data || []).find((fluxo) =>
    escoposIntegracaoConflitam(
      params.escopo,
      normalizarEscopoIntegracoesWhatsappFluxo(fluxo.configuracao_json)
    )
  );
}

async function buscarConflitoPalavraChave(params: {
  empresaId: string;
  valores: string[];
}) {
  if (params.valores.length === 0) return null;

  const { data: gatilhos, error } = await supabaseAdmin
    .from("automacao_gatilhos")
    .select("id, fluxo_id, valor")
    .eq("empresa_id", params.empresaId)
    .eq("tipo_gatilho", "palavra_chave")
    .in("valor", params.valores)
    .limit(1);

  if (error) {
    throw new Error(`Erro ao validar palavras-chave: ${error.message}`);
  }

  const gatilho = gatilhos?.[0];
  if (!gatilho) return null;

  const { data: fluxo } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, nome, status")
    .eq("id", gatilho.fluxo_id)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  return {
    valor: gatilho.valor,
    fluxoId: gatilho.fluxo_id,
    fluxoNome: fluxo?.nome || null,
    fluxoStatus: fluxo?.status || null,
  };
}

function respostaPalavraChaveDuplicada(params: {
  valor: string;
  fluxoNome?: string | null;
  fluxoStatus?: string | null;
}) {
  const identificacaoFluxo = params.fluxoNome
    ? ` no fluxo "${params.fluxoNome}"`
    : " em outro fluxo";
  const statusFluxo = params.fluxoStatus ? ` (${params.fluxoStatus})` : "";

  return NextResponse.json(
    {
      ok: false,
      code: "PALAVRA_CHAVE_DUPLICADA",
      error: `A palavra-chave "${params.valor}" já está cadastrada${identificacaoFluxo}${statusFluxo}. Cada palavra-chave pode pertencer a apenas um fluxo por empresa.`,
    },
    { status: 409 }
  );
}

async function removerFluxoCriadoComFalha(params: {
  empresaId: string;
  fluxoId: string;
}) {
  await supabaseAdmin
    .from("automacao_gatilhos")
    .delete()
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId);

  await supabaseAdmin
    .from("automacao_nos")
    .delete()
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId);

  await supabaseAdmin
    .from("automacao_fluxos")
    .delete()
    .eq("empresa_id", params.empresaId)
    .eq("id", params.fluxoId);
}

function respostaAssinaturaBloqueada() {
  return NextResponse.json(
    {
      ok: false,
      code: "ASSINATURA_BLOQUEADA",
      error:
        "Plano bloqueado. Renove a assinatura para ativar fluxos novamente.",
    },
    { status: 403 }
  );
}

function respostaFluxoAtivoSemGatilho() {
  return NextResponse.json(
    {
      ok: false,
      code: "FLUXO_ATIVO_SEM_GATILHO",
      error:
        "Fluxos que não são \"Padrão\" precisam ter pelo menos um gatilho ativo.",
    },
    { status: 400 }
  );
}

async function fluxoPossuiGatilhoAtivo(params: {
  empresaId: string;
  fluxoId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_gatilhos")
    .select("id")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId)
    .eq("ativo", true)
    .limit(1);

  if (error) {
    throw new Error(`Erro ao validar gatilhos do fluxo: ${error.message}`);
  }

  return (data || []).length > 0;
}

function respostaWhatsappMetaBloqueado(detalhe?: string | null) {
  return NextResponse.json(
    {
      ok: false,
      code: "WHATSAPP_META_BLOQUEADO",
      motivo: "whatsapp_meta_bloqueado",
      error:
        "A conta WhatsApp Business esta desativada ou bloqueada pela Meta. Não é possível ativar fluxos WhatsApp enquanto o bloqueio estiver ativo.",
      detalhe: detalhe || WHATSAPP_META_BLOCK_DESCRIPTION,
      meta_manager_url: WHATSAPP_META_MANAGER_URL,
      help_whatsapp_url: WHATSAPP_META_BLOCK_HELP_URL,
    },
    { status: 423 }
  );
}

async function buscarBloqueioWhatsappMeta(
  empresaId: string,
  integracaoIds?: string[] | null
) {
  let query = supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, status, phone_number_status, onboarding_erro, config_json")
    .eq("empresa_id", empresaId)
    .eq("provider", "meta_official");

  if (integracaoIds?.length) {
    query = query.in("id", integracaoIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `Erro ao verificar bloqueio do WhatsApp Meta: ${error.message}`
    );
  }

  return ((data || []) as IntegracaoWhatsappMetaRow[]).find((integracao) => {
    const config =
      integracao.config_json &&
      typeof integracao.config_json === "object" &&
      !Array.isArray(integracao.config_json)
        ? (integracao.config_json as Record<string, unknown>)
        : {};
    const diagnostico = config.whatsapp_meta_diagnostic;
    const motivoDiagnostico =
      diagnostico && typeof diagnostico === "object"
        ? String((diagnostico as Record<string, unknown>).motivo || "")
        : "";

    return (
      statusWhatsappMetaBloqueado(integracao.status) ||
      statusWhatsappMetaBloqueado(integracao.phone_number_status) ||
      motivoDiagnostico === "business_account_locked"
    );
  });
}

function configuracaoComoObjeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function configuracaoMarcada(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function normalizarTemplatesPorIntegracao(
  valor: unknown
): Record<string, string> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .map(([integracaoId, templateId]) => [
        String(integracaoId || "").trim(),
        String(templateId || "").trim(),
      ])
      .filter(([integracaoId, templateId]) => integracaoId && templateId)
  );
}

async function validarTemplatesWhatsappFluxo(params: {
  empresaId: string;
  fluxoId: string;
  escopoIntegracoes: EscopoIntegracoesWhatsappFluxo;
}) {
  const { data: nos, error: nosError } = await supabaseAdmin
    .from("automacao_nos")
    .select("tipo_no, titulo, configuracao_json")
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId)
    .in("tipo_no", ["agendar_disparo", "agenda_criar_agendamento"]);

  if (nosError) {
    throw new Error(
      `Erro ao validar templates de lembrete: ${nosError.message}`
    );
  }

  const { data: integracoes, error: integracoesError } = await supabaseAdmin
    .from("integracoes_whatsapp")
    .select("id, nome_conexao, numero, posicao, waba_id")
    .eq("empresa_id", params.empresaId)
    .eq("provider", "meta_official")
    .order("posicao", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (integracoesError) {
    throw new Error(
      `Erro ao validar integracoes WhatsApp do fluxo: ${integracoesError.message}`
    );
  }

  const integracoesEscopo =
    params.escopoIntegracoes.modo === "selecionadas"
      ? (integracoes || []).filter((integracao) =>
          params.escopoIntegracoes.ids.includes(String(integracao.id))
        )
      : integracoes || [];
  const wabasEscopo = new Set(
    integracoesEscopo.map((integracao) =>
      String(integracao.waba_id || "").trim() || `integracao:${integracao.id}`
    )
  );
  const exigeTemplatePorIntegracao = wabasEscopo.size > 1;
  const mensagensPorTemplateId = new Map<string, string>();
  const exigenciasPorTemplateId = new Map<
    string,
    Array<{ integracaoId: string; wabaId: string; mensagem: string }>
  >();

  for (const no of nos || []) {
    const config = configuracaoComoObjeto(no.configuracao_json);

    if (no.tipo_no === "agendar_disparo") {
      const mensagem =
        `O bloco "${no.titulo || "Agendar disparo"}" precisa ter um template WhatsApp.`;

      if (exigeTemplatePorIntegracao) {
        const templatesPorIntegracao = normalizarTemplatesPorIntegracao(
          config.templates_por_integracao
        );

        for (const integracao of integracoesEscopo) {
          const integracaoId = String(integracao.id || "").trim();
          const templateId = String(
            templatesPorIntegracao[integracaoId] || ""
          ).trim();
          const wabaId =
            String(integracao.waba_id || "").trim() ||
            `integracao:${integracaoId}`;
          const rotuloIntegracao =
            String(integracao.nome_conexao || "").trim() ||
            String(integracao.numero || "").trim() ||
            `numero ${integracao.posicao || ""}`.trim() ||
            "numero";
          const mensagemIntegracao =
            `O bloco "${no.titulo || "Agendar disparo"}" precisa ter um template WhatsApp para ${rotuloIntegracao}.`;

          if (!templateId) return mensagemIntegracao;

          mensagensPorTemplateId.set(templateId, mensagemIntegracao);

          const exigencias = exigenciasPorTemplateId.get(templateId) || [];
          exigencias.push({
            integracaoId,
            wabaId,
            mensagem: mensagemIntegracao,
          });
          exigenciasPorTemplateId.set(templateId, exigencias);
        }

        continue;
      }

      const templateId = String(config.template_id || "").trim();

      if (!templateId) return mensagem;

      mensagensPorTemplateId.set(templateId, mensagem);
      continue;
    }

    const lembreteAtivo = configuracaoMarcada(
      config.lembrete_agendamento_ativo
    );
    const lembreteWhatsapp = configuracaoMarcada(
      config.lembrete_agendamento_whatsapp
    );

    if (!lembreteAtivo || !lembreteWhatsapp) continue;

    const templateId = String(
      config.lembrete_agendamento_template_id || ""
    ).trim();

    if (!templateId) {
      return "Selecione um template WhatsApp para o lembrete.";
    }

    mensagensPorTemplateId.set(
      templateId,
      "Selecione um template WhatsApp para o lembrete."
    );
  }

  if (mensagensPorTemplateId.size === 0) return null;

  const { data: templates, error: templatesError } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("id, integracao_whatsapp_id, waba_id, status")
    .eq("empresa_id", params.empresaId)
    .in("id", Array.from(mensagensPorTemplateId.keys()));

  if (templatesError) {
    throw new Error(
      `Erro ao validar templates WhatsApp: ${templatesError.message}`
    );
  }

  const templateIdsEncontrados = new Set(
    (templates || []).map((template) => String(template.id))
  );
  const templatesPorId = new Map(
    (templates || []).map((template) => [String(template.id), template])
  );
  const templateAusente = Array.from(mensagensPorTemplateId.keys()).find(
    (templateId) => !templateIdsEncontrados.has(templateId)
  );

  if (templateAusente) {
    return (
      mensagensPorTemplateId.get(templateAusente) ||
      "Selecione um template WhatsApp."
    );
  }

  const templateNaoAprovado = Array.from(mensagensPorTemplateId.keys()).find(
    (templateId) =>
      String(templatesPorId.get(templateId)?.status || "").toUpperCase() !==
      "APPROVED"
  );

  if (templateNaoAprovado) {
    return (
      mensagensPorTemplateId.get(templateNaoAprovado) ||
      "Selecione um template WhatsApp aprovado."
    );
  }

  if (exigeTemplatePorIntegracao) {
    for (const [templateId, exigencias] of exigenciasPorTemplateId) {
      const template = templatesPorId.get(templateId);
      const templateWabaId =
        String(template?.waba_id || "").trim() ||
        `integracao:${String(template?.integracao_whatsapp_id || "").trim()}`;

      const exigenciaIncompativel = exigencias.find(
        (exigencia) => exigencia.wabaId !== templateWabaId
      );

      if (exigenciaIncompativel) {
        return (
          exigenciaIncompativel.mensagem ||
          "O template selecionado pertence a outra WABA."
        );
      }
    }
  } else if (params.escopoIntegracoes.modo === "selecionadas") {
    const idsPermitidos = new Set(params.escopoIntegracoes.ids);
    const wabasPermitidas = new Set(
      integracoesEscopo.map((integracao) =>
        String(integracao.waba_id || "").trim()
      )
    );
    const templateForaDoEscopo = Array.from(mensagensPorTemplateId.keys()).find(
      (templateId) => {
        const template = templatesPorId.get(templateId);
        const integracaoTemplate = String(
          template?.integracao_whatsapp_id || ""
        ).trim();
        const wabaTemplate = String(template?.waba_id || "").trim();

        return (
          (!integracaoTemplate || !idsPermitidos.has(integracaoTemplate)) &&
          (!wabaTemplate || !wabasPermitidas.has(wabaTemplate))
        );
      }
    );

    if (templateForaDoEscopo) {
      return (
        mensagensPorTemplateId.get(templateForaDoEscopo) ||
        "O template selecionado pertence a uma integração fora do escopo deste fluxo."
      );
    }
  }

  return null;
}

function textoNormalizado(valor: unknown) {
  return String(valor || "").trim().toLowerCase();
}

function conexaoCombinaComErro(
  condicao: Record<string, unknown> | null | undefined
) {
  if (!condicao?.tipo) return false;

  const valor = textoNormalizado(condicao.valor);

  if (!valor) return false;

  if (condicao.tipo === "resposta_igual") {
    return valor === "erro";
  }

  if (condicao.tipo === "resposta_contem") {
    return "erro".includes(valor);
  }

  if (condicao.tipo === "resposta_inicia_com") {
    return "erro".startsWith(valor);
  }

  if (condicao.tipo === "resposta_regex") {
    try {
      return new RegExp(String(condicao.valor), "i").test("erro");
    } catch {
      return false;
    }
  }

  return false;
}

async function desvincularAgendamentosDoFluxo(params: {
  fluxoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { error } = await supabaseAdmin
    .from("agenda_agendamentos")
    .update({
      automacao_execucao_id: null,
      automacao_fluxo_id: null,
      automacao_no_id: null,
      updated_at: new Date().toISOString(),
      updated_by: params.usuarioId,
    })
    .eq("empresa_id", params.empresaId)
    .eq("automacao_fluxo_id", params.fluxoId);

  if (error) {
    throw new Error(`Erro ao desvincular agendamentos do fluxo: ${error.message}`);
  }
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
      .from("automacao_fluxos")
      .select(`
        id,
        nome,
        descricao,
        status,
        canal,
        created_at,
        updated_at,
        fluxo_padrao,
        configuracao_json
      `)
      .eq("empresa_id", usuario.empresa_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao buscar fluxos: ${error.message}` },
        { status: 500 }
      );
    }

    const fluxos = data || [];
    const fluxoIds = fluxos.map((fluxo) => fluxo.id);
    const alertasArquivoIaPorFluxo = new Map<string, number>();

    if (fluxoIds.length > 0) {
      const { data: nosArquivoIa, error: nosArquivoIaError } =
        await supabaseAdmin
          .from("automacao_nos")
          .select("id, fluxo_id")
          .eq("empresa_id", usuario.empresa_id)
          .eq("ativo", true)
          .eq("tipo_no", "interpretar_arquivo_ia")
          .in("fluxo_id", fluxoIds);

      if (nosArquivoIaError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Erro ao buscar alertas dos fluxos: ${nosArquivoIaError.message}`,
          },
          { status: 500 }
        );
      }

      const nosArquivoIaIds = (nosArquivoIa || []).map((no) => no.id);

      const { data: conexoesArquivoIa, error: conexoesArquivoIaError } =
        nosArquivoIaIds.length > 0
          ? await supabaseAdmin
              .from("automacao_conexoes")
              .select("no_origem_id, condicao_json")
              .eq("empresa_id", usuario.empresa_id)
              .eq("ativo", true)
              .in("no_origem_id", nosArquivoIaIds)
          : { data: [], error: null };

      if (conexoesArquivoIaError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Erro ao buscar conexoes dos alertas: ${conexoesArquivoIaError.message}`,
          },
          { status: 500 }
        );
      }

      for (const no of nosArquivoIa || []) {
        const temConexaoErro = (conexoesArquivoIa || []).some(
          (conexao) =>
            conexao.no_origem_id === no.id &&
            conexaoCombinaComErro(conexao.condicao_json)
        );

        if (!temConexaoErro) {
          alertasArquivoIaPorFluxo.set(
            no.fluxo_id,
            (alertasArquivoIaPorFluxo.get(no.fluxo_id) || 0) + 1
          );
        }
      }
    }

    const fluxosComAlertas = fluxos.map((fluxo) => ({
      ...fluxo,
      alertas_configuracao: {
        interpretar_arquivo_ia_sem_conexao_erro:
          alertasArquivoIaPorFluxo.get(fluxo.id) || 0,
      },
    }));

    return NextResponse.json({
      ok: true,
      fluxos: fluxosComAlertas,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

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

    const nome = String(body?.nome || "").trim();
    const descricao = String(body?.descricao || "").trim();
    const canal = String(body?.canal || "whatsapp").trim();
    const status = String(body?.status || "rascunho").trim();
    const fluxoPadrao = Boolean(body?.fluxo_padrao);
    const gatilhos = normalizarGatilhosNovoFluxo(body?.gatilhos);
    const condicoesPermitidas = new Set([
      "contem",
      "exata",
      "inicia_com",
      "regex",
    ]);
    const tiposGatilhoPermitidos = new Set([
      "palavra_chave",
      "primeira_mensagem",
      "evento",
      "webhook",
      "manual",
    ]);
    const configuracaoFluxo = normalizarConfiguracaoFluxo(
      body?.configuracao_json
    );
    const validacaoEscopo = await validarEscopoIntegracoesWhatsappFluxo({
      empresaId: usuario.empresa_id,
      usuario,
      configuracao: configuracaoFluxo,
    });

    if (!validacaoEscopo.ok) {
      return NextResponse.json(
        { ok: false, error: validacaoEscopo.error },
        { status: 400 }
      );
    }

    const gatilhoInvalido = gatilhos.find(
      (gatilho) =>
        !gatilho.valor ||
        !condicoesPermitidas.has(gatilho.condicao) ||
        !tiposGatilhoPermitidos.has(gatilho.tipo_gatilho)
    );

    if (gatilhoInvalido) {
      return NextResponse.json(
        { ok: false, error: "Há um gatilho inválido na criação do fluxo." },
        { status: 400 }
      );
    }

    if (fluxoPadrao && gatilhos.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Fluxos padrão não podem ter palavras-chave." },
        { status: 400 }
      );
    }

    if (
      status === "ativo" &&
      !fluxoPadrao &&
      !gatilhos.some((gatilho) => gatilho.ativo)
    ) {
      return respostaFluxoAtivoSemGatilho();
    }

    const palavrasChave = gatilhos
      .filter((gatilho) => gatilho.tipo_gatilho === "palavra_chave")
      .map((gatilho) => gatilho.valor);
    const palavrasChaveUnicas = [...new Set(palavrasChave)];

    if (palavrasChaveUnicas.length !== palavrasChave.length) {
      const palavraDuplicada =
        palavrasChave.find(
          (palavra, indice) => palavrasChave.indexOf(palavra) !== indice
        ) || "";

      return NextResponse.json(
        {
          ok: false,
          code: "PALAVRA_CHAVE_DUPLICADA",
          error: `A palavra-chave "${palavraDuplicada}" foi informada mais de uma vez neste fluxo.`,
        },
        { status: 409 }
      );
    }

    if (status === "ativo" && usuario.assinatura?.status === "bloqueada") {
      return respostaAssinaturaBloqueada();
    }

    if (canal.toLowerCase() === "whatsapp" && status === "ativo") {
      const bloqueioMeta = await buscarBloqueioWhatsappMeta(
        usuario.empresa_id,
        validacaoEscopo.escopo.modo === "selecionadas"
          ? validacaoEscopo.escopo.ids
          : null
      );

      if (bloqueioMeta) {
        return respostaWhatsappMetaBloqueado(bloqueioMeta.onboarding_erro);
      }
    }

    if (fluxoPadrao) {
      const fluxoPadraoExistente = await buscarFluxoPadraoConflitante({
        empresaId: usuario.empresa_id,
        escopo: validacaoEscopo.escopo,
      });

      if (fluxoPadraoExistente) {
        return NextResponse.json(
          {
            ok: false,
            error: "Já existe um fluxo padrão cadastrado.",
          },
          { status: 400 }
        );
      }
    }

    if (!nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const conflitoPalavraChave = await buscarConflitoPalavraChave({
      empresaId: usuario.empresa_id,
      valores: palavrasChaveUnicas,
    });

    if (conflitoPalavraChave) {
      return respostaPalavraChaveDuplicada({
        valor: conflitoPalavraChave.valor,
        fluxoNome: conflitoPalavraChave.fluxoNome,
        fluxoStatus: conflitoPalavraChave.fluxoStatus,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_fluxos")
      .insert({
        empresa_id: usuario.empresa_id,
        nome,
        descricao: descricao || null,
        canal,
        status,
        criado_por: usuario.id,
        atualizado_por: usuario.id,
        fluxo_padrao: fluxoPadrao,
        configuracao_json: configuracaoFluxo,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao criar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    const { error: inicioError } = await supabaseAdmin
      .from("automacao_nos")
      .insert({
        empresa_id: usuario.empresa_id,
        fluxo_id: data.id,
        tipo_no: "inicio",
        titulo: "Início",
        descricao: null,
        posicao_x: 120,
        posicao_y: 180,
        configuracao_json: {},
        ativo: true,
      });

    if (inicioError) {
      await removerFluxoCriadoComFalha({
        empresaId: usuario.empresa_id,
        fluxoId: data.id,
      });

      return NextResponse.json(
        {
          ok: false,
          error: `Houve erro ao criar o bloco inicial: ${inicioError.message}`,
        },
        { status: 500 }
      );
    }

    let gatilhosCriados: Array<Record<string, unknown>> = [];

    if (gatilhos.length > 0) {
      const { data: gatilhosInseridos, error: gatilhosError } =
        await supabaseAdmin
          .from("automacao_gatilhos")
          .insert(
            gatilhos.map((gatilho) => ({
              empresa_id: usuario.empresa_id,
              fluxo_id: data.id,
              ...gatilho,
            }))
          )
          .select("*");

      if (gatilhosError) {
        await removerFluxoCriadoComFalha({
          empresaId: usuario.empresa_id,
          fluxoId: data.id,
        });

        if (erroDePalavraChaveDuplicada(gatilhosError)) {
          return respostaPalavraChaveDuplicada({
            valor:
              palavrasChave.find((palavra) =>
                String(gatilhosError.message || "").includes(palavra)
              ) ||
              palavrasChave[0] ||
              "",
          });
        }

        return NextResponse.json(
          {
            ok: false,
            error: `Erro ao criar gatilhos: ${gatilhosError.message}`,
          },
          { status: 500 }
        );
      }

      gatilhosCriados = gatilhosInseridos || [];
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id!,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: data.id,
      acao: "fluxo_criado",
      descricao: `Fluxo ${data.nome} criado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      depois: data,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    for (const gatilho of gatilhosCriados) {
      await registrarLogAuditoriaSeguro({
        empresa_id: usuario.empresa_id!,
        categoria: "fluxos",
        entidade: "fluxo",
        entidade_id: data.id,
        acao: "fluxo_gatilho_criado",
        descricao: `Gatilho ${String(gatilho.valor || "")} criado`,
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        usuario_email: usuario.email,
        depois: gatilho,
        ip: auditMeta.ip,
        user_agent: auditMeta.user_agent,
      });
    }

    return NextResponse.json({
      ok: true,
      fluxo: data,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

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
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const atualizacao: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      atualizado_por: usuario.id,
    };

    if (body?.nome !== undefined) {
      atualizacao.nome = String(body.nome || "").trim();
    }

    if (body?.descricao !== undefined) {
      const descricao = String(body.descricao || "").trim();
      atualizacao.descricao = descricao || null;
    }

    if (body?.canal !== undefined) {
      atualizacao.canal = String(body.canal || "whatsapp").trim();
    }

    if (body?.status !== undefined) {
      atualizacao.status = String(body.status || "rascunho").trim();
    }

    if (
      atualizacao.status === "ativo" &&
      usuario.assinatura?.status === "bloqueada"
    ) {
      return respostaAssinaturaBloqueada();
    }

    if (body?.configuracao_json !== undefined) {
      atualizacao.configuracao_json = normalizarConfiguracaoFluxo(
        body.configuracao_json
      );
    }

    if (body?.fluxo_padrao === "__validacao_legada_desativada__") {
      const { data: fluxoPadraoExistente } = await supabaseAdmin
        .from("automacao_fluxos")
        .select("id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("fluxo_padrao", true)
        .neq("id", id)
        .neq("status", "arquivado")
        .maybeSingle();

      if (fluxoPadraoExistente) {
        return NextResponse.json(
          {
            ok: false,
            error: "Já existe um fluxo padrão cadastrado.",
          },
          { status: 400 }
        );
      }
    }

    if (body?.fluxo_padrao !== undefined) {
      atualizacao.fluxo_padrao = Boolean(body.fluxo_padrao);
    }


    if (atualizacao.nome !== undefined && !atualizacao.nome) {
      return NextResponse.json(
        { ok: false, error: "Nome do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { data: fluxoAntes } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    if (!fluxoAntes) {
      return NextResponse.json(
        { ok: false, error: "Fluxo nÃ£o encontrado." },
        { status: 404 }
      );
    }

    const configuracaoFinal =
      atualizacao.configuracao_json !== undefined
        ? atualizacao.configuracao_json
        : normalizarConfiguracaoFluxo(fluxoAntes.configuracao_json);
    const validacaoEscopo = await validarEscopoIntegracoesWhatsappFluxo({
      empresaId: usuario.empresa_id,
      usuario,
      configuracao: configuracaoFinal,
    });

    if (!validacaoEscopo.ok) {
      return NextResponse.json(
        { ok: false, error: validacaoEscopo.error },
        { status: 400 }
      );
    }

    const statusFinal = String(atualizacao.status || fluxoAntes.status || "");
    const fluxoPadraoFinal =
      atualizacao.fluxo_padrao !== undefined
        ? atualizacao.fluxo_padrao === true
        : fluxoAntes.fluxo_padrao === true;

    if (fluxoPadraoFinal) {
      const fluxoPadraoExistente = await buscarFluxoPadraoConflitante({
        empresaId: usuario.empresa_id,
        escopo: validacaoEscopo.escopo,
        excluirFluxoId: id,
      });

      if (fluxoPadraoExistente) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Já existe um fluxo padrão cadastrado para este escopo de integração.",
          },
          { status: 400 }
        );
      }
    }

    if (statusFinal === "ativo" && !fluxoPadraoFinal) {
      const possuiGatilhoAtivo = await fluxoPossuiGatilhoAtivo({
        empresaId: usuario.empresa_id,
        fluxoId: id,
      });

      if (!possuiGatilhoAtivo) {
        return respostaFluxoAtivoSemGatilho();
      }
    }

    if (statusFinal === "ativo") {
      const canalFinal = String(
        atualizacao.canal || fluxoAntes?.canal || "whatsapp"
      ).trim();

      if (canalFinal.toLowerCase() === "whatsapp") {
        const erroTemplateWhatsapp = await validarTemplatesWhatsappFluxo({
          empresaId: usuario.empresa_id,
          fluxoId: id,
          escopoIntegracoes: validacaoEscopo.escopo,
        });

        if (erroTemplateWhatsapp) {
          return NextResponse.json(
            {
              ok: false,
              code: "TEMPLATE_WHATSAPP_OBRIGATORIO",
              error: erroTemplateWhatsapp,
            },
            { status: 400 }
          );
        }

        const bloqueioMeta = await buscarBloqueioWhatsappMeta(
          usuario.empresa_id,
          validacaoEscopo.escopo.modo === "selecionadas"
            ? validacaoEscopo.escopo.ids
            : null
        );

        if (bloqueioMeta) {
          return respostaWhatsappMetaBloqueado(bloqueioMeta.onboarding_erro);
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from("automacao_fluxos")
      .update(atualizacao)
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao atualizar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    if (atualizacao.fluxo_padrao === true) {
      const { error: gatilhosError } = await supabaseAdmin
        .from("automacao_gatilhos")
        .delete()
        .eq("empresa_id", usuario.empresa_id)
        .eq("fluxo_id", id);

      if (gatilhosError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Fluxo atualizado, mas houve erro ao remover gatilhos: ${gatilhosError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const statusAntes = String(fluxoAntes?.status || "");
    const statusDepois = String(data.status || "");
    const acao =
      statusAntes !== statusDepois && statusDepois === "ativo"
        ? "fluxo_ativado"
        : statusAntes !== statusDepois && statusDepois === "pausado"
        ? "fluxo_pausado"
        : "fluxo_atualizado";

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id!,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: id,
      acao,
      descricao: `Fluxo ${data.nome || id} atualizado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: fluxoAntes,
      depois: data,
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      fluxo: data,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

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
    const definitivo = Boolean(body?.definitivo);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    if (definitivo) {
      const { data: fluxoArquivado, error: fluxoArquivadoError } =
        await supabaseAdmin
          .from("automacao_fluxos")
          .select("id")
          .eq("id", id)
          .eq("empresa_id", usuario.empresa_id)
          .eq("status", "arquivado")
          .maybeSingle();

      if (fluxoArquivadoError) {
        return NextResponse.json(
          {
            ok: false,
            error: `Erro ao validar fluxo para exclusao definitiva: ${fluxoArquivadoError.message}`,
          },
          { status: 500 }
        );
      }

      if (!fluxoArquivado) {
        return NextResponse.json(
          {
            ok: false,
            error: "Fluxo arquivado nao encontrado para exclusao definitiva.",
          },
          { status: 404 }
        );
      }

      await desvincularAgendamentosDoFluxo({
        fluxoId: id,
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      });

      const { error } = await supabaseAdmin
        .from("automacao_fluxos")
        .delete()
        .eq("id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("status", "arquivado");

      if (error) {
        return NextResponse.json(
          { ok: false, error: `Erro ao apagar definitivamente: ${error.message}` },
          { status: 500 }
        );
      }

      await registrarLogAuditoriaSeguro({
        empresa_id: usuario.empresa_id,
        categoria: "fluxos",
        entidade: "fluxo",
        entidade_id: id,
        acao: "fluxo_excluido_definitivo",
        descricao: "Fluxo excluido definitivamente",
        usuario_id: usuario.id,
        usuario_nome: usuario.nome,
        usuario_email: usuario.email,
        antes: fluxoArquivado,
        ip: auditMeta.ip,
        user_agent: auditMeta.user_agent,
      });

      return NextResponse.json({
        ok: true,
        definitivo: true,
      });
    }

    const { data: fluxoAntes } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("automacao_fluxos")
      .update({
        status: "arquivado",
        updated_at: new Date().toISOString(),
        atualizado_por: usuario.id,
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao arquivar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: id,
      acao: "fluxo_arquivado",
      descricao: `Fluxo ${fluxoAntes?.nome || id} arquivado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: fluxoAntes,
      depois: { status: "arquivado" },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      definitivo: false,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { data: fluxoOriginal, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (fluxoError || !fluxoOriginal) {
      return NextResponse.json(
        { ok: false, error: "Fluxo original não encontrado." },
        { status: 404 }
      );
    }

    const { data: novoFluxo, error: novoFluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .insert({
        empresa_id: usuario.empresa_id,
        nome: `${fluxoOriginal.nome} - cópia`,
        descricao: fluxoOriginal.descricao,
        canal: fluxoOriginal.canal,
        status: "rascunho",
        criado_por: usuario.id,
        atualizado_por: usuario.id,
        fluxo_padrao: false,
        configuracao_json: normalizarConfiguracaoFluxo(
          fluxoOriginal.configuracao_json
        ),
      })
      .select("*")
      .single();

    if (novoFluxoError || !novoFluxo) {
      return NextResponse.json(
        { ok: false, error: `Erro ao duplicar fluxo: ${novoFluxoError?.message}` },
        { status: 500 }
      );
    }

    const { data: nosOriginais, error: nosError } = await supabaseAdmin
      .from("automacao_nos")
      .select("*")
      .eq("fluxo_id", fluxoOriginal.id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true);

    if (nosError) {
      return NextResponse.json(
        { ok: false, error: nosError.message },
        { status: 500 }
      );
    }

    const mapaIds = new Map<string, string>();

    const nosDuplicados = (nosOriginais || []).map((no) => {
      const novoId = crypto.randomUUID();
      mapaIds.set(no.id, novoId);

      return {
        id: novoId,
        empresa_id: usuario.empresa_id,
        fluxo_id: novoFluxo.id,
        tipo_no: no.tipo_no,
        titulo: no.titulo,
        descricao: no.descricao,
        posicao_x: no.posicao_x,
        posicao_y: no.posicao_y,
        configuracao_json: no.configuracao_json || {},
        delay_segundos: no.tipo_no === "inicio" ? null : no.delay_segundos ?? null,
        ativo: true,
      };
    });

    if (nosDuplicados.length > 0) {
      const { error: inserirNosError } = await supabaseAdmin
        .from("automacao_nos")
        .insert(nosDuplicados);

      if (inserirNosError) {
        return NextResponse.json(
          { ok: false, error: inserirNosError.message },
          { status: 500 }
        );
      }
    }

    const { data: conexoesOriginais, error: conexoesError } = await supabaseAdmin
      .from("automacao_conexoes")
      .select("*")
      .eq("fluxo_id", fluxoOriginal.id)
      .eq("empresa_id", usuario.empresa_id)
      .eq("ativo", true);

    if (conexoesError) {
      return NextResponse.json(
        { ok: false, error: conexoesError.message },
        { status: 500 }
      );
    }

    const conexoesDuplicadas = (conexoesOriginais || [])
      .map((conexao) => {
        const novoOrigemId = mapaIds.get(conexao.no_origem_id);
        const novoDestinoId = mapaIds.get(conexao.no_destino_id);

        if (!novoOrigemId || !novoDestinoId) return null;

        return {
          id: crypto.randomUUID(),
          empresa_id: usuario.empresa_id,
          fluxo_id: novoFluxo.id,
          no_origem_id: novoOrigemId,
          no_destino_id: novoDestinoId,
          condicao_json: conexao.condicao_json || {},
          rotulo: conexao.rotulo,
          ordem: conexao.ordem,
          ativo: true,
          usar_ia: conexao.usar_ia === true,
          descricao_ia: conexao.descricao_ia || null,
        };
      })
      .filter(Boolean);

    if (conexoesDuplicadas.length > 0) {
      const { error: inserirConexoesError } = await supabaseAdmin
        .from("automacao_conexoes")
        .insert(conexoesDuplicadas);

      if (inserirConexoesError) {
        return NextResponse.json(
          { ok: false, error: inserirConexoesError.message },
          { status: 500 }
        );
      }
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id!,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: novoFluxo.id,
      acao: "fluxo_duplicado",
      descricao: `Fluxo ${fluxoOriginal.nome} duplicado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        fluxo_id: fluxoOriginal.id,
        nome: fluxoOriginal.nome,
        nos: nosOriginais?.length || 0,
        conexoes: conexoesOriginais?.length || 0,
      },
      depois: {
        fluxo_id: novoFluxo.id,
        nome: novoFluxo.nome,
        nos: nosDuplicados.length,
        conexoes: conexoesDuplicadas.length,
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({
      ok: true,
      fluxo: novoFluxo,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: obterMensagemErro(error) },
      { status: 500 }
    );
  }
}
