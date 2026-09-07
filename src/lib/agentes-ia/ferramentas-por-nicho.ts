export type ContextoNichoFerramenta = {
  codigo?: string | null;
  grupo?: string | null;
  nome?: string | null;
};

type RegraFerramentaNicho = {
  codigos?: readonly string[];
  grupos?: readonly string[];
};

// Somente capacidades realmente específicas de um domínio entram aqui.
// Ferramentas genéricas (agenda, serviços, contato, conhecimento, estoque etc.)
// continuam disponíveis para qualquer nicho porque podem ser úteis em mais de um setor.
const REGRAS_FERRAMENTAS_POR_NICHO: Readonly<Record<string, RegraFerramentaNicho>> = {
  consultar_imoveis: { codigos: ["imobiliaria"] },

  // Proteções para ferramentas clínicas atuais/futuras. Mesmo que uma dessas
  // ferramentas seja adicionada ao catálogo no futuro, uma empresa comercial
  // não poderá vê-la nem executá-la apenas por enviar o tipo manualmente.
  consultar_paciente: { grupos: ["saude"] },
  consultar_pacientes: { grupos: ["saude"] },
  consultar_prontuario: { grupos: ["saude"] },
  consultar_prontuarios: { grupos: ["saude"] },
  registrar_prontuario: { grupos: ["saude"] },
  atualizar_prontuario: { grupos: ["saude"] },
  consultar_odontograma: { codigos: ["odontologia"] },
  registrar_odontograma: { codigos: ["odontologia"] },
  consultar_podograma: { codigos: ["podologia"] },
  registrar_podograma: { codigos: ["podologia"] },
};

function normalizar(valor: unknown) {
  return String(valor || "").trim().toLocaleLowerCase("pt-BR");
}

export function ferramentaPermitidaParaNicho(
  tipo: string,
  nicho?: ContextoNichoFerramenta | null
) {
  const regra = REGRAS_FERRAMENTAS_POR_NICHO[String(tipo || "").trim()];
  if (!regra) return true;

  const codigo = normalizar(nicho?.codigo);
  const grupo = normalizar(nicho?.grupo);

  // Ferramentas especializadas ficam ocultas/bloqueadas quando a empresa não
  // possui nicho definido, evitando liberar capacidade de outro setor por falha
  // de cadastro.
  if (!codigo && !grupo) return false;

  const codigoPermitido =
    !regra.codigos?.length || regra.codigos.some((item) => normalizar(item) === codigo);
  const grupoPermitido =
    !regra.grupos?.length || regra.grupos.some((item) => normalizar(item) === grupo);

  return codigoPermitido && grupoPermitido;
}

export function filtrarFerramentasPorNicho<T extends { tipo: string }>(
  ferramentas: readonly T[],
  nicho?: ContextoNichoFerramenta | null
) {
  return ferramentas.filter((item) => ferramentaPermitidaParaNicho(item.tipo, nicho));
}
