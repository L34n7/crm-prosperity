import { gerarSugestaoDescricaoIAComContexto } from "@/lib/ia/sugestoes-descricao-ia";
import {
  compilarPlanoAssistente as compilarSeguro,
  normalizarPlanoAssistente as normalizarSeguro,
} from "./assistente-fluxos-compilador-seguro";
import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
  ModoAssistenteFluxos,
  PlanoAssistenteEtapa,
  PlanoAssistenteFluxos,
  ResultadoCompilacaoAssistente,
} from "./assistente-fluxos-base";

export type EstrategiaDistribuicaoAtendimento =
  | "fila_setor"
  | "atendente_especifico"
  | "rodizio_aleatorio"
  | "menos_conversas";

type EtapaDistribuicao = PlanoAssistenteEtapa & {
  estrategia_transferencia?: EstrategiaDistribuicaoAtendimento | null;
  atendente_id?: string | null;
  setor_excesso_tentativas?: string | null;
  estrategia_excesso_tentativas?: EstrategiaDistribuicaoAtendimento | null;
  atendente_excesso_tentativas?: string | null;
};

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function txt(v: unknown, n = 1800) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
}
function ref(v: unknown) {
  return txt(v, 180)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
function estrategia(v: unknown, atendente?: unknown) {
  const e = txt(v, 80);
  if (["fila_setor", "atendente_especifico", "rodizio_aleatorio", "menos_conversas"].includes(e)) {
    return e as EstrategiaDistribuicaoAtendimento;
  }
  return txt(atendente, 120) ? "atendente_especifico" : "fila_setor";
}
function estrategiaOpcional(v: unknown, atendente?: unknown) {
  return txt(v, 80) || txt(atendente, 120) ? estrategia(v, atendente) : null;
}

export function normalizarPlanoAssistente(valor: unknown): PlanoAssistenteFluxos {
  const plano = normalizarSeguro(valor);
  const raiz = obj(valor);
  const originais = Array.isArray(raiz.etapas) ? raiz.etapas.map(obj) : [];
  const porRef = new Map(originais.map((e) => [ref(e.ref), e]));
  const etapas = plano.etapas.map((e, i) => {
    const o = porRef.get(ref(e.ref)) || originais[i] || {};
    return {
      ...e,
      estrategia_transferencia: estrategiaOpcional(o.estrategia_transferencia, o.atendente_id),
      atendente_id: txt(o.atendente_id, 120) || null,
      setor_excesso_tentativas: txt(o.setor_excesso_tentativas, 120) || null,
      estrategia_excesso_tentativas: estrategiaOpcional(
        o.estrategia_excesso_tentativas,
        o.atendente_excesso_tentativas
      ),
      atendente_excesso_tentativas: txt(o.atendente_excesso_tentativas, 120) || null,
    } satisfies EtapaDistribuicao;
  });
  return { ...plano, etapas };
}

function tipoNo(tipo: string) {
  const mapa: Record<string, string> = {
    inicio: "inicio",
    mensagem: "enviar_texto",
    pergunta_opcoes: "pergunta_opcoes",
    pergunta_botoes: "enviar_botoes",
    pergunta_livre_ia: "pergunta_livre_ia",
    capturar_resposta: "capturar_resposta",
    midia_imagem: "enviar_imagem",
    midia_video: "enviar_video",
    midia_audio: "enviar_audio",
    midia_arquivo: "enviar_arquivo",
    redirect: "botao_redirect",
    transferir: "transferir_setor",
    encerrar: "encerrar",
    avaliacao: "avaliacao",
  };
  return mapa[tipo] || (tipo.startsWith("agenda_") ? tipo : "enviar_texto");
}

function aplicarDistribuicao(nos: AssistenteAutomacaoNo[], etapas: EtapaDistribuicao[]) {
  const usados = new Set<string>();
  for (const etapa of etapas) {
    const esperado = tipoNo(etapa.tipo);
    const no =
      nos.find(
        (n) =>
          !usados.has(n.id) &&
          n.tipo_no === esperado &&
          txt(n.titulo, 160).toLowerCase() === txt(etapa.titulo, 160).toLowerCase()
      ) || nos.find((n) => !usados.has(n.id) && n.tipo_no === esperado);
    if (!no) continue;
    usados.add(no.id);
    const cfg = { ...obj(no.configuracao_json) };
    if (no.tipo_no === "transferir_setor") {
      const e = estrategia(etapa.estrategia_transferencia, etapa.atendente_id);
      cfg.estrategia_transferencia = e;
      cfg.atendente_id = e === "atendente_especifico" ? etapa.atendente_id || null : null;
    }
    if (etapa.setor_excesso_tentativas) {
      const e = estrategia(
        etapa.estrategia_excesso_tentativas,
        etapa.atendente_excesso_tentativas
      );
      cfg.setor_excesso_tentativas = etapa.setor_excesso_tentativas;
      cfg.estrategia_excesso_tentativas = e;
      cfg.atendente_excesso_tentativas =
        e === "atendente_especifico" ? etapa.atendente_excesso_tentativas || null : null;
    }
    no.configuracao_json = cfg;
  }
  return nos;
}

function opcoes(no: AssistenteAutomacaoNo) {
  const cfg = obj(no.configuracao_json);
  const lista = no.tipo_no === "pergunta_opcoes" ? cfg.opcoes : cfg.botoes;
  return Array.isArray(lista)
    ? lista.map(obj).map((o) => ({
        id: txt(o.valor || o.id, 120),
        titulo: txt(o.titulo || o.texto, 120),
      }))
    : [];
}

function aplicarIa(nos: AssistenteAutomacaoNo[], conexoes: AssistenteAutomacaoConexao[]) {
  const porId = new Map(nos.map((n) => [n.id, n]));
  return conexoes.map((c) => {
    const origem = porId.get(c.no_origem_id);
    const destino = porId.get(c.no_destino_id);
    if (!origem || !destino || !["pergunta_opcoes", "enviar_botoes"].includes(origem.tipo_no)) return c;
    const tipo = txt(c.condicao_json?.tipo, 80);
    if (["sempre", "timeout_sem_resposta"].includes(tipo)) return c;
    const lista = opcoes(origem);
    const valor = txt(c.condicao_json?.valor, 120);
    const atual = lista.find((o) => ref(o.id) === ref(valor) || ref(o.titulo) === ref(c.rotulo));
    const cfgOrigem = obj(origem.configuracao_json);
  const cfgDestino = obj(destino.configuracao_json);
    const descricao = gerarSugestaoDescricaoIAComContexto({
      pergunta: txt(cfgOrigem.mensagem, 220),
      nomeConexao: c.rotulo,
      idResposta: valor,
      textoOpcao: atual?.titulo || c.rotulo || valor,
      destinoTitulo: destino.titulo,
      destinoMensagem: txt(cfgDestino.mensagem || cfgDestino.mensagem_encontrado, 180),
      destinoTipo: destino.tipo_no,
      outrasConexoes: lista.filter((o) => o !== atual).map((o) => o.titulo || o.id),
    });
    return {
      ...c,
      usar_ia: true,
      descricao_ia:
        descricao ||
        `Use esta conexão somente quando a resposta corresponder à opção “${c.rotulo || destino.titulo}”.`,
    };
  });
}

export function compilarPlanoAssistente(params: {
  modo: ModoAssistenteFluxos;
  plano: PlanoAssistenteFluxos;
  fluxoAtual?: { nos?: AssistenteAutomacaoNo[]; conexoes?: AssistenteAutomacaoConexao[] } | null;
  setores?: Parameters<typeof compilarSeguro>[0]["setores"];
  variaveis?: Parameters<typeof compilarSeguro>[0]["variaveis"];
  midias?: Parameters<typeof compilarSeguro>[0]["midias"];
}): ResultadoCompilacaoAssistente {
  const resultado = compilarSeguro(params);
  if (params.modo !== "criar_fluxo") return resultado;
  const nos = aplicarDistribuicao(
    resultado.nos.map((n) => ({ ...n, configuracao_json: { ...n.configuracao_json } })),
    params.plano.etapas as EtapaDistribuicao[]
  );
  return { ...resultado, nos, conexoes: aplicarIa(nos, resultado.conexoes) };
}
