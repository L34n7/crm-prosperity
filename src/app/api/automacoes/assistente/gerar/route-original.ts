import { NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  compilarPlanoAssistente,
  completarRotasDeOpcoesPlano,
  normalizarPlanoAssistente,
  type AssistenteAutomacaoConexao,
  type AssistenteAutomacaoNo,
  type AssistenteMidia,
  type AssistenteSetor,
  type AssistenteVariavel,
  type ModoAssistenteFluxos,
  type PlanoAssistenteFluxos,
} from "@/lib/automacoes/assistente-fluxos";
import {
  aplicarRespostaPerguntaAssistente,
  criarPerguntasAssistenteFluxo,
  errosQueBloqueiamCriacao,
  errosQueExigemReparo,
  proximaPerguntaAssistente,
  type PerguntaAssistenteFluxo,
} from "@/lib/automacoes/assistente-fluxos-conversa";
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
  const [
    { data: empresa },
    { data: setores },
    { data: variaveis },
    { data: midias },
  ] =
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
      supabaseAdmin
        .from("midias")
        .select("id, nome, tipo, url")
        .eq("empresa_id", empresaId)
        .order("created_at", { ascending: false })
        .limit(120),
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
    midias: ((midias || []) as AssistenteMidia[])
      .filter((midia) =>
        ["imagem", "video", "audio", "arquivo"].includes(midia.tipo)
      )
      .map((midia) => ({
        id: midia.id,
        nome: midia.nome,
        tipo: midia.tipo,
        url: midia.url,
      })),
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
              "midia_imagem",
              "midia_video",
              "midia_audio",
              "midia_arquivo",
              "redirect",
              "transferir",
              "encerrar",
              "avaliacao",
            ],
          },
          titulo: { type: ["string", "null"] },
          mensagem: { type: ["string", "null"] },
          variavel: { type: ["string", "null"] },
          tipo_captura: {
            type: ["string", "null"],
            enum: [
              "texto",
              "nome",
              "cpf",
              "cnpj",
              "email",
              "telefone",
              "numero",
              "data",
              "cep",
              "moeda",
              null,
            ],
          },
          setor_id: { type: ["string", "null"] },
          setor_nome: { type: ["string", "null"] },
          resultado: { type: ["string", "null"] },
          midia_id: { type: ["string", "null"] },
          midia_nome: { type: ["string", "null"] },
          midia_tipo: { type: ["string", "null"] },
          midia_url: { type: ["string", "null"] },
          url: { type: ["string", "null"] },
          botao_texto: { type: ["string", "null"] },
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
          "midia_id",
          "midia_nome",
          "midia_tipo",
          "midia_url",
          "url",
          "botao_texto",
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
    clarificacoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          pergunta: { type: "string" },
          tipo: { type: "string", enum: ["selecao", "texto"] },
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
          valor_sugerido: { type: ["string", "null"] },
          motivo: { type: ["string", "null"] },
        },
        required: [
          "id",
          "pergunta",
          "tipo",
          "opcoes",
          "valor_sugerido",
          "motivo",
        ],
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
    "clarificacoes",
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
- midia_imagem, midia_video, midia_audio, midia_arquivo: envia uma midia da biblioteca.
- redirect: envia uma mensagem com botao que abre uma URL.
- transferir: encaminha para um setor existente.
- encerrar: finaliza a jornada.
- avaliacao: coleta nota de atendimento.

Regras:
- Use apenas setores recebidos no contexto. Preencha setor_id quando souber.
- Para pergunta_botoes, gere no maximo 3 opcoes. Cada titulo deve ter no maximo 20 caracteres na contagem JavaScript; prefira texto sem emoji quando o emoji fizer ultrapassar esse limite.
- Para capturar_resposta, use somente uma variavel personalizada em snake_case. Nunca use variaveis fixas do contato como nome, email, telefone, numero, origem ou status_lead. Para capturar o nome, use a chave nome_cliente e tipo_captura nome.
- Tipos de captura permitidos: texto, nome, cpf, cnpj, email, telefone, numero, data, cep ou moeda. Nunca use "livre"; para texto livre use "texto".
- Toda variavel capturada deve ser utilizada em uma etapa posterior, com a sintaxe {{chave}}. Se o pedido nao precisar reutilizar a resposta, nao crie o bloco de captura.
- Para etapas de midia, indique apenas o tipo adequado. Nunca escolha midia_id por conta propria nem associe uma midia somente pelo tipo do arquivo; a midia real sera confirmada explicitamente pelo usuario depois.
- Para redirect, sugira mensagem e botao_texto com ate 20 caracteres. Extraia a URL do pedido quando existir; ela sera confirmada pelo usuario.
- Para pergunta_livre_ia, crie rotas com condicao "ia" e descricao_ia clara.
- Para rotas de opcoes, use condicao "resposta_contem" e valor igual ao id da opcao.
- Toda opcao de pergunta_opcoes ou pergunta_botoes deve possuir exatamente uma rota.
- Antes de finalizar, confira a contagem: cada opcao/botao deve aparecer uma unica vez em rotas, sem excecao.
- Duas opcoes da mesma pergunta nunca devem apontar para o mesmo destino. Crie uma etapa/ref propria para cada ramo e replique as etapas seguintes necessarias para manter os caminhos separados.
- Nunca crie rota "sempre" saindo de pergunta_opcoes ou pergunta_botoes.
- Conecte todas as etapas. Nenhuma etapa pode ficar orfa ou sem caminho a partir de inicio.
- O inicio deve apontar para a primeira etapa real solicitada pelo usuario.
- Sempre que fizer sentido, inclua uma rota de encerramento ou transferencia.
- Inclua a etapa transferir quando ela for solicitada. Use apenas um setor_id recebido no contexto como sugestao; a interface exigira a escolha do usuario antes de criar.
- Frases como "o corretor vai assumir", "encaminhar para especialista" ou "falar com atendente" implicam uma etapa transferir depois da mensagem de handoff.
- Inclua a etapa de midia quando o usuario pedir, mesmo sem item compativel. A interface oferecera a escolha, mas o usuario pode criar o rascunho sem midia; nesse caso o CRM impedira a ativacao ate a selecao posterior.
- Nao inclua templates ou agenda se o contexto nao demonstrar recursos suficientes.
- Em criar_fluxo, use clarificacoes somente quando uma informacao ausente ou ambigua mudar materialmente os caminhos, as perguntas ou o destino final. Gere no maximo 3 perguntas curtas, com 2 ou 3 opcoes sugeridas quando possivel.
- Nao pergunte novamente algo que esteja explicito no pedido. Setor, midia e URL sao confirmados pela interface e nao devem entrar em clarificacoes.
- Toda etapa transferir deve usar setor_id de um setor recebido no contexto quando existir; a interface continuara exigindo a confirmacao do usuario antes de criar.
- Se o modo for adicionar_etapa, use refs de blocos existentes quando a nova etapa tiver que sair de um bloco atual.
- Se o modo for melhorar_mensagens, nao crie etapas; preencha mensagens_revisadas usando refs existentes.
- Se o modo for analisar_fluxo, nao crie etapas; use resumo e avisos para apontar problemas.

Modo solicitado: ${modo}.
Retorne somente o JSON no schema solicitado.
  `.trim();
}

async function solicitarPlanoAssistente(params: {
  modo: ModoAssistenteFluxos;
  contexto: Record<string, unknown>;
  instrucaoAdicional?: string;
}) {
  const resposta = await openai.responses.create({
    model: MODELOS_ASSISTENTE_FLUXOS,
    input: [
      {
        role: "system",
        content: [
          montarPromptSistema(params.modo),
          params.instrucaoAdicional || "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      {
        role: "user",
        content: JSON.stringify(params.contexto),
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

  return {
    plano: normalizarPlanoAssistente(
      JSON.parse(resposta.output_text || "{}")
    ),
    uso: extrairUsoTokensIa(resposta.usage),
  };
}

async function repararPlanoAssistenteSeNecessario(params: {
  plano: PlanoAssistenteFluxos;
  contexto: Record<string, unknown>;
  empresaId: string;
  usuarioId: string;
  setores: AssistenteSetor[];
  variaveis: AssistenteVariavel[];
  midias: AssistenteMidia[];
  etapaUso: string;
}) {
  const compilar = (plano: PlanoAssistenteFluxos) =>
    compilarPlanoAssistente({
      modo: "criar_fluxo",
      plano,
      fluxoAtual: null,
      setores: params.setores,
      variaveis: params.variaveis,
      midias: params.midias,
    });
  let plano = params.plano;
  let compilacao = compilar(plano);
  const errosIniciais = errosQueExigemReparo(compilacao.validacao.erros);

  if (errosIniciais.length === 0) {
    return { plano, compilacao, reparado: false };
  }

  await verificarSaldoTokensIa(params.empresaId);

  const reparo = await solicitarPlanoAssistente({
    modo: "criar_fluxo",
    contexto: {
      contexto_original: params.contexto,
      plano_invalido: plano,
      erros_validacao: errosIniciais.map((erro) => ({
        codigo: erro.codigo,
        mensagem: erro.mensagem,
      })),
    },
    instrucaoAdicional: `
Voce esta reparando um plano que falhou na validacao tecnica.
- Corrija somente o necessario para resolver todos os erros informados.
- Preserve textos, intencao, opcoes e caminhos corretos do pedido original.
- Garanta exatamente uma rota para cada opcao e conecte todas as etapas a partir do inicio.
- Nunca deixe duas opcoes da mesma pergunta apontarem para o mesmo bloco; se necessario, duplique o destino e as etapas seguintes do ramo.
- Para erros de captura, use variavel personalizada (por exemplo nome_cliente), tipo_captura valido e reutilize {{variavel}} em uma mensagem posterior.
- Nao gere novas clarificacoes durante o reparo; retorne clarificacoes como array vazio.
    `.trim(),
  });

  await registrarUsoTokensIa({
    empresaId: params.empresaId,
    usuarioId: params.usuarioId,
    origem: "assistente_fluxos",
    modelo: MODELOS_ASSISTENTE_FLUXOS,
    uso: reparo.uso,
    metadata: {
      modo: "criar_fluxo",
      etapa: params.etapaUso,
      reparo_automatico: true,
    },
  });

  plano = completarRotasDeOpcoesPlano(reparo.plano);
  compilacao = compilar(plano);
  const errosRestantes = errosQueExigemReparo(compilacao.validacao.erros);

  if (errosRestantes.length > 0) {
    const detalhes = errosRestantes
      .slice(0, 6)
      .map((erro) => erro.mensagem)
      .join(" ");
    throw new Error(
      `A IA nao conseguiu corrigir completamente o rascunho. ${detalhes}`
    );
  }

  return { plano, compilacao, reparado: true };
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

type EstadoConversaAssistente = {
  versao: 1;
  instrucao: string;
  perguntas: PerguntaAssistenteFluxo[];
  perguntas_respondidas: string[];
  respostas: Array<{
    pergunta_id: string;
    pergunta: string;
    resposta: string;
    respondida_em: string;
  }>;
};

type SessaoAssistenteRow = {
  id: string;
  empresa_id: string;
  usuario_id: string | null;
  instrucao: string;
  contexto_json: unknown;
  resposta_ia_json: unknown;
  status: string;
};

function normalizarEstadoConversa(valor: unknown): EstadoConversaAssistente {
  const item = objeto(valor);

  return {
    versao: 1,
    instrucao: texto(item.instrucao, 4000),
    perguntas: Array.isArray(item.perguntas)
      ? (item.perguntas as PerguntaAssistenteFluxo[])
      : [],
    perguntas_respondidas: Array.isArray(item.perguntas_respondidas)
      ? item.perguntas_respondidas.map((id) => texto(id, 240)).filter(Boolean)
      : [],
    respostas: Array.isArray(item.respostas)
      ? (item.respostas as EstadoConversaAssistente["respostas"])
      : [],
  };
}

async function criarSessaoAssistente(params: {
  empresaId: string;
  usuarioId: string;
  instrucao: string;
  contexto: Record<string, unknown>;
  plano: PlanoAssistenteFluxos;
  perguntas: PerguntaAssistenteFluxo[];
  tokensEntrada: number | null;
  tokensSaida: number | null;
}) {
  const estado: EstadoConversaAssistente = {
    versao: 1,
    instrucao: params.instrucao,
    perguntas: params.perguntas,
    perguntas_respondidas: [],
    respostas: [],
  };
  const { data, error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .insert({
      empresa_id: params.empresaId,
      automacao_id: null,
      usuario_id: params.usuarioId,
      modo: "criar_fluxo",
      instrucao: params.instrucao,
      contexto_json: {
        ...params.contexto,
        conversa: estado,
      },
      resposta_ia_json: params.plano,
      fluxo_gerado_json: null,
      status: "processando",
      aplicada: false,
      tokens_entrada: params.tokensEntrada,
      tokens_saida: params.tokensSaida,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Nao foi possivel iniciar o assistente: ${error?.message}`);
  }

  return { id: String(data.id), estado };
}

async function buscarSessaoAssistente(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .select(
      "id, empresa_id, usuario_id, instrucao, contexto_json, resposta_ia_json, status"
    )
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Sessao do assistente nao encontrada.");
  }

  if (data.status !== "processando") {
    throw new Error("Esta sessao do assistente ja foi concluida.");
  }

  const contexto = objeto(data.contexto_json);

  return {
    sessao: data as SessaoAssistenteRow,
    contexto,
    estado: normalizarEstadoConversa(contexto.conversa),
    plano: normalizarPlanoAssistente(data.resposta_ia_json),
  };
}

async function replanejarComClarificacoes(params: {
  contextoOriginal: Record<string, unknown>;
  estado: EstadoConversaAssistente;
  planoAtual: PlanoAssistenteFluxos;
  empresaId: string;
  usuarioId: string;
  setores: AssistenteSetor[];
  variaveis: AssistenteVariavel[];
  midias: AssistenteMidia[];
}) {
  await verificarSaldoTokensIa(params.empresaId);

  const respostas = params.estado.respostas
    .filter((resposta) => resposta.pergunta_id.startsWith("clarificacao:"))
    .map((resposta) => ({
      pergunta: resposta.pergunta,
      resposta: resposta.resposta,
    }));
  const geracao = await solicitarPlanoAssistente({
    modo: "criar_fluxo",
    contexto: {
      contexto_original: params.contextoOriginal,
      plano_provisorio: params.planoAtual,
      respostas_de_esclarecimento: respostas,
    },
    instrucaoAdicional: `
As duvidas do plano provisorio ja foram respondidas pelo usuario.
- Trate as respostas como decisoes definitivas.
- Recrie o plano completo incorporando cada resposta.
- Nao faca novas perguntas e retorne clarificacoes como array vazio.
- Preserve todos os textos e requisitos explicitos do pedido original que nao foram alterados pelas respostas.
    `.trim(),
  });

  await registrarUsoTokensIa({
    empresaId: params.empresaId,
    usuarioId: params.usuarioId,
    origem: "assistente_fluxos",
    modelo: MODELOS_ASSISTENTE_FLUXOS,
    uso: geracao.uso,
    metadata: {
      modo: "criar_fluxo",
      etapa: "replanejar_apos_clarificacoes",
      total_clarificacoes: respostas.length,
    },
  });

  const reparo = await repararPlanoAssistenteSeNecessario({
    plano: {
      ...geracao.plano,
      clarificacoes: [],
    },
    contexto: {
      contexto_original: params.contextoOriginal,
      respostas_de_esclarecimento: respostas,
    },
    empresaId: params.empresaId,
    usuarioId: params.usuarioId,
    setores: params.setores,
    variaveis: params.variaveis,
    midias: params.midias,
    etapaUso: "reparar_apos_clarificacoes",
  });

  return reparo.plano;
}

function respostaConversaAssistente(params: {
  sessaoId: string;
  plano: PlanoAssistenteFluxos;
  estado: EstadoConversaAssistente;
  mensagem?: string;
}) {
  const pergunta = proximaPerguntaAssistente({
    perguntas: params.estado.perguntas,
    respondidas: params.estado.perguntas_respondidas,
  });
  const respondidas = params.estado.perguntas_respondidas.length;
  const total = params.estado.perguntas.length;

  return NextResponse.json({
    ok: true,
    proposta_id: params.sessaoId,
    sessao_id: params.sessaoId,
    modo: "criar_fluxo",
    fase: pergunta ? "coletando" : "pronto",
    mensagem:
      params.mensagem ||
      (pergunta
        ? "Preparei o rascunho. Agora preciso confirmar alguns detalhes."
        : "Todas as informacoes foram confirmadas. Revise o plano antes de criar."),
    pergunta,
    progresso: {
      respondidas,
      total,
    },
    historico: params.estado.respostas.map((resposta) => ({
      pergunta:
        resposta.pergunta ||
        params.estado.perguntas.find(
          (perguntaItem) => perguntaItem.id === resposta.pergunta_id
        )?.mensagem ||
        resposta.pergunta_id,
      resposta: resposta.resposta,
    })),
    plano: params.plano,
  });
}

async function responderConversaAssistente(params: {
  sessaoId: string;
  perguntaId: string;
  resposta: unknown;
  empresaId: string;
  usuarioId: string;
}) {
  const [sessaoAtual, contextoEmpresa] = await Promise.all([
    buscarSessaoAssistente(params),
    buscarContextoEmpresa(params.empresaId),
  ]);
  const perguntaAtual = proximaPerguntaAssistente({
    perguntas: sessaoAtual.estado.perguntas,
    respondidas: sessaoAtual.estado.perguntas_respondidas,
  });

  if (!perguntaAtual || perguntaAtual.id !== params.perguntaId) {
    throw new Error("Responda a pergunta atual antes de continuar.");
  }

  if (perguntaAtual.bloqueada) {
    throw new Error(perguntaAtual.ajuda || "Esta pergunta ainda nao pode ser respondida.");
  }

  if (perguntaAtual.campo === "clarificacao") {
    const respostaInformada = texto(params.resposta, 1000);

    if (!respostaInformada) {
      throw new Error("Esta resposta e obrigatoria.");
    }

    const opcao =
      perguntaAtual.tipo === "selecao"
        ? perguntaAtual.opcoes.find((item) => item.id === respostaInformada)
        : null;

    if (perguntaAtual.tipo === "selecao" && !opcao) {
      throw new Error("Selecione uma das respostas sugeridas.");
    }

    const resumoResposta = opcao?.label || respostaInformada;
    let estado: EstadoConversaAssistente = {
      ...sessaoAtual.estado,
      perguntas_respondidas: [
        ...sessaoAtual.estado.perguntas_respondidas,
        perguntaAtual.id,
      ],
      respostas: [
        ...sessaoAtual.estado.respostas,
        {
          pergunta_id: perguntaAtual.id,
          pergunta: perguntaAtual.mensagem,
          resposta: resumoResposta,
          respondida_em: new Date().toISOString(),
        },
      ],
    };
    let plano = sessaoAtual.plano;
    const proximaClarificacao = proximaPerguntaAssistente({
      perguntas: estado.perguntas,
      respondidas: estado.perguntas_respondidas,
    });

    if (!proximaClarificacao) {
      const { conversa: _conversa, ...contextoOriginal } =
        sessaoAtual.contexto;
      void _conversa;
      plano = await replanejarComClarificacoes({
        contextoOriginal,
        estado,
        planoAtual: sessaoAtual.plano,
        empresaId: params.empresaId,
        usuarioId: params.usuarioId,
        setores: contextoEmpresa.setores,
        variaveis: contextoEmpresa.variaveis,
        midias: contextoEmpresa.midias,
      });
      estado = {
        ...estado,
        perguntas: criarPerguntasAssistenteFluxo({
          plano,
          setores: contextoEmpresa.setores,
          midias: contextoEmpresa.midias,
        }),
        perguntas_respondidas: [],
      };
    }

    const { error } = await supabaseAdmin
      .from("automacao_assistente_ia_execucoes")
      .update({
        contexto_json: {
          ...sessaoAtual.contexto,
          conversa: estado,
        },
        resposta_ia_json: plano,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.sessaoId)
      .eq("empresa_id", params.empresaId)
      .eq("usuario_id", params.usuarioId)
      .eq("status", "processando");

    if (error) {
      throw new Error(`Nao foi possivel salvar a resposta: ${error.message}`);
    }

    return respostaConversaAssistente({
      sessaoId: params.sessaoId,
      plano,
      estado,
      mensagem: proximaClarificacao
        ? `Entendido: ${resumoResposta}.`
        : "Obrigado. Atualizei o rascunho com as suas respostas.",
    });
  }

  const aplicada = aplicarRespostaPerguntaAssistente({
    plano: sessaoAtual.plano,
    pergunta: perguntaAtual,
    resposta: params.resposta,
    setores: contextoEmpresa.setores,
    midias: contextoEmpresa.midias,
  });
  const estado: EstadoConversaAssistente = {
    ...sessaoAtual.estado,
    perguntas_respondidas: [
      ...sessaoAtual.estado.perguntas_respondidas,
      perguntaAtual.id,
    ],
    respostas: [
      ...sessaoAtual.estado.respostas,
      {
        pergunta_id: perguntaAtual.id,
        pergunta: perguntaAtual.mensagem,
        resposta: aplicada.resumoResposta,
        respondida_em: new Date().toISOString(),
      },
    ],
  };
  const { error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: {
        ...sessaoAtual.contexto,
        conversa: estado,
      },
      resposta_ia_json: aplicada.plano,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando");

  if (error) {
    throw new Error(`Nao foi possivel salvar a resposta: ${error.message}`);
  }

  return respostaConversaAssistente({
    sessaoId: params.sessaoId,
    plano: aplicada.plano,
    estado,
    mensagem: `Entendido: ${aplicada.resumoResposta}.`,
  });
}

async function atualizarConversaAssistente(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const [sessaoAtual, contextoEmpresa] = await Promise.all([
    buscarSessaoAssistente(params),
    buscarContextoEmpresa(params.empresaId),
  ]);
  const perguntas = criarPerguntasAssistenteFluxo({
    plano: sessaoAtual.plano,
    setores: contextoEmpresa.setores,
    midias: contextoEmpresa.midias,
  });
  const idsAtuais = new Set(perguntas.map((pergunta) => pergunta.id));
  const estado: EstadoConversaAssistente = {
    ...sessaoAtual.estado,
    perguntas,
    perguntas_respondidas: sessaoAtual.estado.perguntas_respondidas.filter(
      (id) => idsAtuais.has(id)
    ),
  };
  const { error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: {
        ...sessaoAtual.contexto,
        conversa: estado,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando");

  if (error) {
    throw new Error(`Nao foi possivel atualizar as opcoes: ${error.message}`);
  }

  return respostaConversaAssistente({
    sessaoId: params.sessaoId,
    plano: sessaoAtual.plano,
    estado,
    mensagem: "Atualizei as opcoes com os dados atuais da empresa.",
  });
}

async function concluirConversaAssistente(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const [sessaoAtual, contextoEmpresa] = await Promise.all([
    buscarSessaoAssistente(params),
    buscarContextoEmpresa(params.empresaId),
  ]);
  const pendente = proximaPerguntaAssistente({
    perguntas: sessaoAtual.estado.perguntas,
    respondidas: sessaoAtual.estado.perguntas_respondidas,
  });

  if (pendente) {
    throw new Error("Responda todas as perguntas do assistente antes de criar o fluxo.");
  }

  const compilacao = compilarPlanoAssistente({
    modo: "criar_fluxo",
    plano: sessaoAtual.plano,
    fluxoAtual: null,
    setores: contextoEmpresa.setores,
    variaveis: contextoEmpresa.variaveis,
    midias: contextoEmpresa.midias,
  });

  const errosBloqueantes = errosQueBloqueiamCriacao(
    compilacao.validacao.erros
  );
  const pendenciasAtivacao = compilacao.validacao.erros.filter(
    (erro) => !errosBloqueantes.includes(erro)
  );

  if (errosBloqueantes.length > 0) {
    const detalhes = errosBloqueantes
      .slice(0, 6)
      .map((item) => item.mensagem)
      .join(" ");
    throw new Error(
      `O rascunho ainda possui informacoes invalidas e nao foi criado. ${detalhes}`
    );
  }

  const materializacao = await materializarFluxoAssistente({
    empresaId: params.empresaId,
    usuarioId: params.usuarioId,
    modo: "criar_fluxo",
    instrucao: sessaoAtual.estado.instrucao || sessaoAtual.sessao.instrucao,
    plano: sessaoAtual.plano,
    estrutura: {
      nos: compilacao.nos,
      conexoes: compilacao.conexoes,
    },
  });
  const aplicadaAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("automacao_assistente_ia_execucoes")
    .update({
      automacao_id: materializacao.fluxo.id,
      fluxo_gerado_json: materializacao.fluxoGerado,
      status: "concluido",
      aplicada: true,
      aplicada_at: aplicadaAt,
      updated_at: aplicadaAt,
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando");

  if (error) {
    console.warn("[assistente-fluxos] fluxo criado, mas sessao nao atualizada", error);
  }

  return NextResponse.json({
    ok: true,
    proposta_id: params.sessaoId,
    sessao_id: params.sessaoId,
    fase: "concluido",
    modo: "criar_fluxo",
    plano: sessaoAtual.plano,
    resumo: compilacao.resumo,
    fluxo_gerado: materializacao.fluxoGerado,
    fluxo_criado: materializacao.fluxo,
    materializado: true,
    validacao: {
      valido: true,
      erros: [],
      avisos: [...compilacao.validacao.avisos, ...pendenciasAtivacao],
    },
    estatisticas: compilacao.estatisticas,
    avisos: [
      ...sessaoAtual.plano.avisos,
      ...(pendenciasAtivacao.length > 0
        ? [
            "O rascunho foi criado sem uma midia selecionada. Escolha a midia no bloco antes de ativar o fluxo.",
          ]
        : []),
    ],
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const modo = normalizarModo(body?.modo);
  const acao = texto(body?.acao, 40) || "gerar";
  const instrucao = texto(body?.instrucao, 4000);
  const fluxoId = texto(body?.fluxo_id || body?.fluxoId, 120);
  const sessaoId = texto(body?.sessao_id || body?.sessaoId, 120);

  try {
    if (
      !process.env.OPENAI_API_KEY &&
      !["retomar", "responder", "atualizar", "criar"].includes(acao)
    ) {
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

    if (modo === "criar_fluxo" && acao === "responder") {
      if (!sessaoId) {
        return NextResponse.json(
          { ok: false, error: "Sessao do assistente nao informada." },
          { status: 400 }
        );
      }

      return responderConversaAssistente({
        sessaoId,
        perguntaId: texto(body?.pergunta_id, 240),
        resposta: body?.resposta,
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      });
    }

    if (modo === "criar_fluxo" && acao === "retomar") {
      if (!sessaoId) {
        return NextResponse.json(
          { ok: false, error: "Sessao do assistente nao informada." },
          { status: 400 }
        );
      }

      return atualizarConversaAssistente({
        sessaoId,
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      });
    }

    if (modo === "criar_fluxo" && acao === "atualizar") {
      if (!sessaoId) {
        return NextResponse.json(
          { ok: false, error: "Sessao do assistente nao informada." },
          { status: 400 }
        );
      }

      return atualizarConversaAssistente({
        sessaoId,
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      });
    }

    if (modo === "criar_fluxo" && acao === "criar") {
      if (!sessaoId) {
        return NextResponse.json(
          { ok: false, error: "Sessao do assistente nao informada." },
          { status: 400 }
        );
      }

      return concluirConversaAssistente({
        sessaoId,
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
      });
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
        midias_disponiveis: contextoEmpresa.midias.reduce(
          (total, midia) => ({
            ...total,
            [midia.tipo]: (total[midia.tipo] || 0) + 1,
          }),
          { imagem: 0, video: 0, audio: 0, arquivo: 0 } as Record<
            AssistenteMidia["tipo"],
            number
          >
        ),
      },
      fluxo_atual: {
        id: fluxo?.id || null,
        nome: fluxo?.nome || null,
        status: fluxo?.status || null,
        nodes: fluxoAtual.nos.map(resumoNoParaIa),
        edges: fluxoAtual.conexoes.map(resumoConexaoParaIa),
      },
    };

    const geracao = await solicitarPlanoAssistente({
      modo,
      contexto,
    });
    let plano = geracao.plano;
    const uso = geracao.uso;

    if (modo === "criar_fluxo" && acao === "preparar") {
      await registrarUsoTokensIa({
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
        origem: "assistente_fluxos",
        modelo: MODELOS_ASSISTENTE_FLUXOS,
        uso,
        metadata: {
          fluxo_id: null,
          modo,
          etapa: "preparar_conversa",
        },
      });

      if (plano.clarificacoes.length === 0) {
        const reparo = await repararPlanoAssistenteSeNecessario({
          plano,
          contexto,
          empresaId: usuario.empresa_id,
          usuarioId: usuario.id,
          setores: contextoEmpresa.setores,
          variaveis: contextoEmpresa.variaveis,
          midias: contextoEmpresa.midias,
          etapaUso: "reparar_rascunho_inicial",
        });
        plano = reparo.plano;
      }

      const perguntas = criarPerguntasAssistenteFluxo({
        plano,
        setores: contextoEmpresa.setores,
        midias: contextoEmpresa.midias,
      });
      const sessao = await criarSessaoAssistente({
        empresaId: usuario.empresa_id,
        usuarioId: usuario.id,
        instrucao: contexto.instrucao,
        contexto,
        plano,
        perguntas,
        tokensEntrada: uso.inputTokens,
        tokensSaida: uso.outputTokens,
      });

      return respostaConversaAssistente({
        sessaoId: sessao.id,
        plano,
        estado: sessao.estado,
      });
    }

    const compilacao = compilarPlanoAssistente({
      modo,
      plano,
      fluxoAtual,
      setores: contextoEmpresa.setores,
      variaveis: contextoEmpresa.variaveis,
      midias: contextoEmpresa.midias,
    });

    if (modo !== "analisar_fluxo" && !compilacao.validacao.valido) {
      const detalhes = compilacao.validacao.erros
        .slice(0, 6)
        .map((item) => item.mensagem)
        .join(" ");

      throw new Error(
        `A IA gerou um fluxo incompleto e ele nao foi criado. ${detalhes}`
      );
    }
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
