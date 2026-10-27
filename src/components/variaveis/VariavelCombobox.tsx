"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search } from "lucide-react";
import type { VariavelCatalogo } from "@/lib/variaveis/catalogo";
import styles from "./VariaveisCompartilhadas.module.css";

function normalizarBusca(valor: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function VariavelCombobox({
  label,
  value,
  onChange,
  opcoes,
  carregando = false,
  placeholder = "Selecione uma variável",
}: {
  label?: string;
  value: string;
  onChange: (chave: string) => void;
  opcoes: VariavelCatalogo[];
  carregando?: boolean;
  placeholder?: string;
}) {
  const inputId = useId();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(value);
  const [buscando, setBuscando] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const selecionada = useMemo(
    () => opcoes.find((opcao) => opcao.chave === value) || null,
    [opcoes, value]
  );

  const filtradas = useMemo(() => {
    if (!buscando) return opcoes;

    const termo = normalizarBusca(busca);
    if (!termo) return opcoes;

    return opcoes.filter((opcao) =>
      normalizarBusca(
        opcao.chave +
          " " +
          opcao.descricao +
          " " +
          opcao.categoria
      ).includes(termo)
    );
  }, [busca, buscando, opcoes]);

  const fechar = useCallback(() => {
    setAberto(false);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(-1);
  }, [value]);

  const abrir = useCallback(() => {
    const indice = opcoes.findIndex((opcao) => opcao.chave === value);
    setAberto(true);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(indice >= 0 ? indice : opcoes.length ? 0 : -1);
  }, [opcoes, value]);

  useEffect(() => {
    if (!aberto) return;

    function fora(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        fechar();
      }
    }

    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto, fechar]);

  function selecionar(opcao: VariavelCatalogo) {
    onChange(opcao.chave);
    setBusca(opcao.chave);
    setBuscando(false);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  return (
    <div className={styles.comboField} ref={containerRef}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <div className={styles.comboControl}>
        <Search size={16} aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listboxId}
          autoComplete="off"
          spellCheck={false}
          value={aberto ? busca : value}
          placeholder={carregando ? "Carregando variáveis..." : placeholder}
          onFocus={(event) => {
            abrir();
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!aberto) abrir();
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setBusca(event.target.value);
            setBuscando(true);
            setAberto(true);
            setIndiceAtivo(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              fechar();
              return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!aberto) {
                abrir();
                return;
              }
              if (!filtradas.length) return;
              const direcao = event.key === "ArrowDown" ? 1 : -1;
              setIndiceAtivo((atual) =>
                atual < 0
                  ? direcao > 0
                    ? 0
                    : filtradas.length - 1
                  : (atual + direcao + filtradas.length) % filtradas.length
              );
              return;
            }

            if (
              event.key === "Enter" &&
              aberto &&
              indiceAtivo >= 0 &&
              filtradas[indiceAtivo]
            ) {
              event.preventDefault();
              selecionar(filtradas[indiceAtivo]);
            }
          }}
        />
      </div>

      {aberto ? (
        <div id={listboxId} role="listbox" className={styles.comboList}>
          {filtradas.length ? (
            filtradas.map((opcao, index) => (
              <button
                key={opcao.chave}
                type="button"
                role="option"
                aria-selected={opcao.chave === value}
                className={
                  index === indiceAtivo
                    ? styles.comboOptionActive
                    : styles.comboOption
                }
                onMouseEnter={() => setIndiceAtivo(index)}
                onClick={() => selecionar(opcao)}
              >
                <span>
                  <strong>{"{{" + opcao.chave + "}}"}</strong>
                  <small>{opcao.descricao}</small>
                </span>
                <em>{opcao.categoria}</em>
              </button>
            ))
          ) : (
            <div className={styles.comboEmpty}>
              Nenhuma variável encontrada.
            </div>
          )}
        </div>
      ) : null}

      {!aberto && selecionada ? (
        <small className={styles.comboDescription}>
          {selecionada.descricao}
        </small>
      ) : null}
    </div>
  );
}
