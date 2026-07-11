import { NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  compilarPlanoAssistente,
  normalizarPlanoAssistente,
  type AssistenteAutomacaoConexao,
  type AssistenteAutomacaoNo,
  type AssistenteSetor,
  type AssistenteVariavel,
  type ModoAssistenteFluxos,
  type PlanoAssistenteFluxos,
} from "@/lib/automacoes/assistente-fluxos";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  SaldoTokensIaEsgotadoError,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";
import { normalizarConfiguracaoFluxo } from "@/lib/automacoes/normalizar-configuracao-fluxo";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = getSupabaseAdmin();

const MODELOS_ASSISTENTE_FLUXOS =
  process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL || "gpt-5.4-mini";
const PREFIXO_FLUXO_IA = "✨ IA - ";

const MODOS_PERMITIDOS = new Set<ModoAssistenteFluxos>([
  "criar_fluxo",
  "adicionar_etapa",
  "melhorar_mensagens",
  "analisar_fluxo",
]);

type EmpresaContextoRow = {
  id?: string;
  nome_fantasia?: string | null;
  razao_social?: string | null;
  observacoes?: string | null;
  timezone?: string | null;
  nichos?:
    | {
        codigo?: string | null;
        nome?: string | null;
      }
    | Array<{
        codigo?: string | null;
        nome?: string | null;
      }>
    | null;
};

type VariavelContextoRow = {
  chave?: string | null;
  metadata_json?: {
    descricao?: string | null;
  } | null;
};

type FluxoAssistenteCriado = {
  id: string;
  nome: string;
  descricao?: string | null;
  status: string;
  canal: string;
  fluxo_padrao?: boolean;
  created_at?: string;
  updated_at?: string;
  configuracao_json?: Record<string, unknown> | null;
};

type EstruturaAssistenteFluxos = {
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
};

function texto(valor: unknown, limite = 1200) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limite);
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function normalizarModo(valor: unknown): ModoAssistenteFluxos {
  const modo = texto(valor, 80) as ModoAssistenteFluxos;
  return MODOS_PERMITIDOS.has(modo) ? modo : "criar_fluxo";
}

function normalizarNo(valor: unknown): AssistenteAutomacaoNo | null {
  const item = objeto(valor);
  const id = texto(item.id, 120);
  const tipoNo = texto(item.tipo_no, 80);

  if (!id || !tipoNo) return null;

  return {
    id,
    tipo_no: tipoNo,
    titulo: texto(item.titulo, 160) || "Bloco",
    descricao: texto(item.descricao, 500) || null,
    posicao_x: Math.round(Number(item.posicao_x || 0)),
    posicao_y: Math.round(Number(item.posicao_y || 0)),
    configuracao_json: objeto(item.configuracao_json),
    delay_segundos:
      item.delay_segundos === null || item.delay_segundos === undefined
        ? null
        : Math.max(0, Math.floor(Number(item.delay_segundos || 0))),
  };
}

function normalizarConexao(valor: unknown): AssistenteAutomacaoConexao | null {
  const item = objeto(valor);
  const id = texto(item.id, 120);
  const origem = texto(item.no_origem_id, 120);
  const destino = texto(item.no_destino_id, 120);

  if (!id || !origem || !destino) return null;

  return {
    id,
    no_origem_id: origem,
    no_destino_id: destino,
    rotulo: texto(item.rotulo, 160) || null,
    ordem: Math.max(1, Math.floor(Number(item.ordem || 1))),
    condicao_json: objeto(item.condicao_json),
    usar_ia: item.usar_ia === true,
    descricao_ia: texto(item.descricao_ia, 500) || null,
  };
}

function normalizarFluxoAtual(valor: unknown) {
  const item = objeto(valor);

  return {
    nos: Array.isArray(item.nos)
      ? item.nos.map(normalizarNo).filter(Boolean)
      : [],
    conexoes: Array.isArray(item.conexoes)
      ? item.conexoes.map(normalizarConexao).filter(Boolean)
      : [],
  } as {
    nos: AssistenteAutomacaoNo[];
    conexoes: AssistenteAutomacaoConexao[];
  };
}

function removerPrefixoAssistente(nome: string) {
  return nome
    .replace(/^✨\s*IA\s*-\s*/i, "")
    .replace(/^IA\s*-\s*/i, "")
    .trim();
}

function montarNomeFluxoAssistente(params: {
  modo: ModoAssistenteFluxos;
  plano: PlanoAssistenteFluxos;
  fluxoOrigem?: FluxoAssistenteCriado | null;
}) {
  const nomeOrigem = texto(params.fluxoOrigem?.nome, 100);
  const nomePlano = texto(params.plano.nome_fluxo, 100);

  const base =
    params.modo === "criar_fluxo"
      ? nomePlano || "Fluxo gerado"
      : params.modo === "adicionar_etapa"
        ? `Nova etapa em ${nomeOrigem || nomePlano || "fluxo"}`
        : params.modo === "melhorar_mensagens"
          ? `Melhoria de ${nomeOrigem || nomePlano || "fluxo"}`
          : nomePlano || nomeOrigem || "Fluxo analisado";

  return `${PREFIXO_FLUXO_IA}${removerPrefixoAssistente(base)}`.slice(0, 140);
}

function montarDescricaoFluxoAssistente(params: {
  modo: ModoAssistenteFluxos;
  instrucao: string;
  plano: PlanoAssistenteFluxos;
  fluxoOrigem?: FluxoAssistenteCriado | null;
}) {
  const partes = ["Fluxo criado pelo assistente de IA e salvo como rascunho."];
  const origem = texto(params.fluxoOrigem?.nome, 160);
  const objetivo = texto(params.plano.objetivo, 260);
  const resumo = texto(params.plano.resumo, 320);
  const instrucao = texto(params.instrucao, 700);

  if (origem && params.modo !== "criar_fluxo") {
    partes.push(`Origem: ${origem}.`);
  }

  if (objetivo) partes.push(`Objetivo: ${objetivo}.`);
  if (resumo) partes.push(`Resumo: ${resumo}.`);
  if (instrucao) partes.push(`Pedido: ${instrucao}`);

  return partes.join(" ").slice(0, 1400);
}

function remapearEstruturaParaNovoFluxo(
  estrutura: EstruturaAssistenteFluxos
): EstruturaAssistenteFluxos {
  const ids = new Map<string, string>();

  const nos = estrutura.nos.map((no) => {
    const novoId = randomUUID();
    ids.set(no.id, novoId);

    return {
      ...no,
      id: novoId,
    };
  });

  const conexoes = estrutura.conexoes
    .map((conexao, index) => {
      const origem = ids.get(conexao.no_origem_id);
      const destino = ids.get(conexao.no_destino_id);

      if (!origem || !destino) return null;

      return {
        ...conexao,
        id: randomUUID(),
        no_origem_id: origem,
        no_destino_id: destino,
        ordem: index + 1,
      };
    })
    .filter(Boolean) as AssistenteAutomacaoConexao[];

  return { nos, conexoes };
}

function normalizarDelayPersistencia(
  tipoNo: string,
  valor: number | null | undefined
) {
  if (tipoNo === "inicio" || valor === null || valor === undefined) {
    return null;
  }

  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;

  return Math.max(0, Math.min(82800, Math.floor(numero)));
}

function prepararNosParaSalvar(nos: AssistenteAutomacaoNo[]) {
  return nos.map((no) => {
    const tipoNo = texto(no.tipo_no, 80);

    return {
      id: no.id,
      tipo_no: tipoNo,
      titulo: texto(no.titulo, 160) || "Bloco",
      descricao: texto(no.descricao, 500) || null,
      posicao_x: Math.round(Number(no.posicao_x || 0)),
      posicao_y: Math.round(Number(no.posicao_y || 0)),
      configuracao_json: objeto(no.configuracao_json),
      delay_segundos: normalizarDelayPersistencia(tipoNo, no.delay_segundos),
    };
  });
}

function prepararConexoesParaSalvar(conexoes: AssistenteAutomacaoConexao[]) {
  return conexoes.map((conexao, index) => ({
    id: conexao.id,
    no_origem_id: conexao.no_origem_id,
    no_destino_id: conexao.no_destino_id,
    condicao_json: objeto(conexao.condicao_json),
    rotulo: texto(conexao.rotulo, 160) || null,
    ordem: Math.max(1, Math.floor(Number(conexao.ordem || index + 1))),
    usar_ia: conexao.usar_ia === true,
    descricao_ia: texto(conexao.descricao_ia, 500) || null,
  }));
}

function validarEstruturaPersistivel(estrutura: EstruturaAssistenteFluxos) {
  const idsNos = new Set<string>();
  const idsConexoes = new Set<string>();
  const inicios = estrutura.nos.filter((no) => no.tipo_no === "inicio");

  if (inicios.length !== 1) {
    return "A IA gerou uma estrutura sem exatamente um bloco de inicio.";
  }

  for (const no of estrutura.nos) {
    if (!no.id || !no.tipo_no) {
      return "A IA gerou um bloco sem ID ou tipo valido.";
    }

    if (idsNos.has(no.id)) {
      return "A IA gerou blocos duplicados.";
    }

    idsNos.add(no.id);
  }

  for (const conexao of estrutura.conexoes) {
    if (!conexao.id || !conexao.no_origem_id || !conexao.no_destino_id) {
      return "A IA gerou uma conexao sem IDs validos.";
    }

    if (idsConexoes.has(conexao.id)) {
      return "A IA gerou conexoes duplicadas.";
    }

    if (
      !idsNos.has(conexao.no_origem_id) ||
      !idsNos.has(conexao.no_destino_id)
    ) {
      return "A IA gerou uma conexao apontando para um bloco ausente.";
    }

    idsConexoes.add(conexao.id);
  }

  return null;
}

async function removerFluxoAssistenteComFalha(params: {
  empresaId: string;
  fluxoId: string;
}) {
  await supabaseAdmin
    .from("automacao_conexoes")
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

async function registrarVersaoAssistenteSeguro(params: {
  empresaId: string;
  fluxoId: string;
  usuarioId: string;
  descricao: string;
  nos: unknown;
  conexoes: unknown;
}) {
  try {
    await supabaseAdmin.from("automacao_versoes").insert({
      empresa_id: params.empresaId,
      automacao_id: params.fluxoId,
      origem: "assistente_ia",
      descricao: params.descricao,
      nodes_json: params.nos,
      edges_json: params.conexoes,
      created_by: params.usuarioId,
    });
  } catch (error) {
    console.warn("[assistente-fluxos] nao foi possivel registrar versao", error);
  }
}

async function materializarFluxoAssistente(params: {
  empresaId: string;
  usuarioId: string;
  modo: ModoAssistenteFluxos;
  instrucao: string;
  plano: PlanoAssistenteFluxos;
  estrutura: EstruturaAssistenteFluxos;
  fluxoOrigem?: FluxoAssistenteCriado | null;
}) {
  const erroPersistencia = validarEstruturaPersistivel(params.estrutura);

  if (erroPersistencia) {
    throw new Error(erroPersistencia);
  }

  const estruturaNovoFluxo = remapearEstruturaParaNovoFluxo(params.estrutura);
  const nosParaSalvar = prepararNosParaSalvar(estruturaNovoFluxo.nos);
  const conexoesParaSalvar = prepararConexoesParaSalvar(
    estruturaNovoFluxo.conexoes
  );

  const { data: fluxoCriado, error: fluxoError } = await supabaseAdmin
    .from("automacao_fluxos")
    .insert({
      empresa_id: params.empresaId,
      nome: montarNomeFluxoAssistente({
        modo: params.modo,
        plano: params.plano,
        fluxoOrigem: params.fluxoOrigem,
      }),
      descricao: montarDescricaoFluxoAssistente({
        modo: params.modo,
        instrucao: params.instrucao,
        plano: params.plano,
        fluxoOrigem: params.fluxoOrigem,
      }),
      canal: params.fluxoOrigem?.canal || "whatsapp",
      status: "rascunho",
      criado_por: params.usuarioId,
      atualizado_por: params.usuarioId,
      fluxo_padrao: false,
      configuracao_json: normalizarConfiguracaoFluxo(
        params.fluxoOrigem?.configuracao_json || {}
      ),
    })
    .select(
      "id, nome, descricao, status, canal, created_at, updated_at, fluxo_padrao, configuracao_json"
    )
    .single();

  if (fluxoError || !fluxoCriado) {
    throw new Error(`Erro ao criar fluxo da IA: ${fluxoError?.message}`);
  }

  const atualizadoEm = new Date().toISOString();
  const { error: salvarEstruturaError } = await supabaseAdmin.rpc(
    "salvar_estrutura_automacao_fluxo_atomica",
    {
      p_empresa_id: params.empresaId,
      p_fluxo_id: fluxoCriado.id,
      p_usuario_id: params.usuarioId,
      p_nos: nosParaSalvar,
      p_conexoes: conexoesParaSalvar,
      p_atualizado_em: atualizadoEm,
    }
  );

  if (salvarEstruturaError) {
    await removerFluxoAssistenteComFalha({
      empresaId: params.empresaId,
      fluxoId: fluxoCriado.id,
    });

    throw new Error(
      `Erro ao salvar fluxo gerado pela IA: ${salvarEstruturaError.message}`
    );
  }

  await registrarVersaoAssistenteSeguro({
    empresaId: params.empresaId,
    fluxoId: fluxoCriado.id,
    usuarioId: params.usuarioId,
    descricao: `Versao criada pelo assistente de IA no modo ${params.modo}.`,
    nos: nosParaSalvar,
    conexoes: conexoesParaSalvar,
  });

  return {
    fluxo: fluxoCriado as FluxoAssistenteCriado,
    fluxoGerado: {
      nos: nosParaSalvar,
      conexoes: conexoesParaSalvar,
    },
  };
}

async function buscarFluxo(params: { fluxoId: string; empresaId: string }) {
  if (!params.fluxoId) return null;

  const { data, error } = await supabaseAdmin
    .from("automacao_fluxos")
    .select("id, nome, descricao, status, canal, fluxo_padrao, configuracao_json")
    .eq("id", params.fluxoId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (error) {
    throw new Error(`Erro ao validar fluxo: ${error.message}`);
  }

  return data || null;
}

async function buscarEstruturaFluxo(params: {
  fluxoId: string;
  empresaId: string;
}) {
  const [{ data: nos, error: nosError }, { data: conexoes, error: conexoesError }] =
    await Promise.all([
      supabaseAdmin
        .from("automacao_nos")
        .select(
          "id, tipo_no, titulo, descricao, posicao_x, posicao_y, configuracao_json, delay_segundos"
        )
        .eq("fluxo_id", params.fluxoId)
        .eq("empresa_id", params.empresaId)
        .eq("ativo", true),
      supabaseAdmin
        .from("automacao_conexoes")
        .select(
          "id, no_origem_id, no_destino_id, rotulo, ordem, condicao_json, usar_ia, descricao_ia"
        )
        .eq("fluxo_id", params.fluxoId)
        .eq("empresa_id", params.empresaId)
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
    ]);

  if (nosError) {
    throw new Error(`Erro ao buscar blocos do fluxo: ${nosError.message}`);
  }

  if (conexoesError) {
    throw new Error(
      `Erro ao buscar conexoes do fluxo: ${conexoesError.message}`
    );
  }

  return {
    nos: (nos || []).map(normalizarNo).filter(Boolean) as AssistenteAutomacaoNo[],
    conexoes: (conexoes || [])
      .map(normalizarConexao)
      .filter(Boolean) as AssistenteAutomacaoConexao[],
  };
}

async function buscarContextoEmpresa(empresaId: string) {
  const [{ data: empresa }, { data: setores }, { data: variaveis }] =
    await Promise.all([
      supabaseAdmin
        .from("empresas")
        .select(
          `
            id,
            nome_fantasia,
            razao_social,
            observacoes,
            timezone,
            nichos (
              codigo,
              nome
            )
          `
        )
        .eq("id", empresaId)
        .maybeSingle(),
      supabaseAdmin
        .from("setores")
        .select("id, nome")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("ordem_exibicao", { ascending: true })
        .order("nome", { ascending: true }),
      supabaseAdmin
        .from("automacao_variaveis")
        .select("chave, metadata_json")
        .eq("empresa_id", empresaId)
        .is("execucao_id", null)
        .is("contato_id", null)
        .eq("metadata_json->>tipo", "global_empresa")
        .eq("metadata_json->>ativo", "true")
        .order("chave", { ascending: true })
        .limit(80),
    ]);

  const empresaRow = (empresa || null) as EmpresaContextoRow | null;
  const nicho = Array.isArray(empresaRow?.nichos)
    ? empresaRow?.nichos?.[0]
    : empresaRow?.nichos;

  return {
    empresa: {
      nome:
        texto(empresaRow?.nome_fantasia, 160) ||
        texto(empresaRow?.razao_social, 160) ||
        "Empresa",
      segmento: texto(nicho?.nome || nicho?.codigo, 160) || null,
      descricao: texto(empresaRow?.observacoes, 800) || null,
      timezone: texto(empresaRow?.timezone, 80) || null,
    },
    setores: ((setores || []) as AssistenteSetor[]).map((setor) => ({
      id: setor.id,
      nome: setor.nome,
    })),
    variaveis: ((variaveis || []) as VariavelContextoRow[]).map((variavel) => ({
      chave: texto(variavel.chave, 120),
      descricao: texto(variavel.metadata_json?.descricao, 240) || null,
      origem: "personalizada",
    })) as AssistenteVariavel[],
  };
}

function resumoNoParaIa(no: AssistenteAutomacaoNo) {
  const config = no.configuracao_json || {};

  return {
    ref: no.id,
    tipo_no: no.tipo_no,
    titulo: no.titulo,
    mensagem:
      texto(config.mensagem, 700) ||
      texto(config.mensagem_encontrado, 700) ||
      null,
    opcoes: Array.isArray(config.opcoes)
      ? config.opcoes.slice(0, 10)
      : Array.isArray(config.botoes)
        ? config.botoes.slice(0, 3)
        : [],
    variavel: texto(config.variavel, 120) || null,
    setor_id: texto(config.setor_id, 120) || null,
  };
}

function resumoConexaoParaIa(conexao: AssistenteAutomacaoConexao) {
  return {
    id: conexao.id,
    origem: conexao.no_origem_id,
    destino: conexao.no_destino_id,
    rotulo: conexao.rotulo,
    condicao_json: conexao.condicao_json || {},
    usar_ia: conexao.usar_ia === true,
    descricao_ia: conexao.descricao_ia || null,
  };
}

const planoAssistenteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nome_fluxo: { type: "string" },
    objetivo: { type: "string" },
    resumo: { type: "string" },
    etapas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: { type: "string" },
          tipo: {
            type: "string",
            enum: [
              "inicio",
              "mensagem",
              "pergunta_opcoes",
              "pergunta_botoes",
              "pergunta_livre_ia",
              "capturar_resposta",
              "transferir",
              "encerrar",
              "avaliacao",
            ],
          },
          titulo: { type: ["string", "null"] },
          mensagem: { type: ["string", "null"] },
          variavel: { type: ["string", "null"] },
          tipo_captura: { type: ["string", "null"] },
          setor_id: { type: ["string", "null"] },
          setor_nome: { type: ["string", "null"] },
          resultado: { type: ["string", "null"] },
          opcoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                texto: { type: "string" },
              },
              required: ["id", "texto"],
            },
          },
        },
        required: [
          "ref",
          "tipo",
          "titulo",
          "mensagem",
          "variavel",
          "tipo_captura",
          "setor_id",
          "setor_nome",
          "resultado",
          "opcoes",
        ],
      },
    },
    rotas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          origem: { type: "string" },
          destino: { type: "string" },
          condicao: {
            type: "string",
            enum: [
              "sempre",
              "resposta_igual",
              "resposta_contem",
              "resposta_inicia_com",
              "resposta_regex",
              "ia",
              "timeout_sem_resposta",
            ],
          },
          valor: { type: ["string", "null"] },
          rotulo: { type: ["string", "null"] },
          descricao_ia: { type: ["string", "null"] },
          timeout_segundos: { type: ["number", "null"] },
        },
        required: [
          "origem",
          "destino",
          "condicao",
          "valor",
          "rotulo",
          "descricao_ia",
          "timeout_segundos",
        ],
      },
    },
    mensagens_revisadas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ref: { type: "string" },
          mensagem: { type: "string" },
          motivo: { type: ["string", "null"] },
        },
        required: ["ref", "mensagem", "motivo"],
      },
    },
    variaveis_sugeridas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          chave: { type: "string" },
          descricao: { type: ["string", "null"] },
        },
        required: ["chave", "descricao"],
      },
    },
    avisos: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "nome_fluxo",
    "objetivo",
    "resumo",
    "etapas",
    "rotas",
    "mensagens_revisadas",
    "variaveis_sugeridas",
    "avisos",
  ],
};

function montarPromptSistema(modo: ModoAssistenteFluxos) {
  return `
Voce e um planejador de fluxos de atendimento WhatsApp para um CRM.

Principio central:
- A IA planeja e sugere.
- O codigo do CRM decide o que e tecnicamente permitido.
- Nao gere JSON de banco, ids reais novos, posicoes ou propriedades internas.

Tipos de etapa permitidos:
- inicio: ponto inicial do fluxo.
- mensagem: envia texto ao contato.
- pergunta_opcoes: pergunta com varias opcoes numeradas/textuais.
- pergunta_botoes: ate 3 botoes do WhatsApp.
- pergunta_livre_ia: entende texto livre por intencao.
- capturar_resposta: solicita e salva um dado em uma variavel.
- transferir: encaminha para um setor existente.
- encerrar: finaliza a jornada.
- avaliacao: coleta nota de atendimento.

Regras:
- Use apenas setores recebidos no contexto. Preencha setor_id quando souber.
- Para pergunta_botoes, gere no maximo 3 opcoes.
- Para capturar_resposta, preencha variavel com chave curta em snake_case.
- Para pergunta_livre_ia, crie rotas com condicao "ia" e descricao_ia clara.
- Para rotas de opcoes, use condicao "resposta_contem" e valor igual ao id da opcao.
- Sempre que fizer sentido, inclua uma rota de encerramento ou transferencia.
- Nao inclua midias, templates ou agenda se o contexto nao demonstrar recursos suficientes.
- Se o modo for adicionar_etapa, use refs de blocos existentes quando a nova etapa tiver que sair de um bloco atual.
- Se o modo for melhorar_mensagens, nao crie etapas; preencha mensagens_revisadas usando refs existentes.
- Se o modo for analisar_fluxo, nao crie etapas; use resumo e avisos para apontar problemas.

Modo solicitado: ${modo}.
Retorne somente o JSON no schema solicitado.
  `.trim();
}

async function registrarExecucaoAssistenteSeguro(params: {
  empresaId: string;
  automacaoId?: string | null;
  usuarioId?: string | null;
  modo: ModoAssistenteFluxos;
  instrucao: string;
  contexto: Record<string, unknown>;
  respostaIa: unknown;
  fluxoGerado: unknown;
  status: "concluido" | "erro";
  erro?: string | null;
  aplicada?: boolean;
  aplicadaAt?: string | null;
  tokensEntrada?: number | null;
  tokensSaida?: number | null;
}) {
  try {
    await supabaseAdmin.from("automacao_assistente_ia_execucoes").insert({
      empresa_id: params.empresaId,
      automacao_id: params.automacaoId || null,
      usuario_id: params.usuarioId || null,
      modo: params.modo,
      instrucao: params.instrucao,
      contexto_json: params.contexto,
      resposta_ia_json: params.respostaIa,
      fluxo_gerado_json: params.fluxoGerado,
      status: params.status,
      erro: params.erro || null,
      aplicada: params.aplicada === true,
      aplicada_at: params.aplicadaAt || null,
      tokens_entrada: params.tokensEntrada ?? null,
      tokens_saida: params.tokensSaida ?? null,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[assistente-fluxos] nao foi possivel registrar execucao", error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const modo = normalizarModo(body?.modo);
  const instrucao = texto(body?.instrucao, 4000);
  const fluxoId = texto(body?.fluxo_id || body?.fluxoId, 120);

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY nao configurada." },
        { status: 500 }
      );
    }

    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;

    if (!usuario.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuario sem empresa vinculada." },
        { status: 400 }
      );
    }

    if (
      modo !== "analisar_fluxo" &&
      modo !== "melhorar_mensagens" &&
      !instrucao
    ) {
      return NextResponse.json(
        { ok: false, error: "Descreva o que a IA deve criar ou alterar." },
        { status: 400 }
      );
    }

    const fluxo = await buscarFluxo({
      fluxoId,
      empresaId: usuario.empresa_id,
    });

    if (fluxoId && !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo nao encontrado." },
        { status: 404 }
      );
    }

    if (modo !== "criar_fluxo" && !fluxo) {
      return NextResponse.json(
        {
          ok: false,
          error: "Selecione um fluxo para a IA analisar, melhorar ou clonar.",
        },
        { status: 400 }
      );
    }

    let fluxoAtual = normalizarFluxoAtual(body?.fluxo_atual);

    if (
      fluxoId &&
      fluxoAtual.nos.length === 0 &&
      ["adicionar_etapa", "melhorar_mensagens", "analisar_fluxo"].includes(modo)
    ) {
      fluxoAtual = await buscarEstruturaFluxo({
        fluxoId,
        empresaId: usuario.empresa_id,
      });
    }

    await verificarSaldoTokensIa(usuario.empresa_id);

    const contextoEmpresa = await buscarContextoEmpresa(usuario.empresa_id);
    const contexto = {
      modo,
      instrucao:
        instrucao ||
        (modo === "analisar_fluxo"
          ? "Analise o fluxo atual e encontre problemas tecnicos e oportunidades de melhoria."
          : "Melhore as mensagens do fluxo atual."),
      empresa: contextoEmpresa.empresa,
      recursos: {
        setores: contextoEmpresa.setores,
        variaveis: contextoEmpresa.variaveis,
      },
      fluxo_atual: {
        id: fluxo?.id || null,
        nome: fluxo?.nome || null,
        status: fluxo?.status || null,
        nodes: fluxoAtual.nos.map(resumoNoParaIa),
        edges: fluxoAtual.conexoes.map(resumoConexaoParaIa),
      },
    };

    const resposta = await openai.responses.create({
      model: MODELOS_ASSISTENTE_FLUXOS,
      input: [
        {
          role: "system",
          content: montarPromptSistema(modo),
        },
        {
          role: "user",
          content: JSON.stringify(contexto),
        },
      ],
      max_output_tokens: 4200,
      text: {
        format: {
          type: "json_schema",
          name: "plano_assistente_fluxos",
          strict: true,
          schema: planoAssistenteSchema as Record<string, unknown>,
        },
      },
    });

    const plano = normalizarPlanoAssistente(
      JSON.parse(resposta.output_text || "{}")
    );

    const compilacao = compilarPlanoAssistente({
      modo,
      plano,
      fluxoAtual,
      setores: contextoEmpresa.setores,
      variaveis: contextoEmpresa.variaveis,
    });

    const uso = extrairUsoTokensIa(resposta.usage);

    await registrarUsoTokensIa({
      empresaId: usuario.empresa_id,
      usuarioId: usuario.id,
      origem: "assistente_fluxos",
      modelo: MODELOS_ASSISTENTE_FLUXOS,
      uso,
      metadata: {
        fluxo_id: fluxoId || null,
        modo,
      },
    });

    const propostaId = randomUUID();
    let fluxoGerado = {
      nos: compilacao.nos,
      conexoes: compilacao.conexoes,
    };
    let fluxoCriado: FluxoAssistenteCriado | null = null;
    let aplicadaAt: string | null = null;

    if (modo !== "analisar_fluxo") {
      const materializacao = await materializarFluxoAssistente({
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
        modo,
        instrucao: contexto.instrucao,
        plano,
        estrutura: fluxoGerado,
        fluxoOrigem: fluxo,
      });

      fluxoCriado = materializacao.fluxo;
      fluxoGerado = materializacao.fluxoGerado;
      aplicadaAt = new Date().toISOString();
    }

    await registrarExecucaoAssistenteSeguro({
      empresaId: usuario.empresa_id,
      automacaoId: fluxoCriado?.id || fluxoId || null,
      usuarioId: usuario.id,
      modo,
      instrucao: contexto.instrucao,
      contexto,
      respostaIa: plano,
      fluxoGerado,
      status: "concluido",
      aplicada: Boolean(fluxoCriado),
      aplicadaAt,
      tokensEntrada: uso.inputTokens,
      tokensSaida: uso.outputTokens,
    });

    return NextResponse.json({
      ok: true,
      proposta_id: propostaId,
      modo,
      plano,
      resumo: compilacao.resumo,
      fluxo_gerado: fluxoGerado,
      fluxo_criado: fluxoCriado,
      materializado: Boolean(fluxoCriado),
      validacao: compilacao.validacao,
      estatisticas: compilacao.estatisticas,
      avisos: plano.avisos,
    });
  } catch (error: unknown) {
    if (error instanceof SaldoTokensIaEsgotadoError) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Saldo de tokens de IA esgotado. Adicione saldo ou aumente o limite para usar o assistente.",
        },
        { status: 402 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar proposta do assistente.",
      },
      { status: 500 }
    );
  }
}
