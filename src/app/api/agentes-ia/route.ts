import { NextResponse } from "next/server";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const MODELO_PADRAO = "gpt-5.6-luna";
const LIMITE_CARACTERISTICAS = 5;
const MENSAGEM_TRANSFERENCIA_PADRAO =
  "Aguarde que um dos nossos atendentes já vai te responder...";

const FERRAMENTAS_VALIDAS = new Set([
  "consultar_conhecimento",
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
  "consultar_contato",
  "transferir_humano",
]);
const FERRAMENTAS_AGENDA = new Set([
  "consultar_agenda",
  "criar_agendamento",
  "remarcar_agendamento",
  "cancelar_agendamento",
]);
const CONDICOES_GATILHO = new Set(["exata", "inicia_com", "contem", "regex"]);
const ESTRATEGIAS_TRANSFERENCIA = new Set([
  "fila_setor",
  "atendente_especifico",
  "rodizio_aleatorio",
  "menos_conversas",
]);

type ModoAtendimento = "economico" | "geral";
type FallbackTipo = "fluxo" | "transferir_humano" | "nenhum";

type FerramentaBody = {
  tipo: string;
  ativo: boolean;
  config_json: Record<string, unknown>;
};

type GatilhoBody = {
  id?: string;
  tipo_gatilho: "palavra_chave";
  valor: string;
  condicao: "exata" | "inicia_com" | "contem" | "regex";
  ativo: boolean;
};

type TransferenciaFallback = {
  escopo_fila: "setor" | "geral";
  setor_id: string | null;
  estrategia_transferencia:
    | "fila_setor"
    | "atendente_especifico"
    | "rodizio_aleatorio"
    | "menos_conversas";
  atendente_id: string | null;
  incluir_administradores_distribuicao: boolean;
  mensagem: string;
};

function idsString(valor: unknown) {
  if (!Array.isArray(valor)) return [] as string[];
  return Array.from(
    new Set(valor.map((item) => String(item || "").trim()).filter(Boolean))
  );
}

function booleano(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function normalizarModo(valor: unknown): ModoAtendimento {
  return String(valor || "").trim() === "geral" ? "geral" : "economico";
}

function normalizarFallbackTipo(valor: unknown): FallbackTipo {
  const tipo = String(valor || "").trim();
  if (tipo === "fluxo" || tipo === "transferir_humano") return tipo;
  return "nenhum";
}

function normalizarCaracteristicas(valor: unknown) {
  const vistos = new Set<string>();
  const itens: string[] = [];
  for (const bruto of String(valor || "").split(",")) {
    const item = bruto.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!item) continue;
    const chave = item.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(item);
    if (itens.length >= LIMITE_CARACTERISTICAS) break;
  }
  return itens.length ? itens.join(", ") : null;
}

function ferramentasBody(valor: unknown): FerramentaBody[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => {
      if (typeof item === "string") {
        return {
          tipo: item,
          ativo: true,
          config_json: {} as Record<string, unknown>,
        };
      }
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      return {
        tipo: String(obj.tipo || "").trim(),
        ativo: obj.ativo !== false,
        config_json:
          obj.config_json &&
          typeof obj.config_json === "object" &&
          !Array.isArray(obj.config_json)
            ? (obj.config_json as Record<string, unknown>)
            : {},
      };
    })
    .filter(
      (item): item is FerramentaBody =>
        !!item && FERRAMENTAS_VALIDAS.has(item.tipo)
    );
}

function gatilhosBody(valor: unknown): GatilhoBody[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const saida: GatilhoBody[] = [];

  for (const item of valor) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const condicao = String(obj.condicao || "contem").trim();
    const palavra = String(obj.valor || "").trim().slice(0, 300);
    if (!palavra || !CONDICOES_GATILHO.has(condicao)) continue;

    const chave = `${condicao}:${palavra.toLocaleLowerCase("pt-BR")}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    saida.push({
      id: String(obj.id || "").trim() || undefined,
      tipo_gatilho: "palavra_chave",
      valor: palavra,
      condicao: condicao as GatilhoBody["condicao"],
      ativo: obj.ativo !== false,
    });
  }

  return saida;
}

function normalizarTransferencia(valor: unknown): TransferenciaFallback {
  const obj =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  const escopo = String(obj.escopo_fila || "geral") === "setor" ? "setor" : "geral";
  const estrategiaBruta = String(obj.estrategia_transferencia || "fila_setor");
  const estrategia = ESTRATEGIAS_TRANSFERENCIA.has(estrategiaBruta)
    ? (estrategiaBruta as TransferenciaFallback["estrategia_transferencia"])
    : "fila_setor";

  return {
    escopo_fila: escopo,
    setor_id:
      escopo === "setor" ? String(obj.setor_id || "").trim() || null : null,
    estrategia_transferencia: escopo === "geral" ? "fila_setor" : estrategia,
    atendente_id:
      escopo === "setor" && estrategia === "atendente_especifico"
        ? String(obj.atendente_id || "").trim() || null
        : null,
    incluir_administradores_distribuicao:
      escopo === "setor" &&
      ["rodizio_aleatorio", "menos_conversas"].includes(estrategia)
        ? booleano(obj.incluir_administradores_distribuicao)
        : false,
    mensagem: String(obj.mensagem ?? "").slice(0, 500),
  };
}

function escoposConflitam(a: string[], b: string[]) {
  if (!a.length || !b.length) return true;
  const conjunto = new Set(b);
  return a.some((id) => conjunto.has(id));
}

function fluxosConflitam(a: string[], b: string[]) {
  if (!a.length || !b.length) return true;
  const conjunto = new Set(b);
  return a.some((id) => conjunto.has(id));
}

function chaveGatilho(gatilho: { condicao?: unknown; valor?: unknown }) {
  return `${String(gatilho.condicao || "").trim()}:${String(gatilho.valor || "")
    .trim()
    .toLocaleLowerCase("pt-BR")}`;
}

function agendaConfiguradaNasFerramentas(ferramentas: FerramentaBody[]) {
  const ferramentasAgendaAtivas = ferramentas.filter(
    (item) => item.ativo && FERRAMENTAS_AGENDA.has(item.tipo)
  );
  if (!ferramentasAgendaAtivas.length) {
    return { usaAgenda: false, agendaId: null as string | null };
  }

  const ids = ferramentasAgendaAtivas.map((item) =>
    String(item.config_json?.agenda_id || "").trim()
  );
  if (ids.some((id) => !id)) {
    return { usaAgenda: true, agendaId: null as string | null };
  }

  const unicos = Array.from(new Set(ids));
  return {
    usaAgenda: true,
    agendaId: unicos.length === 1 ? unicos[0] : null,
  };
}

function normalizarAgendaNasFerramentas(
  ferramentas: FerramentaBody[],
  agendaId: string | null
) {
  if (!agendaId) return ferramentas;
  return ferramentas.map((item) =>
    FERRAMENTAS_AGENDA.has(item.tipo)
      ? {
          ...item,
          config_json: { ...(item.config_json || {}), agenda_id: agendaId },
        }
      : item
  );
}

async function validarAgendaObrigatoria(
  empresaId: string,
  ferramentas: FerramentaBody[]
) {
  const configuracao = agendaConfiguradaNasFerramentas(ferramentas);
  if (!configuracao.usaAgenda) {
    return { ok: true as const, agendaId: null as string | null };
  }
  if (!configuracao.agendaId) {
    return {
      ok: false as const,
      error: "Selecione uma única agenda obrigatória para usar as ferramentas de agenda.",
    };
  }

  const { data: agenda, error } = await supabaseAdmin
    .from("calendarios")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("id", configuracao.agendaId)
    .eq("status", "ativo")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agenda) {
    return {
      ok: false as const,
      error: "A agenda configurada não existe, está inativa ou não pertence à empresa.",
    };
  }
  return { ok: true as const, agendaId: agenda.id };
}

async function carregarFerramentasAgente(empresaId: string, agenteId: string) {
  const { data, error } = await supabaseAdmin
    .from("agente_ia_ferramentas")
    .select("tipo, ativo, config_json")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId);
  if (error) throw new Error(error.message);
  return (data || []).map((item) => ({
    tipo: String(item.tipo || ""),
    ativo: item.ativo !== false,
    config_json: (item.config_json || {}) as Record<string, unknown>,
  }));
}

async function carregarGatilhosAgente(empresaId: string, agenteId: string) {
  const { data, error } = await supabaseAdmin
    .from("agente_ia_gatilhos")
    .select("id, tipo_gatilho, valor, condicao, ativo")
    .eq("empresa_id", empresaId)
    .eq("agente_id", agenteId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return gatilhosBody(data || []);
}

async function contextoEmpresa() {
  const resultado = await getUsuarioContexto();
  if (!resultado.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: resultado.error },
        { status: resultado.status }
      ),
    };
  }
  if (!resultado.usuario.empresa_id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      ),
    };
  }
  return {
    ok: true as const,
    usuario: resultado.usuario,
    empresaId: resultado.usuario.empresa_id,
  };
}

async function carregarAgentes(empresaId: string) {
  const [
    { data: agentes, error },
    { data: ferramentas },
    { data: conhecimentos },
    { data: gatilhos },
  ] = await Promise.all([
    supabaseAdmin
      .from("agentes_ia")
      .select("*")
      .eq("empresa_id", empresaId)
      .neq("status", "arquivado")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("agente_ia_ferramentas")
      .select("id, agente_id, tipo, ativo, config_json")
      .eq("empresa_id", empresaId)
      .order("tipo", { ascending: true }),
    supabaseAdmin
      .from("agente_ia_conhecimentos")
      .select(
        "id, agente_id, titulo, categoria, conteudo, palavras_chave, prioridade, ativo, created_at, updated_at"
      )
      .eq("empresa_id", empresaId)
      .order("prioridade", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("agente_ia_gatilhos")
      .select("id, agente_id, tipo_gatilho, valor, condicao, ativo, created_at")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: true }),
  ]);
  if (error) throw new Error(error.message);

  return (agentes || []).map((agente) => ({
    ...agente,
    modelo: MODELO_PADRAO,
    status: agente.status === "ativo" ? "ativo" : "inativo",
    modo_atendimento: normalizarModo(agente.modo_atendimento),
    fallback_tipo: normalizarFallbackTipo(agente.fallback_tipo),
    ferramentas: (ferramentas || []).filter((item) => item.agente_id === agente.id),
    conhecimentos: (conhecimentos || []).filter(
      (item) => item.agente_id === agente.id
    ),
    gatilhos: (gatilhos || []).filter((item) => item.agente_id === agente.id),
  }));
}

async function validarFallbackReferencias(params: {
  empresaId: string;
  fallbackTipo: FallbackTipo;
  fallbackFluxoId: string | null;
  transferencia: TransferenciaFallback;
}) {
  if (params.fallbackTipo === "fluxo") {
    if (!params.fallbackFluxoId) {
      return { ok: false as const, error: "Selecione o fluxo de contingência." };
    }
    const { data: fluxo, error } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id")
      .eq("empresa_id", params.empresaId)
      .eq("id", params.fallbackFluxoId)
      .eq("status", "ativo")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fluxo) {
      return {
        ok: false as const,
        error: "O fluxo de contingência não existe ou não está ativo.",
      };
    }
  }

  if (params.fallbackTipo === "transferir_humano") {
    if (params.transferencia.escopo_fila === "setor") {
      if (!params.transferencia.setor_id) {
        return { ok: false as const, error: "Selecione o setor da transferência de contingência." };
      }
      const { data: setor, error } = await supabaseAdmin
        .from("setores")
        .select("id")
        .eq("empresa_id", params.empresaId)
        .eq("id", params.transferencia.setor_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!setor) {
        return { ok: false as const, error: "O setor da contingência não pertence à empresa." };
      }
    }

    if (
      params.transferencia.estrategia_transferencia === "atendente_especifico" &&
      !params.transferencia.atendente_id
    ) {
      return { ok: false as const, error: "Selecione o atendente específico da contingência." };
    }

    if (params.transferencia.atendente_id) {
      const { data: atendente, error } = await supabaseAdmin
        .from("usuarios")
        .select("id")
        .eq("empresa_id", params.empresaId)
        .eq("id", params.transferencia.atendente_id)
        .eq("status", "ativo")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!atendente) {
        return { ok: false as const, error: "O atendente da contingência está inativo ou não pertence à empresa." };
      }
    }
  }

  return { ok: true as const };
}

async function validarAtivacaoRoteamento(params: {
  empresaId: string;
  agenteId: string;
  modo: ModoAtendimento;
  integracoes: string[];
  fluxos: string[];
  fallbackExclusivo: boolean;
  gatilhos: GatilhoBody[];
  fallbackTipo: FallbackTipo;
  fallbackFluxoId: string | null;
  transferencia: TransferenciaFallback;
  aceiteSemContingencia: boolean;
}) {
  const referenciaFallback = await validarFallbackReferencias(params);
  if (!referenciaFallback.ok) return referenciaFallback;

  if (params.fallbackTipo === "nenhum" && !params.aceiteSemContingencia) {
    return {
      ok: false as const,
      code: "CONTINGENCIA_NAO_CONFIRMADA",
      error:
        "Confirme que está ciente de que, sem contingência, o atendimento automático pode ficar sem resposta quando os tokens de IA acabarem.",
    };
  }

  if (params.modo === "geral" && !params.fallbackExclusivo && params.gatilhos.length === 0) {
    return {
      ok: false as const,
      code: "AGENTE_GERAL_SEM_ROTEAMENTO",
      error:
        "No modo Geral, cadastre ao menos uma palavra-chave ou ative este agente como fallback exclusivo.",
    };
  }

  const { data: outros, error } = await supabaseAdmin
    .from("agentes_ia")
    .select(
      "id, nome, modo_atendimento, fluxos_ids, fallback_exclusivo, integracoes_whatsapp_ids"
    )
    .eq("empresa_id", params.empresaId)
    .eq("status", "ativo")
    .neq("id", params.agenteId);
  if (error) throw new Error(error.message);

  if (params.modo === "economico") {
    const conflito = (outros || []).find(
      (item) =>
        normalizarModo(item.modo_atendimento) === "economico" &&
        escoposConflitam(params.integracoes, idsString(item.integracoes_whatsapp_ids)) &&
        fluxosConflitam(params.fluxos, idsString(item.fluxos_ids))
    );
    if (conflito) {
      return {
        ok: false as const,
        code: "AGENTE_ECONOMICO_FLUXO_CONFLITANTE",
        error: `O agente “${conflito.nome}” já está ativo para o mesmo fluxo e integração. Cada combinação fluxo + WhatsApp pode ter apenas um agente Econômico.`,
      };
    }
  }

  if (params.modo === "geral") {
    const gerais = (outros || []).filter(
      (item) =>
        normalizarModo(item.modo_atendimento) === "geral" &&
        escoposConflitam(params.integracoes, idsString(item.integracoes_whatsapp_ids))
    );

    if (params.fallbackExclusivo) {
      const conflitoFallback = gerais.find((item) => item.fallback_exclusivo === true);
      if (conflitoFallback) {
        return {
          ok: false as const,
          code: "FALLBACK_GERAL_CONFLITANTE",
          error: `O agente “${conflitoFallback.nome}” já é o fallback exclusivo neste escopo de WhatsApp.`,
        };
      }
    }

    if (params.gatilhos.length > 0 && gerais.length > 0) {
      const idsGerais = gerais.map((item) => item.id);
      const { data: gatilhosOutros, error: gatilhosError } = await supabaseAdmin
        .from("agente_ia_gatilhos")
        .select("agente_id, valor, condicao, ativo")
        .eq("empresa_id", params.empresaId)
        .eq("ativo", true)
        .in("agente_id", idsGerais);
      if (gatilhosError) throw new Error(gatilhosError.message);

      const chavesAtuais = new Set(params.gatilhos.map(chaveGatilho));
      const conflitoGatilho = (gatilhosOutros || []).find((item) =>
        chavesAtuais.has(chaveGatilho(item))
      );
      if (conflitoGatilho) {
        const outro = gerais.find((item) => item.id === conflitoGatilho.agente_id);
        return {
          ok: false as const,
          code: "PALAVRA_CHAVE_AGENTE_CONFLITANTE",
          error: `A mesma palavra-chave já está ativa no agente “${outro?.nome || "outro agente"}” para este WhatsApp.`,
        };
      }
    }
  }

  return { ok: true as const };
}

export async function GET() {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;

    const [
      agentes,
      integracoesResult,
      fluxosResult,
      setoresResult,
      agendasResult,
      usuariosResult,
      vinculosResult,
    ] = await Promise.all([
      carregarAgentes(contexto.empresaId),
      supabaseAdmin
        .from("integracoes_whatsapp")
        .select("id, nome_conexao, numero, phone_number_display_name, verified_name, status")
        .eq("empresa_id", contexto.empresaId)
        .order("posicao", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("automacao_fluxos")
        .select("id, nome, status")
        .eq("empresa_id", contexto.empresaId)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
      supabaseAdmin
        .from("setores")
        .select("id, nome, status, ativo")
        .eq("empresa_id", contexto.empresaId)
        .order("ordem_exibicao", { ascending: true }),
      supabaseAdmin
        .from("calendarios")
        .select("id, nome, timezone, duracao_minutos, status")
        .eq("empresa_id", contexto.empresaId)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
      supabaseAdmin
        .from("usuarios")
        .select("id, nome, email, status")
        .eq("empresa_id", contexto.empresaId)
        .eq("status", "ativo")
        .order("nome", { ascending: true }),
      supabaseAdmin.from("usuarios_setores").select("usuario_id, setor_id"),
    ]);

    const vinculos = vinculosResult.data || [];
    const atendentes = (usuariosResult.data || []).map((usuario) => ({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      setor_ids: vinculos
        .filter((vinculo) => vinculo.usuario_id === usuario.id)
        .map((vinculo) => vinculo.setor_id),
    }));

    return NextResponse.json({
      ok: true,
      agentes,
      opcoes: {
        integracoes: integracoesResult.data || [],
        fluxos: fluxosResult.data || [],
        setores: (setoresResult.data || []).filter(
          (item) => item.ativo !== false && item.status !== "inativo"
        ),
        agendas: agendasResult.data || [],
        atendentes,
      },
    });
  } catch (error) {
    console.error("[AGENTES_IA_API] GET:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao listar agentes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const body = (await request.json()) as Record<string, unknown>;
    const nome = String(body.nome || "Novo agente").trim() || "Novo agente";

    const { data: agente, error } = await supabaseAdmin
      .from("agentes_ia")
      .insert({
        empresa_id: contexto.empresaId,
        nome,
        descricao: String(body.descricao || "").trim() || null,
        status: "inativo",
        modelo: MODELO_PADRAO,
        prompt_sistema: String(body.prompt_sistema || "").trim(),
        tom_voz: null,
        instrucoes: "",
        max_mensagens_contexto: 6,
        debounce_ms: 1200,
        integracoes_whatsapp_ids: [],
        modo_atendimento: "economico",
        fluxos_ids: [],
        fallback_exclusivo: false,
        fallback_tipo: "nenhum",
        fallback_fluxo_id: null,
        fallback_transferencia_json: {
          escopo_fila: "geral",
          setor_id: null,
          estrategia_transferencia: "fila_setor",
          atendente_id: null,
          incluir_administradores_distribuicao: false,
          mensagem: MENSAGEM_TRANSFERENCIA_PADRAO,
        },
        fallback_sem_contingencia_aceito: false,
        created_by: contexto.usuario.id,
        updated_by: contexto.usuario.id,
      })
      .select("*")
      .single();
    if (error || !agente) throw new Error(error?.message || "Erro ao criar agente.");

    const ferramentasPadrao = ["consultar_conhecimento", "consultar_contato"].map(
      (tipo) => ({
        empresa_id: contexto.empresaId,
        agente_id: agente.id,
        tipo,
        ativo: true,
        config_json: {},
      })
    );
    const { error: ferramentasError } = await supabaseAdmin
      .from("agente_ia_ferramentas")
      .insert(ferramentasPadrao);
    if (ferramentasError) throw new Error(ferramentasError.message);

    return NextResponse.json(
      {
        ok: true,
        agente: {
          ...agente,
          modelo: MODELO_PADRAO,
          status: "inativo",
          gatilhos: [],
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[AGENTES_IA_API] POST:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao criar agente.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }

    const { data: atual, error: atualError } = await supabaseAdmin
      .from("agentes_ia")
      .select("*")
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id)
      .maybeSingle();
    if (atualError) throw new Error(atualError.message);
    if (!atual || atual.status === "arquivado") {
      return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });
    }

    const acao = String(body.acao || "salvar");

    if (acao === "ativar") {
      if (atual.status === "ativo") {
        return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
      }

      const [ferramentasAtuais, gatilhosAtuais] = await Promise.all([
        carregarFerramentasAgente(contexto.empresaId, id),
        carregarGatilhosAgente(contexto.empresaId, id),
      ]);
      const validacaoAgenda = await validarAgendaObrigatoria(
        contexto.empresaId,
        ferramentasAtuais
      );
      if (!validacaoAgenda.ok) {
        return NextResponse.json(
          { ok: false, code: "AGENDA_AGENTE_OBRIGATORIA", error: validacaoAgenda.error },
          { status: 409 }
        );
      }

      const validacaoRoteamento = await validarAtivacaoRoteamento({
        empresaId: contexto.empresaId,
        agenteId: id,
        modo: normalizarModo(atual.modo_atendimento),
        integracoes: idsString(atual.integracoes_whatsapp_ids),
        fluxos: idsString(atual.fluxos_ids),
        fallbackExclusivo: atual.fallback_exclusivo === true,
        gatilhos: gatilhosAtuais,
        fallbackTipo: normalizarFallbackTipo(atual.fallback_tipo),
        fallbackFluxoId: String(atual.fallback_fluxo_id || "").trim() || null,
        transferencia: normalizarTransferencia(atual.fallback_transferencia_json),
        aceiteSemContingencia: atual.fallback_sem_contingencia_aceito === true,
      });
      if (!validacaoRoteamento.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "code" in validacaoRoteamento ? validacaoRoteamento.code : "CONFIGURACAO_AGENTE_INVALIDA",
            error: validacaoRoteamento.error,
          },
          { status: 409 }
        );
      }

      const { error } = await supabaseAdmin
        .from("agentes_ia")
        .update({
          status: "ativo",
          modelo: MODELO_PADRAO,
          updated_by: contexto.usuario.id,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", contexto.empresaId)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao === "pausar") {
      const { error } = await supabaseAdmin
        .from("agentes_ia")
        .update({
          status: "inativo",
          modelo: MODELO_PADRAO,
          updated_by: contexto.usuario.id,
          updated_at: new Date().toISOString(),
        })
        .eq("empresa_id", contexto.empresaId)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao === "adicionar_conhecimento") {
      const titulo = String(body.titulo || "").trim();
      const conteudo = String(body.conteudo || "").trim();
      if (!titulo || !conteudo) {
        return NextResponse.json(
          { ok: false, error: "Título e conteúdo são obrigatórios." },
          { status: 400 }
        );
      }
      const palavras = Array.isArray(body.palavras_chave)
        ? idsString(body.palavras_chave)
        : String(body.palavras_chave || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
      const { error } = await supabaseAdmin.from("agente_ia_conhecimentos").insert({
        empresa_id: contexto.empresaId,
        agente_id: id,
        titulo,
        categoria: String(body.categoria || "").trim() || null,
        conteudo,
        palavras_chave: palavras,
        prioridade: Number.isFinite(Number(body.prioridade))
          ? Number(body.prioridade)
          : 0,
        ativo: true,
        created_by: contexto.usuario.id,
        updated_by: contexto.usuario.id,
      });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao === "excluir_conhecimento") {
      const conhecimentoId = String(body.conhecimento_id || "").trim();
      if (!conhecimentoId) {
        return NextResponse.json(
          { ok: false, error: "conhecimento_id é obrigatório." },
          { status: 400 }
        );
      }
      const { error } = await supabaseAdmin
        .from("agente_ia_conhecimentos")
        .delete()
        .eq("empresa_id", contexto.empresaId)
        .eq("agente_id", id)
        .eq("id", conhecimentoId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
    }

    if (acao !== "salvar") {
      return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    }

    const integracoes = idsString(body.integracoes_whatsapp_ids);
    const modo = normalizarModo(body.modo_atendimento ?? atual.modo_atendimento);
    const fluxosIds = idsString(body.fluxos_ids ?? atual.fluxos_ids);
    const fallbackExclusivo = booleano(body.fallback_exclusivo ?? atual.fallback_exclusivo);
    const fallbackTipo = normalizarFallbackTipo(body.fallback_tipo ?? atual.fallback_tipo);
    const fallbackFluxoId =
      fallbackTipo === "fluxo"
        ? String(body.fallback_fluxo_id ?? atual.fallback_fluxo_id ?? "").trim() || null
        : null;
    const transferencia = normalizarTransferencia(
      body.fallback_transferencia_json ?? atual.fallback_transferencia_json
    );
    const aceiteSemContingencia = booleano(
      body.fallback_sem_contingencia_aceito ?? atual.fallback_sem_contingencia_aceito
    );
    const gatilhos = Array.isArray(body.gatilhos)
      ? gatilhosBody(body.gatilhos)
      : await carregarGatilhosAgente(contexto.empresaId, id);

    const validacaoFallback = await validarFallbackReferencias({
      empresaId: contexto.empresaId,
      fallbackTipo,
      fallbackFluxoId,
      transferencia,
    });
    if (!validacaoFallback.ok) {
      return NextResponse.json(
        { ok: false, code: "FALLBACK_AGENTE_INVALIDO", error: validacaoFallback.error },
        { status: 400 }
      );
    }

    if (atual.status === "ativo") {
      const validacaoRoteamento = await validarAtivacaoRoteamento({
        empresaId: contexto.empresaId,
        agenteId: id,
        modo,
        integracoes,
        fluxos: fluxosIds,
        fallbackExclusivo,
        gatilhos,
        fallbackTipo,
        fallbackFluxoId,
        transferencia,
        aceiteSemContingencia,
      });
      if (!validacaoRoteamento.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "code" in validacaoRoteamento ? validacaoRoteamento.code : "CONFIGURACAO_AGENTE_INVALIDA",
            error: validacaoRoteamento.error,
          },
          { status: 409 }
        );
      }
    }

    let ferramentasNormalizadas: FerramentaBody[] | null = null;
    if (Array.isArray(body.ferramentas)) {
      const ferramentas = ferramentasBody(body.ferramentas);
      const validacaoAgenda = await validarAgendaObrigatoria(contexto.empresaId, ferramentas);
      if (!validacaoAgenda.ok) {
        return NextResponse.json(
          { ok: false, code: "AGENDA_AGENTE_OBRIGATORIA", error: validacaoAgenda.error },
          { status: 400 }
        );
      }
      ferramentasNormalizadas = normalizarAgendaNasFerramentas(
        ferramentas,
        validacaoAgenda.agendaId
      );
    }

    const maxContexto = Math.min(
      40,
      Math.max(4, Number(body.max_mensagens_contexto || atual.max_mensagens_contexto || 6))
    );
    const debounce = Math.min(
      10000,
      Math.max(250, Number(body.debounce_ms || atual.debounce_ms || 1200))
    );

    const update = {
      nome: String(body.nome ?? atual.nome).trim() || atual.nome,
      descricao: String(body.descricao ?? atual.descricao ?? "").trim() || null,
      modelo: MODELO_PADRAO,
      prompt_sistema: String(body.prompt_sistema ?? atual.prompt_sistema ?? "").trim(),
      tom_voz: normalizarCaracteristicas(body.tom_voz ?? atual.tom_voz),
      instrucoes: String(body.instrucoes ?? atual.instrucoes ?? "").trim() || null,
      max_mensagens_contexto: maxContexto,
      debounce_ms: debounce,
      modo_atendimento: modo,
      fluxos_ids: modo === "economico" ? fluxosIds : [],
      fallback_exclusivo: modo === "geral" ? fallbackExclusivo : false,
      fallback_tipo: fallbackTipo,
      fallback_fluxo_id: fallbackFluxoId,
      fallback_transferencia_json: transferencia,
      fallback_sem_contingencia_aceito:
        fallbackTipo === "nenhum" ? aceiteSemContingencia : false,
      integracoes_whatsapp_ids: integracoes,
      updated_by: contexto.usuario.id,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from("agentes_ia")
      .update(update)
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    if (Array.isArray(body.gatilhos)) {
      const { error: deleteGatilhosError } = await supabaseAdmin
        .from("agente_ia_gatilhos")
        .delete()
        .eq("empresa_id", contexto.empresaId)
        .eq("agente_id", id);
      if (deleteGatilhosError) throw new Error(deleteGatilhosError.message);
      if (modo === "geral" && gatilhos.length) {
        const { error: gatilhosError } = await supabaseAdmin
          .from("agente_ia_gatilhos")
          .insert(
            gatilhos.map((gatilho) => ({
              empresa_id: contexto.empresaId,
              agente_id: id,
              tipo_gatilho: "palavra_chave",
              valor: gatilho.valor,
              condicao: gatilho.condicao,
              ativo: gatilho.ativo,
            }))
          );
        if (gatilhosError) throw new Error(gatilhosError.message);
      }
    }

    if (ferramentasNormalizadas) {
      const { error: deleteFerramentasError } = await supabaseAdmin
        .from("agente_ia_ferramentas")
        .delete()
        .eq("empresa_id", contexto.empresaId)
        .eq("agente_id", id);
      if (deleteFerramentasError) throw new Error(deleteFerramentasError.message);
      if (ferramentasNormalizadas.length) {
        const { error: ferramentasError } = await supabaseAdmin
          .from("agente_ia_ferramentas")
          .insert(
            ferramentasNormalizadas.map((item) => ({
              empresa_id: contexto.empresaId,
              agente_id: id,
              tipo: item.tipo,
              ativo: item.ativo,
              config_json: item.config_json,
            }))
          );
        if (ferramentasError) throw new Error(ferramentasError.message);
      }
    }

    return NextResponse.json({ ok: true, agentes: await carregarAgentes(contexto.empresaId) });
  } catch (error) {
    console.error("[AGENTES_IA_API] PATCH:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao salvar agente.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const contexto = await contextoEmpresa();
    if (!contexto.ok) return contexto.response;
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });
    }

    const { data: agente, error: agenteError } = await supabaseAdmin
      .from("agentes_ia")
      .select("id, status")
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id)
      .maybeSingle();
    if (agenteError) throw new Error(agenteError.message);
    if (!agente || agente.status === "arquivado") {
      return NextResponse.json({ ok: false, error: "Agente não encontrado." }, { status: 404 });
    }
    if (agente.status === "ativo") {
      return NextResponse.json(
        {
          ok: false,
          code: "AGENTE_ATIVO",
          error: "Pause o agente antes de apagá-lo definitivamente.",
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from("agentes_ia")
      .delete()
      .eq("empresa_id", contexto.empresaId)
      .eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[AGENTES_IA_API] DELETE:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao apagar agente.",
      },
      { status: 500 }
    );
  }
}
