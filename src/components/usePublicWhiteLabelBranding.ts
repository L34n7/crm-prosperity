
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
          setBranding(data.branding as WhiteLabelBranding);
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
