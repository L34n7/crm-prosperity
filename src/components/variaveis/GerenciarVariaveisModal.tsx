"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  VARIAVEIS_FIXAS_SISTEMA,
  normalizarChaveVariavel,
  type VariavelCatalogo,
} from "@/lib/variaveis/catalogo";
import styles from "./VariaveisCompartilhadas.module.css";

export type VariavelPersonalizadaCompartilhada = {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  escopo: string;
  ativo: boolean;
};

export default function GerenciarVariaveisModal({
  aberto,
  onClose,
  onUsar,
  onAtualizadas,
}: {
  aberto: boolean;
  onClose: () => void;
  onUsar?: (chave: string) => void;
  onAtualizadas?: (variaveis: VariavelPersonalizadaCompartilhada[]) => void;
}) {
  const [variaveis, setVariaveis] = useState<
    VariavelPersonalizadaCompartilhada[]
  >([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [chave, setChave] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const fixas = useMemo<VariavelCatalogo[]>(
    () => VARIAVEIS_FIXAS_SISTEMA,
    []
  );

  async function carregar() {
    setCarregando(true);
    setErro("");

    try {
      const response = await fetch("/api/variaveis", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao carregar variáveis.");
      }

      const lista = Array.isArray(data.variaveis) ? data.variaveis : [];
      setVariaveis(lista);
      onAtualizadas?.(lista);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao carregar variáveis."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!aberto) return;

    setChave("");
    setValor("");
    setDescricao("");
    setErro("");
    setSucesso("");
    void carregar();
  }, [aberto]);

  if (!aberto) return null;

  async function salvar() {
    const normalizada = normalizarChaveVariavel(chave);

    if (!normalizada) {
      setErro("Informe o nome da variável.");
      return;
    }

    if (!valor.trim()) {
      setErro("Informe o valor da variável.");
      return;
    }

    setSalvando(true);
    setErro("");
    setSucesso("");

    try {
      const response = await fetch("/api/variaveis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chave: normalizada,
          valor: valor.trim(),
          descricao: descricao.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar variável.");
      }

      setChave("");
      setValor("");
      setDescricao("");
      setSucesso("Variável salva com sucesso.");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao salvar variável."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setErro("");
    setSucesso("");

    try {
      const response = await fetch("/api/variaveis", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao remover variável.");
      }

      setSucesso("Variável removida.");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao remover variável."
      );
    }
  }

  function usar(chaveVariavel: string) {
    onUsar?.(chaveVariavel);
  }

  return (
    <div className={styles.modalOverlay} onMouseDown={onClose}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gerenciar-variaveis-email-titulo"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <p>VARIÁVEIS</p>
            <h3 id="gerenciar-variaveis-email-titulo">Gerenciar variáveis</h3>
            <span>
              As variáveis personalizadas são compartilhadas entre Disparos,
              Fluxos e E-mail Marketing.
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <section className={styles.modalSection}>
            <h4>Cadastrar variável personalizada</h4>

            <div className={styles.formGrid}>
              <label>
                <span>Nome da variável</span>
                <input
                  value={chave}
                  onChange={(event) =>
                    setChave(normalizarChaveVariavel(event.target.value))
                  }
                  placeholder="ex: desconto"
                />
              </label>

              <label>
                <span>Mensagem da variável</span>
                <textarea
                  value={valor}
                  onChange={(event) => setValor(event.target.value)}
                  rows={3}
                  placeholder="Digite o valor ou mensagem da variável..."
                />
              </label>

              <label>
                <span>Descrição interna</span>
                <input
                  value={descricao}
                  onChange={(event) => setDescricao(event.target.value)}
                  placeholder="Ex.: desconto vigente da campanha"
                />
              </label>
            </div>

            <div className={styles.variablePreview}>
              A variável será usada como{" "}
              <strong>{"{{" + (normalizarChaveVariavel(chave) || "nome_variavel") + "}}"}</strong>
            </div>

            {erro ? <div className={styles.error}>{erro}</div> : null}
            {sucesso ? <div className={styles.success}>{sucesso}</div> : null}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void salvar()}
                disabled={salvando}
              >
                {salvando ? "Salvando..." : "Salvar variável"}
              </button>
            </div>
          </section>

          <section className={styles.modalSection}>
            <h4>Variáveis cadastradas</h4>

            {carregando ? (
              <div className={styles.empty}>Carregando variáveis...</div>
            ) : variaveis.length ? (
              <div className={styles.variablesList}>
                {variaveis.map((item) => (
                  <div key={item.id} className={styles.variableItem}>
                    <div>
                      <strong>{"{{" + item.chave + "}}"}</strong>
                      <p>{item.valor}</p>
                      {item.descricao ? <small>{item.descricao}</small> : null}
                    </div>
                    <div>
                      {onUsar ? (
                        <button
                          type="button"
                          onClick={() => usar(item.chave)}
                        >
                          Usar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => void remover(item.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                Nenhuma variável personalizada cadastrada.
              </div>
            )}
          </section>

          <section className={styles.modalSection}>
            <h4>Variáveis fixas do sistema</h4>

            <div className={styles.variablesList}>
              {fixas.map((item) => (
                <div key={item.chave} className={styles.variableItem}>
                  <div>
                    <strong>{item.exemplo}</strong>
                    <p>{item.descricao}</p>
                  </div>
                  {onUsar ? (
                    <button
                      type="button"
                      onClick={() => usar(item.chave)}
                    >
                      Usar
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={styles.modalFooter}>
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
