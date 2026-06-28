import { randomBytes, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarConfiguracaoFluxo } from "@/lib/automacoes/normalizar-configuracao-fluxo";

const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type JsonObject = Record<string, unknown>;

type FluxoSnapshot = {
  nome: string;
  descricao: string | null;
  canal: string;
  configuracao_json: JsonObject;
};

type NoSnapshot = {
  id: string;
  tipo_no: string;
  titulo: string;
  descricao: string | null;
  posicao_x: number;
  posicao_y: number;
  configuracao_json: JsonObject;
  delay_segundos: number | null;
};

type ConexaoSnapshot = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  condicao_json: JsonObject;
  rotulo: string | null;
  ordem: number;
  usar_ia: boolean;
  descricao_ia: string | null;
};

type GatilhoSnapshot = {
  tipo_gatilho: string;
  valor: string | null;
  condicao: string | null;
  ativo: boolean;
};

export type SnapshotCompartilhamentoFluxo = {
  versao: 1;
  fluxo: FluxoSnapshot;
  nos: NoSnapshot[];
  conexoes: ConexaoSnapshot[];
  gatilhos: GatilhoSnapshot[];
  gerado_em: string;
};

type SupabaseLike = SupabaseClient;

const CHAVES_MIDIA_RESTRITA = new Set([
  "midia_url",
  "midia_nome",
  "midia_id",
  "media_url",
  "media_nome",
  "media_id",
  "mime_type",
  "mimeType",
  "arquivo_url",
  "arquivo_nome",
  "arquivo_id",
  "storage_path",
  "storagePath",
]);

function ehObjetoJson(valor: unknown): valor is JsonObject {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function removerReferenciasMidia(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(removerReferenciasMidia);
  }

  if (!ehObjetoJson(valor)) {
    return valor;
  }

  return Object.entries(valor).reduce<JsonObject>((config, [chave, item]) => {
    if (CHAVES_MIDIA_RESTRITA.has(chave)) {
      return config;
    }

    config[chave] = removerReferenciasMidia(item);
    return config;
  }, {});
}

function sanitizarConfiguracaoCompartilhada(configuracao: unknown): JsonObject {
  const configuracaoLimpa = removerReferenciasMidia(configuracao);

  return ehObjetoJson(configuracaoLimpa) ? configuracaoLimpa : {};
}

function sanitizarConfiguracaoFluxoCompartilhada(configuracao: unknown): JsonObject {
  const configuracaoLimpa = sanitizarConfiguracaoCompartilhada(configuracao);
  const configuracaoNormalizada = normalizarConfiguracaoFluxo(configuracaoLimpa);

  return ehObjetoJson(configuracaoNormalizada) ? configuracaoNormalizada : {};
}

export function normalizarCodigoCompartilhamento(codigo: unknown) {
  return String(codigo || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatarCodigoCompartilhamento(codigo: string) {
  const normalizado = normalizarCodigoCompartilhamento(codigo);

  if (!normalizado.startsWith("FLX")) {
    return normalizado;
  }

  const corpo = normalizado.slice(3);
  const grupos = corpo.match(/.{1,4}/g) || [];

  return ["FLX", ...grupos].join("-");
}

export function gerarCodigoCompartilhamentoFluxo() {
  const bytes = randomBytes(12);
  let corpo = "";

  for (let index = 0; index < bytes.length; index += 1) {
    corpo += ALFABETO_CODIGO[bytes[index] % ALFABETO_CODIGO.length];
  }

  return `FLX${corpo}`;
}

export async function montarSnapshotCompartilhamentoFluxo(params: {
  supabase: SupabaseLike;
  empresaId: string;
  fluxoId: string;
}) {
  const { supabase, empresaId, fluxoId } = params;

  const { data: fluxo, error: fluxoError } = await supabase
    .from("automacao_fluxos")
    .select("id, nome, descricao, canal, configuracao_json")
    .eq("id", fluxoId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (fluxoError) {
    throw new Error(`Erro ao buscar fluxo: ${fluxoError.message}`);
  }

  if (!fluxo) {
    throw new Error("Fluxo nao encontrado.");
  }

  const [
    { data: nos, error: nosError },
    { data: conexoes, error: conexoesError },
    { data: gatilhos, error: gatilhosError },
  ] = await Promise.all([
    supabase
      .from("automacao_nos")
      .select(
        "id, tipo_no, titulo, descricao, posicao_x, posicao_y, configuracao_json, delay_segundos"
      )
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("automacao_conexoes")
      .select(
        "id, no_origem_id, no_destino_id, condicao_json, rotulo, ordem, usar_ia, descricao_ia"
      )
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    supabase
      .from("automacao_gatilhos")
      .select("tipo_gatilho, valor, condicao, ativo")
      .eq("fluxo_id", fluxoId)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: true }),
  ]);

  if (nosError) {
    throw new Error(`Erro ao buscar blocos: ${nosError.message}`);
  }

  if (conexoesError) {
    throw new Error(`Erro ao buscar conexoes: ${conexoesError.message}`);
  }

  if (gatilhosError) {
    throw new Error(`Erro ao buscar gatilhos: ${gatilhosError.message}`);
  }

  const snapshot: SnapshotCompartilhamentoFluxo = {
    versao: 1,
    fluxo: {
      nome: String(fluxo.nome || "Fluxo importado"),
      descricao: fluxo.descricao || null,
      canal: String(fluxo.canal || "whatsapp"),
      configuracao_json: sanitizarConfiguracaoFluxoCompartilhada(
        fluxo.configuracao_json
      ),
    },
    nos: (nos || []).map((no) => ({
      id: String(no.id),
      tipo_no: String(no.tipo_no || "enviar_texto"),
      titulo: String(no.titulo || "Bloco"),
      descricao: no.descricao || null,
      posicao_x: Math.round(Number(no.posicao_x || 0)),
      posicao_y: Math.round(Number(no.posicao_y || 0)),
      configuracao_json:
        sanitizarConfiguracaoCompartilhada(no.configuracao_json),
      delay_segundos:
        no.delay_segundos == null ? null : Math.max(0, Number(no.delay_segundos)),
    })),
    conexoes: (conexoes || []).map((conexao, index: number) => ({
      id: String(conexao.id),
      no_origem_id: String(conexao.no_origem_id || ""),
      no_destino_id: String(conexao.no_destino_id || ""),
      condicao_json:
        conexao.condicao_json && typeof conexao.condicao_json === "object"
          ? conexao.condicao_json
          : {},
      rotulo: conexao.rotulo || null,
      ordem: Number(conexao.ordem || index + 1),
      usar_ia: conexao.usar_ia === true,
      descricao_ia: conexao.descricao_ia || null,
    })),
    gatilhos: (gatilhos || []).map((gatilho) => ({
      tipo_gatilho: String(gatilho.tipo_gatilho || "palavra_chave"),
      valor: gatilho.valor ? String(gatilho.valor) : null,
      condicao: gatilho.condicao ? String(gatilho.condicao) : null,
      ativo: gatilho.ativo !== false,
    })),
    gerado_em: new Date().toISOString(),
  };

  return snapshot;
}

function validarSnapshot(
  snapshot: unknown
): asserts snapshot is SnapshotCompartilhamentoFluxo {
  const candidato = snapshot as Partial<SnapshotCompartilhamentoFluxo> | null;

  if (!candidato || candidato.versao !== 1 || !candidato.fluxo) {
    throw new Error("Codigo de fluxo invalido.");
  }

  if (!Array.isArray(candidato.nos) || !Array.isArray(candidato.conexoes)) {
    throw new Error("Codigo de fluxo incompleto.");
  }
}

export async function criarCopiaFluxoCompartilhado(params: {
  supabase: SupabaseLike;
  snapshot: SnapshotCompartilhamentoFluxo;
  empresaDestinoId: string;
  usuarioId: string;
}) {
  const { supabase, snapshot, empresaDestinoId, usuarioId } = params;

  validarSnapshot(snapshot);

  const gatilhosNormalizados = (snapshot.gatilhos || [])
    .filter((gatilho) => String(gatilho.valor || "").trim())
    .map((gatilho) => ({
      tipo_gatilho: gatilho.tipo_gatilho || "palavra_chave",
      valor: String(gatilho.valor || "").trim().toLowerCase(),
      condicao: gatilho.condicao || "contem",
      ativo: gatilho.ativo !== false,
    }));
  const palavrasChave = gatilhosNormalizados
    .filter((gatilho) => gatilho.tipo_gatilho === "palavra_chave")
    .map((gatilho) => gatilho.valor);
  const palavrasChaveUnicas = [...new Set(palavrasChave)];

  if (palavrasChaveUnicas.length !== palavrasChave.length) {
    const palavraDuplicada =
      palavrasChave.find(
        (palavra, indice) => palavrasChave.indexOf(palavra) !== indice
      ) || "";

    throw new Error(
      `A palavra-chave "${palavraDuplicada}" aparece mais de uma vez no fluxo importado.`
    );
  }

  if (palavrasChaveUnicas.length > 0) {
    const { data: conflitos, error: conflitosError } = await supabase
      .from("automacao_gatilhos")
      .select("valor")
      .eq("empresa_id", empresaDestinoId)
      .eq("tipo_gatilho", "palavra_chave")
      .in("valor", palavrasChaveUnicas)
      .limit(1);

    if (conflitosError) {
      throw new Error(
        `Erro ao validar palavras-chave do fluxo: ${conflitosError.message}`
      );
    }

    if (conflitos?.[0]) {
      throw new Error(
        `A palavra-chave "${conflitos[0].valor}" já está cadastrada em um fluxo desta empresa. Remova o conflito antes de importar.`
      );
    }
  }

  const { data: novoFluxo, error: novoFluxoError } = await supabase
    .from("automacao_fluxos")
    .insert({
      empresa_id: empresaDestinoId,
      nome: `${snapshot.fluxo.nome} - importado`,
      descricao: snapshot.fluxo.descricao,
      canal: snapshot.fluxo.canal || "whatsapp",
      status: "rascunho",
      criado_por: usuarioId,
      atualizado_por: usuarioId,
      fluxo_padrao: false,
      configuracao_json: sanitizarConfiguracaoFluxoCompartilhada(
        snapshot.fluxo.configuracao_json
      ),
    })
    .select("*")
    .single();

  if (novoFluxoError || !novoFluxo) {
    throw new Error(`Erro ao importar fluxo: ${novoFluxoError?.message}`);
  }

  const mapaIds = new Map<string, string>();

  const nosParaInserir = snapshot.nos.map((no) => {
    const novoId = randomUUID();
    mapaIds.set(no.id, novoId);

    return {
      id: novoId,
      empresa_id: empresaDestinoId,
      fluxo_id: novoFluxo.id,
      tipo_no: no.tipo_no,
      titulo: no.titulo || "Bloco",
      descricao: no.descricao,
      posicao_x: Math.round(Number(no.posicao_x || 0)),
      posicao_y: Math.round(Number(no.posicao_y || 0)),
      configuracao_json: sanitizarConfiguracaoCompartilhada(no.configuracao_json),
      delay_segundos:
        no.tipo_no === "inicio" || no.delay_segundos == null
          ? null
          : Math.max(0, Number(no.delay_segundos)),
      ativo: true,
    };
  });

  if (nosParaInserir.length > 0) {
    const { error: inserirNosError } = await supabase
      .from("automacao_nos")
      .insert(nosParaInserir);

    if (inserirNosError) {
      throw new Error(`Erro ao importar blocos: ${inserirNosError.message}`);
    }
  }

  const conexoesParaInserir = snapshot.conexoes
    .map((conexao) => {
      const novoOrigemId = mapaIds.get(conexao.no_origem_id);
      const novoDestinoId = mapaIds.get(conexao.no_destino_id);

      if (!novoOrigemId || !novoDestinoId) {
        return null;
      }

      return {
        id: randomUUID(),
        empresa_id: empresaDestinoId,
        fluxo_id: novoFluxo.id,
        no_origem_id: novoOrigemId,
        no_destino_id: novoDestinoId,
        condicao_json: conexao.condicao_json || {},
        rotulo: conexao.rotulo,
        ordem: Number(conexao.ordem || 1),
        usar_ia: conexao.usar_ia === true,
        descricao_ia: conexao.descricao_ia || null,
        ativo: true,
      };
    })
    .filter(Boolean);

  if (conexoesParaInserir.length > 0) {
    const { error: inserirConexoesError } = await supabase
      .from("automacao_conexoes")
      .insert(conexoesParaInserir);

    if (inserirConexoesError) {
      throw new Error(
        `Erro ao importar conexoes: ${inserirConexoesError.message}`
      );
    }
  }

  const gatilhosParaInserir = gatilhosNormalizados.map((gatilho) => ({
    empresa_id: empresaDestinoId,
    fluxo_id: novoFluxo.id,
    ...gatilho,
  }));

  if (gatilhosParaInserir.length > 0) {
    const { error: inserirGatilhosError } = await supabase
      .from("automacao_gatilhos")
      .insert(gatilhosParaInserir);

    if (inserirGatilhosError) {
      await supabase
        .from("automacao_conexoes")
        .delete()
        .eq("empresa_id", empresaDestinoId)
        .eq("fluxo_id", novoFluxo.id);
      await supabase
        .from("automacao_nos")
        .delete()
        .eq("empresa_id", empresaDestinoId)
        .eq("fluxo_id", novoFluxo.id);
      await supabase
        .from("automacao_fluxos")
        .delete()
        .eq("empresa_id", empresaDestinoId)
        .eq("id", novoFluxo.id);

      throw new Error(
        `Erro ao importar gatilhos: ${inserirGatilhosError.message}`
      );
    }
  }

  return {
    fluxo: novoFluxo,
    totais: {
      nos: nosParaInserir.length,
      conexoes: conexoesParaInserir.length,
      gatilhos: gatilhosParaInserir.length,
    },
  };
}
