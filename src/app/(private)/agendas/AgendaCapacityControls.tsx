"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Layers3,
  Pin,
  Plus,
  Shuffle,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import styles from "./page.module.css";

type CalendarOption = {
  id: string;
  nome: string;
  status: string;
  responsavel_id?: string | null;
};

type DistributionStrategy =
  | "rodizio"
  | "menor_carga"
  | "primeiro_disponivel";

type DistributionGroup = {
  id: string;
  nome: string;
  estrategia: DistributionStrategy;
  ativo: boolean;
  agenda_ids: string[];
};

type AgendaCapacityControlsProps = {
  calendars: CalendarOption[];
  selectedIds: string[];
  pinnedIds: string[];
  primaryId: string;
  canEdit: boolean;
  onApplySelectedIds: (ids: string[]) => void;
  onPinnedIdsChange: (ids: string[]) => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
};

const strategyLabels: Record<DistributionStrategy, string> = {
  rodizio: "Rodízio",
  menor_carga: "Menor carga",
  primeiro_disponivel: "Primeiro disponível",
};

function emptyDraft() {
  return {
    id: "",
    nome: "",
    estrategia: "rodizio" as DistributionStrategy,
    agenda_ids: [] as string[],
    ativo: true,
  };
}

export default function AgendaCapacityControls({
  calendars,
  selectedIds,
  pinnedIds,
  primaryId,
  canEdit,
  onApplySelectedIds,
  onPinnedIdsChange,
  onSuccess,
  onError,
}: AgendaCapacityControlsProps) {
  const [viewOpen, setViewOpen] = useState(false);
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>(selectedIds);
  const [draftPinnedIds, setDraftPinnedIds] = useState<string[]>(pinnedIds);
  const [savingView, setSavingView] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groups, setGroups] = useState<DistributionGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const activeCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.status !== "arquivado"),
    [calendars],
  );

  useEffect(() => {
    if (viewOpen) return;
    setDraftSelectedIds(selectedIds);
    setDraftPinnedIds(pinnedIds);
  }, [pinnedIds, selectedIds, viewOpen]);

  async function loadGroups() {
    try {
      setLoadingGroups(true);
      const response = await fetch("/api/agendas/capacidade", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível carregar os grupos de distribuição.",
        );
      }
      setGroups(data.grupos_distribuicao || []);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os grupos de distribuição.",
      );
    } finally {
      setLoadingGroups(false);
    }
  }

  async function openGroups() {
    setDraft(emptyDraft());
    setGroupsOpen(true);
    await loadGroups();
  }

  function toggleViewMenu() {
    if (!viewOpen) {
      setDraftSelectedIds(selectedIds);
      setDraftPinnedIds(pinnedIds);
    }
    setViewOpen((value) => !value);
  }

  function toggleVisible(id: string) {
    setDraftSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function togglePinned(id: string) {
    setDraftPinnedIds((current) => {
      const isPinned = current.includes(id);
      if (!isPinned) {
        setDraftSelectedIds((selected) =>
          selected.includes(id) ? selected : [...selected, id],
        );
      }
      return isPinned
        ? current.filter((item) => item !== id)
        : [...current, id];
    });
  }

  function restorePinnedView() {
    const fixed = activeCalendars
      .filter((calendar) => pinnedIds.includes(calendar.id))
      .map((calendar) => calendar.id);

    if (fixed.length > 0) {
      setDraftSelectedIds(fixed);
      return;
    }

    const fallback =
      activeCalendars.find((calendar) => calendar.id === primaryId)?.id ||
      activeCalendars[0]?.id ||
      "";
    setDraftSelectedIds(fallback ? [fallback] : []);
  }

  async function applyView() {
    const nextSelected = activeCalendars
      .filter((calendar) => draftSelectedIds.includes(calendar.id))
      .map((calendar) => calendar.id);
    const nextPinned = activeCalendars
      .filter((calendar) => draftPinnedIds.includes(calendar.id))
      .map((calendar) => calendar.id);
    const currentPinned = activeCalendars
      .filter((calendar) => pinnedIds.includes(calendar.id))
      .map((calendar) => calendar.id);

    if (nextSelected.length === 0) {
      onError("Selecione pelo menos um calendário para visualizar.");
      return;
    }

    const pinnedChanged = nextPinned.join("|") !== currentPinned.join("|");

    try {
      setSavingView(true);

      if (pinnedChanged) {
        const response = await fetch("/api/agendas/visualizacao", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agenda_ids: nextPinned }),
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) {
          throw new Error(
            data?.error || "Não foi possível salvar os calendários fixados.",
          );
        }
      }

      onPinnedIdsChange(nextPinned);
      onApplySelectedIds(nextSelected);
      setViewOpen(false);
      onSuccess(
        pinnedChanged
          ? "Visualização e calendários fixados atualizados."
          : "Visualização atualizada.",
      );
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a visualização.",
      );
    } finally {
      setSavingView(false);
    }
  }

  function editGroup(group: DistributionGroup) {
    setDraft({
      id: group.id,
      nome: group.nome,
      estrategia: group.estrategia,
      agenda_ids: [...group.agenda_ids],
      ativo: group.ativo !== false,
    });
  }

  function toggleGroupCalendar(id: string) {
    setDraft((current) => ({
      ...current,
      agenda_ids: current.agenda_ids.includes(id)
        ? current.agenda_ids.filter((item) => item !== id)
        : [...current.agenda_ids, id],
    }));
  }

  async function saveGroup() {
    if (!draft.nome.trim()) {
      onError("Informe o nome do grupo de distribuição.");
      return;
    }
    if (draft.agenda_ids.length < 2) {
      onError("Selecione pelo menos dois calendários para o grupo.");
      return;
    }

    try {
      setSavingGroup(true);
      const response = await fetch("/api/agendas/capacidade", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id || undefined,
          nome: draft.nome.trim(),
          estrategia: draft.estrategia,
          agenda_ids: draft.agenda_ids,
          ativo: draft.ativo,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível salvar o grupo de distribuição.",
        );
      }

      onSuccess(
        draft.id
          ? "Grupo de distribuição atualizado."
          : "Grupo de distribuição criado.",
      );
      setDraft(emptyDraft());
      await loadGroups();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o grupo de distribuição.",
      );
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteGroup(group: DistributionGroup) {
    if (!confirm('Excluir o grupo "' + group.nome + '"?')) return;

    try {
      const response = await fetch(
        "/api/agendas/capacidade?id=" + encodeURIComponent(group.id),
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível excluir o grupo de distribuição.",
        );
      }
      onSuccess("Grupo de distribuição excluído.");
      if (draft.id === group.id) setDraft(emptyDraft());
      await loadGroups();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o grupo de distribuição.",
      );
    }
  }

  return (
    <>
      <div className={styles.multiCalendarControls}>
        <div className={styles.multiCalendarPicker}>
          <button
            type="button"
            className="btn"
            onClick={toggleViewMenu}
          >
            <Layers3 size={15} />
            Visualizar
            <span className={styles.multiCalendarCount}>
              {selectedIds.length}
            </span>
            <ChevronDown size={14} />
          </button>

          {viewOpen ? (
            <div className={styles.multiCalendarMenu}>
              <div className={styles.multiCalendarMenuHeader}>
                <div>
                  <strong>Calendários exibidos</strong>
                  <small>
                    Selecione os calendários, fixe seu padrão e clique em Aplicar.
                  </small>
                </div>
                <button
                  type="button"
                  className={styles.iconButtonBare}
                  onClick={() => setViewOpen(false)}
                  aria-label="Fechar seleção"
                >
                  <X size={15} />
                </button>
              </div>

              <div className={styles.multiCalendarOptions}>
                {activeCalendars.map((calendar) => {
                  const checked = draftSelectedIds.includes(calendar.id);
                  const pinned = draftPinnedIds.includes(calendar.id);

                  return (
                    <div
                      key={calendar.id}
                      className={[
                        styles.multiCalendarOption,
                        checked ? styles.multiCalendarOptionActive : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <label className={styles.multiCalendarOptionChoice}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleVisible(calendar.id)}
                        />
                        <span>
                          <strong>{calendar.nome}</strong>
                          <small>
                            {calendar.id === primaryId
                              ? "Calendário principal"
                              : pinned
                                ? "Fixado para abrir automaticamente"
                                : "Disponível para visualização"}
                          </small>
                        </span>
                      </label>

                      <button
                        type="button"
                        className={[
                          styles.multiCalendarPin,
                          pinned ? styles.multiCalendarPinActive : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => togglePinned(calendar.id)}
                        aria-pressed={pinned}
                        aria-label={
                          pinned
                            ? `Desafixar ${calendar.nome}`
                            : `Fixar ${calendar.nome}`
                        }
                        title={
                          pinned
                            ? "Remover da visualização fixa"
                            : "Fixar para abrir sempre com este calendário"
                        }
                      >
                        <Pin size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className={styles.multiCalendarMenuFooter}>
                <div className={styles.multiCalendarMenuShortcuts}>
                  <button
                    type="button"
                    className="btn"
                    onClick={restorePinnedView}
                    disabled={savingView}
                    title="Restaurar a seleção para os calendários fixados"
                  >
                    Somente principal
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setDraftSelectedIds(
                        activeCalendars.map((calendar) => calendar.id),
                      )
                    }
                    disabled={savingView}
                  >
                    Mostrar todos
                  </button>
                </div>

                <button
                  type="button"
                  className={`btn primary ${styles.multiCalendarApply}`}
                  onClick={() => void applyView()}
                  disabled={savingView || draftSelectedIds.length === 0}
                >
                  <Check size={14} />
                  {savingView ? "Salvando..." : "Aplicar"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <button type="button" className="btn" onClick={() => void openGroups()}>
            <Shuffle size={15} />
            Distribuição
          </button>
        ) : null}
      </div>

      {groupsOpen ? (
        <div
          className="modalbg"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingGroup) {
              setGroupsOpen(false);
            }
          }}
        >
          <div className={["modal", styles.distributionModal].join(" ")}>
            <div className="dhead">
              <Shuffle size={18} />
              <div>
                <h2>Distribuição entre calendários</h2>
                <p>
                  Crie grupos para rodízio, menor carga ou primeiro horário
                  disponível.
                </p>
              </div>
              <button className="btn" onClick={() => setGroupsOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <div className={styles.distributionBody}>
              <aside className={styles.distributionList}>
                <div className={styles.distributionListHeader}>
                  <strong>Grupos</strong>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setDraft(emptyDraft())}
                  >
                    <Plus size={14} />
                    Novo
                  </button>
                </div>

                {loadingGroups ? (
                  <div className={styles.distributionEmpty}>Carregando...</div>
                ) : groups.length === 0 ? (
                  <div className={styles.distributionEmpty}>
                    <Shuffle size={20} />
                    <strong>Nenhum grupo criado</strong>
                    <span>
                      Crie um grupo para distribuir agendamentos entre calendários.
                    </span>
                  </div>
                ) : (
                  groups.map((group) => (
                    <button
                      type="button"
                      key={group.id}
                      className={[
                        styles.distributionGroupItem,
                        draft.id === group.id
                          ? styles.distributionGroupItemActive
                          : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => editGroup(group)}
                    >
                      <span>
                        <strong>{group.nome}</strong>
                        <small>
                          {strategyLabels[group.estrategia]} ·{" "}
                          {group.agenda_ids.length} calendários
                        </small>
                      </span>
                      <span
                        className={[
                          styles.distributionStatus,
                          group.ativo ? styles.distributionStatusActive : "",
                        ].filter(Boolean).join(" ")}
                      >
                        {group.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </button>
                  ))
                )}
              </aside>

              <section className={styles.distributionEditor}>
                <div className={styles.distributionEditorHeader}>
                  <div className={styles.distributionEditorIcon}>
                    <UsersRound size={18} />
                  </div>
                  <div>
                    <span className={styles.distributionEyebrow}>
                      {draft.id ? "Editar grupo" : "Novo grupo"}
                    </span>
                    <h3>
                      {draft.id
                        ? draft.nome || "Configurar distribuição"
                        : "Configurar distribuição"}
                    </h3>
                    <p>
                      Defina a estratégia e os calendários que receberão os
                      agendamentos deste grupo.
                    </p>
                  </div>
                </div>

                <div className={styles.distributionFormGrid}>
                  <div className="field">
                    <label>Nome do grupo</label>
                    <input
                      value={draft.nome}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          nome: event.target.value,
                        }))
                      }
                      placeholder="Ex.: Equipe comercial"
                    />
                  </div>

                  <div className="field">
                    <label>Estratégia</label>
                    <select
                      value={draft.estrategia}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          estrategia: event.target.value as DistributionStrategy,
                        }))
                      }
                    >
                      <option value="rodizio">Rodízio</option>
                      <option value="menor_carga">Menor carga</option>
                      <option value="primeiro_disponivel">
                        Primeiro disponível
                      </option>
                    </select>
                  </div>
                </div>

                <div className={styles.distributionStrategyHint}>
                  <Shuffle size={14} />
                  <span>
                    {draft.estrategia === "rodizio"
                      ? "Alterna a preferência entre os calendários disponíveis."
                      : draft.estrategia === "menor_carga"
                        ? "Prioriza o calendário com menor carga no dia."
                        : "Escolhe o calendário com o horário disponível mais próximo."}
                  </span>
                </div>

                <div className={styles.distributionCalendars}>
                  <div className={styles.distributionCalendarsHeader}>
                    <div>
                      <strong>Calendários participantes</strong>
                      <small>Selecione pelo menos dois calendários.</small>
                    </div>
                    <span className={styles.distributionSelectionCount}>
                      {draft.agenda_ids.length} selecionado
                      {draft.agenda_ids.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className={styles.distributionCalendarGrid}>
                    {activeCalendars.map((calendar) => {
                      const checked = draft.agenda_ids.includes(calendar.id);
                      return (
                        <label
                          key={calendar.id}
                          className={[
                            styles.distributionCalendarCard,
                            checked
                              ? styles.distributionCalendarCardActive
                              : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGroupCalendar(calendar.id)}
                          />
                          <span className={styles.distributionCalendarIcon}>
                            <CalendarDays size={15} />
                          </span>
                          <span>
                            <strong>{calendar.nome}</strong>
                            <small>
                              {calendar.responsavel_id
                                ? "Responsável definido"
                                : "Sem responsável fixo"}
                            </small>
                          </span>
                          {checked ? <Check size={15} /> : null}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <label className={styles.distributionActiveToggle}>
                  <span>
                    <strong>Grupo ativo</strong>
                    <small>
                      Permitir que novos agendamentos sejam distribuídos por este grupo.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.ativo}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        ativo: event.target.checked,
                      }))
                    }
                  />
                </label>

                <div className={styles.distributionActions}>
                  {draft.id ? (
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => {
                        const current = groups.find(
                          (group) => group.id === draft.id,
                        );
                        if (current) void deleteGroup(current);
                      }}
                      disabled={savingGroup}
                    >
                      <Trash2 size={14} />
                      Excluir
                    </button>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void saveGroup()}
                    disabled={savingGroup}
                  >
                    <Check size={14} />
                    {savingGroup
                      ? "Salvando..."
                      : draft.id
                        ? "Salvar alterações"
                        : "Criar grupo"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
