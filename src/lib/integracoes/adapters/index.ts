import {
  buscarRegistroCrmProsperity,
  type ConexaoSistemaMapeado,
} from "./crm-prosperity";

export type { ConexaoSistemaMapeado } from "./crm-prosperity";

export async function buscarRegistroSistemaMapeado(params: {
  sistema: string;
  conexao: ConexaoSistemaMapeado;
  recurso: string;
  entidadeId: string;
}) {
  if (params.sistema === "crm_prosperity") {
    return buscarRegistroCrmProsperity({
      conexao: params.conexao,
      recurso: params.recurso,
      entidadeId: params.entidadeId,
    });
  }

  throw new Error(
    `O sistema ${params.sistema} ainda não possui adapter de consulta implementado.`,
  );
}
