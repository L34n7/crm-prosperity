
import type { WhiteLabelBranding } from "@/lib/white-label/types";

type Rgb = { r: number; g: number; b: number };

export type WhiteLabelThemePalette = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

function limitar(valor: number) {
  return Math.max(0, Math.min(255, Math.round(valor)));
}

function normalizarHex(cor: string | null | undefined) {
  const valor = String(cor || "").trim();

  if (/^#[0-9a-f]{6}$/i.test(valor)) {
    return valor.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(valor)) {
    const [, r, g, b] = valor;
    return ("#" + r + r + g + g + b + b).toLowerCase();
  }

  return "#0f509a";
}

function hexParaRgb(cor: string): Rgb {
  const valor = normalizarHex(cor).slice(1);
  return {
    r: Number.parseInt(valor.slice(0, 2), 16),
    g: Number.parseInt(valor.slice(2, 4), 16),
    b: Number.parseInt(valor.slice(4, 6), 16),
  };
}

function rgbParaHex(rgb: Rgb) {
  const parte = (valor: number) => limitar(valor).toString(16).padStart(2, "0");
  return "#" + parte(rgb.r) + parte(rgb.g) + parte(rgb.b);
}

function misturar(corA: string, corB: string, pesoCorB: number) {
  const a = hexParaRgb(corA);
  const b = hexParaRgb(corB);
  const peso = Math.max(0, Math.min(1, pesoCorB));

  return rgbParaHex({
    r: a.r * (1 - peso) + b.r * peso,
    g: a.g * (1 - peso) + b.g * peso,
    b: a.b * (1 - peso) + b.b * peso,
  });
}

function rgba(cor: string, alpha: number) {
  const rgb = hexParaRgb(cor);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function declaracoes(variaveis: Record<string, string>) {
  return Object.entries(variaveis)
    .map(([chave, valor]) => `${chave}: ${valor};`)
    .join("\n");
}

export function gerarPaletaWhiteLabel(
  corPrimaria: string | null | undefined
): WhiteLabelThemePalette {
  const base = normalizarHex(corPrimaria);
  const branco = "#ffffff";
  const preto = "#020617";
  const slate950 = "#020617";
  const slate900 = "#0f172a";
  const slate800 = "#1e293b";

  const luminosidade =
    (hexParaRgb(base).r * 0.2126 +
      hexParaRgb(base).g * 0.7152 +
      hexParaRgb(base).b * 0.0722) /
    255;
  const baseUi =
    luminosidade > 0.78 ? misturar(base, slate900, 0.42) : base;

  const hover = misturar(baseUi, slate900, 0.18);
  const forte = misturar(baseUi, slate900, 0.42);
  const forteHover = misturar(baseUi, preto, 0.5);
  const suave = misturar(baseUi, branco, 0.9);
  const suaveHover = misturar(baseUi, branco, 0.8);
  const borda = misturar(baseUi, branco, 0.66);
  const texto = misturar(baseUi, slate900, 0.2);
  const claro = misturar(baseUi, branco, 0.35);
  const muitoClaro = misturar(baseUi, branco, 0.72);

  const darkPrimary = misturar(baseUi, branco, 0.18);
  const darkHover = misturar(baseUi, branco, 0.3);
  const darkStrong = misturar(baseUi, slate950, 0.18);
  const darkStrongHover = misturar(baseUi, branco, 0.08);
  const darkText = misturar(baseUi, branco, 0.55);
  const darkSurfaceTint = misturar(baseUi, slate900, 0.76);
  const darkSurfaceTintStrong = misturar(baseUi, slate800, 0.58);

  const publicPrimary = forte;
  const publicSecondary = hover;

  return {
    light: {
      "--crm-bg-soft": misturar(baseUi, branco, 0.9),
      "--crm-shell-bg": `linear-gradient(180deg, ${misturar(baseUi, branco, 0.97)} 0%, ${misturar(baseUi, branco, 0.92)} 100%)`,
      "--crm-header-bg": `linear-gradient(135deg, ${rgba(baseUi, 0.025)} 0%, ${rgba(baseUi, 0.055)} 100%)`,
      "--crm-sidebar-bg": `linear-gradient(180deg, #ffffff 0%, ${misturar(baseUi, branco, 0.95)} 130%)`,
      "--crm-sidebar-border": misturar(baseUi, branco, 0.84),
      "--crm-border": misturar(baseUi, branco, 0.88),
      "--crm-border-soft": misturar(baseUi, branco, 0.92),
      "--crm-primary": baseUi,
      "--crm-primary-hover": hover,
      "--crm-primary-strong": forte,
      "--crm-primary-strong-hover": forteHover,
      "--crm-primary-soft": suave,
      "--crm-primary-soft-hover": suaveHover,
      "--crm-primary-border": borda,
      "--crm-primary-text": texto,
      "--crm-accent": baseUi,
      "--crm-accent-soft": rgba(baseUi, 0.14),
      "--crm-sidebar-hover": rgba(baseUi, 0.1),
      "--crm-sidebar-active-bg": `linear-gradient(135deg, ${forte} 0%, ${hover} 100%)`,
      "--crm-sidebar-active-shadow": `0 10px 24px ${rgba(forte, 0.22)}`,
      "--crm-sidebar-avatar-ring": rgba(baseUi, 0.22),
      "--crm-focus-ring": `0 0 0 4px ${rgba(baseUi, 0.2)}`,
      "--headerBackgroundHover": suaveHover,
      "--headerNotificItem": misturar(baseUi, branco, 0.84),
      "--headerNotificItemHover": misturar(baseUi, branco, 0.9),
      "--headerDropdownHover": misturar(baseUi, branco, 0.92),
      "--headerAvatar": `linear-gradient(80deg, ${claro} 0%, ${muitoClaro} 100%)`,
      "--conversationItem": `linear-gradient(135deg, #ffffff 0%, ${misturar(baseUi, branco, 0.95)} 100%)`,
      "--crm-bottom-Hover": misturar(baseUi, branco, 0.94),
      "--crm-bottom-Active": `linear-gradient(135deg, #ffffff 10%, ${misturar(baseUi, branco, 0.76)} 100%)`,
      "--messageBubbleOutgoing": misturar(baseUi, branco, 0.72),

      "--crm-ui-public-content-hex-047857": texto,
      "--crm-ui-public-border-hex-10b981": baseUi,
      "--crm-ui-public-shadow-rgb-16-185-129-0-12": rgba(baseUi, 0.12),
      "--crm-ui-public-border-rgb-16-185-129-0-28": rgba(baseUi, 0.28),
      "--crm-ui-public-surface-hex-065f46": publicPrimary,
      "--crm-ui-public-surface-hex-059669": publicSecondary,
      "--crm-ui-public-shadow-rgb-5-150-105-0-24": rgba(baseUi, 0.24),
      "--crm-ui-public-shadow-rgb-5-150-105-0-3": rgba(baseUi, 0.3),
    },
    dark: {
      "--crm-bg-soft": misturar(baseUi, slate950, 0.88),
      "--crm-shell-bg": `linear-gradient(180deg, #080d14 0%, ${misturar(baseUi, slate950, 0.84)} 100%)`,
      "--crm-header-bg": `linear-gradient(135deg, ${misturar(baseUi, slate950, 0.9)} 0%, ${misturar(baseUi, slate900, 0.84)} 100%)`,
      "--crm-sidebar-bg": `linear-gradient(180deg, #08111c 0%, ${misturar(baseUi, slate950, 0.72)} 58%, ${misturar(baseUi, slate900, 0.66)} 140%)`,
      "--crm-sidebar-border": rgba(baseUi, 0.18),
      "--crm-border": misturar(baseUi, slate900, 0.82),
      "--crm-border-soft": rgba(baseUi, 0.12),
      "--crm-primary": darkPrimary,
      "--crm-primary-hover": darkHover,
      "--crm-primary-strong": darkStrong,
      "--crm-primary-strong-hover": darkStrongHover,
      "--crm-primary-soft": rgba(baseUi, 0.16),
      "--crm-primary-soft-hover": rgba(baseUi, 0.24),
      "--crm-primary-border": rgba(baseUi, 0.34),
      "--crm-primary-text": darkText,
      "--crm-accent": misturar(baseUi, branco, 0.26),
      "--crm-accent-soft": rgba(baseUi, 0.16),
      "--crm-sidebar-hover": rgba(baseUi, 0.12),
      "--crm-sidebar-active-bg": `linear-gradient(135deg, ${misturar(baseUi, preto, 0.28)} 0%, ${misturar(baseUi, branco, 0.05)} 100%)`,
      "--crm-sidebar-active-shadow": `0 16px 34px ${rgba(baseUi, 0.22)}`,
      "--crm-sidebar-avatar-ring": rgba(baseUi, 0.34),
      "--crm-focus-ring": `0 0 0 4px ${rgba(baseUi, 0.24)}`,
      "--headerBackgroundHover": misturar(baseUi, slate950, 0.72),
      "--headerNotificItem": misturar(baseUi, slate900, 0.66),
      "--headerNotificItemHover": misturar(baseUi, slate950, 0.74),
      "--headerDropdownHover": misturar(baseUi, slate950, 0.7),
      "--headerAvatar": `linear-gradient(80deg, ${misturar(baseUi, preto, 0.22)} 0%, ${misturar(baseUi, branco, 0.18)} 100%)`,
      "--conversationItem": `linear-gradient(135deg, #111827 0%, ${darkSurfaceTint} 100%)`,
      "--crm-bottom-Hover": `linear-gradient(135deg, ${rgba(baseUi, 0)} 0%, ${darkSurfaceTint} 100%)`,
      "--crm-bottom-Active": `linear-gradient(135deg, ${rgba(baseUi, 0.1)} 0%, ${darkSurfaceTintStrong} 100%)`,
      "--messageBubbleOutgoing": misturar(baseUi, slate900, 0.48),
    },
  };
}

export function gerarCssTemaWhiteLabel(
  branding: Pick<WhiteLabelBranding, "is_white_label" | "cor_primaria">
) {
  if (!branding.is_white_label) return "";

  const paleta = gerarPaletaWhiteLabel(branding.cor_primaria);

  return `
html[data-white-label-theme="true"] {
${declaracoes(paleta.light)}
}

html[data-white-label-theme="true"][data-theme="dark"] {
${declaracoes(paleta.dark)}
}
`;
}
