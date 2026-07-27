import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const UI_CONSISTENCY_STYLES = `
  [class*="editorPanel"] > [class*="editorHeader"] {
    min-width: 0 !important;
    flex-wrap: wrap !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] > div:first-child {
    min-width: 0 !important;
    max-width: 100% !important;
    flex: 1 1 360px !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] [class*="editorTitle"] {
    max-width: 100% !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] [class*="headerActions"] {
    min-width: 0 !important;
    max-width: 100% !important;
    flex: 0 1 auto !important;
  }

  [class*="editorPanel"] > [class*="editorHeader"] [class*="headerActionsButtons"] {
    min-width: 0 !important;
    max-width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    flex-wrap: wrap !important;
    gap: 10px !important;
  }

  [class*="captureInfoItem"] [class*="captureInfoContent"] > strong:first-child {
    display: block !important;
    margin: 0 0 2px !important;
    color: var(--crm-text-muted) !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    line-height: 1.35 !important;
    letter-spacing: 0.05em !important;
    text-transform: uppercase !important;
  }
`;

const CONTACT_CAPTURE_SORT_SCRIPT = `
  (() => {
    if (window.__crmContactCaptureAlphabeticalOrder) return;
    window.__crmContactCaptureAlphabeticalOrder = true;

    let frame = null;

    const obterTitulo = (item) => {
      const titulo = item.querySelector(
        '[class*="captureInfoContent"] > strong:first-child'
      );

      return String(titulo?.textContent || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .trim();
    };

    const ordenarListas = () => {
      document
        .querySelectorAll('[class*="captureInfoList"]')
        .forEach((lista) => {
          const itens = Array.from(lista.children).filter(
            (item) =>
              item instanceof HTMLElement &&
              String(item.className || "").includes("captureInfoItem")
          );

          if (itens.length < 2) return;

          const ordenados = [...itens].sort((itemA, itemB) =>
            obterTitulo(itemA).localeCompare(obterTitulo(itemB), "pt-BR", {
              sensitivity: "base",
              numeric: true,
            })
          );

          const precisaReordenar = itens.some(
            (item, indice) => item !== ordenados[indice]
          );

          if (!precisaReordenar) return;

          const fragmento = document.createDocumentFragment();
          ordenados.forEach((item) => fragmento.appendChild(item));
          lista.appendChild(fragmento);
        });
    };

    const agendarOrdenacao = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        ordenarListas();
      });
    };

    const observer = new MutationObserver(agendarOrdenacao);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", agendarOrdenacao);
    agendarOrdenacao();
  })();
`;

const siteUrl = (() => {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return "https://crmprosperity.com";
})();

const title = "CRM Prosperity | CRM com IA para WhatsApp";
const description =
  "Centralize o atendimento pelo WhatsApp, automatize conversas, faça disparos, acompanhe leads e gerencie sua operação em uma única plataforma empresarial.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: "%s | CRM Prosperity",
  },
  description,
  applicationName: "CRM Prosperity",
  generator: "Next.js",
  keywords: [
    "CRM Prosperity",
    "CRM WhatsApp",
    "atendimento WhatsApp",
    "automação WhatsApp",
    "disparos WhatsApp",
    "gestão de leads",
    "WhatsApp Business API",
    "CRM empresarial",
  ],
  authors: [{ name: "CRM Prosperity", url: siteUrl }],
  creator: "CRM Prosperity",
  publisher: "CRM Prosperity",
  category: "technology",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl,
    siteName: "CRM Prosperity",
    title,
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "CRM Prosperity - Plataforma empresarial de atendimento e automação no WhatsApp",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CRM Prosperity",
    url: siteUrl,
    logo: `${siteUrl}/android-chrome-512x512.png`,
    image: `${siteUrl}/opengraph-image`,
    description,
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CRM Prosperity",
    alternateName: "CRM Prosperity",
    url: siteUrl,
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CRM Prosperity",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    image: `${siteUrl}/android-chrome-512x512.png`,
    description,
  };

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link
          rel="icon"
          href="/favicon-32x32.png"
          type="image/png"
          sizes="32x32"
        />
        <link
          rel="icon"
          href="/favicon-16x16.png"
          type="image/png"
          sizes="16x16"
        />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          href="/apple-touch-icon.png"
          sizes="180x180"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <style>{UI_CONSISTENCY_STYLES}</style>
      </head>
      <body className="antialiased">
        <Script id="crm-theme-bootstrap" strategy="beforeInteractive">
          {`
            (() => {
              try {
                const saved = window.localStorage.getItem("crm-theme");
                const theme = saved === "dark" || saved === "light" ? saved : "light";
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch {
                document.documentElement.dataset.theme = "light";
                document.documentElement.style.colorScheme = "light";
              }
            })();
          `}
        </Script>
        <Script id="crm-contact-capture-order" strategy="afterInteractive">
          {CONTACT_CAPTURE_SORT_SCRIPT}
        </Script>
        <Script
          id="crm-organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <Script
          id="crm-website-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <Script
          id="crm-software-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
        {children}
      </body>
    </html>
  );
}
