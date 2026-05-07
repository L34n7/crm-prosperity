export const en = {
  common: {
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    back: "Back",
    next: "Next",
    continue: "Continue",
    finish: "Finish",
    close: "Close",
    search: "Search",
    active: "Active",
    inactive: "Inactive",
    pending: "Pending",
    completed: "Completed",
    error: "Error",
    success: "Success",
  },

  auth: {
    loginTitle: "Sign in to your account",
    loginSubtitle: "Access your CRM dashboard.",
    email: "Email",
    password: "Password",
    forgotPassword: "Forgot your password?",
    signIn: "Sign in",
    signOut: "Sign out",
  },

  sidebar: {
    dashboard: "Dashboard",
    conversations: "Conversations",
    contacts: "Contacts",
    automations: "Automations",
    broadcasts: "Broadcasts",
    environmentSetup: "Environment Setup",
    settings: "Settings",
  },

  environmentSetup: {
    title: "Environment Setup",
    subtitle:
      "Connect your Meta account and configure your official WhatsApp Business API environment.",
    stepCurrent: "Current step",
    stepCompleted: "Completed",

    steps: {
      connectMeta: {
        title: "Connect Meta Account",
        description:
          "Authorize access to your Meta Business account and WhatsApp Business assets.",
      },
      selectNumber: {
        title: "Select WhatsApp Number",
        description:
          "Choose the WhatsApp Business number that will be connected to the CRM.",
      },
      configureWebhook: {
        title: "Configure Webhook",
        description:
          "Configure the webhook to receive incoming messages and delivery updates.",
      },
      testConnection: {
        title: "Test Connection",
        description:
          "Send and receive a test message to confirm that the integration is working.",
      },
      completed: {
        title: "Setup Completed",
        description:
          "Your WhatsApp Business API environment is ready to use.",
      },
    },

    buttons: {
      connectMeta: "Connect Meta Account",
      reconnectMeta: "Reconnect Meta Account",
      configureWebhook: "Configure Webhook",
      testConnection: "Test Connection",
      finishSetup: "Finish Setup",
    },

    status: {
      metaConnected: "Meta account connected",
      metaNotConnected: "Meta account not connected",
      webhookVerified: "Webhook verified",
      webhookNotVerified: "Webhook not verified",
      phoneRegistered: "Phone number registered",
      phoneNotRegistered: "Phone number not registered",
    },

    messages: {
      loadingIntegration: "Loading WhatsApp integration...",
      integrationNotFound: "No WhatsApp integration found.",
      metaConnectedSuccess: "Meta account connected successfully.",
      webhookConfiguredSuccess: "Webhook configured successfully.",
      setupCompletedSuccess: "Environment setup completed successfully.",
      genericError: "Something went wrong. Please try again.",
    },
  },
};