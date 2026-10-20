
"use client";

import { useEffect } from "react";
import type { WhiteLabelBranding } from "@/lib/white-label/types";
import { gerarCssTemaWhiteLabel } from "@/lib/white-label/theme";

const STYLE_ID = "crm-white-label-theme-runtime";

export default function WhiteLabelThemeRuntime({
  branding,
}: {
  branding: WhiteLabelBranding;
}) {
  useEffect(() => {
    if (!branding.is_white_label) return;

    const root = document.documentElement;
    const temaVeioDoHost = root.dataset.whiteLabelHost === "true";
    root.dataset.whiteLabelTheme = "true";

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = gerarCssTemaWhiteLabel(branding);

    return () => {
      style?.remove();

      if (!temaVeioDoHost) {
        delete root.dataset.whiteLabelTheme;
      }
    };
  }, [branding]);

  return null;
}
