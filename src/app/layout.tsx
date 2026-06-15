import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Prosperity",
  description: "CRM web multiempresa com WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="crm-theme-bootstrap" strategy="beforeInteractive">
          {`
            (() => {
              try {
                const saved = window.localStorage.getItem("crm-theme");
                const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
                const theme = saved === "dark" || saved === "light" ? saved : system;
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch {
                document.documentElement.dataset.theme = "light";
                document.documentElement.style.colorScheme = "light";
              }
            })();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
