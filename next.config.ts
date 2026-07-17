import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/configuracoes",
        destination: "/configuracoes-gerais",
        permanent: false,
      },
      {
        source: "/usuarios/:path*",
        destination: "/configuracoes/usuarios/:path*",
        permanent: false,
      },
      {
        source: "/empresas/:path*",
        destination: "/configuracoes/empresas/:path*",
        permanent: false,
      },
      {
        source: "/auditoria/:path*",
        destination: "/configuracoes/auditoria/:path*",
        permanent: false,
      },
      {
        source: "/configuracoes/templates-whatsapp/:path*",
        destination: "/templates-whatsapp/:path*",
        permanent: false,
      },
      {
        source: "/configuracoes/whatsapp/perfil/:path*",
        destination: "/perfil-whatsapp/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
