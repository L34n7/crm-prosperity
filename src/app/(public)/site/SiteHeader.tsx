"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import styles from "./site.module.css";

const NAVIGATION = [
  { href: "#solucao", label: "Solução" },
  { href: "#inteligencia-artificial", label: "Inteligência Artificial" },
  { href: "#recursos", label: "Recursos" },
  { href: "#integracoes", label: "Integrações" },
  { href: "#planos", label: "Planos" },
];

export default function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const scrollToSection = useCallback(
    (href: string, behavior: ScrollBehavior = "smooth") => {
      const section = document.querySelector<HTMLElement>(href);

      if (!section) {
        return;
      }

      const sectionHeading =
        section.querySelector<HTMLElement>(
          `.${styles.sectionHeading}, .${styles.aiHeader}`,
        ) ?? section;
      const headerBottom =
        headerRef.current?.getBoundingClientRect().bottom ?? 96;
      const viewportGap = window.innerWidth <= 720 ? 16 : 26;
      const scrollTop =
        window.scrollY +
        sectionHeading.getBoundingClientRect().top -
        headerBottom -
        viewportGap;

      window.scrollTo({
        top: Math.max(0, scrollTop),
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    function alignCurrentHash() {
      if (window.location.hash) {
        scrollToSection(window.location.hash, "auto");
      }
    }

    const initialFrame = window.requestAnimationFrame(alignCurrentHash);
    window.addEventListener("popstate", alignCurrentHash);

    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("popstate", alignCurrentHash);
    };
  }, [scrollToSection]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleNavigation(
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    event.preventDefault();
    closeMenu();

    if (window.location.hash !== href) {
      window.history.pushState(null, "", href);
    }

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToSection(href, behavior));
    });
  }

  return (
    <header
      ref={headerRef}
      className={`${styles.siteHeader} ${
        scrolled ? styles.siteHeaderScrolled : ""
      }`}
    >
      <div className={styles.headerInner}>
        <Link
          href="/site"
          className={styles.brand}
          aria-label="CRM Prosperity — página inicial"
          onClick={closeMenu}
        >
          <span className={styles.brandLogo}>
            <Image
              src="/logo.png"
              alt=""
              width={64}
              height={64}
              priority
            />
          </span>
          <span className={styles.brandName}>
            <strong>CRM</strong>
            <span>Prosperity</span>
          </span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Navegação principal">
          {NAVIGATION.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => handleNavigation(event, item.href)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link href="/login" className={styles.headerLogin}>
            Entrar
          </Link>
          <Link href="/comecar" className={styles.headerCta}>
            Criar conta
          </Link>
          <button
            type="button"
            className={styles.menuButton}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="site-mobile-menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>

      <div
        id="site-mobile-menu"
        className={`${styles.mobileMenu} ${
          menuOpen ? styles.mobileMenuOpen : ""
        }`}
        aria-hidden={!menuOpen}
      >
        <nav aria-label="Navegação mobile">
          {NAVIGATION.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => handleNavigation(event, item.href)}
            >
              {item.label}
            </a>
          ))}
          <a
            href="#faq"
            onClick={(event) => handleNavigation(event, "#faq")}
          >
            Perguntas frequentes
          </a>
        </nav>
        <div className={styles.mobileActions}>
          <Link href="/login" onClick={closeMenu}>
            Entrar no CRM
          </Link>
          <Link href="/comecar" onClick={closeMenu}>
            Criar minha conta
          </Link>
        </div>
      </div>
    </header>
  );
}
