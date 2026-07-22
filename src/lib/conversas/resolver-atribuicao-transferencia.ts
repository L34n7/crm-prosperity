import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizarEstrategiaTransferenciaAtendente,
  selecionarAtendenteTransferencia,
  type EstrategiaTransferenciaAtendente,
} from "@/lib/conversas/estrategia-transferencia";

const supabaseAdmin = getSupabaseAdmin();

const STATUS_CONVERSAS_EM_CARGA = [
  "aberta",
  "fila",
  "bot",
  "em_atendimento",
  "aguardando_cliente",
];

export type ResultadoAtribuicaoTransferencia = {
  setorId: string | null;
  responsavelId: string | null;
  atendenteNome: string | null;
  estrategiaSolicitada: EstrategiaTransferenciaAtendente;
  estrategiaAplicada: EstrategiaTransferenciaAtendente;
  fallbackMotivo: string | null;
};

function resultadoFila(params: {
  setorId: string | null;
  estrategia: EstrategiaTransferenciaAtendente;
  motivo?: string | null;
}): ResultadoAtribuicaoTransferencia {
  return {
    setorId: params.setorId,
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
  estrategia?: unknown;
  atendenteId?: unknown;
}): Promise<ResultadoAtribuicaoTransferencia> {
  const setorId = String(params.setorId || "").trim() || null;
  const atendenteId = String(params.atendenteId || "").trim() || null;
  const estrategia = normalizarEstrategiaTransferenciaAtendente(
    params.estrategia,
    atendenteId
  );

  if (!setorId) {
    return resultadoFila({
      setorId: null,
      estrategia,
      motivo: "setor_nao_informado",
    });
  }

  if (estrategia === "fila_setor") {
    return resultadoFila({ setorId, estrategia });
  }

  try {
    const { data: vinculos, error: vinculosError } = await supabaseAdmin
      .from("usuarios_setores")
      .select("usuario_id")
      .eq("setor_id", setorId);

    if (vinculosError) {
      throw vinculosError;
    }

    const usuarioIds = Array.from(
      new Set(
        (vinculos || [])
          .map((item) => String(item.usuario_id || "").trim())
          .filter(Boolean)
      )
    );

    if (usuarioIds.length === 0) {
      return resultadoFila({
        setorId,
        estrategia,
        motivo: "setor_sem_atendentes",
      });
    }

    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from("usuarios")
      .select("id, nome")
      .eq("empresa_id", params.empresaId)
      .eq("status", "ativo")
      .in("id", usuarioIds);

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
    }));

    const selecionado = selecionarAtendenteTransferencia({
      estrategia,
      candidatos,
      atendenteId,
    });

    if (!selecionado) {
      return resultadoFila({
        setorId,
        estrategia,
        motivo:
          estrategia === "atendente_especifico"
            ? "atendente_indisponivel_ou_fora_do_setor"
            : "sem_atendentes_ativos",
      });
    }

    return {
      setorId,
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
