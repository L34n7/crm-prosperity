"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type Notificacao = {
  id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  conversa_id: string | null;
  created_at: string;
  metadata_json?: Record<string, any>;
};

export default function Header({
  title,
  subtitle,
  profileName,
  avatarUrl,
}: HeaderProps) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificacoesOpen, setNotificacoesOpen] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificacoesRef = useRef<HTMLDivElement | null>(null);

  const headerUser = useHeaderUser();

  const nomeFinal = profileName || headerUser.profileName || "Usuário";
  const avatarFinal = avatarUrl || headerUser.avatarUrl || "";
  const letraAvatar = nomeFinal?.trim()?.charAt(0)?.toUpperCase() || "U";

  async function carregarNotificacoes() {
    try {
      const res = await fetch("/api/notificacoes", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.ok) return;

      setNotificacoes(json.notificacoes || []);
      setNaoLidas(json.nao_lidas || 0);
    } catch {
      // silencioso para não quebrar header
    }
  }

  async function abrirNotificacao(notificacao: Notificacao) {
    try {
      if (!notificacao.lida) {
        await fetch("/api/notificacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: notificacao.id }),
        });
      }

      setNotificacoesOpen(false);
      setNaoLidas((atual) => Math.max(0, atual - (notificacao.lida ? 0 : 1)));

      if (notificacao.conversa_id) {
        router.push(`/conversas?id=${notificacao.conversa_id}`);
      }
    } catch {
      if (notificacao.conversa_id) {
        router.push(`/conversas?id=${notificacao.conversa_id}`);
      }
    }
  }

  useEffect(() => {
    carregarNotificacoes();

    const interval = window.setInterval(() => {
      carregarNotificacoes();
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }

      if (notificacoesRef.current && !notificacoesRef.current.contains(target)) {
        setNotificacoesOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function toggleMenu() {
    setMenuOpen((prev) => !prev);
    setNotificacoesOpen(false);
  }

  function toggleNotificacoes() {
    setNotificacoesOpen((prev) => !prev);
    setMenuOpen(false);
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
        <div className={styles.notificationWrapper} ref={notificacoesRef}>
          <button
            type="button"
            className={styles.notificationButton}
            onClick={toggleNotificacoes}
            title="Notificações"
          >
            🔔

            {naoLidas > 0 && (
              <span className={styles.notificationBadge}>
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            )}
          </button>

          {notificacoesOpen && (
            <div className={styles.notificationDropdown}>
              <div className={styles.notificationHeader}>
                <strong>Notificações</strong>
                <span>{naoLidas} não lida(s)</span>
              </div>

              {notificacoes.length === 0 ? (
                <div className={styles.notificationEmpty}>
                  Nenhuma notificação.
                </div>
              ) : (
                <div className={styles.notificationList}>
                  {notificacoes.map((notificacao) => (
                    <button
                      key={notificacao.id}
                      type="button"
                      className={
                        notificacao.lida
                          ? styles.notificationItem
                          : `${styles.notificationItem} ${styles.notificationItemUnread}`
                      }
                      onClick={() => abrirNotificacao(notificacao)}
                    >
                      <div className={styles.notificationItemTop}>
                        <strong>{notificacao.titulo}</strong>
                        {!notificacao.lida && (
                          <span className={styles.unreadDot} />
                        )}
                      </div>

                      <p>{notificacao.mensagem}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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