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
import styles from "./TemplateVariableSearchSelect.module.css";

export type TemplateVariableOption = {
  chave: string;
  descricao: string;
  categoria: "Fixa" | "Personalizada";
};

type Props = {
  label: string;
  value: string;
  onChange: (chave: string) => void;
  opcoes: TemplateVariableOption[];
  carregando?: boolean;
};

function normalizarBusca(valor: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function TemplateVariableSearchSelect({
  label,
  value,
  onChange,
  opcoes,
  carregando = false,
}: Props) {
  const inputId = useId();
  const listboxId = useId();
  const descricaoId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState(value);
  const [buscando, setBuscando] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const opcaoSelecionada = useMemo(
    () => opcoes.find((opcao) => opcao.chave === value) || null,
    [opcoes, value]
  );

  const opcoesFiltradas = useMemo(() => {
    if (!buscando) return opcoes;

    const termo = normalizarBusca(busca);
    if (!termo) return opcoes;

    return opcoes.filter((opcao) => {
      const conteudo = normalizarBusca(
        `${opcao.chave} ${opcao.descricao} ${opcao.categoria}`
      );
      return conteudo.includes(termo);
    });
  }, [busca, buscando, opcoes]);

  const fecharLista = useCallback(() => {
    setAberto(false);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(-1);
  }, [value]);

  const abrirLista = useCallback(() => {
    const indiceSelecionado = opcoes.findIndex(
      (opcao) => opcao.chave === value
    );

    setAberto(true);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(
      indiceSelecionado >= 0 ? indiceSelecionado : opcoes.length > 0 ? 0 : -1
    );
  }, [opcoes, value]);

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        fecharLista();
      }
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    return () => document.removeEventListener("pointerdown", fecharAoClicarFora);
  }, [aberto, fecharLista]);

  useEffect(() => {
    if (
      !aberto ||
      indiceAtivo < 0 ||
      indiceAtivo >= opcoesFiltradas.length
    ) {
      return;
    }

    document
      .getElementById(`${listboxId}-option-${indiceAtivo}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [aberto, indiceAtivo, listboxId, opcoesFiltradas.length]);

  function selecionarOpcao(opcao: TemplateVariableOption) {
    onChange(opcao.chave);
    setBusca(opcao.chave);
    setBuscando(false);
    setAberto(false);
    setIndiceAtivo(-1);
  }

  function navegarOpcoes(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && aberto) {
      event.preventDefault();
      fecharLista();
      return;
    }

    if (event.key === "Tab") {
      fecharLista();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!aberto) {
        abrirLista();
        return;
      }

      if (opcoesFiltradas.length === 0) return;

      const direcao = event.key === "ArrowDown" ? 1 : -1;
      setIndiceAtivo((indiceAtual) => {
        if (indiceAtual < 0) {
          return direcao > 0 ? 0 : opcoesFiltradas.length - 1;
        }

        return (
          (indiceAtual + direcao + opcoesFiltradas.length) %
          opcoesFiltradas.length
        );
      });
      return;
    }

    if (
      event.key === "Enter" &&
      aberto &&
      indiceAtivo >= 0 &&
      opcoesFiltradas[indiceAtivo]
    ) {
      event.preventDefault();
      selecionarOpcao(opcoesFiltradas[indiceAtivo]);
    }
  }

  return (
    <div className={styles.field} ref={containerRef}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>

      <div className={`${styles.control} ${aberto ? styles.controlOpen : ""}`}>
        <Search
          size={16}
          strokeWidth={2}
          className={styles.searchIcon}
          aria-hidden="true"
        />
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={listboxId}
          aria-describedby={descricaoId}
          aria-activedescendant={
            aberto &&
            indiceAtivo >= 0 &&
            indiceAtivo < opcoesFiltradas.length
              ? `${listboxId}-option-${indiceAtivo}`
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={aberto ? busca : value}
          placeholder="Selecione uma variável"
          className={styles.input}
          onFocus={(event) => {
            abrirLista();
            event.currentTarget.select();
          }}
          onClick={(event) => {
            if (!aberto) abrirLista();
            if (!buscando) event.currentTarget.select();
          }}
          onChange={(event) => {
            setBusca(event.target.value);
            setBuscando(true);
            setAberto(true);
            setIndiceAtivo(0);
          }}
          onKeyDown={navegarOpcoes}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-label={aberto ? "Fechar variáveis" : "Abrir variáveis"}
          aria-expanded={aberto}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (aberto) {
              fecharLista();
            } else {
              abrirLista();
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={aberto ? styles.chevronOpen : ""}
          />
        </button>
      </div>

      {aberto ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções para ${label}`}
          className={styles.menu}
        >
          {opcoesFiltradas.map((opcao, index) => {
            const selecionada = opcao.chave === value;
            const ativa = index === indiceAtivo;

            return (
              <button
                id={`${listboxId}-option-${index}`}
                key={`${opcao.categoria}-${opcao.chave}`}
                type="button"
                role="option"
                aria-selected={selecionada}
                className={`${styles.option} ${
                  ativa ? styles.optionActive : ""
                } ${selecionada ? styles.optionSelected : ""}`}
                onMouseEnter={() => setIndiceAtivo(index)}
                onClick={() => selecionarOpcao(opcao)}
              >
                <span className={styles.optionHeader}>
                  <strong>{`{{${opcao.chave}}}`}</strong>
                  <span className={styles.category}>{opcao.categoria}</span>
                  {selecionada ? (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className={styles.check}
                    />
                  ) : null}
                </span>
                <small>{opcao.descricao}</small>
              </button>
            );
          })}

          {opcoesFiltradas.length === 0 ? (
            <div className={styles.empty}>Nenhuma variável encontrada.</div>
          ) : null}

          {carregando ? (
            <div className={styles.loading}>
              Carregando variáveis personalizadas...
            </div>
          ) : null}
        </div>
      ) : null}

      <p id={descricaoId} className={styles.description}>
        {opcaoSelecionada
          ? opcaoSelecionada.descricao
          : "Selecione uma variável disponível para este campo."}
      </p>
    </div>
  );
}
