import { descriptografarTokenIntegracao } from "@/lib/integracoes/credenciais";
import { buscarRecursoSistemaMapeado } from "@/lib/integracoes/sistemas-mapeados";

export type ConexaoSistemaMapeado = {
  id: string;
  empresa_id: string;
  tipo: string;
  base_url: string | null;
  token_criptografado: string | null;
  codigo_empresa: string | null;
  status: string;
};

function parametroIdentificador(recurso: string) {
  if (recurso === "assinaturas") return "empresa_id";
  if (recurso === "onboardings") return "integracao_id";
  return "id";
}

export async function buscarRegistroCrmProsperity(params: {
  conexao: ConexaoSistemaMapeado;
  recurso: string;
  entidadeId: string;
}) {
  const mapeamento = buscarRecursoSistemaMapeado("crm_prosperity", params.recurso);
  if (!mapeamento) {
    throw new Error(`Recurso ${params.recurso} não está mapeado no CRM Prosperity.`);
  }

  const baseUrl = String(params.conexao.base_url || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("A conexão CRM Prosperity está sem URL base.");

  const token = descriptografarTokenIntegracao(params.conexao.token_criptografado);
  if (!token) throw new Error("A conexão CRM Prosperity está sem token de acesso.");

  const url = new URL(`${baseUrl}${mapeamento.endpoint}`);
  url.searchParams.set(parametroIdentificador(params.recurso), params.entidadeId);
  url.searchParams.set("limite", "1");
  url.searchParams.set("pagina", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
      throw new Error(
        json?.error || `CRM Prosperity respondeu HTTP ${response.status}.`,
      );
    }

    const registros = Array.isArray(json.dados) ? json.dados : [];
    return registros[0] && typeof registros[0] === "object" ? registros[0] : null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("A API do CRM Prosperity não respondeu dentro de 12 segundos.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
