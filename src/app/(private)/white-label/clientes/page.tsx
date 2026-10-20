
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Building2,
  ExternalLink,
  KeyRound,
  Minus,
  Plus,
  Power,
  RefreshCw,
  Smartphone,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import styles from "./white-label-clientes.module.css";

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
  nicho_id: string;
  limite_integracoes_whatsapp: number | null;
  limite_total_numeros_whatsapp: number | null;
  limite_usuarios: number | null;
  nichos?: { nome?: string; codigo?: string } | Array<{ nome?: string; codigo?: string }> | null;
};

type WhiteLabel = {
  nome_marca: string;
  nome_produto: string;
  dominio: string | null;
  licencas_contratadas: number;
  licencas_usadas: number;
  licencas_disponiveis: number;
};

export default function WhiteLabelClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [whiteLabel, setWhiteLabel] = useState<WhiteLabel | null>(null);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [acessandoId, setAcessandoId] = useState("");
  const [alterandoCliente, setAlterandoCliente] = useState("");
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
      const [clientesResponse, nichosResponse] = await Promise.all([
        fetch("/api/white-label/clientes", { cache: "no-store" }),
        fetch("/api/nichos", { cache: "no-store" }),
      ]);

      const [clientesJson, nichosJson] = await Promise.all([
        clientesResponse.json(),
        nichosResponse.json(),
      ]);

      if (!clientesResponse.ok) {
        throw new Error(clientesJson.error || "Não foi possível carregar os clientes.");
      }

      setClientes(clientesJson.clientes || []);
      setWhiteLabel(clientesJson.white_label || null);

      if (nichosResponse.ok) setNichos(nichosJson.nichos || []);

      setForm((atual) => ({
        ...atual,
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

  async function alterarCliente(
    clienteId: string,
    payload: Record<string, unknown>,
    chave: string
  ) {
    if (alterandoCliente) return;

    setAlterandoCliente(clienteId + ":" + chave);
    setErro("");
    setSucesso("");
    setWarning("");

    try {
      const response = await fetch("/api/white-label/clientes/" + clienteId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Não foi possível atualizar o cliente.");
      }

      setSucesso(data.message || "Cliente atualizado.");
      setWarning(data.warning || "");
      await carregar();
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o cliente."
      );
    } finally {
      setAlterandoCliente("");
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
                  <th>Segmento</th>
                  <th>Números adicionais</th>
                  <th>Usuários extras</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => {
                  const nicho = Array.isArray(cliente.nichos) ? cliente.nichos[0] : cliente.nichos;
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
                      <td>{nicho?.nome || "—"}</td>
                      <td>
                        <div className={styles.addonControl}>
                          <button
                            type="button"
                            className={styles.addonButton}
                            onClick={() =>
                              void alterarCliente(
                                cliente.id,
                                { acao: "numero_adicional", delta: -1 },
                                "numero-"
                              )
                            }
                            disabled={
                              Math.max(
                                0,
                                Number(cliente.limite_integracoes_whatsapp || 1) - 1
                              ) <= 0 ||
                              alterandoCliente.startsWith(cliente.id + ":")
                            }
                            title="Remover número adicional"
                          >
                            <Minus size={13} />
                          </button>
                          <span className={styles.addonValue}>
                            <Smartphone size={14} />
                            {Math.max(
                              0,
                              Number(cliente.limite_integracoes_whatsapp || 1) - 1
                            )} / 5
                          </span>
                          <button
                            type="button"
                            className={styles.addonButton}
                            onClick={() =>
                              void alterarCliente(
                                cliente.id,
                                { acao: "numero_adicional", delta: 1 },
                                "numero+"
                              )
                            }
                            disabled={
                              Math.max(
                                0,
                                Number(cliente.limite_integracoes_whatsapp || 1) - 1
                              ) >= 5 ||
                              alterandoCliente.startsWith(cliente.id + ":")
                            }
                            title="Adicionar número por R$ 60/mês"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <small className={styles.addonPrice}>R$ 60/mês cada</small>
                      </td>
                      <td>
                        <div className={styles.addonControl}>
                          <button
                            type="button"
                            className={styles.addonButton}
                            onClick={() =>
                              void alterarCliente(
                                cliente.id,
                                { acao: "usuario_adicional", delta: -1 },
                                "usuario-"
                              )
                            }
                            disabled={
                              Math.max(
                                0,
                                Number(cliente.limite_usuarios || 2) - 2
                              ) <= 0 ||
                              alterandoCliente.startsWith(cliente.id + ":")
                            }
                            title="Remover usuário adicional"
                          >
                            <Minus size={13} />
                          </button>
                          <span className={styles.addonValue}>
                            <UserPlus size={14} />
                            {Math.max(
                              0,
                              Number(cliente.limite_usuarios || 2) - 2
                            )}
                          </span>
                          <button
                            type="button"
                            className={styles.addonButton}
                            onClick={() =>
                              void alterarCliente(
                                cliente.id,
                                { acao: "usuario_adicional", delta: 1 },
                                "usuario+"
                              )
                            }
                            disabled={alterandoCliente.startsWith(cliente.id + ":")}
                            title="Adicionar usuário por R$ 20/mês"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <small className={styles.addonPrice}>R$ 20/mês cada</small>
                      </td>
                      <td>
                        <div className={styles.statusActions}>
                          <span
                            className={`${styles.statusBadge} ${
                              cliente.status === "ativa"
                                ? styles.statusActive
                                : styles.statusInactive
                            }`}
                          >
                            {cliente.status === "ativa" ? "Ativo" : "Inativo"}
                          </span>
                          <button
                            type="button"
                            className={styles.statusButton}
                            onClick={() =>
                              void alterarCliente(
                                cliente.id,
                                {
                                  acao: "status",
                                  ativo: cliente.status !== "ativa",
                                },
                                "status"
                              )
                            }
                            disabled={alterandoCliente.startsWith(cliente.id + ":")}
                          >
                            <Power size={13} />
                            {cliente.status === "ativa" ? "Desativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.accessButton}
                          onClick={() => void acessarCliente(cliente.id)}
                          disabled={
                            acessandoId === cliente.id ||
                            cliente.status !== "ativa"
                          }
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
              A empresa será criada no Plano Básico e o responsável receberá
              o e-mail de ativação com a sua marca.
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
