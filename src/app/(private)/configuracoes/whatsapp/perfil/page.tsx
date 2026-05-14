"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const nomePerfil =
    integracaoSelecionada?.verified_name ||
    integracaoSelecionada?.phone_number_display_name ||
    integracaoSelecionada?.nome_conexao ||
    "Empresa";

  async function carregarPerfil(id?: string) {
    try {
      setCarregando(true);
      setErro("");
      setSucesso("");

      const params = new URLSearchParams();

      if (id) params.set("integracao_id", id);

      const res = await fetch(
        `/api/whatsapp/perfil${params.toString() ? `?${params}` : ""}`,
        { cache: "no-store" }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar perfil.");
      }

      setIntegracoes(json.integracoes || []);

      const novaIntegracaoId = json.integracao?.id || "";
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
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar perfil.");
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
        throw new Error(json.error || "Erro ao salvar perfil.");
      }

      setSucesso("Perfil do WhatsApp atualizado com sucesso.");
      await carregarPerfil(integracaoId);
    } catch (error: any) {
      setErro(error?.message || "Erro ao salvar perfil.");
    } finally {
      setSalvando(false);
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

                    <small>{item.status}</small>
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
                <h1>Informações públicas</h1>
                <span>Altere os dados e veja a prévia ao lado.</span>
              </div>
            </div>

            {(erro || sucesso) && (
              <div className={styles.alertArea}>
                {erro && <div className={styles.errorAlert}>{erro}</div>}
                {sucesso && <div className={styles.successAlert}>{sucesso}</div>}
              </div>
            )}

            <form
              id="form-whatsapp-perfil"
              className={styles.formArea}
              onSubmit={salvarPerfil}
            >
            <div className={styles.profileHero}>
            <label className={styles.photoUpload}>
                <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => handleSelecionarFoto(e.target.files?.[0] || null)}
                />

                <div className={styles.photoUploadPreview}>
                {previewFoto ? <img src={previewFoto} alt="" /> : "📷"}
                </div>

                <strong>Alterar foto</strong>
            </label>
            </div>

            <div className={styles.formGrid}>
            <label className={styles.fieldLabelFull}>
            Nome de exibição
            <input
                className={styles.input}
                value={nomePerfil}
                readOnly
                title="O nome de exibição do WhatsApp passa por revisão do Meta."
            />
            </label>
            <label className={styles.fieldLabel}>
                Sobre
                <input
                className={styles.input}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={139}
                placeholder="Ex: Atendimento oficial da empresa"
                />
            </label>

            <label className={styles.fieldLabel}>
                Categoria
                <select
                className={styles.input}
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
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
                placeholder="Descreva sua empresa."
                />
            </label>

            <label className={styles.fieldLabelFull}>
                Endereço
                <input
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Contagem - MG"
                />
            </label>

            <label className={styles.fieldLabel}>
                E-mail
                <input
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@empresa.com"
                />
            </label>

            <label className={styles.fieldLabel}>
                Site principal
                <input
                className={styles.input}
                value={website1}
                onChange={(e) => setWebsite1(e.target.value)}
                placeholder="https://seudominio.com"
                />
            </label>

            <label className={styles.fieldLabel}>
                Site secundário
                <input
                className={styles.input}
                value={website2}
                onChange={(e) => setWebsite2(e.target.value)}
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
                disabled={salvando || carregando || !integracaoId}
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
    </>
  );
}