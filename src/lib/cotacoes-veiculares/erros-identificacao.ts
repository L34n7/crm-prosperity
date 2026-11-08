/** Diagnósticos do catálogo FIPE: nunca tratar falta de modelo/ano como
 * indisponibilidade técnica, nem inventar opção inexistente.
 */
export type CodigoIdentificacaoFipe=
  "FIPE_MODELO_NAO_ENCONTRADO"|"FIPE_ANO_MODELO_NAO_ENCONTRADO";

export class ErroIdentificacaoModeloFipe extends Error{
  constructor(
    public readonly codigo:CodigoIdentificacaoFipe,
    public readonly perguntaCliente:string,
    detalhe:string,
  ){
    super(detalhe);
    this.name="ErroIdentificacaoModeloFipe";
  }
}

export function diagnosticarIdentificacaoFipe(params:{
  modelo:string;
  anoModelo:string;
  possuiModeloNaMarca:boolean;
}):ErroIdentificacaoModeloFipe{
  const nome=String(params.modelo||"").trim().slice(0,120);
  const ano=String(params.anoModelo||"").trim().slice(0,12);
  return params.possuiModeloNaMarca
    ?new ErroIdentificacaoModeloFipe(
      "FIPE_ANO_MODELO_NAO_ENCONTRADO",
      "Não encontrei esse modelo entre as versões FIPE do ano-modelo "+
        ano+". Pode confirmar o ano-modelo ou a versão?",
      "O catálogo contém o modelo "+nome+
        ", mas não registra a combinação para o ano-modelo "+ano+".",
    )
    :new ErroIdentificacaoModeloFipe(
      "FIPE_MODELO_NAO_ENCONTRADO",
      "Não localizei esse nome nas versões FIPE consultadas. "+
        "Pode confirmar o modelo e a versão do veículo?",
      "Não houve correspondência para "+nome+
        " nos modelos da marca e categoria consultadas.",
    );
}
