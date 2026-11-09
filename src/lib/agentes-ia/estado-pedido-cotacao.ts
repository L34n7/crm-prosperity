import {
  DADOS_COTACAO_VAZIOS,normalizarDadosCotacao,
  type DadosCotacaoConfirmados,
} from "./pedido-cotacao.ts";

/** Snapshot confirmado da ÚLTIMA proposta efetivamente gerada. Os dados
 * nunca vêm de uma resposta textual improvisada pelo modelo ou do resumo
 * de conversas mais antigas. Faz parte do JSON persistido da conversa.
 */
export type PropostaCotacaoConfirmada={
  pedido_id:string;
  modelo:string;
  ano_modelo:string;
  uso:DadosCotacaoConfirmados["uso"];
  veiculo_fipe:string;
};

export function normalizarPropostaCotacao(
  valor:unknown,
):PropostaCotacaoConfirmada|null{
  if(!valor||typeof valor!=="object")return null;
  const v=valor as Record<string,unknown>;
  const modelo=String(v.modelo||"").trim().slice(0,160);
  const ano=String(v.ano_modelo||"").trim();
  const uso=normalizarDadosCotacao({uso:v.uso}).uso;
  if(!modelo||!(/^(?:19|20)\d{2}$/.test(ano)))return null;
  return {
    pedido_id:String(v.pedido_id||"").slice(0,72),
    modelo,ano_modelo:ano,uso,
    veiculo_fipe:String(v.veiculo_fipe||"").trim().slice(0,180),
  };
}

/** O backend só cria o snapshot quando a ferramenta salvou a proposta. */
export function propostaEmitidaCotacao(params:{
  pedidoId:string;
  modeloConsultado:string;
  veiculoFipe:string;
  ano:number|string;
  uso:string|null;
}):PropostaCotacaoConfirmada|null{
  return normalizarPropostaCotacao({
    pedido_id:params.pedidoId,
    modelo:params.modeloConsultado||params.veiculoFipe,
    ano_modelo:String(params.ano||""),
    uso:params.uso,
    veiculo_fipe:params.veiculoFipe,
  });
}

/** Uma correção de ano ou versão de proposta EMITIDA começa do snapshot,
 * não das últimas mensagens da conversa. A solicitação atual pode então
 * substituir somente a informação pedida pelo cliente.
 */
export function dadosDaPropostaParaCorrecao(
  proposta:PropostaCotacaoConfirmada|null,
):DadosCotacaoConfirmados{
  if(!proposta)return {...DADOS_COTACAO_VAZIOS};
  return {
    modelo:proposta.modelo,
    ano_modelo:proposta.ano_modelo,
    uso:proposta.uso,
  };
}

/** Ao trocar a família, somente ano/uso podem ser preservados se o cliente
 * pedir correção do modelo do MESMO veículo. Para um pedido "outro veículo"
 * todos os dados são apagados.
 */
export function dadosAposTrocarModelo(
  dados:DadosCotacaoConfirmados,
  novoVeiculo:boolean,
):DadosCotacaoConfirmados{
  return novoVeiculo?{...DADOS_COTACAO_VAZIOS}:{
    ...normalizarDadosCotacao(dados),modelo:null,
  };
}
