import { normalizarTelefoneBrasilParaWhatsApp } from "@/lib/contatos/normalizar-telefone";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type JsonObject = Record<string, unknown>;

type ContatoResumo = {
  id?: string | null;
  telefone?: string | null;
};

export type ConversaResumoComDisparo = {
  id: string;
  integracao_whatsapp_id?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  contatos?: ContatoResumo | null;
  tem_disparo_agendado_pendente?: boolean;
  disparo_agendado_pendente?: DisparoAgendadoResumo | null;
  [key: string]: unknown;
};

type DisparoAgendadoResumo = {
  id: string;
  executar_em: string;
  template_nome: string | null;
  origem?: "fluxo" | "agenda" | "automacao" | "conversa";
  tipo_agendamento?: string | null;
};

type CandidatoDisparo = DisparoAgendadoResumo & {
  conversa_id: string;
};

function objeto(valor: unknown): JsonObject {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as JsonObject)
    : {};
}

function one<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] || null;
  return valor || null;
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function telefoneChave(valor: unknown) {
  const digitos = texto(valor).replace(/\D/g, "");
  if (!digitos) return "";

  const normalizado = normalizarTelefoneBrasilParaWhatsApp(digitos) || digitos;
  return String(normalizado).replace(/\D/g, "");
}

function millis(valor: unknown) {
  const data = new Date(texto(valor)).getTime();
  return Number.isFinite(data) ? data : Number.POSITIVE_INFINITY;
}

function tipoAgendaLabel(tipo: unknown, canal: unknown) {
  const tipoNormalizado = texto(tipo);
  const canalNormalizado = texto(canal).toLowerCase();

  let label = "Automação da agenda";
  if (tipoNormalizado === "confirmacao") label = "Confirmação do agendamento";
  else if (tipoNormalizado === "lembrete") label = "Lembrete do agendamento";
  else if (tipoNormalizado === "aviso_responsavel") label = "Aviso ao responsável";
  else if (tipoNormalizado === "pos_atendimento") label = "Pós-atendimento";
  else if (tipoNormalizado === "lembrete_individual") {
    label = "Lembrete adicional do agendamento";
  }

  if (!canalNormalizado) return label;
  if (canalNormalizado === "whatsapp") return `${label} · WhatsApp`;
  if (canalNormalizado === "email") return `${label} · E-mail`;
  if (canalNormalizado === "sistema") return `${label} · Sistema`;
  if (canalNormalizado === "fluxo") return `${label} · Fluxo`;
  return `${label} · ${canalNormalizado}`;
}

function obterValorAninhado(
  raiz: JsonObject,
  caminhos: Array<Array<string>>
): string {
  for (const caminho of caminhos) {
    let atual: unknown = raiz;

    for (const chave of caminho) {
      atual = objeto(atual)[chave];
    }

    const valor = texto(atual);
    if (valor) return valor;
  }

  return "";
}

function chaveContatoIntegracao(contatoId: unknown, integracaoId: unknown) {
  const contato = texto(contatoId);
  const integracao = texto(integracaoId);
  return contato && integracao ? `${contato}|${integracao}` : "";
}

function chaveTelefoneIntegracao(telefone: unknown, integracaoId: unknown) {
  const numero = telefoneChave(telefone);
  const integracao = texto(integracaoId);
  return numero && integracao ? `${numero}|${integracao}` : "";
}

function escolherConversaMaisRecente(
  conversas: ConversaResumoComDisparo[]
): ConversaResumoComDisparo | null {
  if (!conversas.length) return null;

  return [...conversas].sort((a, b) => {
    const dataA = Math.max(
      new Date(a.last_message_at || 0).getTime() || 0,
      new Date(a.created_at || 0).getTime() || 0
    );
    const dataB = Math.max(
      new Date(b.last_message_at || 0).getTime() || 0,
      new Date(b.created_at || 0).getTime() || 0
    );
    return dataB - dataA;
  })[0];
}

export async function enriquecerConversasComDisparosAgendados<T extends ConversaResumoComDisparo>(params: {
  empresaId: string;
  conversas: T[];
}): Promise<T[]> {
  if (!params.conversas.length) return params.conversas;

  const supabase = getSupabaseAdmin();
  const idsConversas = new Set(params.conversas.map((item) => item.id));
  const porId = new Map(params.conversas.map((item) => [item.id, item]));
  const porContatoIntegracao = new Map<string, T[]>();
  const porTelefoneIntegracao = new Map<string, T[]>();
  const porContato = new Map<string, T[]>();

  for (const conversa of params.conversas) {
    const contatoId = texto(conversa.contatos?.id);
    const integracaoId = texto(conversa.integracao_whatsapp_id);
    const telefone = conversa.contatos?.telefone;

    const contatoIntegracao = chaveContatoIntegracao(contatoId, integracaoId);
    if (contatoIntegracao) {
      porContatoIntegracao.set(contatoIntegracao, [
        ...(porContatoIntegracao.get(contatoIntegracao) || []),
        conversa,
      ]);
    }

    const telefoneIntegracao = chaveTelefoneIntegracao(telefone, integracaoId);
    if (telefoneIntegracao) {
      porTelefoneIntegracao.set(telefoneIntegracao, [
        ...(porTelefoneIntegracao.get(telefoneIntegracao) || []),
        conversa,
      ]);
    }

    if (contatoId) {
      porContato.set(contatoId, [...(porContato.get(contatoId) || []), conversa]);
    }
  }

  const [agendamentosResult, agendaResult, rotinasResult] = await Promise.all([
    supabase
      .from("automacao_agendamentos")
      .select("id, tipo_agendamento, executar_em, status, payload_json")
      .eq("empresa_id", params.empresaId)
      .in("tipo_agendamento", ["disparo_template", "mensagem_manual"])
      .in("status", ["pendente", "executando"])
      .order("executar_em", { ascending: true }),
    supabase
      .from("agenda_automacao_execucoes")
      .select(`
        id, tipo, canal, executar_em, status, payload_json,
        agenda_agendamentos!inner (
          conversa_id, contato_id, telefone_cliente
        )
      `)
      .eq("empresa_id", params.empresaId)
      .in("status", ["pendente", "processando"])
      .order("executar_em", { ascending: true }),
    supabase
      .from("rotina_automacao_jobs")
      .select("id, titulo, canal, executar_em, status, contexto_json")
      .eq("empresa_id", params.empresaId)
      .in("canal", ["whatsapp", "email"])
      .in("status", ["pendente", "processando"])
      .order("executar_em", { ascending: true }),
  ]);

  const erro = agendamentosResult.error || agendaResult.error || rotinasResult.error;
  if (erro) {
    console.warn("[CONVERSAS] Não foi possível enriquecer badges de disparos agendados:", erro.message);
    return params.conversas;
  }

  const candidatos = new Map<string, CandidatoDisparo>();

  const registrar = (candidato: CandidatoDisparo | null) => {
    if (!candidato || !idsConversas.has(candidato.conversa_id)) return;

    const atual = candidatos.get(candidato.conversa_id);
    if (!atual || millis(candidato.executar_em) < millis(atual.executar_em)) {
      candidatos.set(candidato.conversa_id, candidato);
    }
  };

  const resolverConversa = (dados: {
    conversaId?: unknown;
    contatoId?: unknown;
    telefone?: unknown;
    integracaoId?: unknown;
  }): T | null => {
    const conversaId = texto(dados.conversaId);
    if (conversaId && porId.has(conversaId)) return porId.get(conversaId) || null;

    const integracaoId = texto(dados.integracaoId);
    const contatoId = texto(dados.contatoId);

    if (contatoId && integracaoId) {
      const conversa = escolherConversaMaisRecente(
        porContatoIntegracao.get(chaveContatoIntegracao(contatoId, integracaoId)) || []
      );
      if (conversa) return conversa as T;
    }

    const telefone = telefoneChave(dados.telefone);
    if (telefone && integracaoId) {
      const conversa = escolherConversaMaisRecente(
        porTelefoneIntegracao.get(chaveTelefoneIntegracao(telefone, integracaoId)) || []
      );
      if (conversa) return conversa as T;
    }

    if (contatoId) {
      const candidatas = porContato.get(contatoId) || [];
      if (candidatas.length === 1) return candidatas[0];
    }

    return null;
  };

  for (const item of agendamentosResult.data || []) {
    const payload = objeto(item.payload_json);
    const conversa = resolverConversa({
      conversaId: payload.conversa_id,
      contatoId: payload.contato_id,
      telefone: payload.numero_destino,
      integracaoId: payload.integracao_whatsapp_id,
    });
    if (!conversa) continue;

    const tipo = texto(item.tipo_agendamento);
    const label =
      texto(payload.template_nome) ||
      texto(payload.tipo_label) ||
      (tipo === "mensagem_manual" ? "Mensagem programada" : "Disparo agendado");

    registrar({
      conversa_id: conversa.id,
      id: texto(item.id),
      executar_em: texto(item.executar_em),
      template_nome: label,
      origem: tipo === "mensagem_manual" ? "conversa" : "fluxo",
      tipo_agendamento: tipo,
    });
  }

  for (const item of agendaResult.data || []) {
    const agendamento = one(item.agenda_agendamentos as unknown as JsonObject | JsonObject[] | null);
    const payload = objeto(item.payload_json);
    const conversa = resolverConversa({
      conversaId: agendamento?.conversa_id || payload.conversa_id,
      contatoId: agendamento?.contato_id || payload.contato_id,
      telefone: agendamento?.telefone_cliente || payload.numero_destino,
      integracaoId:
        payload.integracao_whatsapp_id || payload.whatsapp_integracao_id,
    });
    if (!conversa) continue;

    registrar({
      conversa_id: conversa.id,
      id: texto(item.id),
      executar_em: texto(item.executar_em),
      template_nome: tipoAgendaLabel(item.tipo, item.canal),
      origem: "agenda",
      tipo_agendamento: "agenda_automacao",
    });
  }

  for (const item of rotinasResult.data || []) {
    const contexto = objeto(item.contexto_json);
    const conversaId = obterValorAninhado(contexto, [
      ["conversa_id"],
      ["contexto_evento", "conversa_id"],
      ["contexto_evento", "conversa", "id"],
      ["conversa", "id"],
    ]);
    const contatoId = obterValorAninhado(contexto, [
      ["contato_id"],
      ["contexto_evento", "contato_id"],
      ["contexto_evento", "contato", "id"],
      ["contato", "id"],
    ]);
    const telefone = obterValorAninhado(contexto, [
      ["numero_destino"],
      ["telefone"],
      ["telefone_cliente"],
      ["contato_telefone"],
      ["contexto_evento", "cliente", "telefone"],
      ["contexto_evento", "contato", "telefone"],
      ["cliente", "telefone"],
      ["contato", "telefone"],
    ]);
    const integracaoId = obterValorAninhado(contexto, [
      ["integracao_whatsapp_id"],
      ["acao_config", "integracao_whatsapp_id"],
      ["contexto_evento", "integracao_whatsapp_id"],
    ]);

    const conversa = resolverConversa({
      conversaId,
      contatoId,
      telefone,
      integracaoId,
    });
    if (!conversa) continue;

    registrar({
      conversa_id: conversa.id,
      id: texto(item.id),
      executar_em: texto(item.executar_em),
      template_nome:
        texto(item.titulo) ||
        obterValorAninhado(contexto, [["template_nome"], ["tipo_label"]]) ||
        "Disparo da automação",
      origem: "automacao",
      tipo_agendamento: "rotina_automacao",
    });
  }

  return params.conversas.map((conversa) => {
    const candidato = candidatos.get(conversa.id);
    if (!candidato) {
      return {
        ...conversa,
        tem_disparo_agendado_pendente: false,
        disparo_agendado_pendente: null,
      };
    }

    return {
      ...conversa,
      tem_disparo_agendado_pendente: true,
      disparo_agendado_pendente: {
        id: candidato.id,
        executar_em: candidato.executar_em,
        template_nome: candidato.template_nome,
        origem: candidato.origem,
        tipo_agendamento: candidato.tipo_agendamento,
      },
    };
  });
}
