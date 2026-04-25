"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "@/components/LogoutButton";
import { useHeaderUser } from "@/components/header-user-context";
import styles from "./Header.module.css";

type HeaderProps = {
  title: string;
  subtitle?: string;
  profileName?: string;
  creditLabel?: string;
  avatarUrl?: string;
};

export default function Header({
  title,
  subtitle,
  profileName,
  avatarUrl,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const headerUser = useHeaderUser();

  const nomeFinal = profileName || headerUser.profileName || "Usuário";
  const avatarFinal = avatarUrl || headerUser.avatarUrl || "";
  const letraAvatar = nomeFinal?.trim()?.charAt(0)?.toUpperCase() || "U";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return;

      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function toggleMenu() {
    setMenuOpen((prev) => !prev);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>

      <div className={styles.right}>
        <div className={styles.userMenuWrapper} ref={menuRef}>
          <button
            type="button"
            className={styles.profileButton}
            onClick={toggleMenu}
          >
            <div className={styles.avatar}>
              {avatarFinal ? (
                <img
                  src={avatarFinal}
                  alt={`Foto de ${nomeFinal}`}
                  className={styles.avatarImage}
                />
              ) : (
                <span className={styles.avatarFallback}>{letraAvatar}</span>
              )}
            </div>

            <span className={styles.profileName}>{nomeFinal}</span>
            <span className={styles.chevron}>{menuOpen ? "▴" : "▾"}</span>
          </button>

          {menuOpen && (
            <div className={styles.dropdown}>
              <Link
                href="/perfil"
                className={styles.dropdownItem}
                onClick={closeMenu}
              >
                Meu perfil
              </Link>

              <div className={styles.dropdownDivider} />

              <div className={styles.dropdownLogout}>
                <LogoutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}