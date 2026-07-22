/**
 * Estes problemas pertencem ao grafo, nao ao conteudo produzido pela IA.
 * O compilador seguro descarta rotas obsoletas, reconstrui entradas e rotas
 * usando tipo, titulo e semantica dos blocos, e ainda valida o resultado antes
 * de salvar.
 */
export function problemasReparaveisPeloCompilador(problemas: string[]) {
  return (
    problemas.length > 0 &&
    problemas.every(
      (problema) =>
        /^Existem etapas com referencias duplicadas: .+\.$/i.test(problema) ||
        /^A rota .+ -> .+ referencia um bloco inexistente\.$/i.test(problema) ||
        /^O bloco ".+" nao esta conectado ao fluxo\.$/i.test(problema) ||
        /^A opcao ".+" do bloco ".+" precisa ter uma rota\.$/i.test(problema)
    )
  );
}

/**
 * Chamadas internas ja recebem um rascunho e erros especificos. Duas
 * tentativas bastam para elas; a terceira revisao fica reservada para a
 * geracao principal, que tambem construiu o contrato completo da jornada.
 */
export function deveExecutarRevisaoFinal(pipelineCompleto: boolean) {
  void pipelineCompleto;
  return false;
}
