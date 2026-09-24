export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateLanguage = "pt_BR" | "en_US";

export type TextHeaderComponent = {
  type: "HEADER";
  format: "TEXT";
  text: string;
};

export type ImageHeaderComponent = {
  type: "HEADER";
  format: "IMAGE";
  example: {
    header_handle: string[];
  };
};

export type HeaderComponent = TextHeaderComponent | ImageHeaderComponent;

export type BodyComponent = {
  type: "BODY";
  text: string;
  example?: {
    body_text: string[][];
  };
};

export type FooterComponent = {
  type: "FOOTER";
  text: string;
};

export type QuickReplyButton = {
  type: "QUICK_REPLY";
  text: string;
};

export type UrlButton = {
  type: "URL";
  text: string;
  url: string;
};

export type TemplateButton = QuickReplyButton | UrlButton;

export type ButtonsComponent = {
  type: "BUTTONS";
  buttons: TemplateButton[];
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

  const headers = input.components.filter((item) => item.type === "HEADER");
  if (headers.length > 1) {
    errors.push("Informe apenas um HEADER no template.");
  }

  const header = headers[0];
  if (header?.format === "TEXT") {
    if (!header.text?.trim()) {
      errors.push("O texto do HEADER é obrigatório quando o cabeçalho for Texto.");
    }

    if (header.text.length > 60) {
      errors.push("HEADER deve ter no máximo 60 caracteres.");
    }
  }

  if (header?.format === "IMAGE") {
    const handles = Array.isArray(header.example?.header_handle)
      ? header.example.header_handle
      : [];
    const handleValido = handles.some((item) => String(item || "").trim());

    if (!handleValido) {
      errors.push("O HEADER de imagem precisa da mídia de exemplo enviada à Meta.");
    }
  }

  if (body && "text" in body && body.text.length > 1024) {
    errors.push("BODY deve ter no máximo 1024 caracteres.");
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

    const quickReplyButtons = buttons.buttons.filter(
      (button) => button.type === "QUICK_REPLY"
    );
    const urlButtons = buttons.buttons.filter(
      (button) => button.type === "URL"
    );

    if (quickReplyButtons.length > 3) {
      errors.push("BUTTONS pode ter no máximo 3 botões QUICK_REPLY.");
    }

    if (urlButtons.length > 1) {
      errors.push("BUTTONS pode ter no máximo 1 botão Redirect.");
    }

    const invalidButton = buttons.buttons.find(
      (button) => !button.text?.trim() || button.text.length > 25
    );

    if (invalidButton) {
      errors.push("Cada botão deve ter texto entre 1 e 25 caracteres.");
    }

    for (const button of urlButtons) {
      const url = String(button.url || "").trim();

      if (!url) {
        errors.push("O botão Redirect precisa de uma URL.");
        continue;
      }

      if (url.length > 2000) {
        errors.push("A URL do botão Redirect deve ter no máximo 2000 caracteres.");
        continue;
      }

      if (/\{\{\d+\}\}/.test(url)) {
        errors.push(
          "O botão Redirect criado pelo CRM usa URL fixa. Remova variáveis da URL."
        );
        continue;
      }

      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("A URL do botão Redirect deve começar com http:// ou https://.");
        }
      } catch {
        errors.push("Informe uma URL válida para o botão Redirect.");
      }
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