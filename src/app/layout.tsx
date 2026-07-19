import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = (() => {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return "https://crmprosperity.com.br";
})();

const title = "CRM Prosperity | Atendimento, automações e vendas no WhatsApp";
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
    icon: [{ url: "/favicon.svg?v=4", sizes: "any", type: "image/svg+xml" }],
    shortcut: [{ url: "/favicon.svg?v=4", type: "image/svg+xml" }],
    apple: [{ url: "/logo.png?v=4", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
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
    logo: `${siteUrl}/logo.png`,
    image: `${siteUrl}/opengraph-image`,
    description,
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CRM Prosperity",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    image: `${siteUrl}/logo.png`,
    description,
  };

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href="/favicon.svg?v=4"
          type="image/svg+xml"
          sizes="any"
        />
        <link
          rel="shortcut icon"
          href="/favicon.svg?v=4"
          type="image/svg+xml"
        />
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
        <Script
          id="crm-organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
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
