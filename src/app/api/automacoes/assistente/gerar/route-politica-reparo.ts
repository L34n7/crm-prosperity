/**
 * Estes problemas pertencem ao grafo, nao ao conteudo produzido pela IA.
 * O compilador seguro reconstrui entradas e rotas usando tipo, titulo e
 * semantica dos blocos, e ainda valida o resultado antes de salvar.
 */
export function problemasReparaveisPeloCompilador(problemas: string[]) {
  return (
    problemas.length > 0 &&
    problemas.every(
      (problema) =>
        /^O bloco ".+" nao esta conectado ao fluxo\.$/i.test(problema) ||
        /^A opcao ".+" do bloco ".+" precisa ter uma rota\.$/i.test(problema)
    )
  );
}
