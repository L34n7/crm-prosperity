import type { Metadata } from "next";
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
    <html lang="pt-BR">
      <body className="bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}