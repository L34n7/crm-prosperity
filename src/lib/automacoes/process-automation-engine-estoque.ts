import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { interpretarBuscaEstoqueComIA } from "@/lib/ia/interpretar-busca-estoque";
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
const PRODUTOS_POR_PAGINA_VALIDOS = new Set([5, 10, 15]);
const MENSAGEM_MULTIPLOS_PRODUTOS_PADRAO =
  "Encontrei estas opções. Responda com o número do produto que deseja:";

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

type NavegacaoEstoque = "proxima" | "anterior" | null;

type ConsultaMetadata = {
  no_id: string;
  consultado_em: string;
  termo: string;
  termo_busca: string;
  modo: string;
  deposito_ids: string[];
  resultado: string;
  produto_id: string | null;
  candidatos: CandidatoMetadata[];
  pagina: number;
  produtos_por_pagina: number;
  total_candidatos: number;
  total_paginas: number;
  tem_proxima_pagina: boolean;
  tem_pagina_anterior: boolean;
  ia_usada: boolean;
  ia_fallback_motivo: string;
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
  pagina: number;
  produtosPorPagina: number;
  iaUsada: boolean;
};

type EntradaConsulta = {
  termo: string;
  termoBuscaAnterior: string;
  produtoId: string;
  selecaoPorIndice: boolean;
  navegacao: NavegacaoEstoque;
  pagina: number;
  produtosPorPaginaAnterior: number | null;
  iaUsadaAnterior: boolean;
  iaFallbackMotivoAnterior: string;
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
  if (valor === true || valor === "true" || valor === 1 || valor === "1") {
    return true;
  }
  if (valor === false || valor === "false" || valor === 0 || valor === "0") {
    return false;
  }
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

function normalizarTextoComando(valor: unknown) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function navegacaoEscolhida(valor: unknown): NavegacaoEstoque {
  const comando = normalizarTextoComando(valor);

  if (
    new Set([
      "mais",
      "ver mais",
      "mais opcoes",
      "mais produtos",
      "proximo",
      "proximos",
      "proxima",
      "proximas",
      "proxima pagina",
      "pagina seguinte",
      "seguinte",
    ]).has(comando)
  ) {
    return "proxima";
  }

  if (
    new Set([
      "voltar",
      "anterior",
      "anteriores",
      "pagina anterior",
      "voltar pagina",
      "voltar uma pagina",
    ]).has(comando)
  ) {
    return "anterior";
  }

  return null;
}

function modoPesquisaDoConfig(config: Record<string, unknown>) {
  const modo = texto(config.pesquisar_por || config.modo_pesquisa).toLowerCase();
  return MODOS_PESQUISA.has(modo as ModoPesquisaEstoque)
    ? (modo as ModoPesquisaEstoque)
    : "automatico";
}

function produtosPorPaginaDoConfig(config: Record<string, unknown>) {
  const informado = Number(
    config.produtos_por_pagina ?? config.limite_candidatos ?? 15
  );

  if (PRODUTOS_POR_PAGINA_VALIDOS.has(informado)) return informado;
  if (informado === 3) return 5;
  return 15;
}

function mensagemMultiplosDoConfig(config: Record<string, unknown>) {
  if (
    config.mensagem_multiplos_produtos === undefined ||
    config.mensagem_multiplos_produtos === null
  ) {
    return MENSAGEM_MULTIPLOS_PRODUTOS_PADRAO;
  }

  return String(config.mensagem_multiplos_produtos).slice(0, 600).trim();
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

  if (error) {
    throw new Error(`Erro ao carregar execução para consulta de estoque: ${error.message}`);
  }
  if (!data) {
    throw new Error("Execução da automação não encontrada para consulta de estoque.");
  }

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

  if (variavelError) {
    throw new Error(`Erro ao ler variável da execução: ${variavelError.message}`);
  }
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

  if (globalError) {
    throw new Error(`Erro ao ler variável global da empresa: ${globalError.message}`);
  }

  return texto(variavelGlobal?.valor);
}

function candidatosDoMetadata(consulta: Record<string, unknown>) {
  const candidatosRaw = Array.isArray(consulta.candidatos)
    ? consulta.candidatos
    : [];

  return candidatosRaw
    .map((item) => objeto(item))
    .map((item) => ({
      indice: Number(item.indice),
      produto_id: texto(item.produto_id),
      nome: texto(item.nome),
      preco:
        item.preco === null || item.preco === undefined
          ? null
          : Number(item.preco),
      preco_formatado: texto(item.preco_formatado),
    }))
    .filter(
      (item) =>
        Number.isInteger(item.indice) && item.indice > 0 && Boolean(item.produto_id)
    )
    .slice(0, 15) as CandidatoMetadata[];
}

function ultimaConsultaDoMetadata(
  metadata: Record<string, unknown>,
  noId: string
): ConsultaMetadata | null {
  const consulta = objeto(metadata.estoque_ultima_consulta);

  if (texto(consulta.no_id) !== noId) return null;

  const pagina = Math.max(1, Math.floor(Number(consulta.pagina || 1) || 1));
  const produtosPorPagina = PRODUTOS_POR_PAGINA_VALIDOS.has(
    Number(consulta.produtos_por_pagina)
  )
    ? Number(consulta.produtos_por_pagina)
    : 15;
  const totalCandidatos = Math.max(
    0,
    Math.floor(Number(consulta.total_candidatos || 0) || 0)
  );
  const totalPaginas = Math.max(
    1,
    Math.floor(
      Number(consulta.total_paginas || Math.ceil(totalCandidatos / produtosPorPagina)) ||
        1
    )
  );

  return {
    no_id: noId,
    consultado_em: texto(consulta.consultado_em),
    termo: texto(consulta.termo),
    termo_busca: texto(consulta.termo_busca || consulta.termo),
    modo: texto(consulta.modo || "automatico"),
    deposito_ids: Array.isArray(consulta.deposito_ids)
      ? consulta.deposito_ids.map(texto).filter(Boolean).slice(0, 50)
      : [],
    resultado: texto(consulta.resultado),
    produto_id: texto(consulta.produto_id) || null,
    candidatos: candidatosDoMetadata(consulta),
    pagina,
    produtos_por_pagina: produtosPorPagina,
    total_candidatos: totalCandidatos,
    total_paginas: totalPaginas,
    tem_proxima_pagina: booleano(consulta.tem_proxima_pagina, false),
    tem_pagina_anterior: booleano(consulta.tem_pagina_anterior, pagina > 1),
    ia_usada: booleano(consulta.ia_usada, false),
    ia_fallback_motivo: texto(consulta.ia_fallback_motivo),
  };
}

function indiceEscolhido(valor: string) {
  const textoLimpo = valor.trim().toLowerCase();
  const match = textoLimpo.match(/^(?:op[cç][aã]o\s*)?(\d{1,5})$/i);
  if (!match) return null;

  const indice = Number(match[1]);
  return Number.isInteger(indice) && indice > 0 ? indice : null;
}

async function resolverEntradaConsulta(params: {
  empresaId: string;
  execucao: ExecucaoEstoque;
  noId: string;
  config: Record<string, unknown>;
  mensagemTexto?: string;
}): Promise<EntradaConsulta> {
  const origem = texto(params.config.origem_produto || "resposta_cliente").toLowerCase();

  if (origem === "produto_especifico") {
    return {
      termo: "",
      termoBuscaAnterior: "",
      produtoId: texto(params.config.produto_id),
      selecaoPorIndice: false,
      navegacao: null,
      pagina: 1,
      produtosPorPaginaAnterior: null,
      iaUsadaAnterior: false,
      iaFallbackMotivoAnterior: "",
    };
  }

  const chave = normalizarChaveVariavel(
    origem === "variavel"
      ? params.config.variavel_produto
      : params.config.variavel_resposta
  );
  const valorVariavel = chave
    ? await resolverVariavel({
        empresaId: params.empresaId,
        execucao: params.execucao,
        chave,
      })
    : "";
  const valorMensagem = texto(params.mensagemTexto);
  const metadata = objeto(params.execucao.metadata_json);
  const consultaAnterior = ultimaConsultaDoMetadata(metadata, params.noId);

  const valoresComando = Array.from(
    new Set([valorMensagem, valorVariavel].filter(Boolean))
  );

  if (consultaAnterior) {
    for (const valor of valoresComando) {
      const navegacao = navegacaoEscolhida(valor);

      if (navegacao) {
        let pagina = consultaAnterior.pagina;

        if (navegacao === "proxima" && consultaAnterior.tem_proxima_pagina) {
          pagina += 1;
        }
        if (navegacao === "anterior" && pagina > 1) {
          pagina -= 1;
        }

        return {
          termo: consultaAnterior.termo,
          termoBuscaAnterior: consultaAnterior.termo_busca,
          produtoId: "",
          selecaoPorIndice: false,
          navegacao,
          pagina,
          produtosPorPaginaAnterior: consultaAnterior.produtos_por_pagina,
          iaUsadaAnterior: consultaAnterior.ia_usada,
          iaFallbackMotivoAnterior: consultaAnterior.ia_fallback_motivo,
        };
      }
    }

    for (const valor of valoresComando) {
      const indice = indiceEscolhido(valor);
      if (indice === null) continue;

      const candidato = consultaAnterior.candidatos.find(
        (item) => item.indice === indice
      );

      if (candidato) {
        return {
          termo: valor,
          termoBuscaAnterior: consultaAnterior.termo_busca,
          produtoId: candidato.produto_id,
          selecaoPorIndice: true,
          navegacao: null,
          pagina: consultaAnterior.pagina,
          produtosPorPaginaAnterior: consultaAnterior.produtos_por_pagina,
          iaUsadaAnterior: consultaAnterior.ia_usada,
          iaFallbackMotivoAnterior: consultaAnterior.ia_fallback_motivo,
        };
      }
    }
  }

  return {
    termo: valorVariavel || valorMensagem,
    termoBuscaAnterior: "",
    produtoId: "",
    selecaoPorIndice: false,
    navegacao: null,
    pagina: 1,
    produtosPorPaginaAnterior: null,
    iaUsadaAnterior: false,
    iaFallbackMotivoAnterior: "",
  };
}

function termoPareceCodigoBarras(valor: string) {
  return /^\d{8,14}$/.test(valor.replace(/\D/g, "")) && /^\d+$/.test(valor.trim());
}

function deveUsarIa(params: {
  termo: string;
  modo: ModoPesquisaEstoque;
  entrada: EntradaConsulta;
}) {
  if (!params.termo.trim()) return false;
  if (params.entrada.produtoId) return false;
  if (params.entrada.selecaoPorIndice || params.entrada.navegacao) return false;
  if (params.modo === "codigo_sku" || params.modo === "codigo_barras") {
    return false;
  }
  if (params.modo === "automatico" && termoPareceCodigoBarras(params.termo)) {
    return false;
  }

  return true;
}

function montarCandidatos(
  consulta: ResultadoConsultaEstoqueProduto,
  offset: number
) {
  return consulta.candidatos.slice(0, 15).map((candidato, index) => ({
    indice: offset + index + 1,
    produto_id: candidato.id,
    nome: candidato.nome,
    preco: candidato.preco,
    preco_formatado: candidato.preco_formatado,
  }));
}

function montarTextoCandidatos(params: {
  candidatos: CandidatoMetadata[];
  mensagem: string;
  pagina: number;
  totalPaginas: number;
  temProximaPagina: boolean;
  temPaginaAnterior: boolean;
}) {
  if (params.candidatos.length === 0) return "";

  const lista = params.candidatos
    .map(
      (item) =>
        `${item.indice}  -  ${item.nome}${
          item.preco_formatado ? ` — ${item.preco_formatado}` : ""
        }`
    )
    .join("\n");
  const pagina =
    params.totalPaginas > 1
      ? `Página ${params.pagina} de ${params.totalPaginas}`
      : "";

  let instrucao = "Responda com o número da opção.";
  if (params.temProximaPagina && params.temPaginaAnterior) {
    instrucao =
      'Responda com o número da opção, "mais" para ver a próxima página ou "voltar" para ver a página anterior.';
  } else if (params.temProximaPagina) {
    instrucao =
      'Responda com o número da opção ou "mais" para ver mais produtos.';
  } else if (params.temPaginaAnterior) {
    instrucao =
      'Responda com o número da opção ou "voltar" para ver a página anterior.';
  }

  return [params.mensagem, pagina, lista, instrucao]
    .map((parte) => parte.trim())
    .filter(Boolean)
    .join("\n\n");
}

function montarVariaveis(params: {
  consulta: ResultadoConsultaEstoqueProduto;
  candidatos: CandidatoMetadata[];
  pagina: number;
  produtosPorPagina: number;
  totalCandidatos: number;
  totalPaginas: number;
  temProximaPagina: boolean;
  temPaginaAnterior: boolean;
  mensagemMultiplos: string;
  termoBusca: string;
  iaUsada: boolean;
}) {
  const produto = params.consulta.produto;
  const precos = params.consulta.precos;
  const promocao = precos?.promocao;
  const embalagem = params.consulta.embalagem;
  const depositos = params.consulta.depositos;
  const depositoUnico = depositos.length === 1 ? depositos[0] : null;
  const candidatosTexto = montarTextoCandidatos({
    candidatos: params.candidatos,
    mensagem: params.mensagemMultiplos,
    pagina: params.pagina,
    totalPaginas: params.totalPaginas,
    temProximaPagina: params.temProximaPagina,
    temPaginaAnterior: params.temPaginaAnterior,
  });

  return {
    estoque_resultado: params.consulta.resultado,
    estoque_produto_id: produto?.id || "",
    estoque_produto_codigo: produto?.codigo || "",
    estoque_produto_sku: produto?.sku || "",
    estoque_produto_codigo_barras: produto?.codigo_barras || "",
    estoque_produto_nome: produto?.nome || "",

    // Compatibilidade: estoque_preco permanece sendo o preço efetivo do canal WhatsApp,
    // incluindo promoção vigente, enquanto as variáveis específicas expõem todas as faixas.
    estoque_preco: numeroTexto(produto?.preco),
    estoque_preco_formatado: produto?.preco_formatado || "",
    estoque_preco_base: numeroTexto(precos?.base ?? produto?.preco_base),
    estoque_preco_base_formatado:
      precos?.formatados.base || produto?.preco_base_formatado || "",
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

    estoque_quantidade: numeroTexto(params.consulta.quantidade_disponivel),
    estoque_quantidade_fisica: numeroTexto(params.consulta.quantidade_fisica),
    estoque_quantidade_reservada: numeroTexto(params.consulta.quantidade_reservada),
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
    estoque_embalagem_quantidade_disponivel: numeroTexto(
      embalagem?.quantidade_disponivel
    ),
    estoque_candidatos_quantidade: String(params.candidatos.length),
    estoque_candidatos_total: String(params.totalCandidatos),
    estoque_candidatos_texto: candidatosTexto,
    estoque_candidatos_json: JSON.stringify(params.candidatos),
    estoque_pagina: String(params.pagina),
    estoque_total_paginas: String(params.totalPaginas),
    estoque_produtos_por_pagina: String(params.produtosPorPagina),
    estoque_tem_proxima_pagina: String(params.temProximaPagina),
    estoque_tem_pagina_anterior: String(params.temPaginaAnterior),
    estoque_busca_termo: params.termoBusca,
    estoque_busca_ia_usada: String(params.iaUsada),
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

    if (error) {
      throw new Error(`Erro ao salvar variáveis da consulta de estoque: ${error.message}`);
    }
  }

  const metadataAtual = objeto(params.execucao.metadata_json);
  const consultasAtuais = objeto(metadataAtual.estoque_consultas);
  const variaveisAtuais = objeto(metadataAtual.variaveis);

  const { error: execucaoError } = await supabaseAdmin
    .from("automacao_execucoes")
    .update({
      metadata_json: {
        ...metadataAtual,
        variaveis: {
          ...variaveisAtuais,
          ...params.variaveis,
        },
        estoque_consultas: {
          ...consultasAtuais,
          [params.noId]: params.consultaMetadata,
        },
        estoque_ultima_consulta: params.consultaMetadata,
      },
      updated_at: agora,
    })
    .eq("id", params.execucao.id)
    .eq("empresa_id", params.empresaId);

  if (execucaoError) {
    throw new Error(`Erro ao salvar contexto da consulta de estoque: ${execucaoError.message}`);
  }
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
    noId: params.no.id,
    config,
    mensagemTexto: params.mensagemTexto,
  });
  const modo = modoPesquisaDoConfig(config);
  const depositoIds = depositosDoConfig(config);
  const produtosPorPagina =
    entrada.produtosPorPaginaAnterior || produtosPorPaginaDoConfig(config);
  const pagina = entrada.produtoId ? 1 : Math.max(1, entrada.pagina);
  const offset = (pagina - 1) * produtosPorPagina;
  const usarEmbalagemVenda = booleano(config.usar_embalagem_venda, true);
  const mensagemMultiplos = mensagemMultiplosDoConfig(config);

  let iaUsada = entrada.iaUsadaAnterior;
  let iaFallbackMotivo = entrada.iaFallbackMotivoAnterior;
  let termoBusca = entrada.termoBuscaAnterior || entrada.termo;
  let termosBusca = termoBusca ? [termoBusca] : [];

  if (
    deveUsarIa({
      termo: entrada.termo,
      modo,
      entrada,
    })
  ) {
    const interpretacao = await interpretarBuscaEstoqueComIA({
      termoCliente: entrada.termo,
      empresaId: params.empresaId,
      metadata: {
        execucao_id: params.execucaoId,
        fluxo_id: params.fluxoId,
        no_id: params.no.id,
      },
    });

    iaUsada = interpretacao.usou_ia;
    iaFallbackMotivo = interpretacao.fallback_motivo;
    termosBusca = Array.from(
      new Set(
        [interpretacao.termo_principal, ...interpretacao.termos_relacionados]
          .map(texto)
          .filter(Boolean)
      )
    ).slice(0, 4);
    termoBusca = termosBusca[0] || entrada.termo;
  }

  let consulta: ResultadoConsultaEstoqueProduto | null = null;

  if (entrada.produtoId) {
    consulta = await consultarEstoqueProduto({
      empresaId: params.empresaId,
      termo: entrada.termo,
      produtoId: entrada.produtoId,
      modoPesquisa: modo,
      depositoIds,
      usarEmbalagemVenda,
      limiteCandidatos: produtosPorPagina,
    });
  } else {
    const termosParaConsultar = termosBusca.length > 0 ? termosBusca : [entrada.termo];

    for (const termoAtual of termosParaConsultar) {
      const resultado = await consultarEstoqueProduto({
        empresaId: params.empresaId,
        termo: termoAtual,
        modoPesquisa: modo,
        depositoIds,
        usarEmbalagemVenda,
        limiteCandidatos: produtosPorPagina,
        offsetCandidatos: offset,
        permitirSelecaoAutomatica: entrada.navegacao ? false : true,
      });

      consulta = resultado;
      termoBusca = termoAtual;

      if (resultado.resultado !== "nao_encontrado") break;

      // Paginação sempre reutiliza o mesmo termo. Termos relacionados da IA só
      // são tentados na primeira página de uma nova busca.
      if (entrada.navegacao || pagina > 1) break;
    }
  }

  if (!consulta) {
    throw new Error("A consulta de estoque não retornou resultado.");
  }

  if (!RESULTADOS_ESTOQUE.has(consulta.resultado)) {
    throw new Error("Resultado inválido retornado pela consulta de estoque.");
  }

  const candidatos = montarCandidatos(consulta, offset);
  const totalCandidatos = Math.max(
    candidatos.length,
    Number(consulta.total_candidatos || 0)
  );
  const totalPaginas = Math.max(
    1,
    Math.ceil(totalCandidatos / produtosPorPagina)
  );
  const temProximaPagina =
    consulta.resultado === "multiplos_resultados" &&
    pagina < totalPaginas &&
    consulta.tem_mais_candidatos;
  const temPaginaAnterior =
    consulta.resultado === "multiplos_resultados" && pagina > 1;

  const variaveis = montarVariaveis({
    consulta,
    candidatos,
    pagina,
    produtosPorPagina,
    totalCandidatos,
    totalPaginas,
    temProximaPagina,
    temPaginaAnterior,
    mensagemMultiplos,
    termoBusca,
    iaUsada,
  });
  const consultaMetadata: ConsultaMetadata = {
    no_id: params.no.id,
    consultado_em: new Date().toISOString(),
    termo: entrada.termo,
    termo_busca: termoBusca,
    modo,
    deposito_ids: depositoIds,
    resultado: consulta.resultado,
    produto_id: consulta.produto?.id || null,
    candidatos,
    pagina,
    produtos_por_pagina: produtosPorPagina,
    total_candidatos: totalCandidatos,
    total_paginas: totalPaginas,
    tem_proxima_pagina: temProximaPagina,
    tem_pagina_anterior: temPaginaAnterior,
    ia_usada: iaUsada,
    ia_fallback_motivo: iaFallbackMotivo,
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
    pagina,
    produtosPorPagina,
    iaUsada,
  };
}
