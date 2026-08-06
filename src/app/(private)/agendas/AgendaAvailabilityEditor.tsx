"use client";

import { useState, type CSSProperties } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import styles from "./AgendaAvailabilityEditor.module.css";

export type AgendaDayInterval = {
  id?: string;
  nome: string;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
};

export type AgendaAvailabilityDay = {
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
  intervalos: AgendaDayInterval[];
};

type Props = {
  days: AgendaAvailabilityDay[];
  dayNames: string[];
  onChange: (days: AgendaAvailabilityDay[]) => void;
};

function timeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.slice(0, 5));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

function timelineFor(day: AgendaAvailabilityDay) {
  const start = timeToMinutes(day.hora_inicio);
  const parsedEnd = timeToMinutes(day.hora_fim);
  if (start === null || parsedEnd === null) {
    return { valid: false, scale: [] as string[], segments: [] };
  }

  const end = parsedEnd > start ? parsedEnd : parsedEnd + 1440;
  const duration = Math.max(1, end - start);
  const segments = day.intervalos.flatMap((interval) => {
    let intervalStart = timeToMinutes(interval.hora_inicio);
    let intervalEnd = timeToMinutes(interval.hora_fim);
    if (intervalStart === null || intervalEnd === null) return [];
    if (intervalStart < start) intervalStart += 1440;
    if (intervalEnd <= intervalStart) intervalEnd += 1440;
    const clippedStart = Math.max(start, intervalStart);
    const clippedEnd = Math.min(end, intervalEnd);
    if (clippedEnd <= clippedStart) return [];
    return [
      {
        ...interval,
        left: ((clippedStart - start) / duration) * 100,
        width: ((clippedEnd - clippedStart) / duration) * 100,
      },
    ];
  });

  return {
    valid: true,
    segments,
    scale: [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
      minutesToTime(start + duration * ratio),
    ),
  };
}

export default function AgendaAvailabilityEditor({
  days,
  dayNames,
  onChange,
}: Props) {
  const [expandedDays, setExpandedDays] = useState<number[]>([]);

  const updateDay = (index: number, patch: Partial<AgendaAvailabilityDay>) =>
    onChange(
      days.map((day, position) =>
        position === index ? { ...day, ...patch } : day,
      ),
    );

  const updateInterval = (
    dayIndex: number,
    intervalIndex: number,
    patch: Partial<AgendaDayInterval>,
  ) =>
    updateDay(dayIndex, {
      intervalos: days[dayIndex].intervalos.map((interval, position) =>
        position === intervalIndex ? { ...interval, ...patch } : interval,
      ),
    });

  const toggleExpanded = (dayIndex: number) =>
    setExpandedDays((current) =>
      current.includes(dayIndex)
        ? current.filter((item) => item !== dayIndex)
        : [...current, dayIndex],
    );

  const addInterval = (dayIndex: number) => {
    const day = days[dayIndex];
    if (!day.ativo || day.intervalos.length >= 5) return;
    updateDay(dayIndex, {
      intervalos: [
        ...day.intervalos,
        {
          nome: `Intervalo ${day.intervalos.length + 1}`,
          hora_inicio: "12:00",
          hora_fim: "13:00",
          ativo: true,
        },
      ],
    });
    setExpandedDays((current) =>
      current.includes(dayIndex) ? current : [...current, dayIndex],
    );
  };

  return (
    <div className={styles.availability}>
      {days.map((day, dayIndex) => {
        const expanded = day.ativo && expandedDays.includes(dayIndex);
        const timeline = timelineFor(day);
        return (
          <section
            className={`${styles.dayCard} ${expanded ? styles.expandedDay : ""}`}
            key={day.dia_semana}
          >
            <div className={styles.summary}>
              <button
                type="button"
                role="switch"
                aria-checked={day.ativo}
                aria-label={day.ativo ? "Desativar dia" : "Ativar dia"}
                className={`${styles.toggleButton} ${
                  day.ativo ? styles.toggleButtonActive : ""
                }`}
                onClick={() => {
                  if (day.ativo) {
                    setExpandedDays((current) =>
                      current.filter((item) => item !== dayIndex),
                    );
                  }
                  updateDay(dayIndex, { ativo: !day.ativo });
                }}
              >
                <span aria-hidden="true" />
              </button>

              <strong className={styles.dayName}>
                {dayNames[day.dia_semana]}
              </strong>

              <label className={styles.timeControl}>
                <span>Início</span>
                <input
                  type="time"
                  value={day.hora_inicio.slice(0, 5)}
                  disabled={!day.ativo}
                  onChange={(event) =>
                    updateDay(dayIndex, { hora_inicio: event.target.value })
                  }
                />
              </label>

              <label className={styles.timeControl}>
                <span>Fim</span>
                <input
                  type="time"
                  value={day.hora_fim.slice(0, 5)}
                  disabled={!day.ativo}
                  onChange={(event) =>
                    updateDay(dayIndex, { hora_fim: event.target.value })
                  }
                />
              </label>

              <button
                type="button"
                className={styles.quickAddButton}
                disabled={!day.ativo || day.intervalos.length >= 5}
                onClick={() => addInterval(dayIndex)}
              >
                <Plus size={14} aria-hidden="true" />
                Intervalos
              </button>

              <button
                type="button"
                className={styles.expandButton}
                aria-expanded={expanded}
                aria-label={
                  expanded ? "Recolher opções do dia" : "Expandir opções do dia"
                }
                disabled={!day.ativo}
                onClick={() => toggleExpanded(dayIndex)}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>

            {day.ativo ? (
              <div
                className={`${styles.timeline} ${
                  expanded ? styles.timelineExpanded : styles.timelineCompact
                }`}
              >
                {expanded ? (
                  <div className={styles.timelineHeader}>
                    <strong>Linha do dia</strong>
                    <div className={styles.legend}>
                      <span className={styles.availableLegend}>Disponível</span>
                      <span className={styles.intervalLegend}>Intervalo</span>
                    </div>
                  </div>
                ) : null}

                {timeline.valid ? (
                  <>
                    <div className={styles.track}>
                      <div className={styles.availableTrack} />
                      {timeline.segments.map((segment, index) => (
                        <div
                          className={styles.intervalSegment}
                          key={`${segment.nome}-${segment.hora_inicio}-${segment.hora_fim}-${index}`}
                          style={
                            {
                              "--agenda-interval-left": `${segment.left.toFixed(3)}%`,
                              "--agenda-interval-width": `${segment.width.toFixed(3)}%`,
                            } as CSSProperties
                          }
                        >
                          <span>{segment.nome || "Intervalo"}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.scale}>
                      {timeline.scale.map((label, index) => (
                        <span key={`${label}-${index}`}>{label}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.invalidTimeline}>
                    Informe horários válidos para visualizar a linha do dia.
                  </div>
                )}
              </div>
            ) : null}

            {expanded && day.intervalos.length > 0 ? (
              <div className={styles.breaks}>
                {day.intervalos.map((interval, intervalIndex) => (
                  <div
                    className={styles.breakRow}
                    key={interval.id || intervalIndex}
                  >
                    <input
                      value={interval.nome}
                      placeholder="Ex.: Almoço"
                      maxLength={80}
                      aria-label="Nome do intervalo"
                      onChange={(event) =>
                        updateInterval(dayIndex, intervalIndex, {
                          nome: event.target.value,
                        })
                      }
                    />
                    <input
                      type="time"
                      value={interval.hora_inicio.slice(0, 5)}
                      aria-label="Início do intervalo"
                      onChange={(event) =>
                        updateInterval(dayIndex, intervalIndex, {
                          hora_inicio: event.target.value,
                        })
                      }
                    />
                    <input
                      type="time"
                      value={interval.hora_fim.slice(0, 5)}
                      aria-label="Fim do intervalo"
                      onChange={(event) =>
                        updateInterval(dayIndex, intervalIndex, {
                          hora_fim: event.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label="Remover intervalo"
                      onClick={() =>
                        updateDay(dayIndex, {
                          intervalos: day.intervalos.filter(
                            (_, position) => position !== intervalIndex,
                          ),
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
