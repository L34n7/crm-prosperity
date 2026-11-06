/** Seleciona SOMENTE modelos confirmados pela FIPE no ano solicitado.
 * Função pura para validar famílias numerosas sem confiar em um teto de opções. */
export type OpcaoModeloAnoFipe={code:string;name:string};
export type ConsultaModelosAnoFipe={
  ano:OpcaoModeloAnoFipe;
  modelos:OpcaoModeloAnoFipe[];
};
export type ModeloDisponivelAnoFipe={
  modelo:OpcaoModeloAnoFipe;
  anos:OpcaoModeloAnoFipe[];
};

export function agruparModelosPorAnoFipe(
  candidatos:OpcaoModeloAnoFipe[],
  consultas:ConsultaModelosAnoFipe[],
):ModeloDisponivelAnoFipe[]{
  const porCodigo=new Map<string,OpcaoModeloAnoFipe>(
    candidatos.map(modelo=>[modelo.code,modelo] as const)
  );
  const encontrados=new Map<string,ModeloDisponivelAnoFipe>();
  for(const consulta of consultas){
    for(const item of consulta.modelos){
      const modelo=porCodigo.get(item.code);
      if(!modelo)continue;
      const existente=encontrados.get(item.code);
      if(existente){
        if(!existente.anos.some(ano=>ano.code===consulta.ano.code))
          existente.anos.push(consulta.ano);
      }else{
        encontrados.set(item.code,{modelo,anos:[consulta.ano]});
      }
    }
  }
  return [...encontrados.values()];
}
