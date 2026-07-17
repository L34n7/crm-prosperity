import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "CRM Prosperity - Plataforma empresarial de atendimento e automação no WhatsApp";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return "https://crmprosperity.com.br";
}

export default function OpenGraphImage() {
  const siteUrl = getSiteUrl();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "72px 82px",
          background:
            "radial-gradient(circle at 15% 20%, #2563eb 0%, #123b82 34%, #07152d 100%)",
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "760px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#bfdbfe",
              marginBottom: 24,
            }}
          >
            Plataforma empresarial
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              lineHeight: 1.04,
              fontWeight: 800,
              marginBottom: 28,
            }}
          >
            CRM Prosperity
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              lineHeight: 1.3,
              color: "#dbeafe",
            }}
          >
            Atendimento, automações, disparos e gestão de leads pelo WhatsApp.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 270,
            height: 270,
            borderRadius: 62,
            background: "rgba(255, 255, 255, 0.96)",
            boxShadow: "0 30px 80px rgba(0, 0, 0, 0.32)",
          }}
        >
          <img
            src={`${siteUrl}/logo.png`}
            alt=""
            width="220"
            height="220"
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>
    ),
    size
  );
}
