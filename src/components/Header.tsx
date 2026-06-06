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

type SaldoTokensIa = {
  limite_mensal: number | null;
  tokens_usados: number;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  periodo_inicio?: string;
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
  const [modalNotificacoesOpen, setModalNotificacoesOpen] = useState(false);
  const [paginaNotificacoes, setPaginaNotificacoes] = useState(1);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [saldoTokensIa, setSaldoTokensIa] = useState<SaldoTokensIa | null>(
    null
  );
  const [alertaTokensOpen, setAlertaTokensOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const notificacoesRef = useRef<HTMLDivElement | null>(null);

  const headerUser = useHeaderUser();
  const podeExibirSaldoTokensIa = headerUser.permissoes.includes(
    "ia.tokens.exibir_header"
  );
  const podeAcessarExtratoTokensIa = headerUser.permissoes.includes(
    "ia.tokens.visualizar_extrato"
  );

  const nomeFinal = profileName || headerUser.profileName || "Usuário";
  const avatarFinal = avatarUrl || headerUser.avatarUrl || "";
  const letraAvatar = nomeFinal?.trim()?.charAt(0)?.toUpperCase() || "U";

  const LIMITE_NOTIFICACOES_POR_PAGINA = 60;
  const INTERVALO_LEMBRETE_TOKENS_MS = 30 * 60 * 1000;
  const LIMITE_ALERTA_TOKENS_AMARELO = 0.2;
  const LIMITE_ALERTA_TOKENS_VERMELHO = 0.1;

  const notificacoesMenu = notificacoes.slice(0, LIMITE_NOTIFICACOES_POR_PAGINA);

  const totalPaginasNotificacoes = Math.max(
    1,
    Math.ceil(notificacoes.length / LIMITE_NOTIFICACOES_POR_PAGINA)
  );

  const inicioPaginaNotificacoes =
    (paginaNotificacoes - 1) * LIMITE_NOTIFICACOES_POR_PAGINA;

  const notificacoesPaginaModal = notificacoes.slice(
    inicioPaginaNotificacoes,
    inicioPaginaNotificacoes + LIMITE_NOTIFICACOES_POR_PAGINA
  );

  const temMaisDeSessentaNotificacoes =
    notificacoes.length > LIMITE_NOTIFICACOES_POR_PAGINA;
    
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

  async function carregarSaldoTokensIa() {
    if (!podeExibirSaldoTokensIa) return;

    try {
      const res = await fetch("/api/ia/tokens", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.ok) return;

      setSaldoTokensIa(json.saldo || null);
    } catch {
      // silencioso para nao quebrar header
    }
  }

  function formatarTokens(valor: number | null) {
    if (valor === null) return "Ilimitado";

    const formatarCompacto = (numero: number) =>
      new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 1,
      }).format(Math.floor(numero * 10) / 10);

    if (valor >= 1_000_000) {
      return `${formatarCompacto(valor / 1_000_000)} mi`;
    }

    if (valor >= 1_000) {
      return `${formatarCompacto(valor / 1_000)} mil`;
    }

    return String(valor);
  }

  function saldoTokensEmAlerta(saldo: SaldoTokensIa | null) {
    if (!saldo?.limite_mensal || saldo.tokens_restantes === null) return false;
    return (
      saldo.tokens_restantes <
      saldo.limite_mensal * LIMITE_ALERTA_TOKENS_AMARELO
    );
  }

  function saldoTokensCritico(saldo: SaldoTokensIa | null) {
    if (!saldo?.limite_mensal || saldo.tokens_restantes === null) return false;
    return (
      saldo.tokens_restantes <
      saldo.limite_mensal * LIMITE_ALERTA_TOKENS_VERMELHO
    );
  }

  function saldoTokensZerado(saldo: SaldoTokensIa | null) {
    return (
      !!saldo &&
      saldo.limite_mensal !== null &&
      Number(saldo.tokens_restantes ?? 0) <= 0
    );
  }

  function fecharAlertaTokens() {
    if (saldoTokensIa?.periodo_inicio) {
      const chaveBase = `tokens-low-warning:${saldoTokensIa.periodo_inicio}`;

      window.sessionStorage.setItem(
        `${chaveBase}:lastPromptAt`,
        String(Date.now())
      );
      window.sessionStorage.setItem(
        `${chaveBase}:lastRemaining`,
        String(Number(saldoTokensIa.tokens_restantes ?? 0))
      );
    }

    setAlertaTokensOpen(false);
  }

  async function marcarTodasNotificacoesComoLidas() {
    const notificacoesNaoLidas = notificacoes.filter(
      (notificacao) => !notificacao.lida
    );

    if (notificacoesNaoLidas.length === 0) return;

    try {
      await Promise.all(
        notificacoesNaoLidas.map((notificacao) =>
          fetch("/api/notificacoes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: notificacao.id }),
          })
        )
      );

      setNotificacoes((atuais) =>
        atuais.map((notificacao) => ({
          ...notificacao,
          lida: true,
        }))
      );

      setNaoLidas(0);
    } catch {
      // silencioso para não quebrar o header
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

        setNotificacoes((atuais) =>
          atuais.map((item) =>
            item.id === notificacao.id ? { ...item, lida: true } : item
          )
        );
      }

      setNotificacoesOpen(false);
      setModalNotificacoesOpen(false);
      setNaoLidas((atual) => Math.max(0, atual - (notificacao.lida ? 0 : 1)));

      if (notificacao.conversa_id) {
        router.push(`/conversas?id=${notificacao.conversa_id}`);
      }
    } catch {
      setNotificacoesOpen(false);
      setModalNotificacoesOpen(false);

      if (notificacao.conversa_id) {
        router.push(`/conversas?id=${notificacao.conversa_id}`);
      }
    }
  }

  useEffect(() => {
    carregarNotificacoes();
    carregarSaldoTokensIa();

    const interval = window.setInterval(() => {
      carregarNotificacoes();
      carregarSaldoTokensIa();
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

  useEffect(() => {
    if (!saldoTokensEmAlerta(saldoTokensIa)) {
      setAlertaTokensOpen(false);
      return;
    }

    const periodo = saldoTokensIa?.periodo_inicio || "atual";
    const chaveBase = `tokens-low-warning:${periodo}`;
    const tokensRestantes = Number(saldoTokensIa?.tokens_restantes ?? 0);
    const ultimoSaldoRegistrado = Number(
      window.sessionStorage.getItem(`${chaveBase}:lastRemaining`) ?? ""
    );
    const ultimoAvisoEm = Number(
      window.sessionStorage.getItem(`${chaveBase}:lastPromptAt`) ?? ""
    );

    const houveConsumoDepoisDoUltimoAviso =
      Number.isFinite(ultimoSaldoRegistrado) &&
      tokensRestantes < ultimoSaldoRegistrado;
    const lembreteVenceu =
      !Number.isFinite(ultimoAvisoEm) ||
      Date.now() - ultimoAvisoEm >= INTERVALO_LEMBRETE_TOKENS_MS;

    if (houveConsumoDepoisDoUltimoAviso || lembreteVenceu) {
      window.sessionStorage.setItem(
        `${chaveBase}:lastPromptAt`,
        String(Date.now())
      );
      window.sessionStorage.setItem(
        `${chaveBase}:lastRemaining`,
        String(tokensRestantes)
      );
      setAlertaTokensOpen(true);
    }
  }, [saldoTokensIa]);

  function toggleMenu() {
    setMenuOpen((prev) => !prev);
    setNotificacoesOpen(false);
  }

  function toggleNotificacoes() {
    setNotificacoesOpen((prev) => !prev);
    setMenuOpen(false);
  }

  function abrirModalNotificacoes() {
    setPaginaNotificacoes(1);
    setNotificacoesOpen(false);
    setModalNotificacoesOpen(true);
  }

  function fecharModalNotificacoes() {
    setModalNotificacoesOpen(false);
  }

  function irParaPaginaAnteriorNotificacoes() {
    setPaginaNotificacoes((paginaAtual) => Math.max(1, paginaAtual - 1));
  }

  function irParaProximaPaginaNotificacoes() {
    setPaginaNotificacoes((paginaAtual) =>
      Math.min(totalPaginasNotificacoes, paginaAtual + 1)
    );
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  const tokensEmAlerta = saldoTokensEmAlerta(saldoTokensIa);
  const tokensCriticos = saldoTokensCritico(saldoTokensIa);
  const tokensZerados = saldoTokensZerado(saldoTokensIa);
  const tokensBadgeClassName = `${styles.tokensBadge}${
    tokensCriticos
      ? ` ${styles.tokensBadgeDanger}`
      : tokensEmAlerta
        ? ` ${styles.tokensBadgeWarning}`
        : ""
  }`;
  const tokensWarningClassName = `${styles.tokensWarningInline} ${
    tokensCriticos
      ? styles.tokensWarningInlineDanger
      : styles.tokensWarningInlineWarning
  }`;
  const avisoTokensTitulo = tokensZerados
    ? "Tokens esgotados"
    : tokensCriticos
      ? "Tokens estão acabando"
      : "Atenção aos tokens";
  const avisoTokensMensagem = tokensZerados
    ? "Recarregue para reativar a IA."
    : tokensCriticos
      ? "Saldo abaixo de 10%. Recarregue para evitar pausas na IA."
      : "Saldo abaixo de 20%. Planeje uma recarga para não interromper a IA.";

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </div>

      <div className={styles.right}>
        {podeExibirSaldoTokensIa &&
          saldoTokensIa &&
          tokensEmAlerta &&
          (podeAcessarExtratoTokensIa ? (
            <Link
              href="/ia/tokens/pacotes"
              className={tokensWarningClassName}
              title="Comprar tokens de IA"
            >
              <span>{avisoTokensTitulo}</span>
              <strong>{avisoTokensMensagem}</strong>
            </Link>
          ) : (
            <span className={tokensWarningClassName}>
              <span>{avisoTokensTitulo}</span>
              <strong>{avisoTokensMensagem}</strong>
            </span>
          ))}

        {podeExibirSaldoTokensIa &&
          saldoTokensIa &&
          (podeAcessarExtratoTokensIa ? (
            <Link
              href="/ia/tokens"
              className={tokensBadgeClassName}
              title="Abrir extrato de tokens de IA"
            >
              <span className={styles.tokensLabel}>IA</span>
              <strong>{formatarTokens(saldoTokensIa.tokens_restantes)}</strong>
            </Link>
          ) : (
            <span
              className={`${tokensBadgeClassName} ${styles.tokensBadgeStatic}`}
              title="Tokens de IA restantes no ciclo mensal"
            >
              <span className={styles.tokensLabel}>IA</span>
              <strong>{formatarTokens(saldoTokensIa.tokens_restantes)}</strong>
            </span>
          ))}

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

                <div className={styles.notificationHeaderActions}>
                  {naoLidas > 0 && (
                    <button
                      type="button"
                      className={styles.markAllReadButton}
                      onClick={marcarTodasNotificacoesComoLidas}
                    >
                      Marcar todas lidas
                    </button>
                  )}

                  <span>{naoLidas} não lida(s)</span>
                </div>
              </div>

              {notificacoes.length === 0 ? (
                <div className={styles.notificationEmpty}>Nenhuma notificação.</div>
              ) : (
                <div className={styles.notificationList}>
                  {notificacoesMenu.map((notificacao) => (
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
                        {!notificacao.lida && <span className={styles.unreadDot} />}
                      </div>

                      <p>{notificacao.mensagem}</p>
                    </button>
                  ))}

                  {temMaisDeSessentaNotificacoes && (
                    <div className={styles.notificationViewAllWrapper}>
                      <button
                        type="button"
                        className={styles.notificationViewAllButton}
                        onClick={abrirModalNotificacoes}
                      >
                        Ver todas as notificações
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {modalNotificacoesOpen && (
          <div
            className={styles.notificationModalOverlay}
            onClick={fecharModalNotificacoes}
          >
            <div
              className={styles.notificationModal}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.notificationModalHeader}>
                <div className={styles.notificationModalTitle}>
                  <strong>Todas as notificações</strong>
                  <span>
                    Página {paginaNotificacoes} de {totalPaginasNotificacoes}
                  </span>
                </div>

                <div className={styles.notificationModalHeaderActions}>
                  {naoLidas > 0 && (
                    <button
                      type="button"
                      className={styles.markAllReadButton}
                      onClick={marcarTodasNotificacoesComoLidas}
                    >
                      Marcar todas lidas
                    </button>
                  )}

                  <button
                    type="button"
                    className={styles.notificationModalClose}
                    onClick={fecharModalNotificacoes}
                    title="Fechar"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className={styles.notificationModalList}>
                {notificacoesPaginaModal.map((notificacao) => (
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
                      {!notificacao.lida && <span className={styles.unreadDot} />}
                    </div>

                    <p>{notificacao.mensagem}</p>
                  </button>
                ))}
              </div>

              <div className={styles.notificationModalFooter}>
                <button
                  type="button"
                  className={styles.notificationPageButton}
                  onClick={irParaPaginaAnteriorNotificacoes}
                  disabled={paginaNotificacoes === 1}
                >
                  Anterior
                </button>

                <span>
                  {notificacoes.length} notificação(ões)
                </span>

                <button
                  type="button"
                  className={styles.notificationPageButton}
                  onClick={irParaProximaPaginaNotificacoes}
                  disabled={paginaNotificacoes === totalPaginasNotificacoes}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.userMenuWrapper} ref={menuRef}></div>

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

      {alertaTokensOpen && saldoTokensIa && (
        <div className={styles.tokenAlertOverlay} role="dialog" aria-modal="true">
          <div
            className={`${styles.tokenAlertCard} ${
              tokensCriticos
                ? styles.tokenAlertCardDanger
                : styles.tokenAlertCardWarning
            }`}
          >
            <button
              type="button"
              className={styles.tokenAlertClose}
              onClick={fecharAlertaTokens}
              aria-label="Fechar aviso de tokens"
            >
              x
            </button>

            <div className={styles.tokenAlertHero}>
              <span className={styles.tokenAlertEyebrow}>
                {saldoTokensZerado(saldoTokensIa)
                  ? "Tokens esgotados"
                  : tokensCriticos
                    ? "Tokens quase acabando"
                    : "Atencao aos tokens"}
              </span>

              <h2>
                {saldoTokensZerado(saldoTokensIa)
                  ? "Sua IA pode parar no atendimento"
                  : tokensCriticos
                    ? "Seu saldo de IA esta critico"
                    : "Seu saldo de IA esta ficando baixo"}
              </h2>

              <p>
                Restam <strong>{formatarTokens(saldoTokensIa.tokens_restantes)}</strong>{" "}
                tokens disponíveis, incluindo pacotes avulsos.
                Sem tokens, automacoes podem deixar de interpretar respostas,
                analisar arquivos e transcrever audios.
              </p>
            </div>

            <div className={styles.tokenAlertOffers}>
              <div>
                <span>Pacote rapido</span>
                <strong>1 mi tokens</strong>
                <small>R$ 25</small>
              </div>

              <div>
                <span>Melhor valor</span>
                <strong>5 mi tokens</strong>
                <small>R$ 100</small>
              </div>
            </div>

            <div className={styles.tokenAlertActions}>
              <Link
                href="/ia/tokens/pacotes"
                className={styles.tokenAlertPrimary}
                onClick={fecharAlertaTokens}
              >
                Comprar tokens
              </Link>

              <button
                type="button"
                className={styles.tokenAlertSecondary}
                onClick={fecharAlertaTokens}
              >
                Ver depois
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
