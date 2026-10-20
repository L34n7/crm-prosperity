
"use client";

import { useEffect, useState } from "react";
import {
  BRANDING_PROSPERITY,
  type WhiteLabelBranding,
} from "@/lib/white-label/types";

export function usePublicWhiteLabelBranding() {
  const [branding, setBranding] =
    useState<WhiteLabelBranding>(BRANDING_PROSPERITY);

  useEffect(() => {
    let ativo = true;

    fetch("/api/white-label/branding", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (ativo && data?.ok && data?.branding) {
          const proximoBranding = data.branding as WhiteLabelBranding;
          setBranding(proximoBranding);

          if (proximoBranding.favicon_url) {
            let favicon = document.querySelector<HTMLLinkElement>(
              'link[rel="icon"][data-white-label-favicon="true"]'
            );

            if (!favicon) {
              favicon = document.createElement("link");
              favicon.rel = "icon";
              favicon.dataset.whiteLabelFavicon = "true";
              document.head.appendChild(favicon);
            }

            favicon.href = proximoBranding.favicon_url;
          }
        }
      })
      .catch(() => {
        // Mantém a marca padrão se o domínio não estiver configurado.
      });

    return () => {
      ativo = false;
    };
  }, []);

  return branding;
}
