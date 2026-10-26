"use client";

import { useState } from "react";
import styles from "./growth.module.css";

type AtalhoPeriodo =
  | "7d"
  | "15d"
  | "mes_atual"
  | "mes_passado"
  | "30d"
  | "3m"
  | "personalizado";

type GrowthPeriodFilterProps = {
  atalho: AtalhoPeriodo;
  inicio: string;
  fim: string;
};

const TIME_ZONE = "America/Sao_Paulo";

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function subtractDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - days);
  return formatDate(date);
}

function rangeForShortcut(shortcut: AtalhoPeriodo) {
  const end = hojeSaoPaulo();
  const endDate = parseDate(end);

  if (shortcut === "mes_atual") {
    return { inicio: end.slice(0, 8) + "01", fim: end };
  }

  if (shortcut === "mes_passado") {
    const firstCurrent = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1),
    );
    const lastPrevious = new Date(firstCurrent.getTime() - 86400000);
    const firstPrevious = new Date(
      Date.UTC(
        lastPrevious.getUTCFullYear(),
        lastPrevious.getUTCMonth(),
        1,
      ),
    );
    return {
      inicio: formatDate(firstPrevious),
      fim: formatDate(lastPrevious),
    };
  }

  if (shortcut === "7d") return { inicio: subtractDays(end, 6), fim: end };
  if (shortcut === "15d") return { inicio: subtractDays(end, 14), fim: end };
  if (shortcut === "30d") return { inicio: subtractDays(end, 29), fim: end };
  if (shortcut === "3m") return { inicio: subtractDays(end, 89), fim: end };

  return null;
}

export default function GrowthPeriodFilter({
  atalho: initialShortcut,
  inicio: initialStart,
  fim: initialEnd,
}: GrowthPeriodFilterProps) {
  const [atalho, setAtalho] = useState<AtalhoPeriodo>(initialShortcut);
  const [inicio, setInicio] = useState(initialStart);
  const [fim, setFim] = useState(initialEnd);

  function handleShortcut(value: AtalhoPeriodo) {
    setAtalho(value);
    const range = rangeForShortcut(value);
    if (!range) return;
    setInicio(range.inicio);
    setFim(range.fim);
  }

  function handleStart(value: string) {
    setInicio(value);
    setAtalho("personalizado");
  }

  function handleEnd(value: string) {
    setFim(value);
    setAtalho("personalizado");
  }

  return (
    <form className={styles.filters} action="/relatorios-internos/growth">
      <label className={styles.shortcutField}>
        Atalho
        <span>
          <select
            name="atalho"
            value={atalho}
            onChange={(event) =>
              handleShortcut(event.target.value as AtalhoPeriodo)
            }
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="15d">Últimos 15 dias</option>
            <option value="mes_atual">Mês atual</option>
            <option value="mes_passado">Mês passado</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="3m">Últimos 3 meses</option>
            <option value="personalizado">Período personalizado</option>
          </select>
        </span>
      </label>

      <label>
        Início
        <span>
          <input
            type="date"
            name="inicio"
            value={inicio}
            onChange={(event) => handleStart(event.target.value)}
          />
        </span>
      </label>

      <label>
        Fim
        <span>
          <input
            type="date"
            name="fim"
            value={fim}
            onChange={(event) => handleEnd(event.target.value)}
          />
        </span>
      </label>

      <button type="submit">Aplicar período</button>
    </form>
  );
}
