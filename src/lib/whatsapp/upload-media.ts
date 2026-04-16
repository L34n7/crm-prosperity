export type UploadWhatsAppMediaParams = {
  phoneNumberId: string;
  accessToken: string;
  file: File;
};

export type UploadWhatsAppMediaResult = {
  ok: boolean;
  status: number;
  mediaId: string | null;
  raw: unknown;
  error: string | null;
};

export async function uploadWhatsAppMedia({
  phoneNumberId,
  accessToken,
  file,
}: UploadWhatsAppMediaParams): Promise<UploadWhatsAppMediaResult> {
  if (!phoneNumberId) {
    throw new Error("phoneNumberId é obrigatório");
  }

  if (!accessToken) {
    throw new Error("accessToken é obrigatório");
  }

  if (!file) {
    throw new Error("Arquivo é obrigatório");
  }

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", file, file.name);

  const response = await fetch(
    `https://graph.facebook.com/v23.0/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  const raw = await response.json().catch(() => null);

  const mediaId =
    raw &&
    typeof raw === "object" &&
    "id" in raw &&
    typeof (raw as { id?: unknown }).id === "string"
      ? (raw as { id: string }).id
      : null;

  const error =
    !response.ok && raw && typeof raw === "object" && "error" in raw
      ? JSON.stringify((raw as { error?: unknown }).error)
      : !response.ok
      ? "Erro ao subir mídia para o WhatsApp"
      : null;

  return {
    ok: response.ok,
    status: response.status,
    mediaId,
    raw,
    error,
  };
}