import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  consultarEstoqueProduto,
  type ModoPesquisaEstoque,
  type ResultadoConsultaEstoqueProduto,
} from "@/lib/estoque/consultar-estoque-produto";

const supabaseAdmin = getSupabaseAdmin();

const RESULTADOS_ESTOQUE = new Set([
  "disponivel",
  "sem_estoque",
  "nao_encontrado",
  "multiplos_resultados",
]);
const MODOS_PESQUISA = new Set<ModoPesquisaEstoque>([
  "automatico",
  "nome",
  "codigo_sku",
  "codigo_barras",
]);

type AutomacaoNoEstoque = {
  id: string;
  configuracao_json?: Record<string, unknown> | null;
};

type ExecucaoEstoque = {
  id: string;
  contato_id: string | null;
  metadata_json: Record<string, unknown> | null;
};

type CandidatoMetadata = {
  indice: number;
  produto_id: string;
  nome: string;
  preco: number | null;
  preco_formatado: string;
};

type ConsultaMetadata = {
  no_id: string;
  consultado_em: string;
  termo: string;
  modo: string;
  deposito_ids: string[];
  resultado: string;
  produto_id: string | null;
  candidatos: CandidatoMetadata[];
};

export type ExecucaoConsultaEstoqueAutomacao = {
  resultado: string;
  termo: string;
  modo: ModoPesquisaEstoque;
  depositoIds: string[];
  consulta: ResultadoConsultaEstoqueProduto;
  variaveis: Record<string, string>;
  candidatos: CandidatoMetadata[];
  selecaoPorIndice: boolean;
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function booleano(valor: unknown, padrao = false) {
  if (valor === true || valor === "true" || valor === 1 || valor === "1") return true;
  if (valor === false || valor === "false" || valor === 0 || valor === "0") return false;
  return padrao;
}

function numeroTexto(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return String(valor);
}

function normalizarChaveVariavel(valor: unknown) {
  return texto(valor)
    .replace(/^\{\{\s*/, "")
    .replace(/\s*\}\}$/, "")
    .replace(/^variaveis\./i, "")
    .trim()
    .toLowerCase();
}

function modoPesquisaDoConfig(config: Record<string, unknown>) {
  const modo = texto(config.pesquisar_por || config.modo_pesquisa).toLowerCase();
  return MODOS_PESQUISA.has(modo as ModoPesquisaEstoque)
    ? (modo as ModoPesquisaEstoque)
    : "automatico";
}

function depositosDoConfig(config: Record<string, unknown>) {
  const modo = texto(config.deposito_modo || "todos").toLowerCase();
  if (modo === "especifico") {
    const id = texto(config.deposito_id);
    return id ? [id] : [];
  }
  if (modo === "selecionados") {
    const ids = Array.isArray(config.deposito_ids) ? config.deposito_ids : [];
    return Array.from(new Set(ids.map(texto).filter(Boolean))).slice(0, 50);
  }
  return [];
}

async function carregarExecucao(params: {
  empresaId: string;
  execucaoId: string;
  fluxoId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("automacao_execucoes")
    .select("id,contato_id,metadata_json")
    .eq("id", params.execucaoId)
    .eq("empresa_id", params.empresaId)
    .eq("fluxo_id", params.fluxoId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar execução para consulta de estoque: ${error.message}`);
  if (!data) throw new Error("Execução da automação não encontrada para consulta de estoque.");
  return data as ExecucaoEstoque;
}

async function resolverVariavel(params: {
  empresaId: string;
  execucao: ExecucaoEstoque;
  chave: string;
}) {
  const metadata = objeto(params.execucao.metadata_json);
  const variaveis = objeto(metadata.variaveis);
  const valorMetadata = variaveis[params.chave];
  if (valorMetadata !== null && valorMetadata !== undefined && texto(valorMetadata)) {
    return texto(valorMetadata);
  }

  const { data: variavelExecucao, error: variavelError } = await supabaseAdmin
    .from("automacao_variaveis")
    .select("valor")
    .eq("empresa_id", params.empresaId)
    .eq("execucao_id", params.execucao.id)
    .eq("chave", params.chave)
    .maybeSingle();
  if (variavelError) throw new Error(`Erro ao ler variável da execução: ${variavelError.message}`);
  if (texto(variavelExecucao?.valor)) return texto(variavelExecucao?.valor);

  const { data: variavelGlobal, error: globalError } = await supabaseAdmin
    .from("automacao_variaveis")
    .select("valor")
    .eq("empresa_id", params.empresaId)
    .is("execucao_id", null)
    .is("contato_id", null)
    .eq("chave", params.chave)
    .eq("metadata_json->>tipo", "global_empresa")
    .eq("metadata_json->>ativo", "true")
    .maybeSingle();
  if (globalError) throw new Error(`Erro ao ler variável global da empresa: ${globalError.message}`);
  return texto(variavelGlobal?.valor);
}

function ultimaConsultaDoMetadata(metadata: Record<string, unknown>) {
  const consulta = objeto(metadata.estoque_ultima_consulta);
  const candidatosRaw = Array.isArray(consulta.candidatos) ? consulta.candidatos : [];
  const candidatos: CandidatoMetadata[] = candidatosRaw
    .map((item) => objeto(item))
    .map((item) => ({
      indice: Number(item.indice),
      produto_id: texto(item.produto_id),
      nome: texto(item.nome),
      preco: item.preco === null || item.preco === undefined ? null : Number(item.preco),
      preco_formatado: texto(item.preco_formatado),
    }))
    .filter((item) => Number.isInteger(item.indice) && item.indice > 0 && Boolean(item.produto_id))
    .slice(0, 10);
  return candidatos;
}

function indiceEscolhido(valor: string) {
  const textoLimpo = valor.trim().toLowerCase();
  const match = textoLimpo.match(/^(?:op[cç][aã]o\s*)?(\d{1,2})$/i);
  if (!match) return null;
  const indice = Number(match[1]);
  return Number.isInteger(indice) && indice > 0 ? indice : null;
}

async function resolverEntradaConsulta(params: {
  empresaId: string;
  execucao: ExecucaoEstoque;
  config: Record<string, unknown>;
  mensagemTexto?: string;
}) {
  const origem = texto(params.config.origem_produto || "resposta_cliente").toLowerCase();
  if (origem === "produto_especifico") {
    return { termo: "", produtoId: texto(params.config.produto_id), selecaoPorIndice: false };
  }

  const chave = normalizarChaveVariavel(
    origem === "variavel" ? params.config.variavel_produto : params.config.variavel_resposta
  );
  const valorVariavel = chave
    ? await resolverVariavel({ empresaId: params.empresaId, execucao: params.execucao, chave })
    : "";
  const termo = valorVariavel || texto(params.mensagemTexto);
  const metadata = objeto(params.execucao.metadata_json);
  const indice = indiceEscolhido(termo);

  if (indice !== null) {
    const candidato = ultimaConsultaDoMetadata(metadata).find((item) => item.indice === indice);
    if (candidato) return { termo, produtoId: candidato.produto_id, selecaoPorIndice: true };
  }

  return { termo, produtoId: "", selecaoPorIndice: false };
}

function montarCandidatos(consulta: ResultadoConsultaEstoqueProduto) {
  return consulta.candidatos.slice(0, 10).map((candidato, index) => ({
    indice: index + 1,
    produto_id: candidato.id,
    nome: candidato.nome,
    preco: candidato.preco,
    preco_formatado: candidato.preco_formatado,
  }));
}

function montarVariaveis(
  consulta: ResultadoConsultaEstoqueProduto,
  candidatos: CandidatoMetadata[]
) {
  const produto = consulta.produto;
  const precos = consulta.precos;
  const promocao = precos?.promocao;
  const embalagem = consulta.embalagem;
  const depositos = consulta.depositos;
  const depositoUnico = depositos.length === 1 ? depositos[0] : null;
  const candidatosTexto = candidatos
    .map((item) => `${item.indice}. ${item.nome}${item.preco_formatado ? ` — ${item.preco_formatado}` : ""}`)
    .join("\n");

  return {
    estoque_resultado: consulta.resultado,
    estoque_produto_id: produto?.id || "",
    estoque_produto_codigo: produto?.codigo || "",
    estoque_produto_sku: produto?.sku || "",
    estoque_produto_codigo_barras: produto?.codigo_barras || "",
    estoque_produto_nome: produto?.nome || "",

    // Compatibilidade: estoque_preco continua sendo o preço efetivo do canal WhatsApp,
    // já considerando promoção vigente. Fluxos antigos continuam funcionando.
    estoque_preco: numeroTexto(produto?.preco),
    estoque_preco_formatado: produto?.preco_formatado || "",
    estoque_preco_base: numeroTexto(precos?.base ?? produto?.preco_base),
    estoque_preco_base_formatado: precos?.formatados.base || produto?.preco_base_formatado || "",
    estoque_preco_balcao: numeroTexto(precos?.balcao),
    estoque_preco_balcao_formatado: precos?.formatados.balcao || "",
    estoque_preco_online: numeroTexto(precos?.online),
    estoque_preco_online_formatado: precos?.formatados.online || "",
    estoque_preco_whatsapp: numeroTexto(precos?.whatsapp),
    estoque_preco_whatsapp_formatado: precos?.formatados.whatsapp || "",
    estoque_preco_promocional: numeroTexto(precos?.promocional),
    estoque_preco_promocional_formatado: precos?.formatados.promocional || "",
    estoque_preco_pix: numeroTexto(precos?.pix),
    estoque_preco_pix_formatado: precos?.formatados.pix || "",
    estoque_preco_dinheiro: numeroTexto(precos?.dinheiro),
    estoque_preco_dinheiro_formatado: precos?.formatados.dinheiro || "",
    estoque_preco_debito: numeroTexto(precos?.debito),
    estoque_preco_debito_formatado: precos?.formatados.debito || "",
    estoque_preco_credito: numeroTexto(precos?.credito),
    estoque_preco_credito_formatado: precos?.formatados.credito || "",
    estoque_promocao_nome: promocao?.nome || "",
    estoque_promocao_inicio_em: promocao?.inicio_em || "",
    estoque_promocao_fim_em: promocao?.fim_em || "",
    estoque_promocao_canais: promocao?.canais?.join(",") || "",

    estoque_quantidade: numeroTexto(consulta.quantidade_disponivel),
    estoque_quantidade_fisica: numeroTexto(consulta.quantidade_fisica),
    estoque_quantidade_reservada: numeroTexto(consulta.quantidade_reservada),
    estoque_unidade: produto?.unidade || "",
    estoque_deposito_id: depositoUnico?.id || "",
    estoque_deposito_nome:
      depositoUnico?.nome || depositos.map((deposito) => deposito.nome).join(", "),
    estoque_depositos_json: JSON.stringify(depositos),
    estoque_embalagem_id: embalagem?.id || "",
    estoque_embalagem_nome: embalagem?.nome || "",
    estoque_embalagem_sigla: embalagem?.sigla || "",
    estoque_embalagem_fator: numeroTexto(embalagem?.fator),
    estoque_embalagem_preco: numeroTexto(embalagem?.preco),
    estoque_embalagem_preco_formatado: embalagem?.preco_formatado || "",
    estoque_embalagem_quantidade_disponivel: numeroTexto(embalagem?.quantidade_disponivel),
    estoque_candidatos_quantidade: String(candidatos.length),
    estoque_candidatos_texto: candidatosTexto,
    estoque_candidatos_json: JSON.stringify(candidatos),
  };
}

async function persistirResultado(params: {
  empresaId: string;
  execucao: ExecucaoEstoque;
  noId: string;
  variaveis: Record<string, string>;
  consultaMetadata: ConsultaMetadata;
}) {
  const agora = new Date().toISOString();
  const registros = Object.entries(params.variaveis).map(([chave, valor]) => ({
    empresa_id: params.empresaId,
    execucao_id: params.execucao.id,
    contato_id: params.execucao.contato_id,
    chave,
    valor,
    metadata_json: {
      origem: "consultar_estoque",
      no_id: params.noId,
      resultado: params.consultaMetadata.resultado,
    },
    updated_at: agora,
  }));

  if (registros.length > 0) {
    const { error } = await supabaseAdmin
      .from("automacao_variaveis")
      .upsert(registros, { onConflict: "execucao_id,chave" });
    if (error) throw new Error(`Erro ao salvar variáveis da consulta de estoque: ${error.message}`);
  }

  const metadataAtual = objeto(params.execucao.metadata_json);
  const consultasAtuais = objeto(metadataAtual.estoque_consultas);
  const variaveisAtuais = objeto(metadataAtual.variaveis);
  const { error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...metadataAtual,
        variaveis: { ...variaveisAtuais, ...params.variaveis },
        estoque_consultas: { ...consultasAtuais, [params.noId]: params.consultaMetadata },
        estoque_ultima_consulta: params.consultaMetadata,
      },
      updated_at: agora,
    })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId);
  if (execucaoError) throw new Error(`Erro ao salvar contexto da consulta de estoque: ${execucaoError.message}`);
}

export async function executarConsultaEstoqueAutomacao(params: {
  empresaId: string;
  execucaoId: string;
  fluxoId: string;
  no: AutomacaoNoEstoque;
  mensagemTexto?: string;
}): Promise<ExecucaoConsultaEstoqueAutomacao> {
  const config = objeto(params.no.configuracao_json);
  const execucao = await carregarExecucao(params);
  const entrada = await resolverEntradaConsulta({
    empresaId: params.empresaId,
    execucao,
    config,
    mensagemTexto: params.mensagemTexto,
  });
  const modo = modoPesquisaDoConfig(config);
  const depositoIds = depositosDoConfig(config);
  const limiteCandidatos = Math.min(10, Math.max(1, Number(config.limite_candidatos || 5) || 5));

  const consulta = await consultarEstoqueProduto({
    empresaId: params.empresaId,
    termo: entrada.termo,
    produtoId: entrada.produtoId,
    modoPesquisa: modo,
    depositoIds,
    usarEmbalagemVenda: booleano(config.usar_embalagem_venda, true),
    limiteCandidatos,
  });
  if (!RESULTADOS_ESTOQUE.has(consulta.resultado)) {
    throw new Error("Resultado inválido retornado pela consulta de estoque.");
  }

  const candidatos = montarCandidatos(consulta);
  const variaveis = montarVariaveis(consulta, candidatos);
  const consultaMetadata: ConsultaMetadata = {
    no_id: params.no.id,
    consultado_em: new Date().toISOString(),
    termo: entrada.termo,
    modo,
    deposito_ids: depositoIds,
    resultado: consulta.resultado,
    produto_id: consulta.produto?.id || null,
    candidatos,
  };

  await persistirResultado({
    empresaId: params.empresaId,
    execucao,
    noId: params.no.id,
    variaveis,
    consultaMetadata,
  });

  return {
    resultado: consulta.resultado,
    termo: entrada.termo,
    modo,
    depositoIds,
    consulta,
    variaveis,
    candidatos,
    selecaoPorIndice: entrada.selecaoPorIndice,
  };
}
