
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Building2,
  DollarSign,
  Globe2,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import styles from "./white-labels.module.css";
import { gerarPaletaWhiteLabel } from "@/lib/white-label/theme";

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
  valor_mensal_centavos: number;
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
  cor_primaria: "#0f509a",
  licencas_contratadas: "5",
  valor_mensal: "0.00",
  administrador_nome: "",
  administrador_email: "",
  administrador_telefone: "",
  status: "ativo",
};

export default function WhiteLabelsPage() {
  const [itens, setItens] = useState<WhiteLabel[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [warning, setWarning] = useState("");
  const [form, setForm] = useState(FORM_INICIAL);
  const [logoArquivo, setLogoArquivo] = useState<File | null>(null);
  const [faviconArquivo, setFaviconArquivo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [faviconPreview, setFaviconPreview] = useState("");
  const paletaPreview = useMemo(
    () => gerarPaletaWhiteLabel(form.cor_primaria),
    [form.cor_primaria]
  );

  async function carregar() {
    setCarregando(true);
    setErro("");

    try {
      const whiteLabelsResponse = await fetch("/api/white-labels", {
        cache: "no-store",
      });
      const whiteLabelsJson = await whiteLabelsResponse.json();

      if (!whiteLabelsResponse.ok) {
        throw new Error(
          whiteLabelsJson.error || "Não foi possível carregar os White Labels."
        );
      }

      setItens(whiteLabelsJson.white_labels || []);
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
    setLogoArquivo(null);
    setFaviconArquivo(null);
    setLogoPreview("");
    setFaviconPreview("");
    setForm(FORM_INICIAL);
    setModalAberto(true);
  }

  function abrirEdicao(item: WhiteLabel) {
    setEditandoId(item.id);
    setErro("");
    setWarning("");
    setLogoArquivo(null);
    setFaviconArquivo(null);
    setLogoPreview(item.logo_url || "");
    setFaviconPreview(item.favicon_url || "");
    setForm({
      nome: item.nome,
      nome_produto: item.nome_produto,
      dominio: item.dominio,
      cor_primaria: item.cor_primaria || "#0f509a",
      licencas_contratadas: String(item.licencas_contratadas),
      valor_mensal: (item.valor_mensal_centavos / 100).toFixed(2),
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
      const valorMensal = Number(form.valor_mensal.replace(",", "."));

      if (!Number.isFinite(valorMensal) || valorMensal < 0) {
        throw new Error("Informe um valor mensal válido.");
      }

      const payload = new FormData();

      Object.entries(form).forEach(([chave, valor]) => {
        payload.append(chave, String(valor));
      });

      payload.set(
        "licencas_contratadas",
        String(Number(form.licencas_contratadas))
      );
      payload.set(
        "valor_mensal_centavos",
        String(Math.round(valorMensal * 100))
      );

      if (logoArquivo) payload.append("logo", logoArquivo);
      if (faviconArquivo) payload.append("favicon", faviconArquivo);

      const response = await fetch(
        editandoId ? "/api/white-labels/" + editandoId : "/api/white-labels",
        {
          method: editandoId ? "PATCH" : "POST",
          body: payload,
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
  const receitaMensalCentavos = itens.reduce(
    (total, item) =>
      item.status === "ativo" ? total + item.valor_mensal_centavos : total,
    0
  );

  function formatarMoedaCentavos(valor: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor / 100);
  }

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
        <article>
          <DollarSign size={20} />
          <div>
            <span>Mensalidades White Label</span>
            <strong>{formatarMoedaCentavos(receitaMensalCentavos)}</strong>
          </div>
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

                <div className={styles.financialLine}>
                  <span>Valor mensal do White Label</span>
                  <strong>{formatarMoedaCentavos(item.valor_mensal_centavos)}</strong>
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
              <div className={styles.uploadField}>
                <span className={styles.uploadLabel}>Logo</span>
                <label className={styles.uploadBox}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      const arquivo = event.target.files?.[0] || null;
                      setLogoArquivo(arquivo);
                      setLogoPreview(
                        arquivo ? URL.createObjectURL(arquivo) : logoPreview
                      );
                    }}
                  />
                  <span className={styles.uploadPreviewLogo}>
                    {logoPreview ? (
                      <img src={logoPreview} alt="Prévia da logo" />
                    ) : (
                      <Upload size={22} />
                    )}
                  </span>
                  <span className={styles.uploadText}>
                    <strong>{logoArquivo ? logoArquivo.name : "Selecionar logo"}</strong>
                    <small>PNG, JPG ou WEBP · até 3 MB</small>
                  </span>
                </label>
              </div>
              <div className={styles.uploadField}>
                <span className={styles.uploadLabel}>Favicon</span>
                <label className={styles.uploadBox}>
                  <input
                    type="file"
                    accept="image/png,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
                    onChange={(event) => {
                      const arquivo = event.target.files?.[0] || null;
                      setFaviconArquivo(arquivo);
                      setFaviconPreview(
                        arquivo ? URL.createObjectURL(arquivo) : faviconPreview
                      );
                    }}
                  />
                  <span className={styles.uploadPreviewFavicon}>
                    {faviconPreview ? (
                      <img src={faviconPreview} alt="Prévia do favicon" />
                    ) : (
                      <Upload size={20} />
                    )}
                  </span>
                  <span className={styles.uploadText}>
                    <strong>
                      {faviconArquivo ? faviconArquivo.name : "Selecionar favicon"}
                    </strong>
                    <small>PNG, WEBP ou ICO · até 512 KB</small>
                  </span>
                </label>
              </div>
              <div className={styles.colorField}>
                <span className={styles.colorLabel}>Cor principal do sistema</span>
                <div className={styles.colorControl}>
                  <input
                    type="color"
                    value={form.cor_primaria}
                    onChange={(event) =>
                      setForm({ ...form, cor_primaria: event.target.value })
                    }
                    aria-label="Cor principal do White Label"
                  />
                  <code>{form.cor_primaria.toUpperCase()}</code>
                </div>
                <div className={styles.colorPreview} aria-label="Prévia dos tons gerados">
                  <span
                    title="Tom forte"
                    style={{ background: paletaPreview.light["--crm-primary-strong"] }}
                  />
                  <span
                    title="Tom principal"
                    style={{ background: paletaPreview.light["--crm-primary"] }}
                  />
                  <span
                    title="Tom hover"
                    style={{ background: paletaPreview.light["--crm-primary-hover"] }}
                  />
                  <span
                    title="Tom suave"
                    style={{ background: paletaPreview.light["--crm-primary-soft"] }}
                  />
                </div>
                <small className={styles.colorHelp}>
                  O sistema gera automaticamente os tons de hover, seleção,
                  borda, foco e dark mode para todos os módulos.
                </small>
              </div>
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
              <label>
                Valor mensal do White Label (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor_mensal}
                  onChange={(event) =>
                    setForm({ ...form, valor_mensal: event.target.value })
                  }
                  placeholder="500.00"
                  required
                />
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
