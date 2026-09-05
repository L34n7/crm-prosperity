import { validarCaptura } from "@/lib/automacoes/captura-normalizacao";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();

const TIPOS_CAPTURA = new Set([
  "texto",
  "nome",
  "email",
  "telefone",
  "cpf",
  "cnpj",
  "data",
  "cep",
  "numero",
  "moeda",
]);

type TipoCaptura =
  | "texto"
  | "nome"
  | "email"
  | "telefone"
  | "cpf"
  | "cnpj"
  | "data"
  | "cep"
  | "numero"
  | "moeda";

type PendenciaCaptura = {
  id: string;
  empresa_id: string;
  agente_id: string;
  conversa_id: string;
  contato_id?: string | null;
  mensagem_ids?: string[] | null;
  conteudo_agregado?: string | null;
};

type Mensagem = {
  id: string;
  conteudo?: string | null;
  created_at?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

function normalizarBusca(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tipoCapturaValido(valor: unknown): valor is TipoCaptura {
  return TIPOS_CAPTURA.has(String(valor || "").trim().toLowerCase());
}

function mensagemPedeInformacao(texto: string) {
  return /\b(informe|informar|me diga|diga|me fale|me fala|me passe|passe|me envie|envie|pode me informar|poderia me informar|pode me passar|poderia me passar|qual e|qual o|qual a|qual seu|qual sua|preciso do|preciso da|preciso de)\b/.test(
    texto
  );
}

function detectarTipoCapturaPorTexto(textoOriginal: string): TipoCaptura | null {
  const texto = normalizarBusca(textoOriginal);
  if (!texto || !mensagemPedeInformacao(texto)) return null;

  if (/\b(e mail|email)\b/.test(texto)) return "email";
  if (/\bcpf\b/.test(texto)) return "cpf";
  if (/\bcnpj\b/.test(texto)) return "cnpj";
  if (/\bcep\b/.test(texto)) return "cep";
  if (/\b(telefone|celular|numero de whatsapp|whatsapp)\b/.test(texto)) {
    return "telefone";
  }
  if (/\b(data de nascimento|nascimento)\b/.test(texto)) return "data";
  if (/\b(seu nome|nome completo|como voce se chama)\b/.test(texto)) return "nome";
  if (/\b(orcamento|quanto pretende investir|valor que pretende investir|faixa de investimento)\b/.test(texto)) {
    return "moeda";
  }
  if (/\b(quantos|quantas|quantidade)\b/.test(texto)) return "numero";

  return null;
}

function tipoCapturaDaMensagem(mensagem: Mensagem, textoLote: string) {
  const metadata = mensagem.metadata_json || {};
  const explicito =
    metadata.captura_tipo ||
    metadata.tipo_captura ||
    (metadata.captura && typeof metadata.captura === "object"
      ? (metadata.captura as Record<string, unknown>).tipo
      : null);

  if (tipoCapturaValido(explicito)) {
    return String(explicito).trim().toLowerCase() as TipoCaptura;
  }

  return detectarTipoCapturaPorTexto(textoLote);
}

async function carregarPendencia(pendenciaId: string) {
  const { data, error } = await supabaseAdmin
    .from("agente_ia_pendencias")
    .select(
      "id, empresa_id, agente_id, conversa_id, contato_id, mensagem_ids, conteudo_agregado"
    )
    .eq("id", pendenciaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PendenciaCaptura | null) || null;
}

async function carregarContatoId(pendencia: PendenciaCaptura) {
  if (pendencia.contato_id) return pendencia.contato_id;

  const { data, error } = await supabaseAdmin
    .from("conversas")
    .select("contato_id")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("id", pendencia.conversa_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return String(data?.contato_id || "").trim() || null;
}

async function carregarMensagensEntrada(pendencia: PendenciaCaptura) {
  const ids = Array.isArray(pendencia.mensagem_ids)
    ? pendencia.mensagem_ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    const texto = String(pendencia.conteudo_agregado || "").trim();
    return texto
      ? ([
          {
            id: "agregado",
            conteudo: texto,
            created_at: new Date().toISOString(),
            metadata_json: {},
          },
        ] as Mensagem[])
      : [];
  }

  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, conteudo, created_at, metadata_json")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("conversa_id", pendencia.conversa_id)
    .eq("remetente_tipo", "contato")
    .in("id", ids)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []) as Mensagem[];
}

function mensagemEhDoAgente(mensagem: Mensagem, agenteId: string) {
  const metadata = mensagem.metadata_json || {};
  const origem = String(metadata.origem || "").trim();
  const id = String(metadata.agente_id || "").trim();
  return ["agente_ia", "agente_ia_negocio"].includes(origem) && id === agenteId;
}

async function carregarSolicitacaoAnterior(
  pendencia: PendenciaCaptura,
  primeiraEntradaEm: string
) {
  const { data, error } = await supabaseAdmin
    .from("mensagens")
    .select("id, conteudo, created_at, metadata_json")
    .eq("empresa_id", pendencia.empresa_id)
    .eq("conversa_id", pendencia.conversa_id)
    .eq("remetente_tipo", "bot")
    .lt("created_at", primeiraEntradaEm)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw new Error(error.message);

  const mensagensAgente = ((data || []) as Mensagem[]).filter((mensagem) =>
    mensagemEhDoAgente(mensagem, pendencia.agente_id)
  );
  if (!mensagensAgente.length) return null;

  const ultima = mensagensAgente[0];
  const ultimaMetadata = ultima.metadata_json || {};
  const execucaoId = String(ultimaMetadata.agente_execucao_id || "").trim();
  const lote = execucaoId
    ? mensagensAgente.filter(
        (mensagem) =>
          String(mensagem.metadata_json?.agente_execucao_id || "").trim() === execucaoId
      )
    : [ultima];
  const textoLote = lote
    .slice()
    .reverse()
    .map((mensagem) => String(mensagem.conteudo || "").trim())
    .filter(Boolean)
    .join("\n");
  const tipo = tipoCapturaDaMensagem(ultima, textoLote);

  if (!tipo) return null;

  return {
    tipo,
    mensagemId: ultima.id,
    agenteExecucaoId: execucaoId || null,
    texto: textoLote,
  };
}

function valorPrincipalDoContato(
  tipo: TipoCaptura,
  contato: { nome?: string | null; email?: string | null; telefone?: string | null }
) {
  if (tipo === "nome") return contato.nome || "";
  if (tipo === "email") return contato.email || "";
  if (tipo === "telefone") return contato.telefone || "";
  return "";
}

async function salvarCaptura(params: {
  pendencia: PendenciaCaptura;
  contatoId: string;
  tipo: TipoCaptura;
  valorOriginal: string;
  solicitacaoMensagemId: string;
  solicitacaoAgenteExecucaoId: string | null;
}) {
  const validacao = validarCaptura(params.tipo, params.valorOriginal);
  if (!validacao.valido) {
    return { capturado: false, motivo: "valor_invalido" as const };
  }

  const { data: contato, error: contatoError } = await supabaseAdmin
    .from("contatos")
    .select("id, nome, email, telefone")
    .eq("empresa_id", params.pendencia.empresa_id)
    .eq("id", params.contatoId)
    .maybeSingle();

  if (contatoError) throw new Error(contatoError.message);
  if (!contato) return { capturado: false, motivo: "contato_nao_encontrado" as const };

  const principal = valorPrincipalDoContato(params.tipo, contato);
  if (principal) {
    const validacaoPrincipal = validarCaptura(params.tipo, principal);
    if (
      validacaoPrincipal.valido &&
      validacaoPrincipal.valorNormalizado === validacao.valorNormalizado
    ) {
      return { capturado: false, motivo: "valor_ja_existe_no_contato" as const };
    }
  }

  const { data: existente, error: existenteError } = await supabaseAdmin
    .from("contato_informacoes_captura")
    .select("id, nome_campo")
    .eq("empresa_id", params.pendencia.empresa_id)
    .eq("contato_id", params.contatoId)
    .eq("tipo", params.tipo)
    .eq("valor_normalizado", validacao.valorNormalizado)
    .eq("ativo", true)
    .maybeSingle();

  if (existenteError) throw new Error(existenteError.message);
  if (existente) {
    return {
      capturado: false,
      motivo: "valor_ja_capturado" as const,
      registroId: existente.id,
      nomeCampo: existente.nome_campo,
    };
  }

  const { data: inserida, error: insertError } = await supabaseAdmin
    .from("contato_informacoes_captura")
    .insert({
      empresa_id: params.pendencia.empresa_id,
      contato_id: params.contatoId,
      tipo: params.tipo,
      nome_campo: "pendente",
      sequencia: null,
      valor: validacao.valorLimpo,
      valor_normalizado: validacao.valorNormalizado,
      precisao_data: validacao.precisaoData,
      variavel_origem:
        params.tipo === "nome" ? "nome_captura" : `agente_ia_captura_${params.tipo}`,
      ativo: true,
      metadata_json: {
        origem: "agente_ia",
        agente_id: params.pendencia.agente_id,
        tipo_registro: "captura_contato",
        valor_original: params.valorOriginal,
        valor_formatado: validacao.valorFormatado,
        formato_data: validacao.formatoData,
        solicitacao_mensagem_id: params.solicitacaoMensagemId,
        solicitacao_agente_execucao_id: params.solicitacaoAgenteExecucaoId,
      },
    })
    .select("id, nome_campo, sequencia")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { capturado: false, motivo: "valor_duplicado_concorrente" as const };
    }
    throw new Error(insertError.message);
  }

  return {
    capturado: true,
    motivo: "capturado" as const,
    registroId: inserida.id,
    nomeCampo: inserida.nome_campo,
    sequencia: inserida.sequencia,
    tipo: params.tipo,
  };
}

export async function processarCapturaPendenteAgente(pendenciaId: string) {
  const pendencia = await carregarPendencia(pendenciaId);
  if (!pendencia) return { capturado: false, motivo: "pendencia_nao_encontrada" as const };

  const contatoId = await carregarContatoId(pendencia);
  if (!contatoId) return { capturado: false, motivo: "sem_contato" as const };

  const entradas = await carregarMensagensEntrada(pendencia);
  if (!entradas.length) return { capturado: false, motivo: "sem_entrada" as const };

  const primeiraEntradaEm =
    entradas.map((item) => String(item.created_at || "")).filter(Boolean).sort()[0] ||
    new Date().toISOString();
  const solicitacao = await carregarSolicitacaoAnterior(pendencia, primeiraEntradaEm);
  if (!solicitacao) {
    return { capturado: false, motivo: "sem_solicitacao_captura" as const };
  }

  for (const entrada of entradas) {
    const valorOriginal = String(entrada.conteudo || "").trim();
    if (!valorOriginal) continue;

    const resultado = await salvarCaptura({
      pendencia,
      contatoId,
      tipo: solicitacao.tipo,
      valorOriginal,
      solicitacaoMensagemId: solicitacao.mensagemId,
      solicitacaoAgenteExecucaoId: solicitacao.agenteExecucaoId,
    });

    if (resultado.capturado || resultado.motivo !== "valor_invalido") {
      return resultado;
    }
  }

  return {
    capturado: false,
    motivo: "nenhuma_resposta_valida_para_captura" as const,
    tipo: solicitacao.tipo,
  };
}
