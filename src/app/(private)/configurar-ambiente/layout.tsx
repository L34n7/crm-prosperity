import type { ReactNode } from "react";

type ConfigurarAmbienteLayoutProps = {
  children: ReactNode;
};

export default function ConfigurarAmbienteLayout({
  children,
}: ConfigurarAmbienteLayoutProps) {
  return (
    <div className="configurarAmbienteRoute">
      <style>{`
        @media (max-width: 640px) {
          .configurarAmbienteRoute h2[class*="quizTitle"] {
            margin: 6px 0 4px !important;
            font-size: clamp(25px, 6.8vw, 28px) !important;
            line-height: 1.08 !important;
            letter-spacing: -0.03em !important;
            text-wrap: balance;
          }
        }
      `}</style>
      {children}
    </div>
  );
}
