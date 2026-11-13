/**
 * Conteúdo do guia de configuração contextual ao passo exibido pelo assistente.
 * O passo 2 (Meta) preserva suas orientações detalhadas na página.
 */
export type PassoGuiaAmbiente = {
  titulo: string;
  descricao: string;
  ancora?: string;
};
export type GuiaContextualAmbiente = {
  titulo: string;
  introducao: string;
  passos: readonly PassoGuiaAmbiente[];
  aviso?: string;
};

export function obterGuiaContextualAmbiente(
  etapa: number,
  fluxoNumeroAdicional: boolean,
  modoCoexistencia: boolean,
  ambienteConcluido: boolean,
): GuiaContextualAmbiente {
  if (etapa === 0) {
    return {
      titulo: "Primeiros passos",
      introducao: "Conheça a sequência de configuração antes de conectar seu WhatsApp ao CRM.",
      passos: [
        { titulo: "Inicie o assistente", descricao: "Clique em Começar para configurar o ambiente oficial da empresa.", ancora: "introducao" },
        { titulo: "Prepare a conta Meta", descricao: "Tenha acesso ao portfólio empresarial e à conta WhatsApp Business que serão utilizados.", ancora: "preparacao" },
        { titulo: "Escolha como usar o WhatsApp", descricao: "Nas próximas etapas, você poderá escolher entre Cloud API e Coexistência.", ancora: "modos" },
      ],
    };
  }

  if (etapa === 1) {
    if (fluxoNumeroAdicional) {
      return {
        titulo: "Identificar nova integração",
        introducao: "Dê um nome ao novo número para diferenciá-lo das integrações que já existem no CRM.",
        passos: [
          { titulo: "Nome da integração", descricao: "Informe um nome interno com 3 a 80 caracteres, como Comercial ou Suporte.", ancora: "numero-adicional" },
          { titulo: "Manter configurações atuais", descricao: "O segmento e as regras gerais da empresa não serão alterados pelo novo número.", ancora: "numero-adicional" },
          { titulo: "Avançar", descricao: "Salve o nome e continue para escolher o modo de conexão com a Meta.", ancora: "modo-meta" },
        ],
      };
    }

    return {
      titulo: "Segmento da empresa",
      introducao: "Selecione a área de atuação para que o CRM disponibilize recursos adequados à sua empresa.",
      passos: [
        { titulo: "Escolha o segmento", descricao: "Selecione o nicho que corresponde à atividade da empresa.", ancora: "segmento" },
        { titulo: "Confira a seleção", descricao: "O segmento determina recursos e módulos disponíveis. Em White Label, ele pode vir previamente definido.", ancora: "segmento" },
        { titulo: "Salvar e avançar", descricao: "Clique em Avançar para registrar a escolha e seguir para a conexão Meta.", ancora: "modo-meta" },
      ],
    };
  }

  if (etapa === 2) {
    return {
      titulo: "Guia de conexão Meta",
      introducao: modoCoexistencia
        ? "Siga as etapas da Meta para vincular o WhatsApp Business App ao CRM em modo de Coexistência."
        : "Acompanhe este guia enquanto conclui a conexão na janela da Meta.",
      passos: [],
    };
  }

  if (etapa === 3) {
    if (modoCoexistencia) {
      return {
        titulo: "Ativar Coexistência",
        introducao: "Ative o uso simultâneo do WhatsApp Business App e do CRM e acompanhe a importação inicial.",
        passos: [
          { titulo: "Conferir o número", descricao: "Verifique se o número conectado é o WhatsApp Business correto.", ancora: "ativacao" },
          { titulo: "Escolher dados anteriores", descricao: "Selecione importar apenas contatos ou contatos e conversas anteriores, quando a Meta permitir.", ancora: "importacao-coexistencia" },
          { titulo: "Ativar Coexistência", descricao: "Clique em Ativar Coexistência e aguarde a confirmação do vínculo.", ancora: "ativacao" },
          { titulo: "Acompanhar importação", descricao: "Confira avisos e o estado das importações. As mensagens novas podem funcionar enquanto o histórico é processado.", ancora: "importacao-coexistencia" },
        ],
        aviso: "A Meta define a elegibilidade do número e o resultado da importação. Não repita a ativação apenas porque o histórico ainda está sendo processado.",
      };
    }

    return {
      titulo: "Ativar número do WhatsApp",
      introducao: "Registre o número na Cloud API oficial para habilitar o envio e o recebimento de mensagens.",
      passos: [
        { titulo: "Conferir número", descricao: "Verifique o telefone apresentado e se a conta Meta já foi conectada.", ancora: "ativacao" },
        { titulo: "Ativar número", descricao: "Clique em Ativar número para abrir a confirmação da verificação em duas etapas.", ancora: "pin" },
        { titulo: "Informar PIN", descricao: "Digite o PIN de 6 dígitos do número e mantenha-o em local seguro.", ancora: "pin" },
        { titulo: "Confirmar ativação", descricao: "Aguarde o status Número ativado antes de avançar.", ancora: "ativacao" },
      ],
      aviso: "PIN incorreto ou tentativas repetidas podem bloquear novas verificações temporariamente. Confira o PIN antes de insistir.",
    };
  }

  if (etapa === 4 && ambienteConcluido) {
    return {
      titulo: "Ambiente configurado",
      introducao: "A integração foi ativada. Confira o resumo e prossiga para os próximos ajustes do CRM.",
      passos: [
        { titulo: "Conferir os indicadores", descricao: "Verifique o status da integração, o ID da WABA, o ID do número e o webhook.", ancora: "finalizacao" },
        { titulo: fluxoNumeroAdicional ? "Gerenciar números" : "Revisar permissões", descricao: fluxoNumeroAdicional ? "Abra Perfil WhatsApp para consultar e organizar as integrações." : "Clique em Avançar para configurar permissões e regras de acesso da empresa.", ancora: "proximos-passos" },
        { titulo: "Testar funcionamento", descricao: "Verifique o atendimento e, se for enviar campanhas, prepare templates aprovados e configure a cobrança da Meta.", ancora: "pagamento" },
      ],
    };
  }

  return {
    titulo: "Concluir configuração",
    introducao: "Configure a assinatura do webhook, confirme a ativação e valide o resultado final da integração.",
    passos: [
      { titulo: "Verificar webhook", descricao: "Confira se a assinatura de mensagens e eventos está configurada para o número.", ancora: "webhook" },
      { titulo: "Configurar webhook", descricao: "Se estiver pendente, clique em Configurar webhook e aguarde a confirmação.", ancora: "webhook" },
      { titulo: "Concluir ambiente", descricao: "Com o webhook confirmado, clique em Concluir configuração (ou Concluir novo número).", ancora: "finalizacao" },
      { titulo: "Próximos ajustes", descricao: "Depois de concluir, confira as permissões, o Perfil WhatsApp e as condições de cobrança dos disparos.", ancora: "proximos-passos" },
    ],
    aviso: "Se a assinatura falhar por permissões da Meta, revise a autorização whatsapp_business_management e a configuração do aplicativo antes de repetir.",
  };
}
