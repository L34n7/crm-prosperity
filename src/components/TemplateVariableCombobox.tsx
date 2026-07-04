"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import styles from "./TemplateVariableCombobox.module.css";

export type TemplateVariableOption = {
  key: string;
  description: string;
  category: "Fixa" | "Personalizada" | "Fluxo" | "Agendamento";
};

type TemplateVariableComboboxProps = {
  label: string;
  value: string;
  onChange: (key: string) => void;
  options: TemplateVariableOption[];
  loading?: boolean;
};

function normalizeSearch(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function TemplateVariableCombobox({
  label,
  value,
  onChange,
  options,
  loading = false,
}: TemplateVariableComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedOption = useMemo(
    () => options.find((option) => option.key === value) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searching) return options;

    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return options;

    return options.filter((option) =>
      normalizeSearch(
        `${option.key} ${option.description} ${option.category}`
      ).includes(normalizedQuery)
    );
  }, [options, query, searching]);

  const closeList = useCallback(() => {
    setOpen(false);
    setSearching(false);
    setQuery(value);
    setActiveIndex(-1);
  }, [value]);

  const openList = useCallback(() => {
    const selectedIndex = options.findIndex((option) => option.key === value);

    setOpen(true);
    setSearching(false);
    setQuery(value);
    setActiveIndex(
      selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1
    );
  }, [options, value]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        closeList();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [closeList, open]);

  useEffect(() => {
    if (
      !open ||
      activeIndex < 0 ||
      activeIndex >= filteredOptions.length
    ) {
      return;
    }

    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filteredOptions.length, listboxId, open]);

  function selectOption(option: TemplateVariableOption) {
    onChange(option.key);
    setQuery(option.key);
    setSearching(false);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeList();
      return;
    }

    if (event.key === "Tab") {
      closeList();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        openList();
        return;
      }

      if (filteredOptions.length === 0) return;

      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((currentIndex) => {
        if (currentIndex < 0) {
          return direction > 0 ? 0 : filteredOptions.length - 1;
        }

        return (
          (currentIndex + direction + filteredOptions.length) %
          filteredOptions.length
        );
      });
      return;
    }

    if (
      event.key === "Enter" &&
      open &&
      activeIndex >= 0 &&
      filteredOptions[activeIndex]
    ) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    }
  }

  return (
    <div className={styles.field} ref={containerRef}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <div className={`${styles.control} ${open ? styles.controlOpen : ""}`}>
        <Search size={16} className={styles.searchIcon} aria-hidden="true" />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-describedby={descriptionId}
          aria-activedescendant={
            open && activeIndex >= 0 && activeIndex < filteredOptions.length
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={open ? query : value}
          placeholder="Selecione uma variável"
          className={styles.input}
          onFocus={(event) => {
            openList();
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!open) openList();
            if (!searching) event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearching(true);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-label={open ? "Fechar variáveis" : "Abrir variáveis"}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              closeList();
            } else {
              openList();
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={open ? styles.chevronOpen : ""}
          />
        </button>
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções para ${label}`}
          className={styles.menu}
        >
          {filteredOptions.map((option, index) => {
            const selected = option.key === value;
            const active = index === activeIndex;

            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={`${option.category}-${option.key}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.option} ${
                  active ? styles.optionActive : ""
                } ${selected ? styles.optionSelected : ""}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <span className={styles.optionHeader}>
                  <strong>{`{{${option.key}}}`}</strong>
                  <span className={styles.category}>{option.category}</span>
                  {selected ? (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      className={styles.check}
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
                <small>{option.description}</small>
              </button>
            );
          })}

          {filteredOptions.length === 0 ? (
            <div className={styles.empty}>Nenhuma variável encontrada.</div>
          ) : null}

          {loading ? (
            <div className={styles.loading}>
              Carregando variáveis personalizadas...
            </div>
          ) : null}
        </div>
      ) : null}

      <p id={descriptionId} className={styles.description}>
        {selectedOption
          ? selectedOption.description
          : "Selecione uma variável disponível para este campo."}
      </p>
    </div>
  );
}
