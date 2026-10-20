
"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Building2,
  Globe2,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import styles from "./white-labels.module.css";

type Plano = {
  id: string;
  nome: string;
};

type WhiteLabel = {
  id: string;
  nome: string;
  slug: string;
  dominio: string;
  nome_produto: string;
  logo_url: string | null;
  favicon_url: string | null;
  cor_primaria: string;
  licencas_contratadas: number;
  licencas_usadas: number;
  licencas_disponiveis: number;
  plano_padrao_id: string | null;
  empresa_gestora_id: string | null;
  status: "ativo" | "inativo";
  administrador: {
    email: string;
    nome: string | null;
  } | null;
};

const FORM_INICIAL = {
  nome: "",
  nome_produto: "",
  dominio: "",
  logo_url: "",
  favicon_url: "",
  cor_primaria: "#0f509a",
  licencas_contratadas: "5",
  plano_padrao_id: "",
  administrador_nome: "",
  administrador_email: "",
  administrador_telefone: "",
  status: "ativo",
};

export default function WhiteLabelsPage() {
  const [itens, setItens] = useState<WhiteLabel[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [warning, setWarning] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);

  async function carregar() {
    setCarregando(true);
    setErro("");

    try {
      const [whiteLabelsResponse, planosResponse] = await Promise.all([
        fetch("/api/white-labels", { cache: "no-store" }),
        fetch("/api/planos", { cache: "no-store" }),
      ]);
      const [whiteLabelsJson, planosJson] = await Promise.all([
        whiteLabelsResponse.json(),
        planosResponse.json(),
      ]);

      if (!whiteLabelsResponse.ok) {
        throw new Error(
          whiteLabelsJson.error || "Não foi possível carregar os White Labels."
        );
      }

      setItens(whiteLabelsJson.white_labels || []);
      if (planosResponse.ok) {
        setPlanos(planosJson.planos || []);
        setForm((atual) => ({
          ...atual,
          plano_padrao_id:
            atual.plano_padrao_id || planosJson.planos?.[0]?.id || "",
        }));
      }
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os White Labels."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function abrirNovo() {
    setEditandoId("");
    setErro("");
    setWarning("");
    setForm({
      ...FORM_INICIAL,
      plano_padrao_id: planos[0]?.id || "",
    });
    setModalAberto(true);
  }

  function abrirEdicao(item: WhiteLabel) {
    setEditandoId(item.id);
    setErro("");
    setWarning("");
    setForm({
      nome: item.nome,
      nome_produto: item.nome_produto,
      dominio: item.dominio,
      logo_url: item.logo_url || "",
      favicon_url: item.favicon_url || "",
      cor_primaria: item.cor_primaria || "#0f509a",
      licencas_contratadas: String(item.licencas_contratadas),
      plano_padrao_id: item.plano_padrao_id || planos[0]?.id || "",
      administrador_nome: item.administrador?.nome || "",
      administrador_email: item.administrador?.email || "",
      administrador_telefone: "",
      status: item.status,
    });
    setModalAberto(true);
  }

  async function salvar(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErro("");
    setSucesso("");
    setWarning("");

    try {
      const payload = {
        ...form,
        licencas_contratadas: Number(form.licencas_contratadas),
      };
      const response = await fetch(
        editandoId ? "/api/white-labels/" + editandoId : "/api/white-labels",
        {
          method: editandoId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível salvar o White Label.");
      }

      setSucesso(data.message || "White Label salvo com sucesso.");
      setWarning(data.warning || "");
      setModalAberto(false);
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o White Label."
      );
    } finally {
      setSalvando(false);
    }
  }

  const totalLicencas = itens.reduce(
    (total, item) => total + item.licencas_contratadas,
    0
  );
  const totalEmUso = itens.reduce(
    (total, item) => total + item.licencas_usadas,
    0
  );

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Administração mestre</span>
          <h1>White Labels</h1>
          <p>
            Gerencie revendedores, identidade visual, domínio próprio e
            quantidade de licenças.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void carregar()}
          >
            <RefreshCw size={17} />
            Atualizar
          </button>
          <button type="button" className={styles.primary} onClick={abrirNovo}>
            <Plus size={18} />
            Novo White Label
          </button>
        </div>
      </section>

      {erro ? <div className={styles.error}>{erro}</div> : null}
      {sucesso ? <div className={styles.success}>{sucesso}</div> : null}
      {warning ? <div className={styles.warning}>{warning}</div> : null}

      <section className={styles.stats}>
        <article>
          <Building2 size={20} />
          <div><span>White Labels</span><strong>{itens.length}</strong></div>
        </article>
        <article>
          <KeyRound size={20} />
          <div><span>Licenças contratadas</span><strong>{totalLicencas}</strong></div>
        </article>
        <article>
          <Globe2 size={20} />
          <div><span>Licenças em uso</span><strong>{totalEmUso}</strong></div>
        </article>
      </section>

      <section className={styles.panel}>
        {carregando ? (
          <div className={styles.empty}>Carregando White Labels...</div>
        ) : itens.length === 0 ? (
          <div className={styles.empty}>
            <Building2 size={34} />
            <strong>Nenhum White Label criado</strong>
            <span>Crie o primeiro parceiro para liberar o painel de revenda.</span>
          </div>
        ) : (
          <div className={styles.grid}>
            {itens.map((item) => (
              <article className={styles.card} key={item.id}>
                <div className={styles.cardTop}>
                  <div className={styles.brandIdentity}>
                    <span
                      className={styles.brandMark}
                      style={{ background: item.cor_primaria }}
                    >
                      {item.logo_url ? (
                        <img src={item.logo_url} alt="" />
                      ) : (
                        item.nome.charAt(0).toUpperCase()
                      )}
                    </span>
                    <div>
                      <strong>{item.nome_produto}</strong>
                      <span>{item.nome}</span>
                    </div>
                  </div>
                  <span
                    className={
                      item.status === "ativo"
                        ? styles.activeBadge
                        : styles.inactiveBadge
                    }
                  >
                    {item.status}
                  </span>
                </div>

                <div className={styles.domain}>
                  <Globe2 size={15} />
                  {item.dominio}
                </div>

                <div className={styles.licenseRow}>
                  <div>
                    <span>Licenças</span>
                    <strong>
                      {item.licencas_usadas}/{item.licencas_contratadas}
                    </strong>
                  </div>
                  <div>
                    <span>Disponíveis</span>
                    <strong>{item.licencas_disponiveis}</strong>
                  </div>
                </div>

                <div className={styles.adminLine}>
                  <span>Administrador</span>
                  <strong>{item.administrador?.email || "Não definido"}</strong>
                </div>

                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => abrirEdicao(item)}
                >
                  <Pencil size={15} />
                  Editar White Label
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalAberto ? (
        <div className={styles.overlay}>
          <form className={styles.modal} onSubmit={salvar}>
            <button
              type="button"
              className={styles.close}
              onClick={() => setModalAberto(false)}
              disabled={salvando}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <span className={styles.eyebrow}>
              {editandoId ? "Configuração" : "Novo parceiro"}
            </span>
            <h2>{editandoId ? "Editar White Label" : "Criar White Label"}</h2>
            <p>
              O domínio deve ser apontado para este mesmo projeto na Vercel.
            </p>

            <div className={styles.formGrid}>
              <label>
                Nome da marca
                <input
                  value={form.nome}
                  onChange={(event) => setForm({ ...form, nome: event.target.value })}
                  required
                />
              </label>
              <label>
                Nome do produto
                <input
                  value={form.nome_produto}
                  onChange={(event) =>
                    setForm({ ...form, nome_produto: event.target.value })
                  }
                  placeholder="CRM Marca X"
                  required
                />
              </label>
              <label className={styles.full}>
                Domínio
                <input
                  value={form.dominio}
                  onChange={(event) =>
                    setForm({ ...form, dominio: event.target.value })
                  }
                  placeholder="crm.marcadocliente.com.br"
                  required
                />
              </label>
              <label>
                URL da logo
                <input
                  value={form.logo_url}
                  onChange={(event) =>
                    setForm({ ...form, logo_url: event.target.value })
                  }
                  placeholder="https://..."
                />
              </label>
              <label>
                URL do favicon
                <input
                  value={form.favicon_url}
                  onChange={(event) =>
                    setForm({ ...form, favicon_url: event.target.value })
                  }
                  placeholder="https://..."
                />
              </label>
              <label>
                Cor principal
                <input
                  type="color"
                  value={form.cor_primaria}
                  onChange={(event) =>
                    setForm({ ...form, cor_primaria: event.target.value })
                  }
                />
              </label>
              <label>
                Licenças contratadas
                <input
                  type="number"
                  min="1"
                  value={form.licencas_contratadas}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      licencas_contratadas: event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label className={styles.full}>
                Plano padrão de recursos
                <select
                  value={form.plano_padrao_id}
                  onChange={(event) =>
                    setForm({ ...form, plano_padrao_id: event.target.value })
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {planos.map((plano) => (
                    <option key={plano.id} value={plano.id}>
                      {plano.nome}
                    </option>
                  ))}
                </select>
              </label>

              {!editandoId ? (
                <>
                  <label>
                    Administrador
                    <input
                      value={form.administrador_nome}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          administrador_nome: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    E-mail do administrador
                    <input
                      type="email"
                      value={form.administrador_email}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          administrador_email: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label className={styles.full}>
                    Telefone do administrador
                    <input
                      value={form.administrador_telefone}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          administrador_telefone: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              ) : (
                <label className={styles.full}>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({ ...form, status: event.target.value })
                    }
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
              )}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setModalAberto(false)}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button className={styles.primary} type="submit" disabled={salvando}>
                {salvando
                  ? "Salvando..."
                  : editandoId
                    ? "Salvar alterações"
                    : "Criar e enviar ativação"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
