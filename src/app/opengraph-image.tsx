import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "CRM Prosperity — atendimento pelo WhatsApp organizado, automatizado e potencializado por IA";
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

  return "https://crmprosperity.com";
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
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          padding: "54px 64px",
          background:
            "radial-gradient(circle at 48% 10%, rgba(14, 128, 104, 0.34) 0%, rgba(7, 40, 36, 0.16) 31%, rgba(2, 14, 18, 0) 58%), linear-gradient(135deg, #031014 0%, #04181a 48%, #061115 100%)",
          color: "#f8fafc",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            opacity: 0.18,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 54,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 66,
                height: 66,
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "linear-gradient(145deg, rgba(20, 184, 137, 0.18), rgba(255,255,255,0.04))",
                border: "1px solid rgba(75, 219, 173, 0.24)",
              }}
            >
              <img
                src={`${siteUrl}/logo.png`}
                alt=""
                width="54"
                height="54"
                style={{ objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 31, fontWeight: 800 }}>CRM</span>
              <span
                style={{
                  fontSize: 31,
                  fontWeight: 800,
                  color: "#efc983",
                }}
              >
                Prosperity
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 20px",
              borderRadius: 999,
              border: "1px solid rgba(48, 211, 158, 0.30)",
              background: "rgba(7, 95, 76, 0.20)",
              color: "#8be2bd",
              fontSize: 19,
              fontWeight: 700,
            }}
          >
            ✦ Inteligência Artificial integrada
          </div>
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: 1060,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 58,
              lineHeight: 1.02,
              letterSpacing: "-2.5px",
              fontWeight: 800,
            }}
          >
            <span>Atendimento pelo WhatsApp</span>
            <span
              style={{
                marginTop: 10,
                background:
                  "linear-gradient(90deg, #f1d7a7 0%, #d8c886 36%, #7cddb6 74%, #51d8ac 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              organizado, automatizado e
            </span>
            <span
              style={{
                marginTop: 4,
                background:
                  "linear-gradient(90deg, #f1d7a7 0%, #d8c886 30%, #7cddb6 68%, #51d8ac 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              potencializado por IA.
            </span>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 34,
              maxWidth: 900,
              fontSize: 24,
              lineHeight: 1.4,
              color: "#a9b8b8",
            }}
          >
            Centralize conversas, organize sua equipe e automatize processos em
            uma única plataforma conectada ao WhatsApp.
          </div>

          <div
            style={{
              display: "flex",
              gap: 30,
              marginTop: 38,
              fontSize: 18,
              fontWeight: 700,
              color: "#7f9290",
            }}
          >
            <span style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "#d7af68" }}>✓</span>
              API Oficial da Meta + Coexistência
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "#d7af68" }}>✓</span>
              Google Calendar
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <span style={{ color: "#d7af68" }}>✓</span>
              Automações com IA
            </span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
