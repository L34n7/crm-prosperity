"use client";

import { useEffect, useState } from "react";
import { CopyPlus } from "lucide-react";
import type { Fluxo } from "../types";
import styles from "../fluxos.module.css";

export type FiltroStatusFluxo =
  | "todos"
  | "sistema"
  | "rascunho"
  | "ativo"
  | "pausado"
  | "arquivado";

type MenuFluxo = {
  fluxo: Fluxo;
  x: number;
  buttonTop: number;
  buttonBottom: number;
};

type FluxosSidebarProps = {
  fluxos: Fluxo[];
  fluxoSelecionadoId?: string | null;
  carregandoFluxos: boolean;
  buscaFluxo: string;
  filtroStatusFluxo: FiltroStatusFluxo;
  podeCriarFluxos: boolean;
  podeEditarFluxos: boolean;
  podeAtivarFluxos: boolean;
  podeArquivarFluxos: boolean;
  podeExcluirFluxos: boolean;
  isFluxoSistema: (fluxo: Fluxo | null | undefined) => boolean;
  onBuscaFluxoChange: (valor: string) => void;
  onFiltroStatusChange: (valor: FiltroStatusFluxo) => void;
  onAbrirFluxo: (fluxo: Fluxo) => void;
  onNovoFluxo: () => void;
  onImportarFluxo: () => void;
  onRestaurarFluxo: (fluxo: Fluxo) => void;
  onApagarDefinitivo: (fluxo: Fluxo) => void;
  onAlterarStatus: (fluxo: Fluxo, status: "ativo" | "pausado") => void;
  onEditarFluxo: (fluxo: Fluxo) => void;
  onDuplicarFluxo: (fluxo: Fluxo) => void;
  onCompartilharFluxo: (fluxo: Fluxo) => void;
  onArquivarFluxo: (fluxo: Fluxo) => void;
};

function badgeClass(status: string) {
  if (status === "ativo") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "pausado") return `${styles.badge} ${styles.badgeYellow}`;
  if (status === "arquivado") return `${styles.badge} ${styles.badgeRed}`;
  return `${styles.badge} ${styles.badgeGray}`;
}

export default function FluxosSidebar({
  fluxos,
  fluxoSelecionadoId,
  carregandoFluxos,
  buscaFluxo,
  filtroStatusFluxo,
  podeCriarFluxos,
  podeEditarFluxos,
  podeAtivarFluxos,
  podeArquivarFluxos,
  podeExcluirFluxos,
  isFluxoSistema,
  onBuscaFluxoChange,
  onFiltroStatusChange,
  onAbrirFluxo,
  onNovoFluxo,
  onImportarFluxo,
  onRestaurarFluxo,
  onApagarDefinitivo,
  onAlterarStatus,
  onEditarFluxo,
  onDuplicarFluxo,
  onCompartilharFluxo,
  onArquivarFluxo,
}: FluxosSidebarProps) {
  const [menuFluxo, setMenuFluxo] = useState<MenuFluxo | null>(null);
  const possuiAcaoFluxo =
    podeCriarFluxos ||
    podeEditarFluxos ||
    podeAtivarFluxos ||
    podeArquivarFluxos ||
    podeExcluirFluxos;

  useEffect(() => {
    function fecharMenu() {
      setMenuFluxo(null);
    }

    window.addEventListener("click", fecharMenu);
    return () => window.removeEventListener("click", fecharMenu);
  }, []);

  const fluxosVisiveis = fluxos
    .filter((fluxo) =>
      fluxo.nome.toLowerCase().includes(buscaFluxo.toLowerCase())
    )
    .filter((fluxo) => {
      if (filtroStatusFluxo === "todos") return true;
      if (filtroStatusFluxo === "sistema") return isFluxoSistema(fluxo);
      return fluxo.status === filtroStatusFluxo;
    })
    .sort((a, b) => {
      const ordemStatus = {
        rascunho: 1,
        ativo: 2,
        pausado: 3,
        arquivado: 4,
      };
      const statusDiff = ordemStatus[a.status] - ordemStatus[b.status];

      if (statusDiff !== 0) return statusDiff;

      if (a.status === "ativo" && b.status === "ativo") {
        const sistemaDiff =
          Number(isFluxoSistema(a)) - Number(isFluxoSistema(b));

        if (sistemaDiff !== 0) return sistemaDiff;
      }

      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });

  return (
    <>
      <aside className={styles.sidebarFluxos}>
        <div className={styles.sidebarHeader}>
          <p className={styles.eyebrow}>Automações</p>
          <h1 className={styles.sidebarTitle}>Fluxos</h1>
          <p className={styles.sidebarSubtitle}>
            Selecione um fluxo ou crie um novo.
          </p>
        </div>

        <div className={styles.sidebarFilters}>
          <input
            className={styles.input}
            placeholder="Buscar fluxo..."
            value={buscaFluxo}
            onChange={(event) => onBuscaFluxoChange(event.target.value)}
          />

          <div className={styles.filterRow}>
            <select
              className={styles.input}
              value={filtroStatusFluxo}
              onChange={(event) =>
                onFiltroStatusChange(event.target.value as FiltroStatusFluxo)
              }
            >
              <option value="todos">Todos</option>
              <option value="sistema">Fluxos do sistema</option>
              <option value="ativo">Ativos</option>
              <option value="rascunho">Rascunhos</option>
              <option value="pausado">Pausados</option>
              <option value="arquivado">Arquivados</option>
            </select>

            {podeCriarFluxos && (
              <button
                type="button"
                className={styles.newFlowButton}
                title="Criar fluxo"
                onClick={onNovoFluxo}
              >
                +
              </button>
            )}

            {podeCriarFluxos && (
              <button
                type="button"
                className={styles.importFlowButton}
                title="Importar por codigo"
                onClick={onImportarFluxo}
              >
                <CopyPlus size={18} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.flowList}>
          {carregandoFluxos ? (
            <div className={styles.emptyMini}>Carregando...</div>
          ) : fluxos.length === 0 ? (
            <div className={styles.emptyMini}>Nenhum fluxo cadastrado.</div>
          ) : (
            fluxosVisiveis.map((fluxo) => (
              <div
                key={fluxo.id}
                role="button"
                tabIndex={0}
                className={
                  fluxoSelecionadoId === fluxo.id
                    ? styles.flowItemActive
                    : styles.flowItem
                }
                onClick={() => onAbrirFluxo(fluxo)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onAbrirFluxo(fluxo);
                  }
                }}
              >
                <div className={styles.flowItemTop}>
                  <div className={styles.flowItemInfo}>
                    <span className={styles.flowItemTitle}>{fluxo.nome}</span>

                    <div className={styles.flowBadges}>
                      {isFluxoSistema(fluxo) && (
                        <span
                          className={`${styles.badge} ${styles.systemFlowBadge}`}
                          data-system-flow-badge="CRM_SYSTEM_FLOW_STRONG_BADGE_V1"
                        >
                          FLUXO FIXO
                        </span>
                      )}

                      {fluxo.fluxo_padrao && (
                        <span className={`${styles.badge} ${styles.badgeBlue}`}>
                          padrão
                        </span>
                      )}

                      <span className={badgeClass(fluxo.status)}>
                        {fluxo.status}
                      </span>
                    </div>
                  </div>

                  {possuiAcaoFluxo && (
                    <div className={styles.flowMenuWrapper}>
                      <button
                        type="button"
                        className={styles.flowMenuButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();

                          setMenuFluxo((atual) =>
                            atual?.fluxo.id === fluxo.id
                              ? null
                              : {
                                  fluxo,
                                  x: rect.right,
                                  buttonTop: rect.top,
                                  buttonBottom: rect.bottom,
                                }
                          );
                        }}
                      >
                        ⋮
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {menuFluxo && (
        <div
          className={styles.flowDropdownPortal}
          style={{
            top:
              window.innerHeight - menuFluxo.buttonBottom < 170
                ? menuFluxo.buttonTop - 8
                : menuFluxo.buttonBottom + 6,
            left: menuFluxo.x - 180,
            transform:
              window.innerHeight - menuFluxo.buttonBottom < 170
                ? "translateY(-100%)"
                : "none",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {menuFluxo.fluxo.status === "arquivado" ? (
            <>
              {podeAtivarFluxos && (
                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    onRestaurarFluxo(menuFluxo.fluxo);
                    setMenuFluxo(null);
                  }}
                >
                  Restaurar
                </button>
              )}

              {podeExcluirFluxos && (
                <button
                  className={`${styles.flowDropdownItem} ${styles.flowDropdownDanger}`}
                  onClick={() => {
                    onApagarDefinitivo(menuFluxo.fluxo);
                    setMenuFluxo(null);
                  }}
                >
                  Apagar definitivo
                </button>
              )}
            </>
          ) : (
            <>
              {podeAtivarFluxos && (
                <button
                  className={styles.flowDropdownItem}
                  disabled={isFluxoSistema(menuFluxo.fluxo)}
                  title={
                    isFluxoSistema(menuFluxo.fluxo)
                      ? "Fluxos fixos do sistema não podem ser pausados."
                      : undefined
                  }
                  onClick={() => {
                    onAlterarStatus(
                      menuFluxo.fluxo,
                      menuFluxo.fluxo.status === "ativo" ? "pausado" : "ativo"
                    );
                    setMenuFluxo(null);
                  }}
                >
                  {menuFluxo.fluxo.status === "ativo" ? "Pausar" : "Ativar"}
                </button>
              )}

              {podeEditarFluxos && (
                <button
                  type="button"
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    onEditarFluxo(menuFluxo.fluxo);
                    setMenuFluxo(null);
                  }}
                >
                  Editar fluxo
                </button>
              )}

              {podeCriarFluxos && (
                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    onDuplicarFluxo(menuFluxo.fluxo);
                    setMenuFluxo(null);
                  }}
                >
                  Clonar
                </button>
              )}

              {podeEditarFluxos && (
                <button
                  className={styles.flowDropdownItem}
                  onClick={() => {
                    onCompartilharFluxo(menuFluxo.fluxo);
                    setMenuFluxo(null);
                  }}
                >
                  Compartilhar
                </button>
              )}

              {podeArquivarFluxos && (
                <button
                  className={`${styles.flowDropdownItem} ${styles.flowDropdownDanger}`}
                  disabled={isFluxoSistema(menuFluxo.fluxo)}
                  title={
                    isFluxoSistema(menuFluxo.fluxo)
                      ? "Fluxos fixos do sistema não podem ser arquivados."
                      : undefined
                  }
                  onClick={() => {
                    onArquivarFluxo(menuFluxo.fluxo);
                    setMenuFluxo(null);
                  }}
                >
                  Apagar
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
