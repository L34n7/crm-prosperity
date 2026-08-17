import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizarEstrategiaTransferenciaAtendente,
  selecionarAtendenteTransferencia,
  type EstrategiaTransferenciaAtendente,
} from "@/lib/conversas/estrategia-transferencia";
import {
  listarIdsUsuariosAdministradoresDaEmpresa,
  usuarioEhAdministradorDaEmpresa,
} from "@/lib/usuarios/administradores";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_CONVERSAS_EM_CARGA = [
  "aberta",
  "fila",
  "bot",
  "em_atendimento",
  "aguardando_cliente",
];

export type EscopoFila = "setor" | "geral";

function configuracaoAtiva(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

// CRM_QUEUE_SCOPE_V1
export type ResultadoAtribuicaoTransferencia = {
  setorId: string | null;
  escopoFila: EscopoFila;
  responsavelId: string | null;
  atendenteNome: string | null;
  estrategiaSolicitada: EstrategiaTransferenciaAtendente;
  estrategiaAplicada: EstrategiaTransferenciaAtendente;
  fallbackMotivo: string | null;
};

function resultadoFila(params: {
  setorId: string | null;
  estrategia: EstrategiaTransferenciaAtendente;
  escopoFila?: EscopoFila;
  motivo?: string | null;
}): ResultadoAtribuicaoTransferencia {
  return {
    setorId: params.setorId,
    escopoFila:
      params.escopoFila || (params.setorId ? "setor" : "geral"),
    responsavelId: null,
    atendenteNome: null,
    estrategiaSolicitada: params.estrategia,
    estrategiaAplicada: "fila_setor",
    fallbackMotivo: params.motivo || null,
  };
}

export async function resolverAtribuicaoTransferencia(params: {
  empresaId: string;
  setorId?: string | null;
  escopoFila?: unknown;
  estrategia?: unknown;
  atendenteId?: unknown;
  incluirAdministradores?: unknown;
}): Promise<ResultadoAtribuicaoTransferencia> {
  const escopoFila: EscopoFila =
    String(params.escopoFila || "").trim() === "geral"
      ? "geral"
      : "setor";
  const setorId =
    escopoFila === "geral"
      ? null
      : String(params.setorId || "").trim() || null;
  const atendenteId = String(params.atendenteId || "").trim() || null;
  const estrategia = normalizarEstrategiaTransferenciaAtendente(
    params.estrategia,
    atendenteId
  );
  const incluirAdministradores = configuracaoAtiva(
    params.incluirAdministradores
  );

  if (escopoFila === "geral") {
    return resultadoFila({
      setorId: null,
      escopoFila: "geral",
      estrategia,
    });
  }

  if (!setorId) {
    return resultadoFila({
      setorId: null,
      escopoFila: "geral",
      estrategia,
      motivo: "setor_nao_informado_fallback_fila_geral",
    });
  }

  if (estrategia === "fila_setor") {
    return resultadoFila({ setorId, estrategia });
  }

  try {
    if (estrategia === "atendente_especifico") {
      if (!atendenteId) {
        return resultadoFila({
          setorId,
          estrategia,
          motivo: "atendente_nao_informado",
        });
      }

      const { data: atendente, error: atendenteError } = await supabaseAdmin
        .from("usuarios")
        .select("id, nome")
        .eq("id", atendenteId)
        .eq("empresa_id", params.empresaId)
        .eq("status", "ativo")
        .maybeSingle();

      if (atendenteError) {
        throw atendenteError;
      }

      if (!atendente) {
        return resultadoFila({
          setorId,
          estrategia,
          motivo: "atendente_indisponivel",
        });
      }

      const [ehAdministrador, vinculoSetor] = await Promise.all([
        usuarioEhAdministradorDaEmpresa({
          usuarioId: atendente.id,
          empresaId: params.empresaId,
        }),
        supabaseAdmin
          .from("usuarios_setores")
          .select("usuario_id")
          .eq("usuario_id", atendente.id)
          .eq("setor_id", setorId)
          .maybeSingle(),
      ]);

      if (vinculoSetor.error) {
        throw vinculoSetor.error;
      }

      if (!ehAdministrador && !vinculoSetor.data) {
        return resultadoFila({
          setorId,
          estrategia,
          motivo: "atendente_fora_do_setor",
        });
      }

      return {
        setorId,
        escopoFila: "setor",
        responsavelId: atendente.id,
        atendenteNome: atendente.nome || null,
        estrategiaSolicitada: estrategia,
        estrategiaAplicada: estrategia,
        fallbackMotivo: null,
      };
    }

    const { data: vinculos, error: vinculosError } = await supabaseAdmin
      .from("usuarios_setores")
      .select("usuario_id")
      .eq("setor_id", setorId);

    if (vinculosError) {
      throw vinculosError;
    }

    const usuarioIdsVinculados = Array.from(
      new Set(
        (vinculos || [])
          .map((item) => String(item.usuario_id || "").trim())
          .filter(Boolean)
      )
    );

    const administradores = new Set(
      await listarIdsUsuariosAdministradoresDaEmpresa(params.empresaId)
    );
    const usuarioIdsNormaisDoSetor = usuarioIdsVinculados.filter(
      (usuarioId) => !administradores.has(usuarioId)
    );
    const usuarioIdsDistribuicao = Array.from(
      new Set(
        incluirAdministradores
          ? [...usuarioIdsNormaisDoSetor, ...administradores]
          : usuarioIdsNormaisDoSetor
      )
    );

    if (usuarioIdsDistribuicao.length === 0) {
      return resultadoFila({
        setorId,
        estrategia,
        motivo: "setor_sem_atendentes_distribuiveis",
      });
    }

    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from("usuarios")
      .select("id, nome")
      .eq("empresa_id", params.empresaId)
      .eq("status", "ativo")
      .in("id", usuarioIdsDistribuicao);

    if (usuariosError) {
      throw usuariosError;
    }

    const cargas = new Map<string, number>();
    const idsAtivos = (usuarios || []).map((usuario) => usuario.id);

    if (estrategia === "menos_conversas" && idsAtivos.length > 0) {
      const { data: conversas, error: conversasError } = await supabaseAdmin
        .from("conversas")
        .select("responsavel_id")
        .eq("empresa_id", params.empresaId)
        .in("responsavel_id", idsAtivos)
        .in("status", STATUS_CONVERSAS_EM_CARGA);

      if (conversasError) {
        throw conversasError;
      }

      for (const conversa of conversas || []) {
        const responsavelId = String(conversa.responsavel_id || "").trim();
        if (!responsavelId) continue;
        cargas.set(responsavelId, (cargas.get(responsavelId) || 0) + 1);
      }
    }

    const candidatos = (usuarios || []).map((usuario) => ({
      id: usuario.id,
      nome: usuario.nome,
      cargaAtual: cargas.get(usuario.id) || 0,
      isAdministrador: administradores.has(usuario.id),
    }));

    const selecionado = selecionarAtendenteTransferencia({
      estrategia,
      candidatos,
      atendenteId,
      incluirAdministradores,
    });

    if (!selecionado) {
      return resultadoFila({
        setorId,
        estrategia,
        motivo: "sem_atendentes_ativos",
      });
    }

    return {
      setorId,
      escopoFila: "setor",
      responsavelId: selecionado.id,
      atendenteNome: selecionado.nome || null,
      estrategiaSolicitada: estrategia,
      estrategiaAplicada: estrategia,
      fallbackMotivo: null,
    };
  } catch (error) {
    console.error(
      "[TRANSFERENCIA_ATENDENTE] Falha ao selecionar atendente; usando fila do setor:",
      error
    );

    return resultadoFila({
      setorId,
      estrategia,
      motivo: "erro_ao_distribuir_atendente",
    });
  }
}
