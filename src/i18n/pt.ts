export const pt = {
  common: {
    loading: "Carregando...",
    save: "Salvar",
    cancel: "Cancelar",
    edit: "Editar",
    delete: "Excluir",
    back: "Voltar",
    next: "Próximo",
    continue: "Continuar",
    finish: "Finalizar",
    close: "Fechar",
    search: "Buscar",
    active: "Ativo",
    inactive: "Inativo",
    pending: "Pendente",
    completed: "Concluído",
    error: "Erro",
    success: "Sucesso",
  },

  auth: {
    loginTitle: "Entrar na sua conta",
    loginSubtitle: "Acesse o painel do CRM.",
    email: "Email",
    password: "Senha",
    forgotPassword: "Esqueceu sua senha?",
    signIn: "Entrar",
    signOut: "Sair",
  },

  sidebar: {
    dashboard: "Painel",
    conversations: "Conversas",
    contacts: "Contatos",
    automations: "Automações",
    broadcasts: "Disparos",
    environmentSetup: "Configurar ambiente",
    settings: "Configurações",
  },

  environmentSetup: {
    title: "Configurar ambiente",
    subtitle:
      "Conecte sua conta Meta e configure o ambiente oficial da API do WhatsApp Business.",
    stepCurrent: "Etapa atual",
    stepCompleted: "Concluído",

    steps: {
      connectMeta: {
        title: "Conectar conta Meta",
        description:
          "Autorize o acesso à sua conta empresarial da Meta e aos ativos do WhatsApp Business.",
      },
      selectNumber: {
        title: "Selecionar número do WhatsApp",
        description:
          "Escolha o número do WhatsApp Business que será conectado ao CRM.",
      },
      configureWebhook: {
        title: "Configurar Webhook",
        description:
          "Configure o webhook para receber mensagens recebidas e atualizações de entrega.",
      },
      testConnection: {
        title: "Testar conexão",
        description:
          "Envie e receba uma mensagem de teste para confirmar que a integração está funcionando.",
      },
      completed: {
        title: "Configuração concluída",
        description:
          "Seu ambiente da API do WhatsApp Business está pronto para uso.",
      },
    },

    buttons: {
      connectMeta: "Conectar conta Meta",
      reconnectMeta: "Reconectar conta Meta",
      configureWebhook: "Configurar Webhook",
      testConnection: "Testar conexão",
      finishSetup: "Finalizar configuração",
    },

    status: {
      metaConnected: "Conta Meta conectada",
      metaNotConnected: "Conta Meta não conectada",
      webhookVerified: "Webhook verificado",
      webhookNotVerified: "Webhook não verificado",
      phoneRegistered: "Número registrado",
      phoneNotRegistered: "Número não registrado",
    },

    messages: {
      loadingIntegration: "Carregando integração do WhatsApp...",
      integrationNotFound: "Nenhuma integração do WhatsApp encontrada.",
      metaConnectedSuccess: "Conta Meta conectada com sucesso.",
      webhookConfiguredSuccess: "Webhook configurado com sucesso.",
      setupCompletedSuccess: "Configuração do ambiente concluída com sucesso.",
      genericError: "Algo deu errado. Tente novamente.",
    },
  },
};
