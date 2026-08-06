"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import styles from "./AgendaAvailabilityPresentation.module.css";

type IntervalSnapshot = {
  name: string;
  start: string;
  end: string;
};

type DaySnapshot = {
  key: string;
  card: HTMLElement;
  host: HTMLElement;
  breaks: HTMLElement | null;
  title: string;
  active: boolean;
  start: string;
  end: string;
  intervals: IntervalSnapshot[];
};

type TimelineSegment = IntervalSnapshot & {
  left: number;
  width: number;
};

type TimelineData = {
  valid: boolean;
  scale: string[];
  segments: TimelineSegment[];
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function timeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

function buildTimeline(day: DaySnapshot): TimelineData {
  const startMinutes = timeToMinutes(day.start);
  const parsedEnd = timeToMinutes(day.end);

  if (startMinutes === null || parsedEnd === null) {
    return { valid: false, scale: [], segments: [] };
  }

  const endMinutes = parsedEnd > startMinutes ? parsedEnd : parsedEnd + 1440;
  const duration = Math.max(1, endMinutes - startMinutes);

  const segments = day.intervals.flatMap<TimelineSegment>((interval) => {
    let intervalStart = timeToMinutes(interval.start);
    let intervalEnd = timeToMinutes(interval.end);
    if (intervalStart === null || intervalEnd === null) return [];

    if (intervalStart < startMinutes) intervalStart += 1440;
    if (intervalEnd <= intervalStart) intervalEnd += 1440;

    const clippedStart = Math.max(startMinutes, intervalStart);
    const clippedEnd = Math.min(endMinutes, intervalEnd);
    if (clippedEnd <= clippedStart) return [];

    return [
      {
        ...interval,
        left: ((clippedStart - startMinutes) / duration) * 100,
        width: ((clippedEnd - clippedStart) / duration) * 100,
      },
    ];
  });

  return {
    valid: true,
    segments,
    scale: [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
      minutesToTime(startMinutes + duration * ratio),
    ),
  };
}

function snapshotSignature(days: DaySnapshot[]) {
  return days
    .map((day) =>
      [
        day.key,
        day.active ? "1" : "0",
        day.start,
        day.end,
        ...day.intervals.flatMap((interval) => [
          interval.name,
          interval.start,
          interval.end,
        ]),
      ].join("|"),
    )
    .join("||");
}

function applyExistingElementClasses(day: DaySnapshot) {
  day.card.classList.add(styles.dayCard);
  day.card.querySelector<HTMLElement>(".av")?.classList.add(styles.dayRow);

  const breaks = day.breaks;
  if (!breaks) return;

  breaks.classList.add(styles.breaks);
  breaks
    .querySelector<HTMLElement>(".avBreakHead")
    ?.classList.add(styles.breakHeader);
  breaks
    .querySelector<HTMLElement>(".avBreakHead span")
    ?.classList.add(styles.breakTitle);
  breaks
    .querySelector<HTMLButtonElement>(".avAddBreak")
    ?.classList.add(styles.addButton);
  breaks
    .querySelectorAll<HTMLElement>(".avBreak")
    .forEach((row) => row.classList.add(styles.breakRow));
  breaks
    .querySelectorAll<HTMLElement>(".avBreakEmpty")
    .forEach((empty) => empty.classList.add(styles.empty));
  breaks
    .querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Remover intervalo"],button.remove',
    )
    .forEach((button) => button.classList.add(styles.removeButton));
}

function removeExistingElementClasses(day: DaySnapshot) {
  day.card.classList.remove(styles.dayCard, styles.expandedDay);
  day.card.querySelector<HTMLElement>(".av")?.classList.remove(styles.dayRow);

  const breaks = day.breaks;
  if (!breaks) return;

  breaks.hidden = false;
  breaks.classList.remove(styles.breaks);
  breaks
    .querySelector<HTMLElement>(".avBreakHead")
    ?.classList.remove(styles.breakHeader);
  breaks
    .querySelector<HTMLElement>(".avBreakHead span")
    ?.classList.remove(styles.breakTitle);
  breaks
    .querySelector<HTMLButtonElement>(".avAddBreak")
    ?.classList.remove(styles.addButton);
  breaks
    .querySelectorAll<HTMLElement>(".avBreak")
    .forEach((row) => row.classList.remove(styles.breakRow));
  breaks
    .querySelectorAll<HTMLElement>(".avBreakEmpty")
    .forEach((empty) => empty.classList.remove(styles.empty));
  breaks
    .querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Remover intervalo"],button.remove',
    )
    .forEach((button) => button.classList.remove(styles.removeButton));
}

function DayPresentation({
  day,
  expanded,
  onToggle,
}: {
  day: DaySnapshot;
  expanded: boolean;
  onToggle: () => void;
}) {
  const timeline = buildTimeline(day);
  const intervalCount = day.intervals.length;

  return (
    <section className={styles.presentation}>
      <div className={styles.summary}>
        <button
          type="button"
          className={styles.expandButton}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Recolher opções do dia" : "Expandir opções do dia"
          }
          onClick={onToggle}
          disabled={!day.active}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>

        <div className={styles.summaryText}>
          <strong>{day.title}</strong>
          <span>
            {day.start || "--:--"} – {day.end || "--:--"}
          </span>
        </div>

        <span
          className={`${styles.status} ${
            day.active ? styles.activeStatus : styles.inactiveStatus
          }`}
        >
          {day.active ? "Ativo" : "Inativo"}
        </span>

        <span className={styles.intervalCount}>
          {intervalCount} {intervalCount === 1 ? "intervalo" : "intervalos"}
        </span>
      </div>

      {day.active ? (
        <div className={styles.timeline}>
          <div className={styles.timelineHeader}>
            <strong>Linha do dia</strong>
            <div className={styles.legend}>
              <span className={styles.availableLegend}>Disponível</span>
              <span className={styles.intervalLegend}>Intervalo</span>
            </div>
          </div>

          {timeline.valid ? (
            <>
              <div
                className={styles.track}
                aria-label={`Disponibilidade de ${day.start} até ${day.end}`}
              >
                <div className={styles.availableTrack} />
                {timeline.segments.map((segment, index) => {
                  const segmentStyle = {
                    "--agenda-interval-left": `${segment.left.toFixed(3)}%`,
                    "--agenda-interval-width": `${segment.width.toFixed(3)}%`,
                  } as CSSProperties;

                  return (
                    <div
                      key={`${segment.name}-${segment.start}-${segment.end}-${index}`}
                      className={styles.intervalSegment}
                      style={segmentStyle}
                      title={`${segment.name || "Intervalo"} · ${segment.start} – ${segment.end}`}
                    >
                      <span>{segment.name || "Intervalo"}</span>
                    </div>
                  );
                })}
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
    </section>
  );
}

export default function AgendaAvailabilityPresentation() {
  const [days, setDays] = useState<DaySnapshot[]>([]);
  const [, setRevision] = useState(0);
  const daysRef = useRef<DaySnapshot[]>([]);
  const expandedDaysRef = useRef(new Set<string>());
  const initializedDaysRef = useRef(new Set<string>());
  const signatureRef = useRef("");

  const discoverDays = useCallback(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".agendaTemplateShell .availability > .avDay",
      ),
    );

    const nextDays = cards.flatMap<DaySnapshot>((card, index) => {
      const row = card.querySelector<HTMLElement>(".av");
      const titleElement = row?.querySelector<HTMLElement>("b");
      const toggle = row?.querySelector<HTMLButtonElement>(".toggle");
      if (!row || !titleElement || !toggle) return [];

      let host = card.querySelector<HTMLElement>(
        '[data-agenda-availability-react-host="true"]',
      );
      if (!host) {
        host = document.createElement("div");
        host.dataset.agendaAvailabilityReactHost = "true";
        host.className = styles.host;
        row.insertAdjacentElement("afterend", host);
      }

      const timeInputs = Array.from(
        row.querySelectorAll<HTMLInputElement>('input[type="time"]'),
      );
      const breaks = card.querySelector<HTMLElement>(".avBreaks");
      const intervals = breaks
        ? Array.from(breaks.querySelectorAll<HTMLElement>(".avBreak")).map(
            (intervalRow) => {
              const inputs = Array.from(
                intervalRow.querySelectorAll<HTMLInputElement>("input"),
              );
              const timeValues = inputs
                .filter((input) => input.type === "time")
                .map((input) => input.value);

              return {
                name:
                  inputs.find((input) => input.type !== "time")?.value.trim() ||
                  "Intervalo",
                start: timeValues[0] || "",
                end: timeValues[1] || "",
              };
            },
          )
        : [];
      const title = titleElement.textContent?.trim() || `Dia ${index + 1}`;
      const key = `${normalize(title)}-${index}`;
      const active = toggle.classList.contains("y");

      if (!initializedDaysRef.current.has(key)) {
        initializedDaysRef.current.add(key);
      }

      const snapshot: DaySnapshot = {
        key,
        card,
        host,
        breaks,
        title,
        active,
        start: timeInputs[0]?.value || "",
        end: timeInputs[1]?.value || "",
        intervals,
      };

      applyExistingElementClasses(snapshot);
      const expanded = active && expandedDaysRef.current.has(key);
      card.classList.toggle(styles.expandedDay, expanded);
      if (breaks) breaks.hidden = !expanded;

      return [snapshot];
    });

    const nextSignature = snapshotSignature(nextDays);
    const nodesChanged = nextDays.some((day, index) => {
      const current = daysRef.current[index];
      return !current || current.card !== day.card || current.host !== day.host;
    });

    if (
      nextSignature !== signatureRef.current ||
      nextDays.length !== daysRef.current.length ||
      nodesChanged
    ) {
      signatureRef.current = nextSignature;
      daysRef.current = nextDays;
      setDays(nextDays);
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          discoverDays();
        });
      }
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    discoverDays();

    return () => {
      observer.disconnect();
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("change", schedule, true);
      if (frame) window.cancelAnimationFrame(frame);

      daysRef.current.forEach((day) => {
        removeExistingElementClasses(day);
        day.host.remove();
      });
      daysRef.current = [];
    };
  }, [discoverDays]);

  const toggleDay = useCallback((day: DaySnapshot) => {
    const currentlyExpanded = expandedDaysRef.current.has(day.key);
    if (currentlyExpanded) {
      expandedDaysRef.current.delete(day.key);
    } else {
      expandedDaysRef.current.add(day.key);
    }

    const nextExpanded = !currentlyExpanded && day.active;
    day.card.classList.toggle(styles.expandedDay, nextExpanded);
    if (day.breaks) day.breaks.hidden = !nextExpanded;
    setRevision((current) => current + 1);
  }, []);

  return (
    <>
      {days.map((day) =>
        createPortal(
          <DayPresentation
            day={day}
            expanded={day.active && expandedDaysRef.current.has(day.key)}
            onToggle={() => toggleDay(day)}
          />,
          day.host,
          day.key,
        ),
      )}
    </>
  );
}
