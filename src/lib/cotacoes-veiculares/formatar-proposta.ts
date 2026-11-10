import {descricaoLegivelFipe} from "./orientacao-versoes.ts";
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
  total_centavos?:number;
  adesao_ativa?:boolean;
  adesao_tipo?:"fixa"|"mensalidade_mais_taxa";
  adesao_adicional_centavos?:number|null;
  adesao_centavos?:number|null;
  primeiro_pagamento_centavos?:number|null;
  rastreador_obrigatorio?:boolean;
  rastreador_instalacao_centavos?:number;
  rastreador_mensalidade_inclusa?:boolean;
  rastreador_mensalidade_adicional_centavos?:number;
  taxas_unicas_centavos?:number|null;
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
    "• Veículo: "+descricaoLegivelFipe(dados.veiculo),
    ...(dados.anoModelo?["• Ano/modelo: "+dados.anoModelo]:[]),
    "• Uso: "+dados.uso,
  ];

  const observacoesComuns=dados.planos.length>1&&
    dados.planos.every(p=>p.observacoes?.trim()===dados.planos[0].observacoes?.trim());

  for(const plano of dados.planos){
    const adicionalRastreador=Number(plano.rastreador_mensalidade_adicional_centavos||0);
    const mensalidadeEfetiva=typeof plano.total_centavos==="number"
      ?plano.total_centavos:plano.mensalidade_base_centavos+
        plano.opcionais.reduce((soma,o)=>soma+o.centavos,0)+adicionalRastreador;
    const adesaoDinamica=plano.adesao_ativa&&plano.adesao_tipo==="mensalidade_mais_taxa";
    linhas.push(
      "",
      "━━━━━━━━━━━━━━━━━━",
      "🛡️ *"+tituloPlano(plano.plano_nome).toLocaleUpperCase("pt-BR")+"*",
      "━━━━━━━━━━━━━━━━━━",
      "",
      "💰 *Mensalidade: "+moeda(plano.mensalidade_base_centavos)+"/mês*",
      "_Valor do plano, sem opcionais._",
      ...(plano.rastreador_obrigatorio&&adicionalRastreador>0?[
        "• Rastreador: + "+moeda(adicionalRastreador)+"/mês",
      ]:[]),
      ...(mensalidadeEfetiva!==plano.mensalidade_base_centavos?[
        "💰 *Mensalidade final com adicionais selecionados: "+
          moeda(mensalidadeEfetiva)+"/mês*",
      ]:[]),
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
    if(plano.adesao_ativa||plano.rastreador_obrigatorio){
      linhas.push("","🧾 *TAXAS DE CONTRATAÇÃO*");
      if(plano.adesao_ativa){
        if(adesaoDinamica){
          linhas.push("• Adesão (primeira mensalidade de "+moeda(mensalidadeEfetiva)+
            " + taxa adicional de "+(plano.adesao_adicional_centavos==null
              ?"valor a confirmar":moeda(plano.adesao_adicional_centavos))+"): "+
            (plano.adesao_centavos==null?"a confirmar":moeda(plano.adesao_centavos)));
        }else{
          linhas.push("• Adesão: "+(plano.adesao_centavos==null
            ?"valor a confirmar com a equipe"
            :moeda(plano.adesao_centavos)+" (pagamento único)"));
        }
      }
      if(plano.rastreador_obrigatorio){
        linhas.push(
          "• Rastreador obrigatório para esta faixa de veículo",
          "• Instalação: "+moeda(plano.rastreador_instalacao_centavos||0)+
            " (pagamento único)",
          plano.rastreador_mensalidade_inclusa
            ?"• Mensalidade do rastreador já incluída no preço informado"
            :"• Mensalidade adicional do rastreador: "+
              moeda(adicionalRastreador)+"/mês",
        );
      }
      if(adesaoDinamica){
        linhas.push(
          "• *Total para contratar agora: "+(plano.primeiro_pagamento_centavos==null
            ?"a confirmar":moeda(plano.primeiro_pagamento_centavos))+"*",
          "• Próxima mensalidade (em 30 dias): "+moeda(mensalidadeEfetiva),
        );
      }else if(plano.taxas_unicas_centavos!=null){
        linhas.push("• Total das taxas únicas: "+moeda(plano.taxas_unicas_centavos));
      }else if(plano.adesao_ativa){
        linhas.push("• Total das taxas únicas: a confirmar após definir a adesão");
      }
    }
    if(!observacoesComuns&&plano.observacoes?.trim()){
      linhas.push("","📝 *CONDIÇÕES DO "+tituloPlano(plano.plano_nome).toLocaleUpperCase("pt-BR")+"*",
        plano.observacoes.trim());
    }
  }
  if(observacoesComuns&&dados.planos[0]?.observacoes?.trim())
    linhas.push("","📝 *CONDIÇÕES COMERCIAIS*",dados.planos[0].observacoes.trim());

  linhas.push(
    "",
    "ℹ️ _Opcionais não selecionados são cobrados à parte. A cota de participação não integra a mensalidade._",
    "_Proposta informativa, sujeita às condições comerciais da associação._",
    ...(!dados.planos.every(p=>p.tabela_validada)?
      ["_Valores sujeitos à validação comercial._"]:[]),
    "",
    "🤝 *PRÓXIMOS PASSOS*",
    "Se um dos planos fizer sentido para você, posso esclarecer suas dúvidas e encaminhar sua escolha para nossa equipe continuar a contratação.",
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
