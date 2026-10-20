
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import styles from "./white-label-clientes.module.css";

type Plano = {
  id: string;
  nome: string;
  slug: string;
};

type Nicho = {
  id: string;
  nome: string;
  codigo: string;
};

type Cliente = {
  id: string;
  nome_fantasia: string;
  razao_social: string | null;
  email: string;
  telefone: string | null;
  nome_responsavel: string | null;
  status: string;
  created_at: string;
  plano_id: string;
  nicho_id: string;
  planos?: { nome?: string; slug?: string } | Array<{ nome?: string; slug?: string }> | null;
  nichos?: { nome?: string; codigo?: string } | Array<{ nome?: string; codigo?: string }> | null;
};

type WhiteLabel = {
  nome_marca: string;
  nome_produto: string;
  dominio: string | null;
  licencas_contratadas: number;
  licencas_usadas: number;
  licencas_disponiveis: number;
  plano_padrao_id: string | null;
};

function valorRelacao<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] || null;
  return valor || null;
}

export default function WhiteLabelClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [whiteLabel, setWhiteLabel] = useState<WhiteLabel | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [acessandoId, setAcessandoId] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [warning, setWarning] = useState("");
  const [form, setForm] = useState({
    nome_fantasia: "",
    razao_social: "",
    nome_responsavel: "",
    email: "",
    telefone: "",
    plano_id: "",
    nicho_id: "",
  });

  const limiteAtingido =
    Boolean(whiteLabel) && (whiteLabel?.licencas_disponiveis ?? 0) <= 0;

  const percentualUso = useMemo(() => {
    if (!whiteLabel?.licencas_contratadas) return 0;
    return Math.min(
      100,
      Math.round(
        (whiteLabel.licencas_usadas / whiteLabel.licencas_contratadas) * 100
      )
    );
  }, [whiteLabel]);

  async function carregar() {
    setCarregando(true);
    setErro("");

    try {
      const [clientesResponse, planosResponse, nichosResponse] =
        await Promise.all([
          fetch("/api/white-label/clientes", { cache: "no-store" }),
          fetch("/api/white-label/planos", { cache: "no-store" }),
          fetch("/api/nichos", { cache: "no-store" }),
        ]);

      const [clientesJson, planosJson, nichosJson] = await Promise.all([
        clientesResponse.json(),
        planosResponse.json(),
        nichosResponse.json(),
      ]);

      if (!clientesResponse.ok) {
        throw new Error(clientesJson.error || "Não foi possível carregar os clientes.");
      }

      setClientes(clientesJson.clientes || []);
      setWhiteLabel(clientesJson.white_label || null);

      if (planosResponse.ok) setPlanos(planosJson.planos || []);
      if (nichosResponse.ok) setNichos(nichosJson.nichos || []);

      setForm((atual) => ({
        ...atual,
        plano_id:
          atual.plano_id ||
          clientesJson.white_label?.plano_padrao_id ||
          planosJson.planos?.[0]?.id ||
          "",
        nicho_id: atual.nicho_id || nichosJson.nichos?.[0]?.id || "",
      }));
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o White Label."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function cadastrarCliente(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErro("");
    setSucesso("");
    setWarning("");

    try {
      const response = await fetch("/api/white-label/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível cadastrar o cliente.");
      }

      setSucesso(data.message || "Cliente cadastrado com sucesso.");
      setWarning(data.warning || "");
      setModalAberto(false);
      setForm((atual) => ({
        ...atual,
        nome_fantasia: "",
        razao_social: "",
        nome_responsavel: "",
        email: "",
        telefone: "",
      }));
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar o cliente."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function acessarCliente(empresaId: string) {
    setAcessandoId(empresaId);
    setErro("");

    try {
      const response = await fetch("/api/empresas/acesso-temporario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível acessar o cliente.");
      }

      window.location.href = data.redirect || "/painel/ao-vivo";
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível acessar o cliente."
      );
      setAcessandoId("");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Administração White Label</span>
          <h1>Clientes {whiteLabel?.nome_marca || ""}</h1>
          <p>
            Cadastre seus clientes, acompanhe as licenças e envie o acesso
            inicial automaticamente.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void carregar()}
            disabled={carregando}
          >
            <RefreshCw size={17} />
            Atualizar
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setModalAberto(true)}
            disabled={limiteAtingido}
            title={
              limiteAtingido
                ? "Todas as licenças contratadas estão em uso."
                : undefined
            }
          >
            <Plus size={18} />
            Cadastrar cliente
          </button>
        </div>
      </section>

      {erro ? <div className={styles.error}>{erro}</div> : null}
      {sucesso ? <div className={styles.success}>{sucesso}</div> : null}
      {warning ? <div className={styles.warning}>{warning}</div> : null}

      <section className={styles.statsGrid}>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><KeyRound size={19} /></span>
          <div>
            <span>Licenças contratadas</span>
            <strong>{whiteLabel?.licencas_contratadas ?? "—"}</strong>
          </div>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><Users size={19} /></span>
          <div>
            <span>Em uso</span>
            <strong>{whiteLabel?.licencas_usadas ?? "—"}</strong>
          </div>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><Plus size={19} /></span>
          <div>
            <span>Disponíveis</span>
            <strong>{whiteLabel?.licencas_disponiveis ?? "—"}</strong>
          </div>
        </article>
      </section>

      <section className={styles.licensePanel}>
        <div>
          <strong>Uso das licenças</strong>
          <span>{percentualUso}% utilizado</span>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: percentualUso + "%" }}
          />
        </div>
        {limiteAtingido ? (
          <p>
            Todas as licenças estão em uso. Solicite novas licenças à
            Prosperity antes de cadastrar outro cliente.
          </p>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Empresas cadastradas</h2>
            <p>
              {whiteLabel?.dominio
                ? "Acesso dos clientes: " + whiteLabel.dominio
                : "Domínio White Label não configurado."}
            </p>
          </div>
          <span className={styles.countBadge}>{clientes.length} clientes</span>
        </div>

        {carregando ? (
          <div className={styles.emptyState}>Carregando clientes...</div>
        ) : clientes.length === 0 ? (
          <div className={styles.emptyState}>
            <Building2 size={34} />
            <strong>Nenhum cliente cadastrado</strong>
            <span>Use “Cadastrar cliente” para consumir a primeira licença.</span>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Responsável</th>
                  <th>Plano</th>
                  <th>Segmento</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => {
                  const plano = valorRelacao(cliente.planos);
                  const nicho = valorRelacao(cliente.nichos);
                  return (
                    <tr key={cliente.id}>
                      <td>
                        <strong>{cliente.nome_fantasia}</strong>
                        <span>{cliente.email}</span>
                      </td>
                      <td>
                        <strong>{cliente.nome_responsavel || "—"}</strong>
                        <span>{cliente.telefone || "Sem telefone"}</span>
                      </td>
                      <td>{plano?.nome || "—"}</td>
                      <td>{nicho?.nome || "—"}</td>
                      <td>
                        <span className={styles.statusBadge}>
                          {cliente.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.accessButton}
                          onClick={() => void acessarCliente(cliente.id)}
                          disabled={acessandoId === cliente.id}
                        >
                          <ExternalLink size={15} />
                          {acessandoId === cliente.id
                            ? "Abrindo..."
                            : "Acessar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAberto ? (
        <div className={styles.overlay}>
          <form className={styles.modal} onSubmit={cadastrarCliente}>
            <button
              type="button"
              className={styles.close}
              onClick={() => setModalAberto(false)}
              disabled={salvando}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <span className={styles.eyebrow}>Nova licença</span>
            <h2>Cadastrar cliente</h2>
            <p>
              A empresa será criada e o responsável receberá o e-mail de
              ativação com a sua marca.
            </p>

            <div className={styles.formGrid}>
              <label>
                Nome da empresa
                <input
                  value={form.nome_fantasia}
                  onChange={(event) =>
                    setForm({ ...form, nome_fantasia: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Razão social
                <input
                  value={form.razao_social}
                  onChange={(event) =>
                    setForm({ ...form, razao_social: event.target.value })
                  }
                />
              </label>
              <label>
                Responsável
                <input
                  value={form.nome_responsavel}
                  onChange={(event) =>
                    setForm({ ...form, nome_responsavel: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                E-mail de acesso
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Telefone
                <input
                  value={form.telefone}
                  onChange={(event) =>
                    setForm({ ...form, telefone: event.target.value })
                  }
                />
              </label>
              <label>
                Plano de recursos
                <select
                  value={form.plano_id}
                  onChange={(event) =>
                    setForm({ ...form, plano_id: event.target.value })
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
              <label className={styles.fullField}>
                Segmento
                <select
                  value={form.nicho_id}
                  onChange={(event) =>
                    setForm({ ...form, nicho_id: event.target.value })
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {nichos.map((nicho) => (
                    <option key={nicho.id} value={nicho.id}>
                      {nicho.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setModalAberto(false)}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={salvando}
              >
                {salvando ? "Cadastrando..." : "Cadastrar e enviar acesso"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
