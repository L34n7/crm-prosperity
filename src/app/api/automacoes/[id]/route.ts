import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  getRequestAuditMetadata,
  registrarLogAuditoriaSeguro,
} from "@/lib/auditoria/logs";

const LIMITE_DELAY_SEGUNDOS = 23 * 60 * 60;
const TIPOS_NO_MIDIA = new Set([
  "enviar_imagem",
  "enviar_video",
  "enviar_audio",
  "enviar_arquivo",
]);
const CODIGO_ESTRUTURA_DESATUALIZADA = "ESTRUTURA_FLUXO_DESATUALIZADA";

const supabaseAdmin = getSupabaseAdmin();

type RegistroEstrutura = Record<string, unknown>;

type ResumoConexaoAuditoria = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
  rotulo: string | null;
  ordem: number;
  condicao_json: unknown;
  usar_ia: boolean;
  descricao_ia: string | null;
};

type AlteracaoConexaoAuditoria = {
  id: string;
  antes: ResumoConexaoAuditoria | null;
  depois: ResumoConexaoAuditoria | null;
};

type ResumoNoAuditoria = {
  id: string;
  tipo_no: string;
  titulo: string | null;
  descricao: string | null;
  configuracao_json: unknown;
  delay_segundos: number | null;
};

type AlteracaoNoAuditoria = {
  id: string;
  antes: ResumoNoAuditoria | null;
  depois: ResumoNoAuditoria | null;
};

function normalizarDelaySegundosApi(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;

  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error("O delay informado é inválido.");
  }

  const delayInteiro = Math.floor(numero);
  if (delayInteiro < 0) {
    throw new Error("O delay não pode ser negativo.");
  }

  if (delayInteiro > LIMITE_DELAY_SEGUNDOS) {
    throw new Error(
      "O tempo máximo de delay permitido é de 23 horas, equivalente a 82.800 segundos."
    );
  }

  return delayInteiro;
}

function idsUnicos(registros: RegistroEstrutura[]) {
  return Array.from(
    new Set(
      registros
        .map((registro) => String(registro?.id || "").trim())
        .filter(Boolean)
    )
  );
}

function respostaEstruturaDesatualizada(params: {
  tipo: "bloco" | "conexao";
  idsConflitantes: string[];
}) {
  const substantivo = params.tipo === "bloco" ? "blocos" : "conexões";

  return NextResponse.json(
    {
      ok: false,
      code: CODIGO_ESTRUTURA_DESATUALIZADA,
      error:
        `A tela estava com dados de outro fluxo (${params.idsConflitantes.length} ${substantivo}). ` +
        "A gravação foi cancelada para proteger os dados. Reabra o fluxo e tente novamente.",
      recarregar_estrutura: true,
      ids_conflitantes: params.idsConflitantes.slice(0, 20),
    },
    { status: 409 }
  );
}

async function validarPertencimentoEstrutura(params: {
  empresaId: string;
  fluxoId: string;
  nos: RegistroEstrutura[];
  conexoes: RegistroEstrutura[];
}) {
  const idsNos = idsUnicos(params.nos);
  const idsConexoes = idsUnicos(params.conexoes);

  const [nosExistentes, conexoesExistentes] = await Promise.all([
    idsNos.length > 0
      ? supabaseAdmin
          .from("automacao_nos")
          .select("id, empresa_id, fluxo_id")
          .in("id", idsNos)
      : Promise.resolve({ data: [], error: null }),
    idsConexoes.length > 0
      ? supabaseAdmin
          .from("automacao_conexoes")
          .select("id, empresa_id, fluxo_id")
          .in("id", idsConexoes)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (nosExistentes.error) {
    throw new Error(
      `Erro ao validar pertencimento dos blocos: ${nosExistentes.error.message}`
    );
  }

  if (conexoesExistentes.error) {
    throw new Error(
      `Erro ao validar pertencimento das conexões: ${conexoesExistentes.error.message}`
    );
  }

  const nosConflitantes = (nosExistentes.data || [])
    .filter(
      (no) =>
        String(no.empresa_id) !== params.empresaId ||
        String(no.fluxo_id) !== params.fluxoId
    )
    .map((no) => String(no.id));

  if (nosConflitantes.length > 0) {
    return respostaEstruturaDesatualizada({
      tipo: "bloco",
      idsConflitantes: nosConflitantes,
    });
  }

  const conexoesConflitantes = (conexoesExistentes.data || [])
    .filter(
      (conexao) =>
        String(conexao.empresa_id) !== params.empresaId ||
        String(conexao.fluxo_id) !== params.fluxoId
    )
    .map((conexao) => String(conexao.id));

  if (conexoesConflitantes.length > 0) {
    return respostaEstruturaDesatualizada({
      tipo: "conexao",
      idsConflitantes: conexoesConflitantes,
    });
  }

  return null;
}

function resumirConexaoAuditoria(
  conexao: RegistroEstrutura,
  index?: number
): ResumoConexaoAuditoria {
  return {
    id: String(conexao.id || ""),
    no_origem_id: String(conexao.no_origem_id || ""),
    no_destino_id: String(conexao.no_destino_id || ""),
    rotulo: conexao.rotulo ? String(conexao.rotulo) : null,
    ordem: Number(conexao.ordem || (index != null ? index + 1 : 0)),
    condicao_json: conexao.condicao_json || {},
    usar_ia: conexao.usar_ia === true,
    descricao_ia: conexao.descricao_ia
      ? String(conexao.descricao_ia).trim()
      : null,
  };
}

function listarConexoesAlteradas(
  conexoesAntes: RegistroEstrutura[],
  conexoesDepois: RegistroEstrutura[]
) {
  const antesPorId = new Map(
    conexoesAntes.map((conexao) => [
      conexao.id,
      resumirConexaoAuditoria(conexao),
    ])
  );
  const depoisPorId = new Map(
    conexoesDepois.map((conexao, index) => [
      conexao.id,
      resumirConexaoAuditoria(conexao, index),
    ])
  );
  const ids = new Set([...antesPorId.keys(), ...depoisPorId.keys()]);

  return Array.from(ids)
    .map((id) => {
      const antes = antesPorId.get(id) || null;
      const depois = depoisPorId.get(id) || null;
      return JSON.stringify(antes) === JSON.stringify(depois)
        ? null
        : { id: String(id), antes, depois };
    })
    .filter(
      (item): item is AlteracaoConexaoAuditoria => item !== null
    );
}

function resumirNoAuditoria(no: RegistroEstrutura): ResumoNoAuditoria {
  return {
    id: String(no.id || ""),
    tipo_no: String(no.tipo_no || ""),
    titulo: no.titulo ? String(no.titulo) : null,
    descricao: no.descricao ? String(no.descricao) : null,
    configuracao_json: no.configuracao_json || {},
    delay_segundos:
      no.tipo_no === "inicio"
        ? null
        : normalizarDelaySegundosApi(no.delay_segundos),
  };
}

function listarNosAlterados(
  nosAntes: RegistroEstrutura[],
  nosDepois: RegistroEstrutura[]
) {
  const antesPorId = new Map(
    nosAntes.map((no) => [no.id, resumirNoAuditoria(no)])
  );
  const depoisPorId = new Map(
    nosDepois.map((no) => [no.id, resumirNoAuditoria(no)])
  );
  const ids = new Set([...antesPorId.keys(), ...depoisPorId.keys()]);

  return Array.from(ids)
    .map((id) => {
      const antes = antesPorId.get(id) || null;
      const depois = depoisPorId.get(id) || null;
      return JSON.stringify(antes) === JSON.stringify(depois)
        ? null
        : { id: String(id), antes, depois };
    })
    .filter((item): item is AlteracaoNoAuditoria => item !== null);
}

function validarMidiasObrigatoriasNos(nos: RegistroEstrutura[]) {
  for (const no of nos) {
    const tipoNo = String(no?.tipo_no || "").trim();
    if (!TIPOS_NO_MIDIA.has(tipoNo)) continue;

    const configuracao: RegistroEstrutura =
      no?.configuracao_json &&
      typeof no.configuracao_json === "object" &&
      !Array.isArray(no.configuracao_json)
        ? (no.configuracao_json as RegistroEstrutura)
        : {};

    if (!String(configuracao.midia_url || "").trim()) {
      const titulo = String(no?.titulo || "Bloco de midia").trim();
      return `O bloco "${titulo}" precisa ter uma midia selecionada.`;
    }
  }

  return "";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    const [nosResult, conexoesResult] = await Promise.all([
      supabaseAdmin
        .from("automacao_nos")
        .select("*")
        .eq("fluxo_id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("automacao_conexoes")
        .select("*")
        .eq("fluxo_id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
    ]);

    if (nosResult.error) {
      return NextResponse.json(
        { ok: false, error: nosResult.error.message },
        { status: 500 }
      );
    }

    if (conexoesResult.error) {
      return NextResponse.json(
        { ok: false, error: conexoesResult.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      fluxo,
      nos: nosResult.data || [],
      conexoes: conexoesResult.data || [],
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auditMeta = getRequestAuditMetadata(req);
    const resultadoContexto = await getUsuarioContexto();

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();
    const nos: RegistroEstrutura[] = Array.isArray(body?.nos) ? body.nos : [];
    const conexoes: RegistroEstrutura[] = Array.isArray(body?.conexoes)
      ? body.conexoes
      : [];

    const { data: fluxo, error: fluxoError } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("id, empresa_id")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .single();

    if (fluxoError || !fluxo) {
      return NextResponse.json(
        { ok: false, error: "Fluxo não encontrado." },
        { status: 404 }
      );
    }

    for (const no of nos) {
      const noId = String(no?.id || "").trim();
      const tipoNo = String(no?.tipo_no || "").trim();

      if (!noId) {
        return NextResponse.json(
          { ok: false, error: "Existe um bloco sem ID válido no fluxo." },
          { status: 400 }
        );
      }

      if (!tipoNo) {
        return NextResponse.json(
          { ok: false, error: `O bloco ${noId} não possui um tipo válido.` },
          { status: 400 }
        );
      }

      if (tipoNo !== "inicio") {
        normalizarDelaySegundosApi(no.delay_segundos);
      }
    }

    const respostaConflito = await validarPertencimentoEstrutura({
      empresaId: String(usuario.empresa_id),
      fluxoId: id,
      nos,
      conexoes,
    });

    if (respostaConflito) return respostaConflito;

    const erroMidiaObrigatoria = validarMidiasObrigatoriasNos(nos);
    if (erroMidiaObrigatoria) {
      return NextResponse.json(
        { ok: false, error: erroMidiaObrigatoria },
        { status: 400 }
      );
    }

    const [nosAntesResult, conexoesAntesResult] = await Promise.all([
      supabaseAdmin
        .from("automacao_nos")
        .select(
          "id, tipo_no, titulo, descricao, configuracao_json, delay_segundos, ativo"
        )
        .eq("fluxo_id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true),
      supabaseAdmin
        .from("automacao_conexoes")
        .select(
          "id, no_origem_id, no_destino_id, rotulo, ordem, condicao_json, usar_ia, descricao_ia, ativo"
        )
        .eq("fluxo_id", id)
        .eq("empresa_id", usuario.empresa_id)
        .eq("ativo", true),
    ]);

    if (nosAntesResult.error || conexoesAntesResult.error) {
      throw new Error(
        nosAntesResult.error?.message ||
          conexoesAntesResult.error?.message ||
          "Erro ao carregar estrutura atual."
      );
    }

    const nosAntes = (nosAntesResult.data || []) as RegistroEstrutura[];
    const conexoesAntes = (conexoesAntesResult.data || []) as RegistroEstrutura[];
    const agora = new Date().toISOString();
    const conexoesAlteradas = listarConexoesAlteradas(conexoesAntes, conexoes);
    const nosAlterados = listarNosAlterados(nosAntes, nos);

    const nosParaSalvar = nos.map((no) => {
      const tipoNo = String(no.tipo_no || "");
      return {
        id: no.id,
        tipo_no: tipoNo,
        titulo: no.titulo || "Bloco",
        descricao: no.descricao || null,
        posicao_x: Math.round(Number(no.posicao_x || 0)),
        posicao_y: Math.round(Number(no.posicao_y || 0)),
        configuracao_json: no.configuracao_json || {},
        delay_segundos:
          tipoNo === "inicio"
            ? null
            : normalizarDelaySegundosApi(no.delay_segundos),
      };
    });

    const conexoesParaSalvar = conexoes.map((conexao, index) => ({
      id: conexao.id,
      no_origem_id: conexao.no_origem_id,
      no_destino_id: conexao.no_destino_id,
      condicao_json: conexao.condicao_json || {},
      rotulo: conexao.rotulo || null,
      ordem: Number(conexao.ordem || index + 1),
      usar_ia: conexao.usar_ia === true,
      descricao_ia: conexao.descricao_ia
        ? String(conexao.descricao_ia).trim()
        : null,
    }));

    const { error: salvarEstruturaError } = await supabaseAdmin.rpc(
      "salvar_estrutura_automacao_fluxo_atomica",
      {
        p_empresa_id: usuario.empresa_id,
        p_fluxo_id: id,
        p_usuario_id: usuario.id,
        p_nos: nosParaSalvar,
        p_conexoes: conexoesParaSalvar,
        p_atualizado_em: agora,
      }
    );

    if (salvarEstruturaError) {
      const errosDeValidacao = new Set([
        "21000",
        "22023",
        "22P02",
        "23503",
        "23514",
      ]);
      const status =
        salvarEstruturaError.code === "P0002"
          ? 404
          : errosDeValidacao.has(salvarEstruturaError.code || "")
            ? 400
            : 500;

      return NextResponse.json(
        {
          ok: false,
          error: `Erro ao salvar estrutura: ${salvarEstruturaError.message}`,
        },
        { status }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id!,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: id,
      acao: "fluxo_estrutura_salva",
      descricao: "Estrutura do fluxo salva",
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: {
        nos: nosAntes.length,
        conexoes: conexoesAntes.length,
        nos_alterados: nosAlterados.map((item) => item.antes),
        conexoes_alteradas: conexoesAlteradas.map((item) => item.antes),
      },
      depois: {
        nos: nos.length,
        conexoes: conexoes.length,
        nos_alterados: nosAlterados.map((item) => item.depois),
        conexoes_alteradas: conexoesAlteradas.map((item) => item.depois),
      },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const mensagem = error instanceof Error ? error.message : "Erro interno.";
    const erroDeValidacaoDelay =
      mensagem.includes("delay") ||
      mensagem.includes("23 horas") ||
      mensagem.includes("82.800 segundos");

    return NextResponse.json(
      { ok: false, error: mensagem },
      { status: erroDeValidacaoDelay ? 400 : 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const resultadoContexto = await getUsuarioContexto();
    const auditMeta = getRequestAuditMetadata(req);

    if (!resultadoContexto.ok) {
      return NextResponse.json(
        { ok: false, error: resultadoContexto.error },
        { status: resultadoContexto.status }
      );
    }

    const { usuario } = resultadoContexto;
    const body = await req.json();

    if (!usuario?.empresa_id) {
      return NextResponse.json(
        { ok: false, error: "Usuário sem empresa vinculada." },
        { status: 400 }
      );
    }

    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do fluxo é obrigatório." },
        { status: 400 }
      );
    }

    const { data: fluxoAntes } = await supabaseAdmin
      .from("automacao_fluxos")
      .select("*")
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("automacao_fluxos")
      .update({
        status: "arquivado",
        updated_at: new Date().toISOString(),
        atualizado_por: usuario.id,
      })
      .eq("id", id)
      .eq("empresa_id", usuario.empresa_id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao apagar fluxo: ${error.message}` },
        { status: 500 }
      );
    }

    await registrarLogAuditoriaSeguro({
      empresa_id: usuario.empresa_id,
      categoria: "fluxos",
      entidade: "fluxo",
      entidade_id: id,
      acao: "fluxo_arquivado",
      descricao: `Fluxo ${fluxoAntes?.nome || id} arquivado`,
      usuario_id: usuario.id,
      usuario_nome: usuario.nome,
      usuario_email: usuario.email,
      antes: fluxoAntes,
      depois: { status: "arquivado" },
      ip: auditMeta.ip,
      user_agent: auditMeta.user_agent,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      },
      { status: 500 }
    );
  }
}
