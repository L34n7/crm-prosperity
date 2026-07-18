"use client";

import { useEffect } from "react";

const LINK_ID = "mobile-empresa-menu-link";

function criarIconeEmpresa() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const paths = [
    "M3 21h18",
    "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16",
    "M9 7h1",
    "M14 7h1",
    "M9 11h1",
    "M14 11h1",
    "M9 15h1",
    "M14 15h1",
  ];

  paths.forEach((d) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  });

  return svg;
}

export default function MobileEmpresaMenuLink({ isAdmin }: { isAdmin: boolean }) {
  useEffect(() => {
    if (!isAdmin) return;

    function inserirAtalho() {
      if (document.getElementById(LINK_ID)) return;

      const perfil = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href="/perfil"]'),
      ).find((link) => link.textContent?.trim() === "Perfil");

      if (!perfil || !perfil.parentElement) return;

      const link = document.createElement("a");
      link.id = LINK_ID;
      link.href = "/configuracoes-gerais";
      link.className = perfil.className;
      link.appendChild(criarIconeEmpresa());

      const texto = document.createElement("span");
      texto.textContent = "Empresa";
      link.appendChild(texto);

      link.addEventListener("click", () => {
        const overlay = link.closest('[class*="mobileMoreOverlay"]');
        if (overlay instanceof HTMLElement) overlay.click();
      });

      perfil.insertAdjacentElement("afterend", link);
    }

    inserirAtalho();

    const observer = new MutationObserver(inserirAtalho);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.getElementById(LINK_ID)?.remove();
    };
  }, [isAdmin]);

  return null;
}
