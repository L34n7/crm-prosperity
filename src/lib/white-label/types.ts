
export type WhiteLabelBranding = {
  is_white_label: boolean;
  id: string | null;
  nome_marca: string;
  nome_produto: string;
  dominio: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  cor_primaria: string;
};

export type WhiteLabelResumo = WhiteLabelBranding & {
  slug: string | null;
  licencas_contratadas: number;
  licencas_usadas: number;
  licencas_disponiveis: number;
  plano_padrao_id: string | null;
  empresa_gestora_id: string | null;
  status: "ativo" | "inativo";
};

export type WhiteLabelAdminContexto = {
  id: string;
  white_label_id: string;
  usuario_id: string | null;
  email: string;
  nome: string | null;
  white_label: WhiteLabelResumo;
};

export const BRANDING_PROSPERITY: WhiteLabelBranding = {
  is_white_label: false,
  id: null,
  nome_marca: "CRM Prosperity",
  nome_produto: "CRM Prosperity",
  dominio: "crmprosperity.com",
  logo_url: "/logo.png",
  favicon_url: "/favicon.ico",
  cor_primaria: "#0f509a",
};
