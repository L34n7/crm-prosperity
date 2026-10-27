import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseAdmin = getSupabaseAdmin();
const PAGE_SIZE = 1000;

export type ContatoAudienciaEmail = {
  id: string;
  nome: string | null;
  email: string;
  telefone: string | null;
  empresa: string | null;
  origem: string | null;
  campanha: string | null;
  interesse: string | null;
};

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizarContato(item: Record<string, unknown>) {
  const email = String(item.email || "").trim().toLowerCase();

  if (!emailValido(email)) return null;

  return {
    id: String(item.id || ""),
    nome: item.nome ? String(item.nome) : null,
    email,
    telefone: item.telefone ? String(item.telefone) : null,
    empresa: item.empresa ? String(item.empresa) : null,
    origem: item.origem ? String(item.origem) : null,
    campanha: item.campanha ? String(item.campanha) : null,
    interesse: item.interesse ? String(item.interesse) : null,
  } satisfies ContatoAudienciaEmail;
}

function deduplicarPorEmail(contatos: ContatoAudienciaEmail[]) {
  const mapa = new Map<string, ContatoAudienciaEmail>();

  for (const contato of contatos) {
    if (!mapa.has(contato.email)) {
      mapa.set(contato.email, contato);
    }
  }

  return Array.from(mapa.values());
}

async function buscarContatosPorIds(empresaId: string, ids: string[]) {
  const resultado: ContatoAudienciaEmail[] = [];

  for (let inicio = 0; inicio < ids.length; inicio += 500) {
    const lote = ids.slice(inicio, inicio + 500);

    if (!lote.length) continue;

    const { data, error } = await supabaseAdmin
      .from("contatos")
      .select("id, nome, email, telefone, empresa, origem, campanha, interesse")
      .eq("empresa_id", empresaId)
      .in("id", lote)
      .not("email", "is", null)
      .neq("email", "");

    if (error) {
      throw new Error("Erro ao buscar contatos da audiência: " + error.message);
    }

    for (const item of data || []) {
      const contato = normalizarContato(item as Record<string, unknown>);
      if (contato) resultado.push(contato);
    }
  }

  return resultado;
}

async function buscarTodosContatosComEmail(empresaId: string) {
  const resultado: ContatoAudienciaEmail[] = [];
  let pagina = 0;

  while (true) {
    const inicio = pagina * PAGE_SIZE;
    const fim = inicio + PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("contatos")
      .select("id, nome, email, telefone, empresa, origem, campanha, interesse")
      .eq("empresa_id", empresaId)
      .not("email", "is", null)
      .neq("email", "")
      .order("id", { ascending: true })
      .range(inicio, fim);

    if (error) {
      throw new Error("Erro ao buscar contatos com e-mail: " + error.message);
    }

    for (const item of data || []) {
      const contato = normalizarContato(item as Record<string, unknown>);
      if (contato) resultado.push(contato);
    }

    if (!data || data.length < PAGE_SIZE) break;
    pagina += 1;
  }

  return resultado;
}

async function buscarContatosDaLista(params: {
  empresaId: string;
  listaId: string;
}) {
  const { data: lista, error: listaError } = await supabaseAdmin
    .from("contatos_listas")
    .select("id, nome")
    .eq("id", params.listaId)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (listaError) {
    throw new Error("Erro ao validar lista: " + listaError.message);
  }

  if (!lista) {
    throw new Error("Lista de contatos não encontrada.");
  }

  const ids: string[] = [];
  let pagina = 0;

  while (true) {
    const inicio = pagina * PAGE_SIZE;
    const fim = inicio + PAGE_SIZE - 1;

    const { data, error } = await supabaseAdmin
      .from("contatos_lista_membros")
      .select("contato_id")
      .eq("lista_id", params.listaId)
      .order("contato_id", { ascending: true })
      .range(inicio, fim);

    if (error) {
      throw new Error("Erro ao carregar membros da lista: " + error.message);
    }

    ids.push(...(data || []).map((item) => String(item.contato_id)));

    if (!data || data.length < PAGE_SIZE) break;
    pagina += 1;
  }

  return {
    lista,
    contatos: await buscarContatosPorIds(params.empresaId, ids),
  };
}

export async function resolverAudienciaEmail(params: {
  empresaId: string;
  tipo: "todos" | "lista" | "contatos";
  listaId?: string | null;
  contatoIds?: string[] | null;
}) {
  if (params.tipo === "todos") {
    return {
      descricao: "Todos os contatos com e-mail",
      contatos: deduplicarPorEmail(
        await buscarTodosContatosComEmail(params.empresaId)
      ),
    };
  }

  if (params.tipo === "lista") {
    if (!params.listaId) {
      throw new Error("Selecione uma lista de contatos.");
    }

    const resultado = await buscarContatosDaLista({
      empresaId: params.empresaId,
      listaId: params.listaId,
    });

    return {
      descricao: "Lista: " + resultado.lista.nome,
      contatos: deduplicarPorEmail(resultado.contatos),
    };
  }

  const ids = Array.from(
    new Set(
      (params.contatoIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  if (!ids.length) {
    throw new Error("Selecione pelo menos um contato.");
  }

  if (ids.length > 5000) {
    throw new Error("Selecione no máximo 5.000 contatos por campanha manual.");
  }

  return {
    descricao: ids.length + " contato(s) selecionado(s)",
    contatos: deduplicarPorEmail(
      await buscarContatosPorIds(params.empresaId, ids)
    ),
  };
}

export async function buscarEmailsSuprimidos(
  empresaId: string
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("email_suppressions")
    .select("email, empresa_id")
    .or("empresa_id.is.null,empresa_id.eq." + empresaId);

  if (error) {
    throw new Error("Erro ao consultar supressões: " + error.message);
  }

  return new Set(
    (data || [])
      .map((item) => String(item.email || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function recalcularMetricasCampanhaEmail(campanhaId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "email_marketing_recalcular_campanha",
    {
      p_campanha_id: campanhaId,
    }
  );

  if (error) {
    console.error("[EMAIL MARKETING] Falha ao recalcular campanha:", {
      campanhaId,
      erro: error.message,
    });
  }

  return data;
}
