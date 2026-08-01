"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./FooterSocialLinks.module.css";

const FOOTER_DESCRIPTION =
  "Plataforma empresarial de atendimento, automação e gestão de relacionamento com clientes pelo WhatsApp.";

function normalizarTexto(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export default function FooterSocialLinks() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    let createdMount: HTMLElement | null = null;

    function localizarRodape() {
      const footer = document.querySelector("footer");
      if (!footer) return false;

      const description = Array.from(footer.querySelectorAll("p")).find(
        (paragraph) =>
          normalizarTexto(paragraph.textContent) === FOOTER_DESCRIPTION
      );

      if (!description) return false;

      let mount = footer.querySelector<HTMLElement>(
        "[data-crm-footer-social-links]"
      );

      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.crmFooterSocialLinks = "true";
        description.insertAdjacentElement("afterend", mount);
        createdMount = mount;
      }

      setMountNode(mount);
      return true;
    }

    if (!localizarRodape()) {
      observer = new MutationObserver(() => {
        if (localizarRodape()) observer?.disconnect();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer?.disconnect();
      createdMount?.remove();
    };
  }, []);

  if (!mountNode) return null;

  return createPortal(
    <nav className={styles.socialLinks} aria-label="Redes sociais do CRM Prosperity">
      <a
        href="https://www.instagram.com/crmprosperity"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.socialLink}
        aria-label="Acessar o Instagram do CRM Prosperity"
      >
        <span className={styles.iconWrap} aria-hidden="true">
          <Image
            src="/icons/insta.png"
            alt=""
            width={24}
            height={24}
            className={styles.icon}
          />
        </span>
        <span>@crmprosperity</span>
      </a>

      <a
        href="https://www.youtube.com/@CRMProsperity"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.socialLink}
        aria-label="Acessar o canal do CRM Prosperity no YouTube"
      >
        <span className={styles.iconWrap} aria-hidden="true">
          <Image
            src="/icons/youtube.png"
            alt=""
            width={24}
            height={24}
            className={styles.icon}
          />
        </span>
        <span>CRM Prosperity</span>
      </a>
    </nav>,
    mountNode
  );
}
