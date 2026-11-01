import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  consolidarInteressesIdentificadosIa,
  type CapturaInteresseIa,
  type EstadoInteressesIa,
} from "./interesses-identificados";

/**
 * Somente chamar após verificar autenticação, permissão, empresa e contato.
 * Consultas service_role sempre têm filtros explícitos de empresa e contato.
 */
export async function listarInteressesIdentificadosContato(
  empresaId: string,
  contatoId: string
) {
  const supabase = getSupabaseAdmin();

  // O limite evita listas de UUIDs ilimitadas no PostgREST.
  // A ordenação dá prioridade às conversas mais recentes.
  const { data: conversas, error: conversasError } = await supabase
    .from("conversas")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("contato_id", contatoId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (conversasError) throw new Error(conversasError.message);

  const ids = (conversas || []).map((item) => String(item.id));
  const autorizadas = new Set(ids);

  // Lotes pequenos evitam URLs excessivamente longas no PostgREST quando
  // um mesmo contato acumula centenas de conversas.
  const lotes: string[][] = [];
  for (let inicio = 0; inicio < ids.length; inicio += 60) {
    lotes.push(ids.slice(inicio, inicio + 60));
  }

  const [capturasResultado, ...estadosResultados] = await Promise.all([
    supabase
      .from("contato_informacoes_captura")
      .select("id,valor,capturado_em,metadata_json")
      .eq("empresa_id", empresaId)
      .eq("contato_id", contatoId)
      .eq("variavel_origem", "agente_ia_interesse_preferencia")
      .eq("ativo", true)
      .order("capturado_em", { ascending: false })
      .limit(300),
    ...lotes.map((lote) =>
      supabase
        .from("agente_ia_conversa_estados")
        .select("conversa_id,updated_at,estado_json")
        .eq("empresa_id", empresaId)
        .in("conversa_id", lote)
        .order("updated_at", { ascending: false })
        .limit(500)
    ),
  ]);
  if (capturasResultado.error) throw new Error(capturasResultado.error.message);

  const estados: EstadoInteressesIa[] = [];
  for (const resultado of estadosResultados) {
    if (resultado.error) throw new Error(resultado.error.message);
    estados.push(...((resultado.data || []) as EstadoInteressesIa[]));
  }

  return consolidarInteressesIdentificadosIa(
    estados,
    (capturasResultado.data || []) as CapturaInteresseIa[],
    autorizadas
  );
}
