import {identificarAjusteCotacao, textoPositivoDaCorrecao} from "./ajustes-cotacao";

/**
 * Detecta correção de veículo/versão após cotação sem tratá-la como
 * aceite comercial. A presença de uma proposta anterior deve ser
 * validada pelo runtime antes de reabrir a ferramenta.
 */
export function clienteCorrigiuVersaoCotacao(mensagem: string): boolean {
  const texto = String(mensagem || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  const ajuste=identificarAjusteCotacao(mensagem,true);
  return /\b(?:nao e|nao foi|nao corresponde|nao esta correto|esta errado|ficou errado|veio errado)\b.{0,55}\b(?:modelo|versao|motor|motorizacao|cambio|veiculo|carro)\b/.test(texto) ||
    /\b(?:modelo|versao|motor|motorizacao|cambio|veiculo|carro)\b.{0,35}\b(?:errado|errada|incorreto|incorreta|diferente|correto e|correta e|e na verdade|na verdade e)\b/.test(texto) ||
    /\b(?:corrigir|corrija|correcao|refazer|refaca|recalcular|ajustar)\b.{0,50}\b(?:cotacao|versao|modelo|motor|motorizacao|veiculo)\b/.test(texto) ||
    /\b(?:na verdade|nao|o correto e|a correta e)\b.{0,25}\b(?:e|eh|tem|possui)\s+\d[.,]\d\b/.test(texto) ||
    /\b(?:motor|motorizacao|versao|modelo|cambio)\s+(?:correto\s+|correta\s+)?(?:e|eh)\s+\d[.,]\d\b/.test(texto) ||
    // Correções da tração/eixos, sem presumir que "4x2" seja motor 4.2.
    (/\b(?:confundi|errei|corrig|troquei|enganei|na verdade|corret[oa]|cert[oa]|tracao|nao e|nao era|nao foi|mas e|era)\b/.test(texto) &&
     /\b(?:4|6|8|10|12)\s*x\s*(?:2|4|6|8)\b/.test(texto)) ||
    /\bnao\s+(?:4|6|8|10|12)\s*x\s*(?:2|4|6|8)\b/.test(texto) ||
    // Corrigir ano, modelo, câmbio ou uma seleção anterior também exige
    // retomar um recálculo prometido (não apenas correções de tração).
    Boolean(ajuste && ajuste.acao!=="atendente");
}

/** Última tração POSITIVAMENTE corrigida pelo cliente, não pela IA.
 * Descarta trechos negados: "não é 4x2, é 8x2" -> 8x2;
 * "é 8x2, não 4x2" -> 8x2; "não é 4x2" -> sem versão suficiente.
 */
export function tracaoCorrigidaCotacao(mensagens:string[]):string|null{
  const inicio=mensagens.findLastIndex(clienteCorrigiuVersaoCotacao);
  if(inicio<0)return null;
  const correcoes=mensagens.slice(inicio).map(mensagem=>
    String(mensagem||"").normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/×/g,"x")
      .replace(/\b(4|6|8|10|12)\s*x\s*([2468])\b/g,"$1x$2")
  );
  const padraoTracao=/\b(?:4|6|8|10|12)x(?:2|4|6|8)\b/g;
  for(let i=correcoes.length-1;i>=0;i--){
    const semNegacoes=textoPositivoDaCorrecao(correcoes[i]);
    const tracoes=[...semNegacoes.matchAll(padraoTracao)].map(m=>m[0]);
    if(tracoes.length)return tracoes.at(-1)||null;
  }
  return null;
}

/** Remove qualquer tração antiga do modelo antes de aplicar a correção.
 * Não toca motor decimal (2.0), potência (460), câmbio ou carroceria.
 */
export function aplicarTracaoCorrigidaCotacao(modelo:string,tracao:string|null):string{
  if(!tracao)return String(modelo||"").trim();
  const atual=String(modelo||"").trim();
  const antiga=/\b(?:4|6|8|10|12)\s*[x×]\s*(?:2|4|6|8)\b/i;
  if(antiga.test(atual))return atual.replace(antiga,tracao)
    .replace(/\s+/g," ").trim();
  return [atual,tracao].filter(Boolean).join(" ");
}

/** Recuperar a versão FIPE ANTERIOR só quando o cliente corrigiu
 * exclusivamente a tração; preserva carroceria, diesel e acabamento
 * confirmados na proposta salva, mas exige mesmo modelo e ano.
 */
export function versaoAnteriorComTracaoCorrigida(params:{
  veiculoAnterior:string;anoAnterior:number|null;
  modeloConfirmado:string;anoConfirmado:string;tracao:string;
  mensagemCorrecao:string;
}):string|null{
  const normalizar=(texto:string)=>String(texto||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  const texto=normalizar(params.mensagemCorrecao)
    .replace(/\b(?:4|6|8|10|12)\s*x\s*(?:2|4|6|8)\b/g," ");
  const comuns=new Set(("confundi confusao errei erro errado errada desculpe foi mal " +
    "nao e era eh foi mas correto correta certo certa o a de do da apenas so " +
    "tracao eixo eixos configuracao verdade na por para agora mudou trocar troquei " +
    "sim simples anteriormente falei falei errado isso mesma mesmo").split(" "));
  const palavrasAdicionais=texto.split(" ").filter(p=>p&&!comuns.has(p));
  if(palavrasAdicionais.length||Number(params.anoAnterior)!==Number(params.anoConfirmado))
    return null;
  const modelo=normalizar(params.modeloConfirmado);
  const anterior=normalizar(params.veiculoAnterior);
  const tokens=modelo.split(" ").filter(p=>p.length>=2);
  if(!modelo||!anterior||!tokens.length||
     !tokens.every(t=>anterior.split(" ").includes(t))||
     !/\b(?:4|6|8|10|12)\s*x\s*(?:2|4|6|8)\b/i.test(params.veiculoAnterior))
    return null;
  return aplicarTracaoCorrigidaCotacao(params.veiculoAnterior,params.tracao);
}

/** Uma promessa de recalcular NÃO é uma cotação emitida.
 * Identifica inclusive "vou recalcular para o Volvo" sem dizer "cotação".
 */
export function promessaCotacaoSemFerramenta(mensagens:string[]):boolean{
  return mensagens.some(mensagem=>{
    const texto=String(mensagem||"").normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const acao=/\b(?:vou|irei|estou|vamos|ja estou|ja vamos)\s+(?:(?:agora|ja|so)\s+)?(?:consultar|verificar|gerar|calcular|recalcular|refazer|preparar|prosseguir|enviar|buscando|consultando|recalculando|verificando|revisar|atualizar)\b/.test(texto);
    return acao&&( /\b(?:cotacao|orcamento|simulacao|preco|valores|proposta)\b/.test(texto)||
      /\b(?:recalcular|recalculando|refazer|refazendo)\b/.test(texto));
  });
}

/** Retoma APENAS quando uma correção ocorreu depois da última proposta
 * e o agente prometeu recalcular sem executar. Não recota por "ok" comum.
 */
export function recalculoPrometidoAposCorrecao(params:{
  mensagensAposProposta:Array<{role:"user"|"assistant";content:string}>;
  ultimaRespostaAgente:string;
  mensagemAtual:string;
}):boolean{
  return params.mensagensAposProposta.some(item=>
    item.role==="user"&&clienteCorrigiuVersaoCotacao(item.content)
  )&&promessaCotacaoSemFerramenta([params.ultimaRespostaAgente])
    &&clienteCobraRecalculoPrometido(params.mensagemAtual);
}

/** Uma confirmação curta após promessa de recálculo não pode virar
 * somente mais uma mensagem prometendo o mesmo resultado.
 */
export function clienteCobraRecalculoPrometido(mensagem:string):boolean{
  const texto=String(mensagem||"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[.!?,;:]/g," ").replace(/\s+/g," ").trim();
  return /^(?:ok|okay|sim|isso|pode|pode sim|pode gerar|pode recalcular|pode fazer|confirmo|confirmado|certo|estou aguardando|continuo aguardando|aguardando|aguardo|ainda estou aguardando|e a cotacao|cade a cotacao|ja gerou|ja ficou pronta|pode enviar)$/.test(texto);
}

/**
 * A motorização informada APÓS uma correção prevalece sobre a utilizada
 * na proposta rejeitada. Nunca deduzir motorização a partir do valor FIPE.
 */
export function motorizacaoCorrigidaCotacao(mensagens: string[]): string | null {
  const ultimaCorrecao = mensagens.findLastIndex((item) =>
    clienteCorrigiuVersaoCotacao(item)
  );
  if (ultimaCorrecao < 0) return null;
  const mensagensDaCorrecao = mensagens.slice(ultimaCorrecao);
  const motores = mensagensDaCorrecao.flatMap((texto) =>
    [...textoPositivoDaCorrecao(texto).matchAll(/\b([1-9][.,][0-9])\b/g)].map((m) =>
      m[1].replace(",", ".")
    )
  );
  return motores.at(-1) || null;
}

export function aplicarMotorizacaoCorrigida(modelo: string, motor: string | null): string {
  if (!motor) return modelo;
  const atual = modelo.match(/\b[1-9][.,][0-9]\b/);
  if (atual) return modelo.replace(atual[0], motor);
  return (modelo.trim() + " " + motor).trim();
}

/** "Não é esse modelo" isolado pede informação, não nova cotação especulativa. */
export function versaoCorrigidaFoiInformada(mensagens: string[]): boolean {
  const ultimaCorrecao = mensagens.findLastIndex((item) =>
    clienteCorrigiuVersaoCotacao(item)
  );
  if (ultimaCorrecao < 0) return true;
  const novas = mensagens.slice(ultimaCorrecao).map(textoPositivoDaCorrecao);
  return Boolean(tracaoCorrigidaCotacao(mensagens))||novas.some((texto) =>
    /\b[1-9][.,][0-9]\b/.test(texto) ||
    /\b(?:automatico|automatica|manual|mecanico|mecanica|cvt|tiptronic|dsg|ltz|lxs|lx|ex|exl|xlt|xls|xl|limited|comfortline|highline|trendline|sportline|r.line|gls|gl|cd|challenge|milenium|milenio|millennium|express)\b/.test(texto) ||
    /\b(?:versao|modelo)\s+(?:certo|correto|certa|correta|e|eh)\s+\S+/.test(texto)
  );
}

/** Seleção do câmbio mais recente do CLIENTE no pedido corrente.
 * Se a pessoa disse "automático" e depois "manual", vale o último.
 */
export function cambioInformadoCotacao(
  mensagens: string[],
): "automatico" | "manual" | null {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const mensagem=String(mensagens[i]||"");
    const texto=textoPositivoDaCorrecao(mensagem);
    const opcoes = [...texto.matchAll(
      /\b(automatic[oa]|auto|aut\.?|tiptronic|dsg|cvt|manual|mecanic[oa]|mec\.?)\b/g
    )].map((m) => m[1]);
    if (opcoes.length) {
      const ultima = opcoes.at(-1) || "";
      return /^(manual|mec)/.test(ultima) ? "manual" : "automatico";
    }
    // "Não é automático" NÃO confirma automático nem autoriza reusar
    // o câmbio de mensagens mais antigas.
    if(identificarAjusteCotacao(mensagem)?.acao==="cambio")return null;
  }
  return null;
}

/** Garante que o modelo consultado não contradiga o câmbio confirmado.
 * O nome da versão ainda será validado pela FIPE: não autoriza escolher
 * um motor/acabamento diferente nem inferir preço.
 */
export function aplicarCambioInformado(
  modelo: string, cambio: "automatico" | "manual" | null,
): string {
  if (!cambio) return modelo;
  const semCambio = String(modelo || "")
    .replace(/\b(?:autom[aá]tic[oa]|auto|aut|manual|mec[aâ]nic[oa]|mec|tiptronic|dsg|cvt)\b\.?/gi, " ")
    .replace(/\s+/g, " ").trim();
  return (semCambio + (cambio === "automatico" ? " automático" : " manual")).trim();
}

/** Cumprimentos e confirmações genéricas não são dados suficientes para
 * repetir uma chamada FIPE pendente. O pedido segue salvo até o próximo
 * detalhe relevante do veículo ou pedido explícito do cliente.
 */
export function mensagemSocialSemDadosCotacao(mensagem: string): boolean {
  const texto = String(mensagem || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[.!?,;:🙂😊👋]+/gu, " ").replace(/\s+/g, " ").trim();
  return /^(?:oi+|ola+|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|tudo certo|como vai|como voce esta|obrigad[oa]|muito obrigad[oa]|valeu|ate mais|tchau|ok|okay|entendi|beleza|certo|show)$/.test(texto);
}
