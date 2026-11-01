export type InteresseIdentificadoIa = {
  id: string;
  texto: string;
  conversa_id: string | null;
  data_referencia: string | null;
  tipo_data: "captura" | "atualizacao_estado";
  origem: "captura" | "historico";
};

export type EstadoInteressesIa = {
  conversa_id: string;
  updated_at: string | null;
  estado_json: unknown;
};

export type CapturaInteresseIa = {
  id: string;
  valor: string;
  capturado_em: string | null;
  metadata_json: unknown;
};

const PREFIXO_INTERESSE = /^interesse\/preferências coletado pelo agente ia\s*[:\-]?\s*/i;

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function textoVisivel(valor: unknown) {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ").replace(PREFIXO_INTERESSE, "").trim().slice(0, 240) : "";
}

function chaveTexto(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/**
 * Consolida capturas permanentes e interesses históricos por contato.
 * Mantém o vínculo da conversa e prefere o registro confirmado ao estado da IA.
 * A data do histórico indica última atualização do estado, não a captura exata.
 */
export function consolidarInteressesIdentificadosIa(
  estados: EstadoInteressesIa[],
  capturas: CapturaInteresseIa[],
  conversasAutorizadas: ReadonlySet<string>
): InteresseIdentificadoIa[] {
  const resultado = new Map<string, InteresseIdentificadoIa>();

  for (const captura of capturas) {
    const texto = textoVisivel(captura.valor);
    if (!texto) continue;
    const metadata = objeto(captura.metadata_json);
    const idInformado = typeof metadata.conversa_id === "string" ? metadata.conversa_id : "";
    const conversaId = conversasAutorizadas.has(idInformado) ? idInformado : null;
    const chave = `${conversaId || "sem-conversa"}|${chaveTexto(texto)}`;
    if (resultado.has(chave)) continue;
    resultado.set(chave, {
      id: `captura:${captura.id}`,
      texto,
      conversa_id: conversaId,
      data_referencia: captura.capturado_em,
      tipo_data: "captura",
      origem: "captura",
    });
  }

  for (const estado of estados) {
    if (!conversasAutorizadas.has(estado.conversa_id)) continue;
    const interesses = objeto(estado.estado_json).interesses;
    if (!Array.isArray(interesses)) continue;

    for (const valor of interesses) {
      const texto = textoVisivel(valor);
      if (!texto) continue;
      const chave = `${estado.conversa_id}|${chaveTexto(texto)}`;
      if (resultado.has(chave)) continue;
      resultado.set(chave, {
        id: `historico:${estado.conversa_id}:${chaveTexto(texto)}`,
        texto,
        conversa_id: estado.conversa_id,
        data_referencia: estado.updated_at,
        tipo_data: "atualizacao_estado",
        origem: "historico",
      });
    }
  }

  return Array.from(resultado.values()).sort((a, b) =>
    (b.data_referencia || "").localeCompare(a.data_referencia || "") || a.texto.localeCompare(b.texto, "pt-BR")
  );
}
