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
import disparoStyles from "../disparos-whatsapp/disparos-whatsapp.module.css";

type VariavelPersonalizada = {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  escopo?: string | null;
  ativo: boolean;
};

type OpcaoVariavelTemplate = {
  chave: string;
  descricao: string;
  categoria: "Fixa" | "Personalizada";
};

type Props = {
  totalVariaveis: number;
  variaveis: string[];
  onChange: (variaveis: string[]) => void;
};

const VARIAVEIS_FIXAS_SISTEMA = [
  {
    chave: "nome_contato",
    exemplo: "{{nome_contato}}",
    descricao: "Nome salvo no cadastro do contato.",
  },
  {
    chave: "nome",
    exemplo: "{{nome}}",
    descricao: "Nome do contato.",
  },
  {
    chave: "nome_whatsapp",
    exemplo: "{{nome_whatsapp}}",
    descricao:
      "Nome do perfil do WhatsApp quando existir; se não existir, usa o nome salvo no contato.",
  },
  {
    chave: "email_contato",
    exemplo: "{{email_contato}}",
    descricao: "E-mail salvo no cadastro do contato.",
  },
  {
    chave: "numero_contato",
    exemplo: "{{numero_contato}}",
    descricao: "Número/telefone salvo no cadastro do contato.",
  },
  {
    chave: "campanha",
    exemplo: "{{campanha}}",
    descricao: "Campanha vinculada ao contato.",
  },
  {
    chave: "origem",
    exemplo: "{{origem}}",
    descricao: "Origem do contato.",
  },
  {
    chave: "status_lead",
    exemplo: "{{status_lead}}",
    descricao: "Classificação atual do lead.",
  },
  {
    chave: "classificacao_lead",
    exemplo: "{{classificacao_lead}}",
    descricao: "Classificação global do lead.",
  },
  {
    chave: "protocolo_atual",
    exemplo: "{{protocolo_atual}}",
    descricao: "Protocolo ativo da conversa atual do contato.",
  },
  {
    chave: "ultimo_protocolo",
    exemplo: "{{ultimo_protocolo}}",
    descricao: "Último protocolo encerrado/inativo do contato.",
  },
];

function normalizarEntradaVariavelTemplate(valor: string) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+/g, "");
}

function normalizarBuscaVariavelTemplate(valor: string) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function SeletorVariavelTemplate({
  label,
  value,
  onChange,
  opcoes,
  carregando,
}: {
  label: string;
  value: string;
  onChange: (chave: string) => void;
  opcoes: OpcaoVariavelTemplate[];
  carregando: boolean;
}) {
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
    [opcoes, value],
  );

  const opcoesFiltradas = useMemo(() => {
    if (!buscando) return opcoes;

    const termo = normalizarBuscaVariavelTemplate(busca);
    if (!termo) return opcoes;

    return opcoes.filter((opcao) => {
      const conteudo = normalizarBuscaVariavelTemplate(
        `${opcao.chave} ${opcao.descricao} ${opcao.categoria}`,
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
      (opcao) => opcao.chave === value,
    );

    setAberto(true);
    setBuscando(false);
    setBusca(value);
    setIndiceAtivo(
      indiceSelecionado >= 0 ? indiceSelecionado : opcoes.length > 0 ? 0 : -1,
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

  function selecionarOpcao(opcao: OpcaoVariavelTemplate) {
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
    <div className={disparoStyles.variableComboboxField} ref={containerRef}>
      <label className={disparoStyles.label} htmlFor={inputId}>
        {label}
      </label>

      <div
        className={`${disparoStyles.variableComboboxControl} ${
          aberto ? disparoStyles.variableComboboxControlOpen : ""
        }`}
      >
        <Search
          size={16}
          strokeWidth={2}
          className={disparoStyles.variableComboboxSearchIcon}
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
          className={disparoStyles.variableComboboxInput}
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
          className={disparoStyles.variableComboboxToggle}
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
            className={aberto ? disparoStyles.variableComboboxChevronOpen : ""}
          />
        </button>
      </div>

      {aberto ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções para ${label}`}
          className={disparoStyles.variableComboboxMenu}
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
                className={`${disparoStyles.variableComboboxOption} ${
                  ativa ? disparoStyles.variableComboboxOptionActive : ""
                } ${
                  selecionada ? disparoStyles.variableComboboxOptionSelected : ""
                }`}
                onMouseEnter={() => setIndiceAtivo(index)}
                onClick={() => selecionarOpcao(opcao)}
              >
                <span className={disparoStyles.variableComboboxOptionHeader}>
                  <strong>{`{{${opcao.chave}}}`}</strong>
                  <span className={disparoStyles.variableComboboxCategory}>
                    {opcao.categoria}
                  </span>
                  {selecionada ? (
                    <Check
                      size={16}
                      strokeWidth={2.5}
                      aria-hidden="true"
                      className={disparoStyles.variableComboboxCheck}
                    />
                  ) : null}
                </span>
                <small>{opcao.descricao}</small>
              </button>
            );
          })}

          {opcoesFiltradas.length === 0 ? (
            <div className={disparoStyles.variableComboboxEmpty}>
              Nenhuma variável encontrada.
            </div>
          ) : null}

          {carregando ? (
            <div className={disparoStyles.variableComboboxLoading}>
              Carregando variáveis personalizadas...
            </div>
          ) : null}
        </div>
      ) : null}

      <p id={descricaoId} className={disparoStyles.variableComboboxDescription}>
        {opcaoSelecionada
          ? opcaoSelecionada.descricao
          : "Selecione uma variável disponível para este campo."}
      </p>
    </div>
  );
}

export default function AutomationTemplateVariables({
  totalVariaveis,
  variaveis,
  onChange,
}: Props) {
  const [modalVariaveisAberto, setModalVariaveisAberto] = useState(false);
  const [variaveisPersonalizadas, setVariaveisPersonalizadas] = useState<
    VariavelPersonalizada[]
  >([]);
  const [loadingVariaveis, setLoadingVariaveis] = useState(false);
  const [salvandoVariavel, setSalvandoVariavel] = useState(false);
  const [erroVariavelModal, setErroVariavelModal] = useState("");
  const [novaVariavelChave, setNovaVariavelChave] = useState("");
  const [novaVariavelValor, setNovaVariavelValor] = useState("");
  const [novaVariavelDescricao, setNovaVariavelDescricao] = useState("");

  const carregarVariaveisPersonalizadas = useCallback(async () => {
    try {
      setLoadingVariaveis(true);
      const res = await fetch("/api/variaveis", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar variáveis.");
      }
      setVariaveisPersonalizadas(
        Array.isArray(json.variaveis) ? json.variaveis : [],
      );
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao carregar variáveis.",
      );
    } finally {
      setLoadingVariaveis(false);
    }
  }, []);

  useEffect(() => {
    void carregarVariaveisPersonalizadas();
  }, [carregarVariaveisPersonalizadas]);

  const opcoesVariaveisTemplate = useMemo<OpcaoVariavelTemplate[]>(() => {
    const chavesAdicionadas = new Set<string>();
    const opcoes: OpcaoVariavelTemplate[] = [];

    for (const variavel of VARIAVEIS_FIXAS_SISTEMA) {
      if (chavesAdicionadas.has(variavel.chave)) continue;
      chavesAdicionadas.add(variavel.chave);
      opcoes.push({
        chave: variavel.chave,
        descricao: variavel.descricao,
        categoria: "Fixa",
      });
    }

    for (const variavel of variaveisPersonalizadas) {
      const chave = normalizarEntradaVariavelTemplate(variavel.chave);
      if (!variavel.ativo || !chave || chavesAdicionadas.has(chave)) continue;

      chavesAdicionadas.add(chave);
      opcoes.push({
        chave,
        descricao:
          variavel.descricao?.trim() ||
          "Variável personalizada cadastrada pela empresa.",
        categoria: "Personalizada",
      });
    }

    return opcoes;
  }, [variaveisPersonalizadas]);

  function atualizarVariavel(posicao: number, chave: string) {
    const novas = Array.from(
      { length: totalVariaveis },
      (_, index) => variaveis[index] || "",
    );
    novas[posicao] = chave;
    onChange(novas);
  }

  function aplicarVariavelNoCampo(chave: string) {
    const valor = normalizarEntradaVariavelTemplate(chave);
    if (!valor) return;

    const novas = Array.from(
      { length: totalVariaveis },
      (_, index) => variaveis[index] || "",
    );
    const primeiroVazio = novas.findIndex((item) => !String(item || "").trim());
    novas[primeiroVazio >= 0 ? primeiroVazio : 0] = valor;
    onChange(novas);
  }

  async function salvarVariavelPersonalizada() {
    try {
      setErroVariavelModal("");
      const chave = normalizarEntradaVariavelTemplate(novaVariavelChave);
      const valor = novaVariavelValor.trim();

      if (!chave) {
        setErroVariavelModal("Informe o nome da variável.");
        return;
      }
      if (!valor) {
        setErroVariavelModal("Informe o valor da variável.");
        return;
      }

      setSalvandoVariavel(true);
      const res = await fetch("/api/variaveis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chave,
          valor,
          descricao: novaVariavelDescricao.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao salvar variável.");
      }

      setNovaVariavelChave("");
      setNovaVariavelValor("");
      setNovaVariavelDescricao("");
      await carregarVariaveisPersonalizadas();
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao salvar variável.",
      );
    } finally {
      setSalvandoVariavel(false);
    }
  }

  async function removerVariavelPersonalizada(id: string) {
    try {
      setErroVariavelModal("");
      const res = await fetch("/api/variaveis", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao remover variável.");
      }
      await carregarVariaveisPersonalizadas();
    } catch (error: unknown) {
      setErroVariavelModal(
        error instanceof Error ? error.message : "Erro ao remover variável.",
      );
    }
  }

  return (
    <>
      <div className={disparoStyles.templateHintRow}>
        <div className={disparoStyles.templateHint}>
          Este template usa <strong>{totalVariaveis}</strong> variável(is).
          Selecione qual dado substituirá cada marcador do template.
        </div>

        <button
          type="button"
          className={disparoStyles.variablesButton}
          onClick={() => {
            setErroVariavelModal("");
            setModalVariaveisAberto(true);
          }}
        >
          Gerenciar variáveis
        </button>
      </div>

      <div className={disparoStyles.templateVariablesGrid}>
        {Array.from({ length: totalVariaveis }, (_, posicao) => (
          <SeletorVariavelTemplate
            key={`automacao-variavel-${posicao}`}
            label={`Variável ${posicao + 1} · {{${posicao + 1}}}`}
            value={variaveis[posicao] || ""}
            onChange={(chave) => atualizarVariavel(posicao, chave)}
            opcoes={opcoesVariaveisTemplate}
            carregando={loadingVariaveis}
          />
        ))}
      </div>

      {modalVariaveisAberto ? (
        <div
          className={disparoStyles.modalOverlay}
          style={{ zIndex: 260 }}
          onClick={() => {
            setErroVariavelModal("");
            setModalVariaveisAberto(false);
          }}
        >
          <div
            className={disparoStyles.modalConfirmacao}
            role="dialog"
            aria-modal="true"
            aria-label="Gerenciar variáveis"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={disparoStyles.modalHeader}>
              <div>
                <p className={disparoStyles.modalEyebrow}>Variáveis</p>
                <h3 className={disparoStyles.modalTitle}>Gerenciar variáveis</h3>
                <p className={disparoStyles.modalSubtitle}>
                  Cadastre variáveis personalizadas e consulte as variáveis fixas
                  disponíveis para disparos e fluxos.
                </p>
              </div>

              <button
                type="button"
                className={disparoStyles.modalClose}
                onClick={() => {
                  setErroVariavelModal("");
                  setModalVariaveisAberto(false);
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className={disparoStyles.modalBody}>
              <div className={disparoStyles.modalSection}>
                <h4 className={disparoStyles.modalSectionTitle}>
                  Cadastrar variável personalizada
                </h4>

                <div className={disparoStyles.variableFormGrid}>
                  <div className={disparoStyles.field}>
                    <label className={disparoStyles.label}>Nome da variável</label>
                    <input
                      value={novaVariavelChave}
                      onChange={(event) =>
                        setNovaVariavelChave(
                          normalizarEntradaVariavelTemplate(event.target.value),
                        )
                      }
                      className={disparoStyles.input}
                      placeholder="ex: desconto"
                    />
                  </div>
                </div>

                <div className={disparoStyles.field}>
                  <label className={disparoStyles.label}>
                    Mensagem da variável
                  </label>
                  <textarea
                    value={novaVariavelValor}
                    onChange={(event) => setNovaVariavelValor(event.target.value)}
                    className={disparoStyles.textarea}
                    placeholder="Digite a mensagem da variável..."
                    rows={4}
                  />
                </div>

                <div className={disparoStyles.field}>
                  <label className={disparoStyles.label}>Descrição Interna</label>
                  <textarea
                    value={novaVariavelDescricao}
                    onChange={(event) =>
                      setNovaVariavelDescricao(event.target.value)
                    }
                    className={disparoStyles.textareadesc}
                    placeholder="ex: essa variável é sobre desconto."
                  />
                </div>

                <div className={disparoStyles.variablePreviewBox}>
                  A variável será usada assim:{" "}
                  <strong>
                    {"{{"}
                    {normalizarEntradaVariavelTemplate(novaVariavelChave) ||
                      "nome_variavel"}
                    {"}}"}
                  </strong>
                </div>

                {erroVariavelModal ? (
                  <div className={disparoStyles.errorAlert}>
                    {erroVariavelModal}
                  </div>
                ) : null}

                <div className={disparoStyles.variableFormActions}>
                  <button
                    type="button"
                    className={disparoStyles.primaryButton}
                    onClick={salvarVariavelPersonalizada}
                    disabled={salvandoVariavel}
                  >
                    {salvandoVariavel ? "Salvando..." : "Salvar variável"}
                  </button>
                </div>
              </div>

              <div className={disparoStyles.modalSection}>
                <h4 className={disparoStyles.modalSectionTitle}>
                  Variáveis cadastradas
                </h4>

                {loadingVariaveis ? (
                  <div className={disparoStyles.emptyMiniState}>
                    Carregando variáveis...
                  </div>
                ) : variaveisPersonalizadas.length === 0 ? (
                  <div className={disparoStyles.emptyMiniState}>
                    Nenhuma variável personalizada cadastrada.
                  </div>
                ) : (
                  <div className={disparoStyles.variablesList}>
                    {variaveisPersonalizadas.map((item) => (
                      <div key={item.id} className={disparoStyles.variableItem}>
                        <div className={disparoStyles.variableMain}>
                          <strong className={disparoStyles.variableCode}>
                            {"{{"}
                            {item.chave}
                            {"}}"}
                          </strong>

                          <p className={disparoStyles.variablePerson}>
                            <strong>Mensagem da variável: </strong>
                            {item.valor}
                          </p>

                          {item.descricao ? (
                            <p className={disparoStyles.variablePerson}>
                              <strong>Descrição Interna: </strong>
                              {item.descricao}
                            </p>
                          ) : null}
                        </div>

                        <div className={disparoStyles.variableActions}>
                          <button
                            type="button"
                            className={disparoStyles.variableUseButton}
                            onClick={() => aplicarVariavelNoCampo(item.chave)}
                          >
                            Usar
                          </button>

                          <button
                            type="button"
                            className={disparoStyles.variableDeleteButton}
                            onClick={() => removerVariavelPersonalizada(item.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={disparoStyles.modalSection}>
                <h4 className={disparoStyles.modalSectionTitle}>
                  Variáveis fixas do sistema
                </h4>

                <div className={disparoStyles.variablesList}>
                  {VARIAVEIS_FIXAS_SISTEMA.map((item) => (
                    <div key={item.chave} className={disparoStyles.variableItem}>
                      <div className={disparoStyles.variableMain}>
                        <strong className={disparoStyles.variableCode}>
                          {item.exemplo}
                        </strong>
                        <p className={disparoStyles.variableDescription}>
                          {item.descricao}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={disparoStyles.variableUseButton}
                        onClick={() => aplicarVariavelNoCampo(item.chave)}
                      >
                        Usar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={disparoStyles.modalFooter}>
              <button
                type="button"
                className={disparoStyles.secondaryButton}
                onClick={() => {
                  setErroVariavelModal("");
                  setModalVariaveisAberto(false);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
