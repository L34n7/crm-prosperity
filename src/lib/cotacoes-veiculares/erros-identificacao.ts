/** Diagnósticos do catálogo FIPE: nunca tratar falta de modelo/ano como
 * indisponibilidade técnica, nem inventar opção inexistente.
 */
export type CodigoIdentificacaoFipe=
  "FIPE_MODELO_NAO_ENCONTRADO"|"FIPE_ANO_MODELO_NAO_ENCONTRADO";

export class ErroIdentificacaoModeloFipe extends Error{
  readonly codigo:CodigoIdentificacaoFipe;
  readonly perguntaCliente:string;
  constructor(codigo:CodigoIdentificacaoFipe,perguntaCliente:string,detalhe:string){
    super(detalhe);
    this.name="ErroIdentificacaoModeloFipe";
    this.codigo=codigo;
    this.perguntaCliente=perguntaCliente;
  }
}

export function diagnosticarIdentificacaoFipe(params:{
  modelo:string;
  anoModelo:string;
  possuiModeloNaMarca:boolean;
  anosDisponiveis?:string[];
}):ErroIdentificacaoModeloFipe{
  const nome=String(params.modelo||"").trim().slice(0,120);
  const ano=String(params.anoModelo||"").trim().slice(0,12);
  const pareceCodigoGeracao=/^[a-z]{1,2}\d{2,3}$/i.test(nome);
  const anos=(params.anosDisponiveis||[])
    .filter(valor=>/^(?:19|20)\d{2}$/.test(valor)).slice(0,7);
  const sugestao=anos.length
    ?" Encontrei registros para "+anos.join(", ")+
      ". Algum desses anos corresponde ao seu veículo?"
    :" Pode confirmar o ano-modelo ou a versão?";
  return params.possuiModeloNaMarca
    ?new ErroIdentificacaoModeloFipe(
      "FIPE_ANO_MODELO_NAO_ENCONTRADO",
      "Não encontrei esse modelo entre as versões FIPE do ano-modelo "+
        ano+"."+sugestao,
      "O catálogo contém o modelo "+nome+
        ", mas não registra a combinação para o ano-modelo "+ano+".",
    )
    :new ErroIdentificacaoModeloFipe(
      "FIPE_MODELO_NAO_ENCONTRADO",
      pareceCodigoGeracao
        ?"Não encontrei o código "+nome+
          " como nome de modelo FIPE. Qual é o nome comercial do veículo? "+
          "Assim posso consultar as versões reais do ano informado."
        :"Não localizei esse nome nas versões FIPE consultadas. "+
          "Pode confirmar o modelo e a versão do veículo?",
      "Não houve correspondência para "+nome+
        " nos modelos da marca e categoria consultadas.",
    );
}
