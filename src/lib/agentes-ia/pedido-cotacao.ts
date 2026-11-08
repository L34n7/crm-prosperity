/**
 * Intenção e validação da solicitação atual de cotação veicular.
 * Nunca usar dados de uma proposta anterior como autorização para cotar
 * um novo veículo. Nenhum modelo ou marca recebe tratamento especial.
 */
function normalizar(value:string):string{
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}
/** Tolerância mínima a erros de escrita na IDENTIFICAÇÃO do modelo.
 * Só compara palavras com pelo menos cinco caracteres, admitindo uma
 * inserção, remoção ou substituição. Não escolhe a versão FIPE: isso
 * continua sujeito à consulta oficial e à confirmação de ambiguidades.
 */
function umaEdicaoModelo(a:string,b:string):boolean{
  if(a===b)return true;
  if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,erros=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++erros>1)return false;
    if(a.length>b.length)i++;
    else if(b.length>a.length)j++;
    else {i++;j++;}
  }
  return erros+(a.length-i)+(b.length-j)<=1;
}
function termoModeloPresente(token:string,mensagens:string[]):boolean{
  if(token.length<5)return false;
  return mensagens.some(m=>normalizar(m).split(" ").some(p=>
    umaEdicaoModelo(token,p)));
}

/** Desistência explícita encerra a seleção de versões; não é correção do carro. */
export function clienteCancelouCotacao(mensagem:string):boolean{
  const t=normalizar(mensagem);
  // Aceita comandos curtos de cancelamento e uma transcrição comum do áudio.
  if(/^(?:cancela|cancelar|canela|pare|pode parar|desisti)$/.test(t))return true;
  return /\b(?:deixa(?: isso)? (?:pra|para) la|deixa quieto|desisto(?: da cotacao| do seguro)?|nao quero mais(?: (?:cotar|a cotacao|essa cotacao|esse seguro))?|cancela(?:r)? (?:a |essa )?cotacao|pode cancelar (?:a |essa )?cotacao)\b/.test(t);
}

export function clientePediuCotacaoVeicular(mensagem:string):boolean{
  const t=normalizar(mensagem);
  if(!t)return false;
  if (clienteCancelouCotacao(mensagem)) return false;
  if (clientePediuNovoVeiculoCotacao(mensagem)) return true;
  // No contexto de um agente de cotação, "eu tenho um Vectra 2002" inicia
  // a coleta; uma resposta subsequente "Particular" deve completá-la.
  if(/^(?:eu\s+)?tenho\s+(?:um|uma)\s+.{2,70}\b(?:19|20)\d{2}\b/.test(t))
    return true;
  if(/\b(?:cotar|simular|orcamento|cotacao|simulacao)\b/.test(t)
    && /\b(?:quero|gostaria|preciso|pode|poderia|vou|vamos|solicito|fazer|gerar|receber|outra|novo|mais)\b/.test(t)
    && !/\b(?:quero|gostaria)\s+(?:saber|entender|revisar|comparar|ver)\b/.test(t))return true;
  if(/\b(?:quanto fica|quanto custa|qual o valor|qual o preco|quanto sai|preco do seguro|valor do seguro)\b/.test(t)
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
  permitirUsoPendente=false,
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
    "caminhao","caminhoes","van","vans","utilitario","utilitarios","furgao",
    "passageiro","passageiros","carga","cargas","agregado",
    "total","gasolina","diesel","motor","mpfi","manual","automatico",
    "gl","gs","gsi","cd","sed",
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
  // Modelos numéricos (ex.: 208 ou 2008) exigem referência explícita.
  // O ano sozinho ("Vectra 2000") não vira nome de outro veículo.
  const modeloNumero=palavras.find((parte,i)=>/^\d{3,4}$/.test(parte) &&
    (palavras.length===1 || (i>0 && MARCAS_VEICULARES.has(palavras[i-1]))));
  // Modelos de caminhão com código composto (NN.NNN/NN-NNN) também
  // são nomes. Nunca interpretá-los como categoria ou ano.
  const codigoComposto=normalizar(modelo).match(/(?:^| )\d{1,2} \d{3}(?: |$)/)?.[0].trim()||"";
  const codigoConfirmado=Boolean(codigoComposto)&&recentes.some(texto=>
    (" "+texto+" ").includes(" "+codigoComposto+" ")
  );
  const modeloNumerico=Boolean(modeloNumero);
  const numeroNomeado=modeloNumerico && recentes.some((mensagem)=>{
    const partes=mensagem.split(" ");
    return partes.some((parte,i)=>parte===modeloNumero &&
      ((i>0 && MARCAS_VEICULARES.has(partes[i-1])) ||
       (i>0 && partes[i-1]==="modelo")));
  });
  // Acabamento isolado (LTZ, GLS, XLT...) não é modelo: são
  // características compartilhadas por diversas famílias e marcas.
  if(palavras.length>0 && palavras.every(p=>
      PALAVRAS_GERAIS_COTACAO.has(p)||MARCAS_VEICULARES.has(p)))
    return "Qual é o modelo do novo veículo?";
  if((!tokens.length&&!numeroNomeado&&!codigoConfirmado) ||
    (tokens.length>0&&!codigoConfirmado&&!tokens.some(t=>new RegExp("(^| )"+t+"( |$)").test(combinado)
     ||compacto.includes(t)||termoModeloPresente(t,recentes)))){
    return "Qual é o modelo do novo veículo?";
  }
  const anoArgumento=String(ano||"").match(/\b(?:19|20)\d{2}\b/g)?.at(-1)||"";
  const anosCliente=combinado.match(/\b(?:19|20)\d{2}\b/g)||[];
  const anoCliente=anosCliente.at(-1)||"";
  if(!anoArgumento||anoArgumento!==anoCliente ||
     (modeloNumerico && anosCliente.length===1 && anoCliente===modeloNumero)){
    return "Qual é o ano-modelo do novo veículo?";
  }
  const usoConfirmado={
    particular:/\b(?:particular|pessoal|proprio)\b/,
    aplicativo:/\b(?:aplicativo|uber|99)\b/,
    taxi:/\b(?:taxi)\b/,
    comercial:/\b(?:comercial|trabalho|empresa)\b/,
  } as const;
  if(!permitirUsoPendente&&(!(uso in usoConfirmado)||
     !usoConfirmado[uso as keyof typeof usoConfirmado].test(combinado))){
    return "Qual é a finalidade de uso do novo veículo: particular, aplicativo, táxi ou comercial?";
  }
  return null;
}

/** Consultar a FIPE apenas com especificações realmente dadas neste pedido.
 * Versões e motores sugeridos pela IA não são confirmações do cliente.
 */
export function modeloComDadosConfirmados(mensagens:string[], modeloIa:string):string{
  const mensagensBrutas=mensagens.join(" ").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const texto=normalizar(mensagensBrutas);
  const compacto=texto.replace(/[^a-z0-9]/g,"");
  return String(modeloIa||"").trim().split(/\s+/).filter(Boolean)
    .filter(parte=>{
      const termo=normalizar(parte);
      const valor=termo.replace(/[^a-z0-9]/g,"");
      if(!valor)return false;
      // Atributos não usados pela FIPE não devem refinar a versão.
      if(/^(?:nacional|importado|importada|carburador|carburado|injecao|eletronica)$/.test(termo))
        return false;
      if(/^[1-9][.,][0-9]$/.test(parte)){
        const motor=parte.replace(".", "[.,]");
        return new RegExp("(^|[^0-9])"+motor+"([^0-9]|$)").test(mensagensBrutas);
      }
      if(/^(?:19|20)\d{2}$/.test(parte)){
        return mensagens.some((mensagem)=>{
          const partes=normalizar(mensagem).split(" ");
          return partes.some((item,i)=>item===termo &&
            i>0 && (MARCAS_VEICULARES.has(partes[i-1]) || partes[i-1]==="modelo"));
        });
      }
      if(valor.length<=2)return texto.split(" ").includes(valor);
      return compacto.includes(valor)||termoModeloPresente(valor,[texto]);
    }).join(" ").trim();
}


/** A IA pode omitir o modelo ou alterar sua grafia. Recupere a família
 * confirmada no pedido corrente somente se aparecer nas mensagens do
 * próprio cliente. Não reaproveita carro de cotação anterior.
 */
export function preservarModeloCotacaoConfirmado(
  mensagens:string[],modeloIa:string,modeloEstado:string,
):string{
  const proposta=modeloComDadosConfirmados(mensagens,modeloIa);
  const validacaoModelo=proposta
    ?validarDadosNovosCotacao(mensagens,proposta,"","")
    :"Qual é o modelo do novo veículo?";
  if(proposta&&validacaoModelo!=="Qual é o modelo do novo veículo?")return proposta;
  const guardado=modeloComDadosConfirmados(mensagens,modeloEstado);
  const validacaoGuardado=guardado
    ?validarDadosNovosCotacao(mensagens,guardado,"","")
    :"Qual é o modelo do novo veículo?";
  return guardado&&validacaoGuardado!=="Qual é o modelo do novo veículo?"
    ?guardado:"";
}

/** Um novo veículo é um pedido distinto; "quero outro plano" NÃO é cotação. */
export function clientePediuNovoVeiculoCotacao(mensagem: string): boolean {
  const texto = normalizar(mensagem);
  if (!texto) return false;
  if (/\b(?:outro plano|outro opcional|outra cobertura|outra forma de pagamento)\b/.test(texto))
    return false;
  if (/^(?:(?:vamos|bora|quero|faz|faca|gera|gere|pode|agora)\s+)?(?:outro|outra|proximo|proxima)(?:\s+(?:veiculo|carro|moto|cotacao|orcamento|proposta))?$/.test(texto))
    return true;
  if (/^(?:qual|quais|quanto|como|porque|por que|me explica)\b/.test(texto))
    return false;
  const mencionaOutro = /\b(?:outro|outra|novo|nova|proximo|proxima|mais um|mais uma)\b/.test(texto);
  const mencionaVeiculoOuCotacao = /\b(?:veiculo|carro|moto|cotacao|cotar|simulacao|simular|orcamento|proposta)\b/.test(texto);
  const pedidoExplicito = /^(?:quero|gostaria|preciso|vamos|bora|pode|poderia|faz|faca|fazer|gera|gere|vou|agora)\b/.test(texto);
  return mencionaOutro && (mencionaVeiculoOuCotacao || pedidoExplicito) &&
    !/\b(?:outra vez|mais uma vez|de novo)\b/.test(texto);
}

/** Reabrir somente sob pedido explícito; nunca refazer uma proposta concluída. */
export function clientePediuRetomarCotacao(mensagem: string): boolean {
  const texto = normalizar(mensagem);
  return /^(?:consegue|pode|poderia|vamos|tenta|tente)\s+(?:(?:me\s+)?(?:gerar|cotar|calcular|refazer|retomar|continuar|tentar)(?:\s+(?:a|uma|essa|esta))?(?:\s+cotacao)?(?:\s+(?:agora|novamente|de novo))?|(?:tentar|fazer)\s+(?:de novo|novamente)(?:\s+a cotacao)?)(?:\s+agora)?$/.test(texto)
    || /^(?:gera|gere|retoma|retome|continua|continue)\s+(?:(?:a|essa|esta)\s+)?cotacao(?:\s+agora)?$/.test(texto);
}

export type UsoCotacaoConfirmado = "particular" | "aplicativo" | "taxi" | "comercial";
export type DadosCotacaoConfirmados = {
  modelo: string | null;
  ano_modelo: string | null;
  uso: UsoCotacaoConfirmado | null;
};
export const DADOS_COTACAO_VAZIOS: DadosCotacaoConfirmados = {
  modelo: null, ano_modelo: null, uso: null,
};

const PALAVRAS_GERAIS_COTACAO = new Set(
  ("a o as os e eu de da do das dos um uma meu minha seus seu do meu do seu carro carros veiculo veiculos moto motos " +
  "quero gostaria preciso posso pode poderia podemos faz faca fazer fazermos vamos bora agora depois novo nova outra outro " +
  "proximo proxima cotar cote cotacao cotacoes orcamento proposta propostas simular simulacao gerar gere gera " +
  "para por com sem em no na uso finalidade ano modelo marca marca e eh ser sera foi tem tenho esta esse essa isso " +
  "tio tia pai mae irmao irma amigo amiga cliente pessoa dono terceiro mesmo mesma mais novamente novo " +
  "particular pessoal proprio aplicativo uber taxi comercial trabalho empresa flex diesel gasolina hibrido eletrico " +
  "manual automatico automatica mecanico mecanica motor motorizacao cambio sedan hatch suv pickup camionete cabine " +
  "dupla simples tracao cd 4x4 4x2 gls lxs ex exl lx ltz lt xlt xls xl limited challenge premium completo " +
  "caminhao caminhoes van vans utilitario utilitarios furgao passageiro passageiros carga cargas agregado " +
  "gl gs gsi gi cd sed advantage express " +
  "confirmo confirmado correto certa certo verdade sim nao ok obrigado obrigada obrigado por favor voces conseguem dia dias diario familia casa caro uai neh ne ta beleza belezaaa entendi vou usar usando dia a dia uso para trabalhar dirigindo rodar quero nao mais " +
  "consegue tentar tente tentei outra vez fazer de novo quero saber qual qual e meu por que quanto fica quanto custa cancela cancelar canela"
    ).split(/\s+/).filter(Boolean)
);
const MARCAS_VEICULARES = new Set(
  ("honda volkswagen vw ford chevrolet gm fiat toyota hyundai renault nissan bmw audi jeep " +
  "mercedes benz mitsubishi peugeot citroen kia land rover suzuki byd chery volvo porsche " +
  "mazda jac subaru mini lexus ram dodge peugeot"
    ).split(/\s+/)
);

/** Um acabamento curto (LTZ, GLS, LX etc.) não nomeia um veículo.
 * Só pode complementar a família do modelo explicitamente informada.
 */
export function acabamentoIsoladoCotacao(texto:string):boolean{
  const t=normalizar(texto);
  return new Set(("lt ltz gl gls gs gsi lx lxs lxr ex exl xl xls xlt " +
    "limited challenge express advantage titanium comfortline highline " +
    "trendline premier touring sport").split(" ")).has(t);
}

/** Apenas indicativo de que o cliente nomeou um veículo; a FIPE faz a seleção final.
 * Nunca usar esse campo como versão FIPE, motorização ou preço confirmado.
 */
function modeloMencionadoCotacao(mensagem: string): string | null {
  const textoOriginal=String(mensagem||"").trim();
  // Código do modelo dito isoladamente; a FIPE validará marca e versão.
  const codigo=textoOriginal.match(/^\d{1,2}[.\-\s]\d{3}$/);
  if(codigo)return codigo[0].replace(/[\s-]/g,".");
  const palavras = normalizar(mensagem).split(" ").filter(Boolean);
  const candidatas = palavras.filter((palavra) =>
    !PALAVRAS_GERAIS_COTACAO.has(palavra) &&
    !MARCAS_VEICULARES.has(palavra) &&
    !/^(?:19|20)\d{2}$/.test(palavra) &&
    !/^\d$/.test(palavra) &&
    !/^\d{2}$/.test(palavra) &&
    !/^\d+(?:cv|v|p)$/.test(palavra) &&
    !/^\d+x\d+$/.test(palavra)
  );
  if (candidatas.length) return candidatas.join(" ").slice(0, 150);
  // Ex.: Peugeot 2008: o nome do modelo também parece um ano. Não presumir ano-modelo.
  const anos = palavras.filter((palavra) => /^(?:19|20)\d{2}$/.test(palavra));
  if (palavras.some((palavra) => MARCAS_VEICULARES.has(palavra)) &&
      (anos.length === 1 ||
       (anos.length > 1 && Number(anos.at(-1)) - Number(anos[0]) >= 3)))
    return anos[0];
  return null;
}

/** Normaliza o estado persistido sem confiar em JSON arbitrário. */
export function normalizarDadosCotacao(valor: unknown): DadosCotacaoConfirmados {
  const obj = valor && typeof valor === "object" ? valor as Record<string, unknown> : {};
  const modelo = typeof obj.modelo === "string" ? obj.modelo.trim().slice(0, 150) : "";
  const ano = typeof obj.ano_modelo === "string" ? obj.ano_modelo : "";
  const uso = String(obj.uso || "");
  return {
    modelo: modelo || null,
    ano_modelo: /^(?:19|20)\d{2}$/.test(ano) ? ano : null,
    uso: ["particular", "aplicativo", "taxi", "comercial"].includes(uso)
      ? uso as UsoCotacaoConfirmado : null,
  };
}

/** Consolida dados apenas das mensagens do pedido ATUAL; preserva o que já
 * foi confirmado mesmo quando a janela recente do chat for paginada.
 * A interpretação detalhada da marca/versão continua sendo feita pela IA/FIPE.
 */
export function consolidarDadosCotacao(
  mensagens: string[],
  anterior: DadosCotacaoConfirmados = DADOS_COTACAO_VAZIOS,
): DadosCotacaoConfirmados {
  const dados = { ...normalizarDadosCotacao(anterior) };
  for (const mensagem of mensagens) {
    const texto = normalizar(mensagem);
    // Falas de finalidade de uso (ex.: "dia a dia") não são modelos.
    // Se um estado antigo guardou palavras genéricas, corrige ao receber
    // uma identificação real sem exigir reiniciar a conversa.
    if (!dados.modelo || !modeloMencionadoCotacao(dados.modelo))
      dados.modelo = modeloMencionadoCotacao(mensagem) || null;
    const anos = [...texto.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => m[0]);
    const unicoAnoTambemModelo = anos.length === 1 &&
      dados.modelo === anos[0] &&
      texto.split(" ").some((palavra)=>MARCAS_VEICULARES.has(palavra));
    if (anos.length && !unicoAnoTambemModelo) dados.ano_modelo = anos.at(-1) || null;
    if (/\b(?:particular|pessoal|proprio)\b/.test(texto) &&
        !/\bnao\s+(?:e|sera|uso)\s+(?:particular|pessoal|proprio)\b/.test(texto))
      dados.uso = "particular";
    else if (/\b(?:aplicativo|uber)\b/.test(texto)) dados.uso = "aplicativo";
    else if (/\btaxi\b/.test(texto)) dados.uso = "taxi";
    else if (/\b(?:comercial|uso profissional)\b/.test(texto)) dados.uso = "comercial";
  }
  return dados;
}

export function dadosEssenciaisCotacaoConfirmados(dados: DadosCotacaoConfirmados): boolean {
  return Boolean(dados.modelo && dados.ano_modelo && dados.uso);
}
