/**
 * Proposta comercial compartilhada entre o agente IA e "Copiar comparativo".
 * A FIPE e a tabela de origem continuam no cálculo interno, nunca no texto do cliente.
 */
export type OpcionalProposta={codigo:string;nome:string;centavos:number};
export type PlanoProposta={
  plano_nome:string;
  mensalidade_base_centavos:number;
  cota_participacao_centavos:number;
  terceiros_limite_centavos:number;
  assistencia_km_total:number;
  assistencias_ano:number;
  carro_reserva_incluso_dias:number;
  coberturas:string[];
  opcionais:OpcionalProposta[];
  opcionais_disponiveis?:OpcionalProposta[];
  observacoes:string;
  tabela_validada:boolean;
};
export type DadosProposta={
  veiculo:string;
  anoModelo?:number|string|null;
  uso:string;
  interessado?:string|null;
  planos:PlanoProposta[];
};

const moeda=(centavos:number)=>
  new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"})
    .format(centavos/100).replace(/[\u00a0\u202f]/g," ");

const tituloPlano=(nome:string)=>/^plano\b/i.test(nome.trim())?nome.trim():"Plano "+nome.trim();

function opcionaisDisponiveis(plano:PlanoProposta):OpcionalProposta[]{
  const vistos=new Set<string>();
  const lista=[...(plano.opcionais_disponiveis||[]),...(plano.opcionais||[])];
  return lista.filter(item=>{
    const codigo=item.codigo||item.nome;
    if(!codigo||vistos.has(codigo))return false;
    vistos.add(codigo);
    return true;
  });
}

/** Estrutura premium em texto para WhatsApp, sem HTML ou valores FIPE. */
export function formatarPropostaVeicular(dados:DadosProposta):string{
  const linhas:string[]=[
    "🚘 *COTAÇÃO DE PROTEÇÃO VEICULAR*",
    "",
    "📋 *DADOS DO VEÍCULO*",
    ...(dados.interessado?.trim()?["• Interessado: "+dados.interessado.trim()]:[]),
    "• Veículo: "+dados.veiculo,
    ...(dados.anoModelo?["• Ano/modelo: "+dados.anoModelo]:[]),
    "• Uso: "+dados.uso,
  ];

  const observacoesComuns=dados.planos.length>1&&
    dados.planos.every(p=>p.observacoes?.trim()===dados.planos[0].observacoes?.trim());

  for(const plano of dados.planos){
    linhas.push(
      "",
      "━━━━━━━━━━━━━━━━━━",
      "🛡️ *"+tituloPlano(plano.plano_nome).toLocaleUpperCase("pt-BR")+"*",
      "━━━━━━━━━━━━━━━━━━",
      "",
      "💰 *Mensalidade: "+moeda(plano.mensalidade_base_centavos)+"/mês*",
      "_Valor do plano, sem opcionais._",
      "",
      "📌 *BENEFÍCIOS DO PLANO*",
      "• Cota de participação: "+moeda(plano.cota_participacao_centavos),
      "• Cobertura para terceiros: "+(plano.terceiros_limite_centavos?
        moeda(plano.terceiros_limite_centavos):"Não disponível"),
      "• Assistência 24h: "+plano.assistencia_km_total+" km"+
        (plano.assistencias_ano?" · "+plano.assistencias_ano+" acionamentos/ano":""),
      ...(plano.carro_reserva_incluso_dias>0?
        ["• Carro reserva incluso: "+plano.carro_reserva_incluso_dias+" dias"]:[]),
      "",
      "✅ *COBERTURAS INCLUÍDAS*",
      ...(plano.coberturas.length?
        plano.coberturas.map(item=>"✓ "+item):["• Consulte as coberturas do plano"]),
    );

    const opcionais=opcionaisDisponiveis(plano);
    linhas.push(
      "",
      "➕ *OPCIONAIS DISPONÍVEIS*",
      "_Não inclusos na mensalidade acima._",
      ...(opcionais.length?
        opcionais.map(o=>"• "+o.nome+" — + "+moeda(o.centavos)+"/mês"):
        ["• Nenhum opcional disponível para este plano."]),
    );
    if(!observacoesComuns&&plano.observacoes?.trim()){
      linhas.push("","📝 *CONDIÇÕES DO "+tituloPlano(plano.plano_nome).toLocaleUpperCase("pt-BR")+"*",
        plano.observacoes.trim());
    }
  }
  if(observacoesComuns&&dados.planos[0]?.observacoes?.trim())
    linhas.push("","📝 *CONDIÇÕES COMERCIAIS*",dados.planos[0].observacoes.trim());

  linhas.push(
    "",
    "ℹ️ _Os opcionais são cobrados à parte. A cota de participação não integra a mensalidade._",
    "_Proposta informativa, sujeita às condições comerciais da associação._",
    ...(!dados.planos.every(p=>p.tabela_validada)?
      ["_Valores sujeitos à validação comercial._"]:[]),
    "",
    "🤝 *Quer seguir com a contratação?*",
    "Basta responder *Quero contratar* e encaminharei você para um atendente concluir o processo.",
  );
  return linhas.join("\n").trim();
}

/** A API WhatsApp aceita até 4096 caracteres por mensagem. Divide em linhas,
 * preserva títulos e evita o corte silencioso das mensagens do agente IA. */
export function dividirPropostaWhatsApp(texto:string,limite=3500):string[]{
  const trechos:string[]=[];
  let atual="";
  for(const linha of texto.split("\n")){
    const candidata=atual?atual+"\n"+linha:linha;
    if(candidata.length>limite&&atual.trim()){
      trechos.push(atual.trim());
      atual="";
    }
    if(linha.length>limite){
      for(let i=0;i<linha.length;i+=limite)
        trechos.push(linha.slice(i,i+limite));
      continue;
    }
    atual=atual?atual+"\n"+linha:linha;
  }
  if(atual.trim())trechos.push(atual.trim());
  return trechos;
}
