"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./FooterSocialLinks.module.css";

const FOOTER_DESCRIPTION_START =
  "Plataforma empresarial de atendimento, automação e gestão de relacionamento";

function normalizarTexto(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export default function FooterSocialLinks() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let frameId: number | null = null;

    function localizarRodape() {
      if (disposed) return;

      const footers = Array.from(document.querySelectorAll("footer"));
      let mountEncontrado: HTMLElement | null = null;

      for (const footer of footers) {
        const description = Array.from(footer.querySelectorAll("p")).find(
          (paragraph) =>
            normalizarTexto(paragraph.textContent).startsWith(
              FOOTER_DESCRIPTION_START
            )
        );

        if (!description) continue;

        let mount = footer.querySelector<HTMLElement>(
          "[data-crm-footer-social-links]"
        );

        if (!mount) {
          mount = document.createElement("div");
          mount.dataset.crmFooterSocialLinks = "true";
          description.insertAdjacentElement("afterend", mount);
        }

        mountEncontrado = mount;
        break;
      }

      setMountNode((current) =>
        current === mountEncontrado ? current : mountEncontrado
      );
    }

    function agendarLocalizacao() {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        localizarRodape();
      });
    }

    const observer = new MutationObserver(agendarLocalizacao);

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("load", agendarLocalizacao);
    agendarLocalizacao();

    const reforcoInicial = window.setTimeout(agendarLocalizacao, 250);
    const reforcoFinal = window.setTimeout(agendarLocalizacao, 1000);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("load", agendarLocalizacao);
      window.clearTimeout(reforcoInicial);
      window.clearTimeout(reforcoFinal);

      if (frameId !== null) cancelAnimationFrame(frameId);

      document
        .querySelectorAll<HTMLElement>("[data-crm-footer-social-links]")
        .forEach((element) => element.remove());
    };
  }, []);

  if (!mountNode || !mountNode.isConnected) return null;

  return createPortal(
    <nav className={styles.socialLinks} aria-label="Redes sociais do CRM Prosperity">
      <a
        href="https://www.instagram.com/crmprosperity"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.socialLink}
        aria-label="Acessar o Instagram do CRM Prosperity"
        title="Instagram do CRM Prosperity"
      >
        <Image
          src="/icons/insta.png"
          alt=""
          width={36}
          height={36}
          className={styles.icon}
          aria-hidden="true"
        />
      </a>

      <a
        href="https://www.youtube.com/@CRMProsperity"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.socialLink}
        aria-label="Acessar o canal do CRM Prosperity no YouTube"
        title="YouTube do CRM Prosperity"
      >
        <Image
          src="/icons/youtube.png"
          alt=""
          width={36}
          height={36}
          className={styles.icon}
          aria-hidden="true"
        />
      </a>
    </nav>,
    mountNode
  );
}
