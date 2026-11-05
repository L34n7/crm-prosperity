/**
 * Intenção e validação da solicitação atual de cotação veicular.
 * Nunca usar dados de uma proposta anterior como autorização para cotar
 * um novo veículo. Nenhum modelo ou marca recebe tratamento especial.
 */
function normalizar(value:string):string{
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
export function clientePediuCotacaoVeicular(mensagem:string):boolean{
  const t=normalizar(mensagem);
  if(!t)return false;
  if(/\b(?:cotar|simular|orcamento|cotacao|simulacao)\b/.test(t)
    && /\b(?:quero|gostaria|preciso|pode|poderia|vou|vamos|solicito|fazer|gerar|receber|outra|novo|outra|mais|carro|veiculo|moto|seguro|protecao)\b/.test(t))return true;
  if(/\b(?:quanto fica|quanto custa|qual o valor|qual o preco|valor|preco)\b/.test(t)
    && /\b(?:seguro|protecao|veiculo|carro|moto)\b/.test(t))return true;
  if(/\b(?:quero outro|quero outra|outro veiculo|outro carro|nova proposta|novo orcamento|outra proposta|mais uma cotacao)\b/.test(t))return true;
  return /\b(?:faz|faca|gere|gera|calcule|calcula)\s+(?:uma?\s+)?(?:cotacao|simulacao|orcamento)\b/.test(t);
}

export function confirmouProsseguirCotacao(mensagem:string):boolean{
  const t=normalizar(mensagem);
  return /^(?:ok|okay|sim|claro|pode|pode sim|pode gerar|pode cotar|pode prosseguir|prossegue|pode continuar|vai em frente|manda ver|isso|isso mesmo|confirmo)$/.test(t);
}

/** Confronta os argumentos da IA com dados NOVOS informados pelo cliente.
 * O nome do modelo deve aparecer em alguma mensagem após a nova solicitação.
 * Ano e uso precisam ser confirmados nesta solicitação. Nunca aceitar dados
 * exclusivamente presentes nas cotações ou respostas antigas da IA.
 */
export function validarDadosNovosCotacao(
  mensagens:string[],
  modelo:string,
  ano:string,
  uso:string,
):string|null{
  const recentes=mensagens.map(normalizar).filter(Boolean);
  const combinado=recentes.join(" ");
  const compacto=combinado.replace(/[^a-z0-9]/g,"");
  const palavras=normalizar(modelo).split(" ").filter(v=>v.length>0);
  const genericas=new Set([
    "honda","volkswagen","vw","ford","chevrolet","gm","fiat",
    "toyota","hyundai","renault","nissan","bmw","audi","jeep",
    "mercedes","benz","mitsubishi","peugeot","citroen","kia",
    "land","rover","suzuki","byd","chery","volvo","porsche",
    "carro","veiculo","automovel","sedan","sed","hatch","coupe","flex",
    "total","gasolina","diesel","motor","mpfi","manual","automatico",
    "automatica","aut","mec","i","motion","particular","comercial",
  ]);
  const nominais=palavras.filter(p=>p.length>=2 &&
    !genericas.has(p) && !/^\d+$/.test(p) && !/^\d+[.,]\d+$/.test(p));
  // No caso HR-V, T-Cross etc., a FIPE separa o nome em tokens curtos.
  // A comparação usa a grafia compactada, sem enumerar modelos específicos.
  const grupos: string[]=[];
  for(let i=0;i<palavras.length;i++){
    if(palavras[i].length>=2&&!genericas.has(palavras[i])){
      grupos.push(palavras[i]);
      if(i+1<palavras.length&&palavras[i+1].length<=2)
        grupos.push(palavras[i]+palavras[i+1]);
    }
  }
  const tokens=[...new Set([...nominais,...grupos])]
    .filter(t=>t.length>=2&&!genericas.has(t)&&
      !/^(?:19|20)\d{2}$/.test(t));
  if(!tokens.length||!tokens.some(t=>new RegExp("(^| )"+t+"( |$)").test(combinado)
     ||compacto.includes(t))){
    return "Qual é o modelo do novo veículo?";
  }
  const anoArgumento=String(ano||"").match(/\b(?:19|20)\d{2}\b/g)?.at(-1)||"";
  const anoCliente=combinado.match(/\b(?:19|20)\d{2}\b/g)?.at(-1)||"";
  if(!anoArgumento||anoArgumento!==anoCliente){
    return "Qual é o ano-modelo do novo veículo?";
  }
  const usoConfirmado={
    particular:/\b(?:particular|pessoal|proprio)\b/,
    aplicativo:/\b(?:aplicativo|uber|99)\b/,
    taxi:/\b(?:taxi)\b/,
    comercial:/\b(?:comercial|trabalho|empresa)\b/,
  } as const;
  if(!(uso in usoConfirmado)||
     !usoConfirmado[uso as keyof typeof usoConfirmado].test(combinado)){
    return "Qual é a finalidade de uso do novo veículo: particular, aplicativo, táxi ou comercial?";
  }
  return null;
}
