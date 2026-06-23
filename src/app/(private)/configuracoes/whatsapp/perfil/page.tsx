"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import styles from "./whatsapp-perfil.module.css";

type Integracao = {
  id: string;
  nome_conexao: string;
  numero: string;
  status: string;
  phone_number_id: string | null;
  verified_name: string | null;
  phone_number_display_name: string | null;
  display_phone_number?: string | null;
  name_status?: string | null;
  new_name_status?: string | null;
  phone_number_status?: string | null;
  quality_rating?: string | null;
  meta_messaging_limit_tier?: string | null;
  meta_messaging_limit?: number | null;
  meta_account_mode?: string | null;
  meta_saude_ultima_verificacao_em?: string | null;
  onboarding_erro?: string | null;
};

type LimiteMeta = {
  limite: number;
  usados: number;
  restantes: number;
  percentual: number;
  tier: string | null;
  origem: string;
  alerta: "normal" | "amarelo" | "vermelho";
};

type PerfilWhatsapp = {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
};

type DiagnosticoWhatsApp = {
  motivo: string;
  codigoMeta: number | null;
  titulo: string;
  descricao: string;
  detalheTecnico: string | null;
  acaoCliente: string | null;
  acaoInterna: string | null;
  metaManagerUrl: string | null;
  helpWhatsappUrl: string | null;
  bloqueiaOperacao: boolean;
};

const categorias = [
  { value: "", label: "Não informar" },
  { value: "AUTO", label: "Automotivo" },
  { value: "BEAUTY", label: "Beleza" },
  { value: "APPAREL", label: "Roupas e acessórios" },
  { value: "EDU", label: "Educação" },
  { value: "ENTERTAIN", label: "Entretenimento" },
  { value: "FINANCE", label: "Finanças" },
  { value: "HEALTH", label: "Saúde" },
  { value: "PROF_SERVICES", label: "Serviços profissionais" },
  { value: "RETAIL", label: "Varejo" },
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "TRAVEL", label: "Viagem" },
  { value: "OTHER", label: "Outro" },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizarStatus(valor?: string | null) {
  return String(valor || "").trim().toLowerCase();
}

function formatarStatusConexao(status?: string | null) {
  switch (normalizarStatus(status)) {
    case "ativa":
      return "Ativa";
    case "bloqueado":
      return "Bloqueada";
    case "banido":
    case "banned":
      return "Banida";
    case "inativo":
      return "Inativa";
    default:
      return status || "Sem status";
  }
}

function formatarNumero(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "0";
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function formatarPercentual(valor?: number | null) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "0%";
  return `${Math.round(valor * 100)}%`;
}

export default function WhatsappPerfilPage() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [integracaoId, setIntegracaoId] = useState("");
  const [perfil, setPerfil] = useState<PerfilWhatsapp | null>(null);

  const [about, setAbout] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [website1, setWebsite1] = useState("");
  const [website2, setWebsite2] = useState("");
  const [vertical, setVertical] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [previewFoto, setPreviewFoto] = useState("");
  const [cropAberto, setCropAberto] = useState(false);
  const [imagemOriginal, setImagemOriginal] = useState("");
  const [zoom, setZoom] = useState(1);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const [dragInicio, setDragInicio] = useState({ x: 0, y: 0 });
  const [posInicio, setPosInicio] = useState({ x: 0, y: 0 });
  
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [limiteMeta, setLimiteMeta] = useState<LimiteMeta | null>(null);
  const [diagnosticoWhatsapp, setDiagnosticoWhatsapp] =
    useState<DiagnosticoWhatsApp | null>(null);

  const [modalNomeAberto, setModalNomeAberto] = useState(false);
  const [novoNomeExibicao, setNovoNomeExibicao] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const nomePerfil =
    integracaoSelecionada?.phone_number_display_name ||
    integracaoSelecionada?.verified_name ||
    "Empresa";

  const integracaoBloqueada =
    Boolean(diagnosticoWhatsapp?.bloqueiaOperacao) ||
    ["bloqueado", "banido", "blocked", "banned"].includes(
      normalizarStatus(integracaoSelecionada?.status)
    ) ||
    ["banned", "blocked"].includes(
      normalizarStatus(integracaoSelecionada?.phone_number_status)
    );

  async function carregarPerfil(
    id?: string,
    options?: { preservarMensagens?: boolean }
  ) {
    try {
      setCarregando(true);

      if (!options?.preservarMensagens) {
        setErro("");
        setSucesso("");
      }

      const params = new URLSearchParams();

      if (id) params.set("integracao_id", id);

      const res = await fetch(
        `/api/whatsapp/perfil${params.toString() ? `?${params}` : ""}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setDiagnosticoWhatsapp(json.diagnostico || null);
        throw new Error(json.error || "Erro ao carregar perfil.");
      }

      setDiagnosticoWhatsapp(json.diagnostico || null);

      const listaIntegracoes = json.integracoes || [];
      const integracaoAtualizada = json.integracao || null;

      const listaComNomeAtualizado = listaIntegracoes.map((item: Integracao) => {
        if (item.id !== integracaoAtualizada?.id) {
          return item;
        }

        return {
          ...item,
          verified_name: integracaoAtualizada.verified_name,
          phone_number_display_name: integracaoAtualizada.phone_number_display_name,
          display_phone_number: integracaoAtualizada.display_phone_number,
          name_status: integracaoAtualizada.name_status,
          new_name_status: integracaoAtualizada.new_name_status,
          phone_number_status: integracaoAtualizada.phone_number_status,
          quality_rating: integracaoAtualizada.quality_rating,
          meta_messaging_limit_tier: integracaoAtualizada.meta_messaging_limit_tier,
          meta_messaging_limit: integracaoAtualizada.meta_messaging_limit,
          meta_account_mode: integracaoAtualizada.meta_account_mode,
          meta_saude_ultima_verificacao_em:
            integracaoAtualizada.meta_saude_ultima_verificacao_em,
          onboarding_erro: integracaoAtualizada.onboarding_erro,
        };
      });

      setIntegracoes(listaComNomeAtualizado);
      setLimiteMeta(json.limite_meta || null);

      const novaIntegracaoId = integracaoAtualizada?.id || "";

      setIntegracaoId(novaIntegracaoId);

      const novoPerfil = json.perfil || null;
      setPerfil(novoPerfil);

      setAbout(novoPerfil?.about || "");
      setAddress(novoPerfil?.address || "");
      setDescription(novoPerfil?.description || "");
      setEmail(novoPerfil?.email || "");
      setWebsite1(novoPerfil?.websites?.[0] || "");
      setWebsite2(novoPerfil?.websites?.[1] || "");
      setVertical(novoPerfil?.vertical || "");
      setPreviewFoto(novoPerfil?.profile_picture_url || "");
      setFoto(null);
    } catch (error: unknown) {
      setErro(getErrorMessage(error, "Erro ao carregar perfil."));
    } finally {
      setCarregando(false);
    }
  }

  async function salvarPerfil(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const formData = new FormData();

      formData.set("integracao_id", integracaoId);
      formData.set("about", about);
      formData.set("address", address);
      formData.set("description", description);
      formData.set("email", email);
      formData.set("website1", website1);
      formData.set("website2", website2);
      formData.set("vertical", vertical);

      if (foto) formData.set("profile_picture", foto);

      const res = await fetch("/api/whatsapp/perfil", {
        method: "PATCH",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setDiagnosticoWhatsapp(json.diagnostico || null);
        throw new Error(json.error || "Erro ao salvar perfil.");
      }

      setSucesso(json.message || "Perfil do WhatsApp atualizado com sucesso.");
      await carregarPerfil(integracaoId, { preservarMensagens: true });
    } catch (error: unknown) {
      setErro(getErrorMessage(error, "Erro ao salvar perfil."));
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarAlteracaoNome() {
    try {
      setSalvandoNome(true);
      setErro("");
      setSucesso("");

      const res = await fetch("/api/whatsapp/perfil/nome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_id: integracaoId,
          novo_nome: novoNomeExibicao,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setDiagnosticoWhatsapp(json.diagnostico || null);
        throw new Error(json.error || "Erro ao solicitar alteração do nome.");
      }

      setSucesso(
        "Solicitação de alteração do nome enviada ao Meta. A aprovação pode levar algum tempo."
      );

      setModalNomeAberto(false);
      setNovoNomeExibicao("");

      await carregarPerfil(integracaoId);
    } catch (error: unknown) {
      setErro(getErrorMessage(error, "Erro ao solicitar alteração do nome."));
    } finally {
      setSalvandoNome(false);
    }
  }

  useEffect(() => {
    carregarPerfil();
  }, []);

    function handleSelecionarFoto(file: File | null) {
    if (!file) {
        setFoto(null);
        setPreviewFoto(perfil?.profile_picture_url || "");
        return;
    }

    const url = URL.createObjectURL(file);

    setImagemOriginal(url);
    setZoom(1);
    setPosX(0);
    setPosY(0);
    setCropAberto(true);
    }

    async function aplicarCrop() {
    if (!imagemOriginal) return;

    const img = new Image();
    img.src = imagemOriginal;

    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
    });

    const tamanho = 512;
    const canvas = document.createElement("canvas");
    canvas.width = tamanho;
    canvas.height = tamanho;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tamanho, tamanho);

    const baseScale = Math.max(tamanho / img.width, tamanho / img.height);
    const scale = baseScale * zoom;

    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;

    const drawX = (tamanho - drawWidth) / 2 + posX;
    const drawY = (tamanho - drawHeight) / 2 + posY;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    canvas.toBlob(
        (blob) => {
        if (!blob) return;

        const arquivoCortado = new File([blob], "foto-perfil-whatsapp.jpg", {
            type: "image/jpeg",
        });

        const preview = URL.createObjectURL(blob);

        setFoto(arquivoCortado);
        setPreviewFoto(preview);
        setCropAberto(false);
        setImagemOriginal("");
        setZoom(1);
        setPosX(0);
        setPosY(0);
        },
        "image/jpeg",
        0.92
    );
    }

    function cancelarCrop() {
    setCropAberto(false);
    setImagemOriginal("");
    setZoom(1);
    setPosX(0);
    setPosY(0);
    }

    function iniciarArraste(clientX: number, clientY: number) {
    setArrastando(true);
    setDragInicio({ x: clientX, y: clientY });
    setPosInicio({ x: posX, y: posY });
    }

    function moverArraste(clientX: number, clientY: number) {
    if (!arrastando) return;

    const novoX = posInicio.x + (clientX - dragInicio.x);
    const novoY = posInicio.y + (clientY - dragInicio.y);

    setPosX(Math.max(-220, Math.min(220, novoX)));
    setPosY(Math.max(-220, Math.min(220, novoY)));
    }

    function finalizarArraste() {
    setArrastando(false);
    }

  const carregandoPagina = carregando && integracoes.length === 0 && !perfil;

  if (carregandoPagina) {
    return (
      <>
        <Header
          title="Perfil do WhatsApp"
          subtitle="Configure como sua empresa aparece para o cliente no WhatsApp."
        />

        <main className={styles.pageContent}>
          <div className={styles.loadingPage}>
            <div className={styles.loadingCardFull}>
              <div className={styles.loadingSpinner}></div>

              <div>
                <h2>Carregando perfil do WhatsApp</h2>
                <p>
                  Estamos buscando as informações da sua conta no Meta. Aguarde
                  alguns segundos.
                </p>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header
        title="Perfil do WhatsApp"
        subtitle="Configure como sua empresa aparece para o cliente no WhatsApp."
      />

      <main className={styles.pageContent}>
        <section className={styles.whatsappShell}>
          <aside className={styles.chatSidebar}>
            <div className={styles.sidebarTop}>
              <div className={styles.sidebarAvatar}>☘️</div>
              <div>
                <strong>Conexões</strong>
                <span>WhatsApp Oficial</span>
              </div>
            </div>

            <div className={styles.searchBox}>Buscar ou selecionar conexão</div>

            <div className={styles.connectionList}>
              {integracoes.length === 0 ? (
                <div className={styles.emptyConnection}>
                  Nenhuma integração encontrada.
                </div>
              ) : (
                integracoes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      item.id === integracaoId
                        ? styles.connectionActive
                        : styles.connectionItem
                    }
                    onClick={() => carregarPerfil(item.id)}
                  >
                    <div className={styles.connectionAvatar}>
                      {item.nome_conexao?.charAt(0)?.toUpperCase() || "W"}
                    </div>

                    <div className={styles.connectionInfo}>
                      <strong>{item.nome_conexao}</strong>
                      <span>{item.numero}</span>
                    </div>

                    <small>{formatarStatusConexao(item.status)}</small>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <div className={styles.previewHeaderLeft}>
                <div className={styles.smallAvatar}>
                  {previewFoto ? <img src={previewFoto} alt="" /> : "W"}
                </div>

                <div>
                  <strong>{nomePerfil}</strong>
                  <span>{integracaoSelecionada?.numero || "WhatsApp"}</span>
                </div>
              </div>

              <button
                type="button"
                className={styles.refreshButton}
                onClick={() => carregarPerfil(integracaoId)}
                disabled={carregando || !integracaoId}
              >
                Atualizar
              </button>
            </div>

            <div className={styles.previewBody}>
              {carregando ? (
                <div className={styles.loadingCard}>Carregando perfil...</div>
              ) : !integracaoId ? (
                <div className={styles.loadingCard}>
                  Selecione uma integração para editar.
                </div>
              ) : (
                <div className={styles.phoneMockup}>
                  <div className={styles.phoneHeader}>
                    <div className={styles.phoneCover}></div>

                    <div className={styles.profilePhotoWrap}>
                      {previewFoto ? (
                        <img
                          src={previewFoto}
                          alt="Foto do perfil"
                          className={styles.profilePhoto}
                        />
                      ) : (
                        <div className={styles.profilePhotoPlaceholder}>
                          {nomePerfil.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <h2>{nomePerfil}</h2>
                    <p>{integracaoSelecionada?.numero}</p>
                  </div>

                  <div className={styles.profileActions}>
                    <div>
                      <span>💬</span>
                      Mensagem
                    </div>
                    <div>
                      <span>📞</span>
                      Ligar
                    </div>
                    <div>
                      <span>🔎</span>
                      Buscar
                    </div>
                  </div>

                  <div className={styles.profileSection}>
                    <span>Sobre</span>
                    <strong>{about || "Adicione uma frase curta sobre sua empresa."}</strong>
                  </div>

                  <div className={styles.profileSection}>
                    <span>Descrição</span>
                    <p>
                      {description ||
                        "Explique rapidamente o que sua empresa faz."}
                    </p>
                  </div>

                  <div className={styles.profileSection}>
                    <span>Informações comerciais</span>
                    <p>{address || "Endereço não informado"}</p>
                    <p>{email || "E-mail não informado"}</p>
                    <p>{website1 || "Site não informado"}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className={styles.editorPanel}>
            <div className={styles.editorTop}>
              <div>
                <p className={styles.eyebrow}>Editar perfil</p>
                <h1>Perfil Whatsapp Business</h1>
              </div>
            </div>

            {(erro || sucesso) && (
              <div className={styles.alertArea}>
                {erro && <div className={styles.errorAlert}>{erro}</div>}
              </div>
            )}

            {diagnosticoWhatsapp && (
              <div className={styles.diagnosticAlert}>
                <div className={styles.diagnosticHeader}>
                  <span>Meta</span>
                  <strong>{diagnosticoWhatsapp.titulo}</strong>
                </div>

                <p>{diagnosticoWhatsapp.descricao}</p>

                {diagnosticoWhatsapp.acaoCliente && (
                  <p>
                    <strong>O que fazer agora:</strong>{" "}
                    {diagnosticoWhatsapp.acaoCliente}
                  </p>
                )}

                {diagnosticoWhatsapp.acaoInterna && (
                  <p>
                    <strong>No CRM:</strong> {diagnosticoWhatsapp.acaoInterna}
                  </p>
                )}

                <div className={styles.diagnosticActions}>
                  {diagnosticoWhatsapp.metaManagerUrl && (
                    <a
                      href={diagnosticoWhatsapp.metaManagerUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Acessar Gerenciador do WhatsApp
                    </a>
                  )}

                  {diagnosticoWhatsapp.helpWhatsappUrl && (
                    <a
                      href={diagnosticoWhatsapp.helpWhatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pedir ajuda pelo WhatsApp
                    </a>
                  )}
                </div>

                <div className={styles.diagnosticMeta}>
                  <span>
                    Codigo Meta: {diagnosticoWhatsapp.codigoMeta || "n/a"}
                  </span>
                  {diagnosticoWhatsapp.detalheTecnico && (
                    <span>{diagnosticoWhatsapp.detalheTecnico}</span>
                  )}
                </div>
              </div>
            )}

            <FeedbackToast
              success={sucesso}
              onSuccessDismiss={() => setSucesso("")}
            />

            <form
              id="form-whatsapp-perfil"
              className={styles.formArea}
              onSubmit={salvarPerfil}
            >

            <div className={styles.profileHero}>
              {integracoes.length > 1 && (
                <div className={styles.integracaoSwitcher}>
                  <select
                    className={styles.integracaoSelect}
                    value={integracaoId}
                    onChange={(e) => carregarPerfil(e.target.value)}
                    disabled={carregando}
                  >
                    {integracoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.phone_number_display_name ||
                          item.verified_name ||
                          item.nome_conexao}{" "}
                        • {item.numero}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            <label className={styles.photoUpload}>
                <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={integracaoBloqueada}
                onChange={(e) => handleSelecionarFoto(e.target.files?.[0] || null)}
                />

                <div className={styles.photoUploadPreview}>
                {previewFoto ? <img src={previewFoto} alt="" /> : "📷"}
                </div>

                <strong>Alterar foto</strong>
                <div className={styles.numeroIntegracao}>
                  {integracaoSelecionada?.display_phone_number ||
                    integracaoSelecionada?.numero ||
                    "Número não identificado"}
                </div>
            </label>
            </div>


            {limiteMeta && (
              <div
                className={`${styles.limitCard} ${
                  limiteMeta.alerta === "vermelho"
                    ? styles.limitCardDanger
                    : limiteMeta.alerta === "amarelo"
                    ? styles.limitCardWarning
                    : ""
                }`}
              >
                <div className={styles.limitHeader}>
                  <div>
                    <span>Saude Meta</span>
                    <strong>Limite de conversas iniciadas em 24h</strong>
                  </div>
                  <strong>{formatarPercentual(limiteMeta.percentual)}</strong>
                </div>

                <div className={styles.limitGrid}>
                  <div>
                    <span>Limite atual</span>
                    <strong>{formatarNumero(limiteMeta.limite)}</strong>
                  </div>
                  <div>
                    <span>Usadas/reservadas</span>
                    <strong>{formatarNumero(limiteMeta.usados)}</strong>
                  </div>
                  <div>
                    <span>Restantes</span>
                    <strong>{formatarNumero(limiteMeta.restantes)}</strong>
                  </div>
                </div>

                <div className={styles.limitMeta}>
                  <span>Tier: {limiteMeta.tier || "Nao informado"}</span>
                  <span>
                    Qualidade: {integracaoSelecionada?.quality_rating || "Nao informada"}
                  </span>
                  <span>
                    Modo: {integracaoSelecionada?.meta_account_mode || "Nao informado"}
                  </span>
                </div>
              </div>
            )}

            <div className={styles.formGrid}>
            <label className={styles.fieldLabelFull}>
              Nome de exibição
              <div className={styles.nameRow}>
                <input
                  className={styles.input}
                  value={nomePerfil}
                  readOnly
                  title="O nome de exibição do WhatsApp passa por revisão do Meta."
                />

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setNovoNomeExibicao(nomePerfil === "Empresa" ? "" : nomePerfil);
                    setModalNomeAberto(true);
                  }}
                  disabled={!integracaoId || integracaoBloqueada}
                >
                  Alterar nome
                </button>
              </div>
            </label>

            <label className={styles.fieldLabel}>
              Sobre
              <input
                className={styles.input}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={139}
                disabled={integracaoBloqueada}
                placeholder="Ex: Atendimento oficial da empresa"
              />
            </label>

            <label className={styles.fieldLabel}>
                Categoria
                <select
                className={styles.input}
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                disabled={integracaoBloqueada}
                >
                {categorias.map((item) => (
                    <option key={item.value} value={item.value}>
                    {item.label}
                    </option>
                ))}
                </select>
            </label>

            <label className={styles.fieldLabelFull}>
                Descrição
                <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={256}
                disabled={integracaoBloqueada}
                placeholder="Descreva sua empresa."
                />
            </label>

            <label className={styles.fieldLabelFull}>
                Endereço
                <input
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={integracaoBloqueada}
                placeholder="Insira o edenreço comercial"
                />
            </label>

            <label className={styles.fieldLabel}>
                E-mail
                <input
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={integracaoBloqueada}
                placeholder="Insira o email comercial"
                />
            </label>

            <label className={styles.fieldLabel}>
                Site principal
                <input
                className={styles.input}
                value={website1}
                onChange={(e) => setWebsite1(e.target.value)}
                disabled={integracaoBloqueada}
                placeholder="https://seudominio.com"
                />
            </label>

            <label className={styles.fieldLabel}>
                Site secundário
                <input
                className={styles.input}
                value={website2}
                onChange={(e) => setWebsite2(e.target.value)}
                disabled={integracaoBloqueada}
                placeholder="https://instagram.com/suaempresa"
                />
            </label>
            </div>

            <div className={styles.noticeBox}>
            O nome oficial do WhatsApp Business normalmente passa por revisão do Meta e não
            pode ser alterado diretamente nesta tela.
            </div>

            <div className={styles.saveArea}>
            <button
                type="submit"
                className={styles.saveButton}
                disabled={salvando || carregando || !integracaoId || integracaoBloqueada}
            >
                {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
            </div>
            </form>
          </aside>
        </section>
      </main>

    {cropAberto && (
    <div className={styles.modalOverlay} onClick={cancelarCrop}>
        <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
            <div>
            <h2 className={styles.modalTitle}>Ajustar foto</h2>
            <p className={styles.modalSubtitle}>
                Centralize a imagem e ajuste o zoom antes de salvar.
            </p>
            </div>

            <button
            type="button"
            className={styles.closeButton}
            onClick={cancelarCrop}
            >
            Fechar
            </button>
        </div>

        <div className={styles.cropBody}>
            <div
            className={styles.cropPreview}
            onMouseDown={(e) => iniciarArraste(e.clientX, e.clientY)}
            onMouseMove={(e) => moverArraste(e.clientX, e.clientY)}
            onMouseUp={finalizarArraste}
            onMouseLeave={finalizarArraste}
            onTouchStart={(e) => {
                const toque = e.touches[0];
                iniciarArraste(toque.clientX, toque.clientY);
            }}
            onTouchMove={(e) => {
                const toque = e.touches[0];
                moverArraste(toque.clientX, toque.clientY);
            }}
            onTouchEnd={finalizarArraste}
            >
            {imagemOriginal && (
                <img
                src={imagemOriginal}
                alt="Imagem para cortar"
                draggable={false}
                style={{
                    transform: `translate(${posX}px, ${posY}px) scale(${zoom})`,
                    cursor: arrastando ? "grabbing" : "grab",
                }}
                />
            )}
            </div>

            <label className={styles.fieldLabel}>
            Zoom
            <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
            />
            </label>
        </div>

        <div className={styles.modalActions}>
            <button
            type="button"
            className={styles.ghostButton}
            onClick={cancelarCrop}
            >
            Cancelar
            </button>

            <button
            type="button"
            className={styles.primaryButton}
            onClick={aplicarCrop}
            >
            Confirmar corte
            </button>
        </div>
        </div>
    </div>
    )}

    {modalNomeAberto && (
      <div
        className={styles.modalOverlay}
        onClick={() => setModalNomeAberto(false)}
      >
        <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div>
              <h2 className={styles.modalTitle}>Alterar nome de exibição</h2>
              <p className={styles.modalSubtitle}>
                Esse nome pode passar por revisão do Meta antes de aparecer para os
                clientes.
              </p>
            </div>

            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setModalNomeAberto(false)}
            >
              Fechar
            </button>
          </div>

          <div className={styles.modalBody}>
            <label className={styles.fieldLabel}>
              Novo nome
              <input
                className={styles.input}
                value={novoNomeExibicao}
                onChange={(e) => setNovoNomeExibicao(e.target.value)}
                placeholder="Ex: Leandro Buygain"
                maxLength={150}
              />
            </label>

            <div className={styles.noticeBox}>
              Use um nome que represente claramente sua empresa. Evite emojis,
              slogans, termos como “Oficial” ou “Verificado” e nomes genéricos.
              Após aprovação, pode ser necessário registrar novamente o número.
            </div>
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setModalNomeAberto(false)}
              disabled={salvandoNome}
            >
              Cancelar
            </button>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={solicitarAlteracaoNome}
              disabled={
                salvandoNome ||
                integracaoBloqueada ||
                novoNomeExibicao.trim().length < 3
              }
            >
              {salvandoNome ? "Enviando..." : "Solicitar alteração"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
