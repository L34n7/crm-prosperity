/**
 * Identifica perguntas frequentes para pré-consultar os conhecimentos do
 * agente ANTES de gerar a resposta. Sempre passa a pergunta original para
 * o mecanismo de busca, que é isolado por empresa/agente.
 *
 * Não usa nomes de empresas, tarifas ou promessas de suporte globais:
 * cada agente consulta apenas a própria base de conhecimento autorizada.
 */
export function consultaFaqProduto(mensagem: string): string | null {
  const original=String(mensagem||"").trim();
  if(!original)return null;
  const t=original.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/\s+/g," ").trim();
  const pistas=[
    // Suporte 24h, implantação e ajuda.
    /\b(?:suporte|assistencia tecnica|atendimento tecnico|central de ajuda|treinamento|tutorial|implantacao|instalacao|programar|programacao|programador)\b/,
    // Plano e capacidade de IA (não confundir com credenciais/token da Meta).
    /\b(?:tokens|recarga de ia|recarga de tokens|saldo de ia|franquia de ia)\b/,
    // Cloud API, migração, qualidade e janela WhatsApp.
    /\b(?:coexistencia|numero atual|mesmo numero|migrar whatsapp|migracao whatsapp|historico antigo|perder historico|app business|bloqueio|banimento|banido|janela de 24 horas|janela 24h|opt-in|consentimento|template|templates)\b/,
    // Usuários, números adicionais e atendimento multi-equipe.
    /\b(?:numero adicional|numeros adicionais|numero extra|usuarios|usuario extra|atendentes|setores|departamentos|filas de atendimento|permissoes)\b/,
    // Ferramentas reais, relatórios, automações e agenda.
    /\b(?:follow-up|follow up|followup|acompanhamento automatico|fluxos|chatbot|agendamento automatico|google calendar|kanban|funil de vendas|relatorios|email marketing|e-mail marketing|cotacao|orcamento|estoque|odontograma|prontuario)\b/,
    // Variáveis e problemas reais em campanhas/importações (FAQ de disparos).
    /\b(?:variavel|variaveis|csv|planilha de contatos|lista de contatos|disparos personalizados|campo de nome|nome_contato|nome_whatsapp)\b/,
    // Primeiro acesso/pós-compra e rotas corretas de login (nunca cadastro).
    /\b(?:primeiro acesso|ja paguei|ja comprei|ja contratei|finalizei o pagamento|fiz o cadastro|ja fiz login|como faco (?:agora )?(?:pra|para) acessar|como acessar|acessar agora|link do login|criar login|recuperar senha|convite por email|novo usuario)\b/,
    // Demos visuais, migração de parceiro e novos números oficiais.
    /\b(?:me mostra a tela|tem uma tela|quero ver funcionando|quero ver a tela|video demonstrativo|video do sistema|demonstracao em video|parceiro anterior|outro provedor|outra bm|bm diferente|novo numero|mais um numero|quatro numeros|4 numeros)\b/,
    // Assinatura, integrações, confiança e parceiros.
    /\b(?:trial|teste gratis|fidelidade|reembolso|cancelamento|lgpd|privacidade|backup|retencao|exportacao|seguranca dos dados|white label|whitelabel|revender|revenda|n8n|zapier|api externa|sistema externo)\b/,
  ];
  return pistas.some((regex)=>regex.test(t)) ? original.slice(0,140) : null;
}
