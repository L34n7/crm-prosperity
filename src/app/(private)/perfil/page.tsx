"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { createClient } from "@/lib/supabase/client";
import styles from "./perfil.module.css";
import Header from "@/components/Header";

type PerfilItem = {
  id: string;
  nome: string;
};

type SetorItem = {
  id: string;
  nome: string;
};

type EmpresaItem = {
  id: string;
  nome: string | null;
};

type UsuarioPerfil = {
  id: string;
  auth_user_id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  avatar_url: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  rg?: string | null;
  rg_uf?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  nivel?: string | null;
  status: string;
};

type PerfilResponse = {
  ok: boolean;
  data?: {
    usuario: UsuarioPerfil;
    empresa: EmpresaItem | null;
    perfis: PerfilItem[];
    setores: SetorItem[];
  };
  error?: string;
};

const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const TAMANHO_MAXIMO_MB = 4;
const TAMANHO_MAXIMO_BYTES = TAMANHO_MAXIMO_MB * 1024 * 1024;

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

function formatarCPF(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);

  return numeros
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function validarCPF(cpf: string) {
  const cleaned = cpf.replace(/\D/g, "");

  if (cleaned.length !== 11) return false;
  if (/^(\d)\1+$/.test(cleaned)) return false;

  let soma = 0;
  let resto = 0;

  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cleaned.substring(i - 1, i), 10) * (11 - i);
  }

  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cleaned.substring(9, 10), 10)) return false;

  soma = 0;

  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cleaned.substring(i - 1, i), 10) * (12 - i);
  }

  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;

  return resto === parseInt(cleaned.substring(10, 11), 10);
}

function formatarRG(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 9);

  if (numeros.length <= 2) return numeros;
  if (numeros.length <= 5) return `${numeros.slice(0, 2)}.${numeros.slice(2)}`;
  if (numeros.length <= 8) {
    return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5)}`;
  }

  return `${numeros.slice(0, 2)}.${numeros.slice(2, 5)}.${numeros.slice(5, 8)}-${numeros.slice(8)}`;
}

function extrairCaminhoStorage(url: string | null | undefined) {
  if (!url) return null;

  const marcador = "/storage/v1/object/public/avatars/";
  const indice = url.indexOf(marcador);

  if (indice === -1) return null;

  return decodeURIComponent(url.slice(indice + marcador.length));
}

function criarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = url;
  });
}

async function gerarImagemCortada(
  imageSrc: string,
  pixelCrop: Area
): Promise<File> {
  const image = await criarImagem(imageSrc);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Não foi possível processar a imagem.");
  }

  const tamanhoFinal = 600;
  canvas.width = tamanhoFinal;
  canvas.height = tamanhoFinal;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    tamanhoFinal,
    tamanhoFinal
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (resultado) => {
        if (!resultado) {
          reject(new Error("Falha ao gerar imagem cortada."));
          return;
        }
        resolve(resultado);
      },
      "image/jpeg",
      0.82
    );
  });

  return new File([blob], `avatar-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export default function PerfilPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviandoSenha, setEnviandoSenha] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removendoAvatar, setRemovendoAvatar] = useState(false);

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [usuario, setUsuario] = useState<UsuarioPerfil | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaItem | null>(null);
  const [perfis, setPerfis] = useState<PerfilItem[]>([]);
  const [setores, setSetores] = useState<SetorItem[]>([]);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    data_nascimento: "",
    cpf: "",
    rg: "",
    rg_uf: "",
    cidade: "",
    estado: "",
    avatar_url: "",
  });

  const [previewAvatar, setPreviewAvatar] = useState("");

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imagemOriginalParaCrop, setImagemOriginalParaCrop] = useState("");
  const [arquivoOriginalParaCrop, setArquivoOriginalParaCrop] = useState<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    async function carregarPerfil() {
      try {
        setLoading(true);
        setErro("");
        setMensagem("");

        const resposta = await fetch("/api/me/perfil", {
          method: "GET",
          cache: "no-store",
        });

        const json: PerfilResponse = await resposta.json();

        if (!resposta.ok || !json.ok || !json.data) {
          throw new Error(json.error || "Não foi possível carregar o perfil.");
        }

        const { usuario, empresa, perfis, setores } = json.data;

        setUsuario(usuario);
        setEmpresa(empresa);
        setPerfis(perfis);
        setSetores(setores);

        setForm({
          nome: usuario.nome ?? "",
          email: usuario.email ?? "",
          data_nascimento: usuario.data_nascimento ?? "",
          cpf: usuario.cpf ?? "",
          rg: usuario.rg ?? "",
          rg_uf: usuario.rg_uf ?? "",
          cidade: usuario.cidade ?? "",
          estado: usuario.estado ?? "",
          avatar_url: usuario.avatar_url ?? "",
        });

        setPreviewAvatar(usuario.avatar_url ?? "");
      } catch (error) {
        setErro(
          error instanceof Error ? error.message : "Erro ao carregar perfil."
        );
      } finally {
        setLoading(false);
      }
    }

    carregarPerfil();
  }, []);

  function atualizarCampo(campo: keyof typeof form, valor: string) {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  }

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  function fecharCropModal() {
    if (imagemOriginalParaCrop.startsWith("blob:")) {
      URL.revokeObjectURL(imagemOriginalParaCrop);
    }

    setCropModalOpen(false);
    setImagemOriginalParaCrop("");
    setArquivoOriginalParaCrop(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }

  async function salvarPerfil() {
    if (!usuario) return;

    if (form.cpf && !validarCPF(form.cpf)) {
      setErro("CPF inválido.");
      return;
    }

    if (form.rg && !form.rg_uf) {
      setErro("Selecione a UF do RG.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      const payload = {
        nome: form.nome.trim(),
        data_nascimento: form.data_nascimento || null,
        cpf: form.cpf.trim() || null,
        rg: form.rg.trim() || null,
        rg_uf: form.rg_uf || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado || null,
        avatar_url: form.avatar_url || null,
      };

      const { data, error } = await supabase
        .from("usuarios")
        .update(payload)
        .eq("id", usuario.id)
        .eq("auth_user_id", usuario.auth_user_id)
        .select(
          "id, nome, data_nascimento, cpf, rg, rg_uf, cidade, estado, avatar_url, updated_at"
        );

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        throw new Error(
          "Nenhum registro foi atualizado. Verifique a policy de UPDATE da tabela usuarios."
        );
      }

      const atualizado = data[0];

      setMensagem("Perfil atualizado com sucesso.");
      setUsuario((prev) =>
        prev
          ? {
              ...prev,
              nome: atualizado.nome,
              data_nascimento: atualizado.data_nascimento,
              cpf: atualizado.cpf,
              rg: atualizado.rg,
              rg_uf: atualizado.rg_uf,
              cidade: atualizado.cidade,
              estado: atualizado.estado,
              avatar_url: atualizado.avatar_url,
            }
          : prev
      );

      setForm((prev) => ({
        ...prev,
        nome: atualizado.nome ?? "",
        data_nascimento: atualizado.data_nascimento ?? "",
        cpf: atualizado.cpf ?? "",
        rg: atualizado.rg ?? "",
        rg_uf: atualizado.rg_uf ?? "",
        cidade: atualizado.cidade ?? "",
        estado: atualizado.estado ?? "",
        avatar_url: atualizado.avatar_url ?? "",
      }));

      setPreviewAvatar(atualizado.avatar_url ?? "");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao salvar perfil.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarSenha() {
    if (!usuario?.email) return;

    try {
      setEnviandoSenha(true);
      setErro("");
      setMensagem("");

      const { error } = await supabase.auth.resetPasswordForEmail(
        usuario.email,
        {
          redirectTo: `${window.location.origin}/atualizar-senha`,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      setMensagem("Enviamos um link para alteração de senha no seu e-mail.");
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o e-mail de alteração de senha."
      );
    } finally {
      setEnviandoSenha(false);
    }
  }

  function selecionarAvatar(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;

    try {
      setErro("");
      setMensagem("");

      const arquivoOriginal = input.files?.[0];
      if (!arquivoOriginal) return;

      if (!TIPOS_PERMITIDOS.includes(arquivoOriginal.type)) {
        throw new Error("Formato inválido. Envie JPG, PNG ou WEBP.");
      }

      if (arquivoOriginal.size > TAMANHO_MAXIMO_BYTES) {
        throw new Error(`A imagem deve ter no máximo ${TAMANHO_MAXIMO_MB} MB.`);
      }

      const previewUrl = URL.createObjectURL(arquivoOriginal);

      setArquivoOriginalParaCrop(arquivoOriginal);
      setImagemOriginalParaCrop(previewUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCropModalOpen(true);

      input.value = "";
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao selecionar avatar.");
      input.value = "";
    }
  }

  async function confirmarCropAvatar() {
    if (!usuario || !imagemOriginalParaCrop || !croppedAreaPixels) return;

    try {
      setUploadingAvatar(true);
      setErro("");
      setMensagem("");

      const arquivoCortado = await gerarImagemCortada(
        imagemOriginalParaCrop,
        croppedAreaPixels
      );

      const caminhoAntigo = extrairCaminhoStorage(
        form.avatar_url || usuario.avatar_url
      );
      const novoCaminho = `${usuario.id}/avatar-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(novoCaminho, arquivoCortado, {
          upsert: true,
          contentType: "image/jpeg",
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(novoCaminho);

      atualizarCampo("avatar_url", publicUrlData.publicUrl);
      setPreviewAvatar(publicUrlData.publicUrl);

      if (caminhoAntigo && caminhoAntigo !== novoCaminho) {
        await supabase.storage.from("avatars").remove([caminhoAntigo]);
      }

      const tamanhoOriginalKb = arquivoOriginalParaCrop
        ? (arquivoOriginalParaCrop.size / 1024).toFixed(0)
        : null;

      const tamanhoFinalKb = (arquivoCortado.size / 1024).toFixed(0);

      setMensagem(
        tamanhoOriginalKb
          ? `Imagem cortada e otimizada com sucesso. Tamanho: ${tamanhoOriginalKb} KB → ${tamanhoFinalKb} KB. Clique em salvar para confirmar.`
          : "Imagem cortada e otimizada com sucesso. Clique em salvar para confirmar."
      );

      fecharCropModal();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao processar avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removerAvatar() {
    if (!usuario) return;

    try {
      setRemovendoAvatar(true);
      setErro("");
      setMensagem("");

      const caminhoAtual = extrairCaminhoStorage(
        form.avatar_url || usuario.avatar_url
      );

      if (caminhoAtual) {
        const { error: removeError } = await supabase.storage
          .from("avatars")
          .remove([caminhoAtual]);

        if (removeError) {
          throw new Error(removeError.message);
        }
      }

      atualizarCampo("avatar_url", "");
      setPreviewAvatar("");

      setMensagem("Foto removida com sucesso. Clique em salvar para confirmar.");
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao remover foto.");
    } finally {
      setRemovendoAvatar(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.card}>Carregando perfil...</div>
        </div>
      </div>
    );
  }

  return (
    <>
    <Header
      title="Meu perfil"
      subtitle="Atualize seus dados pessoais, documentos e foto de perfil."
    />
    
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1>Meu perfil</h1>
            <p>Atualize seus dados pessoais e sua foto de perfil.</p>
          </div>

          {(mensagem || erro) && (
            <div
              className={`${styles.alert} ${erro ? styles.error : styles.success}`}
            >
              {erro || mensagem}
            </div>
          )}

          <div className={styles.grid}>
            <section className={`${styles.card} ${styles.sidebar}`}>
              <div className={styles.avatarWrap}>
                <div className={styles.avatar}>
                  {previewAvatar ? (
                    <img src={previewAvatar} alt="Avatar do usuário" />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {form.nome?.trim()?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                  )}
                </div>

                <div className={styles.avatarButtons}>
                  <label className={styles.uploadBtn}>
                    {uploadingAvatar ? "Processando..." : "Trocar foto"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={selecionarAvatar}
                      disabled={uploadingAvatar || removendoAvatar}
                      hidden
                    />
                  </label>

                  <button
                    type="button"
                    onClick={removerAvatar}
                    disabled={
                      uploadingAvatar ||
                      removendoAvatar ||
                      (!previewAvatar && !form.avatar_url)
                    }
                    className={styles.removeBtn}
                  >
                    {removendoAvatar ? "Removendo..." : "Remover foto"}
                  </button>
                </div>

                <p className={styles.uploadHint}>
                  JPG, PNG ou WEBP. Máximo de {TAMANHO_MAXIMO_MB} MB.
                </p>
              </div>

              <div className={styles.infoBox}>
                <div className={styles.infoGroup}>
                  <span className={styles.infoLabel}>Empresa</span>
                  <p className={styles.infoValue}>
                    {empresa?.nome || "Não vinculado"}
                  </p>
                </div>

                <div className={styles.infoGroup}>
                  <span className={styles.infoLabel}>Perfil</span>
                  <div className={styles.tags}>
                    {perfis.length > 0 ? (
                      perfis.map((perfil, index) => (
                        <span
                          key={
                            perfil.id
                              ? `perfil-${perfil.id}-${index}`
                              : `perfil-${perfil.nome}-${index}`
                          }
                          className={styles.tag}
                        >
                          {perfil.nome}
                        </span>
                      ))
                    ) : (
                      <span className={styles.empty}>Nenhum perfil vinculado</span>
                    )}
                  </div>
                </div>

                <div className={styles.infoGroup}>
                  <span className={styles.infoLabel}>Setor</span>
                  <div className={styles.tags}>
                    {setores.length > 0 ? (
                      setores.map((setor, index) => (
                        <span
                          key={
                            setor.id
                              ? `setor-${setor.id}-${index}`
                              : `setor-${setor.nome}-${index}`
                          }
                          className={styles.tag}
                        >
                          {setor.nome}
                        </span>
                      ))
                    ) : (
                      <span className={styles.empty}>Nenhum setor vinculado</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className={`${styles.card} ${styles.formCard}`}>
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label>Nome</label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) => atualizarCampo("nome", e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label>E-mail</label>
                  <input type="email" value={form.email} disabled />
                </div>

                <div className={styles.field}>
                  <label>Data de nascimento</label>
                  <input
                    type="date"
                    value={form.data_nascimento}
                    onChange={(e) =>
                      atualizarCampo("data_nascimento", e.target.value)
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label>CPF</label>
                  <input
                    type="text"
                    value={form.cpf}
                    onChange={(e) =>
                      atualizarCampo("cpf", formatarCPF(e.target.value))
                    }
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>

                <div className={styles.field}>
                  <label>RG</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.rg}
                    onChange={(e) =>
                      atualizarCampo("rg", formatarRG(e.target.value))
                    }
                    placeholder="00.000.000-0"
                  />
                </div>

                <div className={styles.field}>
                  <label>UF do RG</label>
                  <select
                    value={form.rg_uf}
                    onChange={(e) => atualizarCampo("rg_uf", e.target.value)}
                    className={styles.select}
                  >
                    <option value="">Selecione</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label>Cidade</label>
                  <input
                    type="text"
                    value={form.cidade}
                    onChange={(e) => atualizarCampo("cidade", e.target.value)}
                    placeholder="Sua cidade"
                  />
                </div>

                <div className={styles.field}>
                  <label>Estado</label>
                  <select
                    value={form.estado}
                    onChange={(e) => atualizarCampo("estado", e.target.value)}
                    className={styles.select}
                  >
                    <option value="">Selecione</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  onClick={salvarPerfil}
                  disabled={salvando}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  {salvando ? "Salvando..." : "Salvar alterações"}
                </button>

                <button
                  onClick={alterarSenha}
                  disabled={enviandoSenha}
                  className={`${styles.btn} ${styles.btnSecondary}`}
                >
                  {enviandoSenha ? "Enviando..." : "Alterar senha"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {cropModalOpen && (
        <div className={styles.cropOverlay}>
          <div className={styles.cropModal}>
            <div className={styles.cropHeader}>
              <h2>Ajustar foto de perfil</h2>
              <p>Posicione a imagem dentro do círculo.</p>
            </div>

            <div className={styles.cropArea}>
              <Cropper
                image={imagemOriginalParaCrop}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className={styles.cropControls}>
              <label className={styles.zoomLabel}>
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className={styles.zoomRange}
                />
              </label>
            </div>

            <div className={styles.cropActions}>
              <button
                type="button"
                onClick={fecharCropModal}
                className={`${styles.btn} ${styles.btnSecondary}`}
                disabled={uploadingAvatar}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarCropAvatar}
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? "Processando..." : "Confirmar corte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}