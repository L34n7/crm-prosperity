export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateLanguage = "pt_BR" | "en_US";

export type HeaderComponent = {
  type: "HEADER";
  format: "TEXT";
  text: string;
};

export type BodyComponent = {
  type: "BODY";
  text: string;
};

export type FooterComponent = {
  type: "FOOTER";
  text: string;
};

export type QuickReplyButton = {
  type: "QUICK_REPLY";
  text: string;
};

export type ButtonsComponent = {
  type: "BUTTONS";
  buttons: QuickReplyButton[];
};

export type TemplateComponent =
  | HeaderComponent
  | BodyComponent
  | FooterComponent
  | ButtonsComponent;

export type CreateTemplateInput = {
  name: string;
  category: TemplateCategory;
  language: TemplateLanguage;
  components: TemplateComponent[];
};

export function normalizeTemplateName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function validateTemplateInput(input: CreateTemplateInput) {
  const errors: string[] = [];

  if (!input.name?.trim()) {
    errors.push("Nome do template é obrigatório.");
  }

  if (!input.category) {
    errors.push("Categoria é obrigatória.");
  }

  if (!input.language) {
    errors.push("Idioma é obrigatório.");
  }

  if (!Array.isArray(input.components) || input.components.length === 0) {
    errors.push("Informe ao menos um componente.");
  }

  const body = input.components.find((item) => item.type === "BODY");
  if (!body) {
    errors.push("O componente BODY é obrigatório.");
  }

  const header = input.components.find((item) => item.type === "HEADER");
  if (header && "text" in header && header.text.length > 60) {
    errors.push("HEADER deve ter no máximo 60 caracteres.");
  }

  const footer = input.components.find((item) => item.type === "FOOTER");
  if (footer && "text" in footer && footer.text.length > 60) {
    errors.push("FOOTER deve ter no máximo 60 caracteres.");
  }

  const buttons = input.components.find((item) => item.type === "BUTTONS");
  if (buttons && "buttons" in buttons) {
    if (buttons.buttons.length === 0) {
      errors.push("BUTTONS deve ter ao menos um botão.");
    }

    if (buttons.buttons.length > 3) {
      errors.push("BUTTONS pode ter no máximo 3 botões QUICK_REPLY.");
    }

    const invalidButton = buttons.buttons.find(
      (button) => !button.text?.trim() || button.text.length > 25
    );

    if (invalidButton) {
      errors.push("Cada botão deve ter texto entre 1 e 25 caracteres.");
    }
  }

  return errors;
}

export async function createMetaTemplate(params: {
  wabaId: string;
  accessToken: string;
  data: CreateTemplateInput;
}) {
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${params.wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.data),
    }
  );

  const result = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data: result,
  };
}


export async function listMetaTemplates(params: {
  wabaId: string;
  accessToken: string;
}) {
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${params.wabaId}/message_templates?limit=100`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const result = await response.json();

  return {
    ok: response.ok,
    status: response.status,
    data: result,
  };
}