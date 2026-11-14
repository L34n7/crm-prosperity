/**
 * Guarda de experiência pós-compra do consultor comercial Leonardo.
 *
 * Protege o cliente que já comprou contra receber um link de NOVO cadastro
 * no lugar de login. Correção determinística somente na situação conhecida;
 * não altera respostas corretas nem outros agentes/empresas.
 */
const ID_LEONARDO_PROSPERITY="512da872-07df-49b6-87fe-dfec84c271c6";
const URL_LOGIN="https://crmprosperity.com/login";
const URL_AMBIENTE="https://crmprosperity.com/configurar-ambiente";

export function protegerRespostaPosCompraProsperity(params:{
  agenteId:string;
  ultimaMensagemCliente:string;
  mensagens:string[];
}):string[]{
  const mensagens=params.mensagens;
  if(params.agenteId!==ID_LEONARDO_PROSPERITY||!mensagens.length)return mensagens;
  const entrada=String(params.ultimaMensagemCliente||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").trim();
  const noPosCompra=/\b(?:ja paguei|ja comprei|ja contratei|paguei agora|paguei o plano|finalizei o pagamento|ja fiz (?:o )?cadastro|ja fiz login|ja entrei|pronto[,.! ]{0,20}como|como faco (?:agora )?(?:pra|para) acessar|como (?:eu )?acesso (?:agora|o (?:crm|sistema))|onde faco login|onde entro no sistema)\b/.test(entrada);
  if(!noPosCompra)return mensagens;
  const enviariaCadastro=mensagens.some(m=>/https?:\/\/(?:www\.)?crmprosperity\.com\/comecar(?:[?/\s]|$)/i.test(String(m)));
  if(!enviariaCadastro)return mensagens;
  const jaEntrou=/\b(?:ja fiz login|ja entrei|estou logado|estou dentro do sistema)\b/.test(entrada);
  if(jaEntrou){
    return ["Que bom que você já conseguiu entrar! O próximo passo é abrir Configurar Ambiente e conectar seu WhatsApp à Meta: "+URL_AMBIENTE+". Se aparecer uma dúvida em alguma etapa, me diga o que está vendo na tela que eu te oriento."];
  }
  return [
    "Se você já concluiu o cadastro/compra, o próximo passo é acessar o CRM por aqui: "+URL_LOGIN,
    "Confira o e-mail cadastrado para o link de primeiro acesso e definição de senha. Se já criou sua senha, entre com seu e-mail. Caso não tenha recebido a mensagem ou o pagamento ainda não esteja confirmado, confira o spam e me avise para encaminharmos ao suporte. Depois do login, a configuração do WhatsApp fica em "+URL_AMBIENTE+".",
  ];
}
