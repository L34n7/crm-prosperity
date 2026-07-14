"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { montarWhatsappUrl } from "@/lib/contatos/sistema";
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
  setup_completed_at?: string | null;
  onboarding_status?: string | null;
  onboarding_erro?: string | null;
  modo_integracao?: "cloud_api" | "coexistence";
  coex_status?: string | null;
  posicao?: number | null;
  waba_id?: string | null;
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

type AdministradorEmpresa = {
  id: string;
  nome: string;
  email?: string | null;
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

const COTACAO_ENTERPRISE_URL = montarWhatsappUrl(
  "Olá! Quero fazer uma cotação do plano Profissional Enterprise do CRM Prosperity para usar mais números de WhatsApp."
);

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizarTextoPerfil(valor?: string | null) {
  return String(valor || "").trim();
}

function normalizarWebsitesPerfil(websites?: string[] | null) {
  return (websites || [])
    .map((item) => normalizarTextoPerfil(item))
    .filter(Boolean);
}

function dadosPerfilForamAlterados(params: {
  perfil: PerfilWhatsapp | null;
  about: string;
  address: string;
  description: string;
  email: string;
  website1: string;
  website2: string;
  vertical: string;
  foto: File | null;
}) {
  const {
    perfil,
    about,
    address,
    description,
    email,
    website1,
    website2,
    vertical,
    foto,
  } = params;

  if (foto) return true;

  const websitesFormulario = normalizarWebsitesPerfil([website1, website2]);
  const websitesAtuais = normalizarWebsitesPerfil(perfil?.websites);

  return (
    normalizarTextoPerfil(about) !== normalizarTextoPerfil(perfil?.about) ||
    normalizarTextoPerfil(address) !== normalizarTextoPerfil(perfil?.address) ||
    normalizarTextoPerfil(description) !==
      normalizarTextoPerfil(perfil?.description) ||
    normalizarTextoPerfil(email) !== normalizarTextoPerfil(perfil?.email) ||
    normalizarTextoPerfil(vertical) !==
      normalizarTextoPerfil(perfil?.vertical) ||
    JSON.stringify(websitesFormulario) !== JSON.stringify(websitesAtuais)
  );
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

function formatarData(valor?: string | null) {
  if (!valor) return "Não informado";

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

function obterQualidadeNumero(quality?: string | null) {
  const valor = normalizarStatus(quality);

  if (valor === "green") {
    return {
      texto: "Alta",
      classe: styles.qualityHigh,
    };
  }

  if (valor === "yellow") {
    return {
      texto: "Média",
      classe: styles.qualityMedium,
    };
  }

  if (valor === "red") {
    return {
      texto: "Baixa",
      classe: styles.qualityLow,
    };
  }

  return {
    texto: "Não informada",
    classe: styles.qualityNeutral,
  };
}

function obterTextoStatusIntegracao(
  status?: string | null,
  phoneStatus?: string | null
) {
  const statusIntegracao = normalizarStatus(status);
  const statusNumero = normalizarStatus(phoneStatus);

  if (
    ["bloqueado", "banido", "blocked", "banned", "restricted"].includes(
      statusIntegracao
    ) ||
    ["bloqueado", "banido", "blocked", "banned", "restricted"].includes(
      statusNumero
    )
  ) {
    return "Atenção necessária na conexão";
  }

  if (statusIntegracao === "ativa" || statusNumero === "connected") {
    return "WhatsApp conectado e operacional";
  }

  if (statusIntegracao === "desconectada") {
    return "Integração desconectada";
  }

  return "Status da conexão não informado";
}

export default function WhatsappPerfilPage() {
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [integracaoId, setIntegracaoId] = useState("");
  const [perfil, setPerfil] = useState<PerfilWhatsapp | null>(null);
  const [nomeIntegracao, setNomeIntegracao] = useState("");
  const [nomeIntegracaoOriginal, setNomeIntegracaoOriginal] = useState("");

  const [about, setAbout] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [website1, setWebsite1] = useState("");
  const [website2, setWebsite2] = useState("");
  const [vertical, setVertical] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [previewFoto, setPreviewFoto] = useState("");
  const [fotosIntegracoes, setFotosIntegracoes] = useState<
    Record<string, string>
  >({});
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
  const [administrador, setAdministrador] =
  useState<AdministradorEmpresa | null>(null);
  const [diagnosticoWhatsapp, setDiagnosticoWhatsapp] =
    useState<DiagnosticoWhatsApp | null>(null);
  const [onboardingIncompleto, setOnboardingIncompleto] =
    useState(false);
  const [onboardingRedirect, setOnboardingRedirect] =
    useState("/configurar-ambiente");
  const [limiteIntegracoesWhatsapp, setLimiteIntegracoesWhatsapp] =
    useState(1);
  const [proximaPosicaoIntegracao, setProximaPosicaoIntegracao] =
    useState<number | null>(null);
  const [podeCadastrarNovaIntegracao, setPodeCadastrarNovaIntegracao] =
    useState(false);
  const [cadastrandoIntegracao, setCadastrandoIntegracao] = useState(false);
  const [modalUpgradeAberto, setModalUpgradeAberto] = useState(false);

  const [modalNomeAberto, setModalNomeAberto] = useState(false);
  const [novoNomeExibicao, setNovoNomeExibicao] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [erroNomeExibicao, setErroNomeExibicao] = useState("");
  const [sucessoNomeExibicao, setSucessoNomeExibicao] = useState("");
  const [modalDesconectarAberto, setModalDesconectarAberto] = useState(false);
  const [
    modalEscolherDesconexaoAberto,
    setModalEscolherDesconexaoAberto,
  ] = useState(false);
  const [integracaoDesconexaoId, setIntegracaoDesconexaoId] = useState("");
  const [desconectando, setDesconectando] = useState(false);
  const [erroDesconexao, setErroDesconexao] = useState("");
  const [
    confirmouDesconexaoCoexNoApp,
    setConfirmouDesconexaoCoexNoApp,
  ] = useState(false);

  const integracaoSelecionada = useMemo(() => {
    return integracoes.find((item) => item.id === integracaoId) || null;
  }, [integracoes, integracaoId]);

  const integracaoDesconexaoSelecionada = useMemo(() => {
    return (
      integracoes.find((item) => item.id === integracaoDesconexaoId) ||
      integracaoSelecionada
    );
  }, [integracoes, integracaoDesconexaoId, integracaoSelecionada]);

  const perfilEditavelNoCrm =
    integracaoSelecionada?.modo_integracao !== "coexistence";
    
  const nomePerfil =
    integracaoSelecionada?.phone_number_display_name ||
    integracaoSelecionada?.verified_name ||
    "Empresa";

  const integracaoBloqueada =
    onboardingIncompleto ||
    Boolean(diagnosticoWhatsapp?.bloqueiaOperacao) ||
    ["bloqueado", "banido", "blocked", "banned"].includes(
      normalizarStatus(integracaoSelecionada?.status)
    ) ||
    ["banned", "blocked"].includes(
      normalizarStatus(integracaoSelecionada?.phone_number_status)
    );

  const qualidadeNumero = obterQualidadeNumero(
    integracaoSelecionada?.quality_rating
  );
  const proximaPosicaoVisual = Math.min(integracoes.length + 1, 3);
  const deveMostrarControlesMultiIntegracao =
    limiteIntegracoesWhatsapp > 1 || integracoes.length > 1;
  const labelAdicionarNumero = `Add número ${proximaPosicaoIntegracao || proximaPosicaoVisual}`;

  const textoStatusIntegracao = obterTextoStatusIntegracao(
    integracaoSelecionada?.status,
    integracaoSelecionada?.phone_number_status
  );

  const haAlteracoesMeta = dadosPerfilForamAlterados({
    perfil,
    about,
    address,
    description,
    email,
    website1,
    website2,
    vertical,
    foto,
  });
  const nomeIntegracaoAlterado =
    nomeIntegracao.trim() !== nomeIntegracaoOriginal.trim();
  const haAlteracoesPerfil = haAlteracoesMeta || nomeIntegracaoAlterado;

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
      setOnboardingIncompleto(json.onboarding_incompleto === true);
      setOnboardingRedirect(
        json.onboarding_redirect || "/configurar-ambiente"
      );

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
          setup_completed_at: integracaoAtualizada.setup_completed_at,
          onboarding_status: integracaoAtualizada.onboarding_status,
          onboarding_erro: integracaoAtualizada.onboarding_erro,
        };
      });

      setIntegracoes(listaComNomeAtualizado);
      setLimiteMeta(json.limite_meta || null);
      setAdministrador(json.administrador || null);
      setLimiteIntegracoesWhatsapp(
        Number(json.limite_integracoes_whatsapp || 1)
      );
      setProximaPosicaoIntegracao(
        typeof json.proxima_posicao === "number" ? json.proxima_posicao : null
      );
      setPodeCadastrarNovaIntegracao(json.pode_cadastrar_nova === true);

      const novaIntegracaoId = integracaoAtualizada?.id || "";

      setIntegracaoId(novaIntegracaoId);
      const novoNomeIntegracao = integracaoAtualizada?.nome_conexao || "";
      setNomeIntegracao(novoNomeIntegracao);
      setNomeIntegracaoOriginal(novoNomeIntegracao);

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
      if (novaIntegracaoId && novoPerfil?.profile_picture_url) {
        setFotosIntegracoes((atuais) => ({
          ...atuais,
          [novaIntegracaoId]: novoPerfil.profile_picture_url,
        }));
      }
      setFoto(null);
    } catch (error: unknown) {
      setErro(getErrorMessage(error, "Erro ao carregar perfil."));
    } finally {
      setCarregando(false);
    }
  }

  async function cadastrarNovaIntegracao() {
    if (cadastrandoIntegracao) return;

    if (!podeCadastrarNovaIntegracao) {
      setModalUpgradeAberto(true);
      return;
    }

    try {
      setCadastrandoIntegracao(true);
      setErro("");
      setSucesso("");

      const res = await fetch("/api/integracoes-whatsapp", {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok || !json.integracao?.id) {
        throw new Error(
          json.error || "Nao foi possivel criar a nova integracao."
        );
      }

      window.localStorage.setItem(
        "crm_nova_integracao_whatsapp_pendente",
        JSON.stringify({
          integracao_id: json.integracao.id,
          posicao: json.posicao || proximaPosicaoIntegracao || null,
          wabas_anteriores: Array.from(
            new Set(
              integracoes
                .map((item) => String(item.waba_id || "").trim())
                .filter(Boolean)
            )
          ),
          criado_em: new Date().toISOString(),
        })
      );

      window.location.href = `/configurar-ambiente?integracao_id=${encodeURIComponent(
        json.integracao.id
      )}&fluxo=novo-numero`;
    } catch (error: unknown) {
      setErro(
        getErrorMessage(error, "Nao foi possivel cadastrar outro numero.")
      );
    } finally {
      setCadastrandoIntegracao(false);
    }
  }

  async function salvarPerfil(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!haAlteracoesPerfil) {
      setErro("");
      setSucesso("Nenhuma alteração para salvar.");
      return;
    }

    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      const nomeConexao = nomeIntegracao.trim();

      if (nomeIntegracaoAlterado && (nomeConexao.length < 3 || nomeConexao.length > 80)) {
        throw new Error("O nome da integração deve ter entre 3 e 80 caracteres.");
      }

      if (haAlteracoesMeta) {
        const formData = new FormData();

        formData.delete("display_name");
      formData.delete("verified_name");
      formData.delete("nome_exibicao");
      formData.delete("nome");
      formData.delete("novo_nome");

      formData.set("integracao_id", integracaoId);
      formData.set("about", about);
      formData.set("address", address);
      formData.set("description", description);
      formData.set("email", email);
      formData.set("website1", website1);
      formData.set("website2", website2);
      formData.set("vertical", vertical);

      if (foto) {
        const tiposPermitidos = ["image/jpeg", "image/png"];

        if (!tiposPermitidos.includes(foto.type)) {
          throw new Error("A foto precisa estar em JPG ou PNG.");
        }

        if (foto.size > 5 * 1024 * 1024) {
          throw new Error("A foto precisa ter no máximo 5 MB.");
        }

        formData.set("profile_picture", foto);
      }

      const validarUrlPerfil = (valor: string) => {
        const site = valor.trim();

        if (!site) {
          return true;
        }

        try {
          const url = new URL(site);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      };

      if (!validarUrlPerfil(website1)) {
        throw new Error(
          "O Site principal precisa ser uma URL completa, por exemplo: https://seudominio.com.br"
        );
      }

      if (!validarUrlPerfil(website2)) {
        throw new Error(
          "O Site secundário precisa ser uma URL completa, por exemplo: https://seudominio.com.br"
        );
      }

        const res = await fetch("/api/whatsapp/perfil", {
          method: "PATCH",
          body: formData,
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
          setDiagnosticoWhatsapp(json.diagnostico || null);
          throw new Error(json.error || "Erro ao salvar perfil.");
        }
      }

      if (nomeIntegracaoAlterado) {
        const resNome = await fetch("/api/integracoes-whatsapp", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integracao_id: integracaoId,
            nome_conexao: nomeConexao,
          }),
        });
        const jsonNome = await resNome.json();

        if (!resNome.ok || !jsonNome.ok) {
          throw new Error(jsonNome.error || "Erro ao salvar o nome da integração.");
        }
      }

      setSucesso("Alterações salvas com sucesso.");
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
      setErroNomeExibicao("");
      setSucessoNomeExibicao("");

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

        const mensagem =
          json.error ||
          "Erro ao solicitar alteração do nome.";

        setErroNomeExibicao(mensagem);
        return;
      }

      setSucessoNomeExibicao(
        json.message ||
          "Solicitação enviada ao Meta. A aprovação pode levar algum tempo."
      );

      setSucesso(
        "Solicitação de alteração do nome enviada ao Meta. A aprovação pode levar algum tempo."
      );

      setNovoNomeExibicao("");

      setTimeout(() => {
        setModalNomeAberto(false);
        setSucessoNomeExibicao("");
      }, 1200);

      await carregarPerfil(integracaoId, { preservarMensagens: true });
    } catch (error: unknown) {
      setErroNomeExibicao(
        getErrorMessage(error, "Erro ao solicitar alteração do nome.")
      );
    } finally {
      setSalvandoNome(false);
    }
  }

  async function carregarFotosIntegracoesParaDesconexao() {
    const integracoesSemFoto = integracoes.filter(
      (item) => item.phone_number_id && !fotosIntegracoes[item.id]
    );

    if (!integracoesSemFoto.length) return;

    const fotos = await Promise.all(
      integracoesSemFoto.map(async (item) => {
        try {
          const response = await fetch(
            `/api/whatsapp/perfil?integracao_id=${encodeURIComponent(item.id)}`,
            { cache: "no-store" }
          );
          const data = await response.json();
          return [item.id, data?.perfil?.profile_picture_url || ""] as const;
        } catch {
          return [item.id, ""] as const;
        }
      })
    );

    setFotosIntegracoes((atuais) => ({
      ...atuais,
      ...Object.fromEntries(fotos.filter(([, fotoPerfil]) => fotoPerfil)),
    }));
  }

  function abrirModalDesconexao() {
    setErroDesconexao("");
    setConfirmouDesconexaoCoexNoApp(false);

    if (integracoes.length > 1) {
      setIntegracaoDesconexaoId("");
      setModalEscolherDesconexaoAberto(true);
      void carregarFotosIntegracoesParaDesconexao();
      return;
    }

    setIntegracaoDesconexaoId(integracaoId);
    setModalDesconectarAberto(true);
  }

  function abrirConfirmacaoDesconexao(id: string) {
    setErroDesconexao("");
    setConfirmouDesconexaoCoexNoApp(false);
    setIntegracaoDesconexaoId(id);
    setModalEscolherDesconexaoAberto(false);
    setModalDesconectarAberto(true);
  }

  function fecharModalEscolherDesconexao() {
    if (desconectando) return;
    setModalEscolherDesconexaoAberto(false);
    setErroDesconexao("");
  }

  function fecharModalDesconexao() {
    if (desconectando) return;
    setModalDesconectarAberto(false);
    setIntegracaoDesconexaoId("");
    setErroDesconexao("");
    setConfirmouDesconexaoCoexNoApp(false);
  }

  async function desconectarIntegracao() {
    const alvoIntegracaoId = integracaoDesconexaoId || integracaoId;
    const integracaoAlvo =
      integracoes.find((item) => item.id === alvoIntegracaoId) ||
      integracaoSelecionada;

    if (!alvoIntegracaoId || desconectando) return;

    let redirecionando = false;

    try {
      setDesconectando(true);
      setErroDesconexao("");

      const response = await fetch(
        `/api/integracoes-whatsapp/${encodeURIComponent(alvoIntegracaoId)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmar_desconexao: true,
            confirmar_desconexao_coex_no_app:
              integracaoAlvo?.modo_integracao ===
                "coexistence" &&
              confirmouDesconexaoCoexNoApp,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || "Não foi possível desconectar a integração."
        );
      }

      redirecionando = true;
      window.location.replace(data.redirect_to || "/configurar-ambiente");
    } catch (error: unknown) {
      setErroDesconexao(
        getErrorMessage(error, "Não foi possível desconectar a integração.")
      );
    } finally {
      if (!redirecionando) {
        setDesconectando(false);
      }
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

            <div className={`${styles.newConnectionArea} ${styles.hiddenLegacyConnectionArea}`}>
              <button
                type="button"
                className={styles.newConnectionButton}
                onClick={cadastrarNovaIntegracao}
                disabled={cadastrandoIntegracao}
              >
                {cadastrandoIntegracao ? "Criando..." : labelAdicionarNumero}
              </button>

              {deveMostrarControlesMultiIntegracao && (
                <span>
                  {integracoes.length} de {limiteIntegracoesWhatsapp} integração
                  {limiteIntegracoesWhatsapp === 1 ? "" : "es"} liberada
                  {limiteIntegracoesWhatsapp === 1 ? "" : "s"}.
                </span>
              )}
            </div>

            <div className={`${styles.newConnectionArea} ${styles.hiddenLegacyConnectionArea}`}>
              <button
                type="button"
                className={styles.newConnectionButton}
                onClick={cadastrarNovaIntegracao}
                disabled={cadastrandoIntegracao}
              >
                {cadastrandoIntegracao
                  ? "Criando..."
                  : proximaPosicaoIntegracao
                  ? `Cadastrar nÃºmero ${proximaPosicaoIntegracao}`
                  : "Limite de nÃºmeros atingido"}
              </button>

              <span>
                {integracoes.length} de {limiteIntegracoesWhatsapp} integraÃ§Ã£o
                {limiteIntegracoesWhatsapp === 1 ? "" : "es"} liberada
                {limiteIntegracoesWhatsapp === 1 ? "" : "s"}.
              </span>
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

            {onboardingIncompleto && (
              <div className={styles.diagnosticAlert}>
                <div className={styles.diagnosticHeader}>
                  <span>WhatsApp</span>
                  <strong>Configuração ainda não concluída</strong>
                </div>

                <p>
                  Conclua o onboarding para consultar e editar o perfil
                  comercial na Meta.
                </p>

                <div className={styles.diagnosticActions}>
                  <a href={onboardingRedirect}>
                    Concluir configuração
                  </a>
                </div>
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
                      Pedir ajuda
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
              {deveMostrarControlesMultiIntegracao && integracoes.length > 1 && (
                <div className={styles.integracaoSwitcher}>
                  <select
                    className={styles.integracaoSelect}
                    value={integracaoId}
                    onChange={(e) => carregarPerfil(e.target.value)}
                    disabled={carregando}
                  >
                    {integracoes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome_conexao ||
                          item.phone_number_display_name ||
                          item.verified_name}
                        {item.numero ? ` ${item.numero}` : ""}
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
                <div className={styles.limitGrid}>
                  <div>
                    <span>Limite diário</span>
                    <strong>{formatarNumero(limiteMeta.limite)}</strong>
                  </div>

                  <div>
                    <span>Usadas hoje</span>
                    <strong>{formatarNumero(limiteMeta.usados)}</strong>
                  </div>

                  <div>
                    <span>Restantes</span>
                    <strong>{formatarNumero(limiteMeta.restantes)}</strong>
                  </div>
                </div>

                <div className={styles.integrationInfoGrid}>
                  <div className={styles.integrationInfoItem}>
                    <span>Nome verificado:</span>
                    <strong>{integracaoSelecionada?.verified_name || nomePerfil}</strong>
                  </div>

                  <div className={styles.integrationInfoItem}>
                    <span>Administrador:</span>
                    <strong>{administrador?.nome || "Não informado"}</strong>
                  </div>

                  <div className={styles.integrationInfoItem}>
                    <span>Qualidade do número:</span>
                    <strong className={`${styles.qualityBadge} ${qualidadeNumero.classe}`}>
                      <i />
                      {qualidadeNumero.texto}
                    </strong>
                  </div>

                  <div className={styles.integrationInfoItem}>
                    <span>Data início:</span>
                    <strong>
                      {formatarData(integracaoSelecionada?.setup_completed_at)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.formGrid}>
            <label className={styles.fieldLabel}>
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
                    setErroNomeExibicao("");
                    setSucessoNomeExibicao("");
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
              Nome da integração
              <input
                className={styles.input}
                value={nomeIntegracao}
                minLength={3}
                maxLength={80}
                onChange={(e) => setNomeIntegracao(e.target.value)}
                placeholder="Ex.: WhatsApp Comercial"
                disabled={!integracaoId || carregando}
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
                Site principal
                <input
                type="url"
                placeholder="https://seusite.com.br"
                inputMode="url"
                className={styles.input}
                value={website1}
                onChange={(e) => setWebsite1(e.target.value)}
                disabled={integracaoBloqueada}
                />
            </label>

            <label className={styles.fieldLabel}>
                Site secundário
                <input
                type="url"
                placeholder="https://instagram.com/suaempresa"
                inputMode="url"
                className={styles.input}
                value={website2}
                onChange={(e) => setWebsite2(e.target.value)}
                disabled={integracaoBloqueada}
                />
            </label>
            </div>

            {!perfilEditavelNoCrm && (
              <div className={styles.noticeBox}>
                Este número está conectado por coexistência. Alguns dados do perfil não
                podem ser editados pelo CRM. Use o botão <strong>Ajustar no Meta</strong>{" "}
                para alterar o perfil diretamente no Gerenciador do WhatsApp ou no
                WhatsApp Business App.
              </div>
            )}

            {(erro || sucesso) && (
              <div className={styles.alertArea}>
                {erro && <div className={styles.errorAlert}>{erro}</div>}
              </div>
            )}

            <div className={styles.saveArea}>
              <div className={styles.saveLeftActions}>
                <button
                  type="button"
                  className={styles.disconnectButton}
                  onClick={abrirModalDesconexao}
                  disabled={!integracaoId || carregando || desconectando}
                >
                  Desconectar integração
                </button>

                <button
                  type="button"
                  className={styles.addNumberButton}
                  onClick={cadastrarNovaIntegracao}
                  disabled={cadastrandoIntegracao}
                >
                  {cadastrandoIntegracao ? "Criando..." : labelAdicionarNumero}
                </button>
              </div>

              <button
                type="button"
                className={`${styles.disconnectButton} ${styles.hiddenLegacyConnectionArea}`}
                onClick={abrirModalDesconexao}
                disabled={!integracaoId || carregando || desconectando}
              >
                Desconectar integração
              </button>

              <div className={styles.saveActions}>
                <a
                  className={styles.metaButton}
                  href="https://business.facebook.com/latest/whatsapp_manager/phone_numbers"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ajustar no Meta
                </a>

                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={
                    salvando ||
                    carregando ||
                    !integracaoId ||
                    integracaoBloqueada ||
                    !haAlteracoesPerfil ||
                    (haAlteracoesMeta && !perfilEditavelNoCrm)
                  }
                >
                  {salvando ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
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
            </div>

            {erroNomeExibicao && (
              <div className={styles.modalErrorAlert}>
                {erroNomeExibicao}
              </div>
            )}

            {sucessoNomeExibicao && (
              <div className={styles.modalSuccessAlert}>
                {sucessoNomeExibicao}
              </div>
            )}
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

    {modalUpgradeAberto && (
      <div
        className={styles.modalOverlay}
        onClick={() => setModalUpgradeAberto(false)}
      >
        <div
          className={`${styles.modalCard} ${styles.upgradeModal}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-upgrade-integracoes"
        >
          <div className={styles.modalHeader}>
            <div>
              <h2
                id="titulo-upgrade-integracoes"
                className={styles.modalTitle}
              >
                Mais números no WhatsApp
              </h2>
              <p className={styles.modalSubtitle}>
                Seu plano atual não possui outra integração liberada.
              </p>
            </div>

            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setModalUpgradeAberto(false)}
            >
              Fechar
            </button>
          </div>

          <div className={styles.upgradeGrid}>
            <div className={styles.upgradeItem}>
              <span>1</span>
              <strong>Plano Profissional Enterprise</strong>
              <p>Libera operação com mais números oficiais no mesmo ambiente.</p>
            </div>

            <div className={styles.upgradeItem}>
              <span>2</span>
              <strong>Configuração assistida</strong>
              <p>A liberação é feita no banco após a contratação ou cotação aprovada.</p>
            </div>

            <div className={styles.upgradeItem}>
              <span>3</span>
              <strong>Fluxos e templates</strong>
              <p>Ao adicionar outra WABA, revise blocos de disparo agendado.</p>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setModalUpgradeAberto(false)}
            >
              Agora não
            </button>

            <a
              className={styles.primaryButton}
              href={COTACAO_ENTERPRISE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solicitar cotação
            </a>
          </div>
        </div>
      </div>
    )}

    {modalEscolherDesconexaoAberto && (
      <div
        className={styles.modalOverlay}
        onClick={fecharModalEscolherDesconexao}
        role="presentation"
      >
        <div
          className={`${styles.modalCard} ${styles.disconnectChoiceModal}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-escolher-desconexao"
        >
          <div className={styles.modalHeader}>
            <div>
              <h2
                id="titulo-escolher-desconexao"
                className={styles.modalTitle}
              >
                Qual número deseja desconectar?
              </h2>
              <p className={styles.modalSubtitle}>
                Escolha apenas a integração que deve parar de operar no CRM.
              </p>
            </div>
          </div>

          <div className={styles.disconnectChoiceGrid}>
            {integracoes.map((item) => (
              <div
                key={item.id}
                className={`${styles.disconnectChoiceCard} ${
                  Number(item.posicao || 1) === 2
                    ? styles.disconnectChoiceCardIntegration2
                    : Number(item.posicao || 1) === 3
                    ? styles.disconnectChoiceCardIntegration3
                    : styles.disconnectChoiceCardIntegration1
                }`}
              >
                <div className={styles.disconnectChoiceTop}>
                  <div className={styles.connectionAvatar}>
                    {fotosIntegracoes[item.id] ? (
                      <img
                        src={fotosIntegracoes[item.id]}
                        alt={`Foto de ${item.nome_conexao || "WhatsApp"}`}
                      />
                    ) : (
                      item.nome_conexao?.charAt(0)?.toUpperCase() || "W"
                    )}
                  </div>

                  <div>
                    <strong>{item.nome_conexao || "WhatsApp"}</strong>
                    <span>{item.numero || "Número pendente"}</span>
                  </div>
                </div>

                <div className={styles.disconnectChoiceMeta}>
                  <span>Integração {item.posicao || "-"}</span>
                  <span>{formatarStatusConexao(item.status)}</span>
                </div>

                <button
                  type="button"
                  className={styles.disconnectChoiceButton}
                  onClick={() => abrirConfirmacaoDesconexao(item.id)}
                  disabled={desconectando}
                >
                  Desconectar este número
                </button>
              </div>
            ))}
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={fecharModalEscolherDesconexao}
              disabled={desconectando}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )}

    {modalDesconectarAberto && (
      <div
        className={styles.modalOverlay}
        onClick={fecharModalDesconexao}
        role="presentation"
      >
        <div
          className={`${styles.modalCard} ${styles.disconnectModal}`}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-desconectar-integracao"
          aria-describedby="descricao-desconectar-integracao"
        >
          <div className={styles.disconnectModalHeader}>
            <div className={styles.warningIcon} aria-hidden="true">
              !
            </div>

            <div>
              <h2
                id="titulo-desconectar-integracao"
                className={styles.modalTitle}
              >
                Desconectar integração da Meta?
              </h2>
              <p
                id="descricao-desconectar-integracao"
                className={styles.modalSubtitle}
              >
                Esta ação interrompe a operação deste número no CRM.
              </p>
              {integracaoDesconexaoSelecionada && (
                <span className={styles.disconnectTarget}>
                  {integracaoDesconexaoSelecionada.nome_conexao || "WhatsApp"}
                  {integracaoDesconexaoSelecionada.numero
                    ? ` - ${integracaoDesconexaoSelecionada.numero}`
                    : ""}
                </span>
              )}
            </div>
          </div>

          <div className={styles.disconnectModalBody}>
            <p className={styles.impactIntro}>
              Ao confirmar, os seguintes impactos serão aplicados:
            </p>

            <ul className={styles.impactList}>
              <li>
                O envio e o recebimento de novas mensagens por esta integração
                serão interrompidos.
              </li>
              <li>
                Templates sincronizados, disparos pendentes e filas desta
                conexão serão removidos ou cancelados.
              </li>
              <li>
                Fluxos que usam esses templates serão pausados. A seleção do
                template e suas variáveis serão limpas nos blocos afetados.
              </li>
              <li>
                Conversas, contatos, rastreamentos e logs já existentes serão
                preservados. As conversas serão vinculadas novamente se o mesmo
                número for reconectado.
              </li>
              <li>
                A conta, o número e a WABA continuarão existindo na Meta. A
                remoção acontece somente dentro do CRM.
              </li>
              <li>
                Você será direcionado ao onboarding e precisará configurar a
                integração novamente para retomar a operação.
              </li>
            </ul>

            <div className={styles.backupNotice}>
              <strong>Backup de segurança</strong>
              <span>
                Antes da exclusão, o sistema salvará uma cópia interna completa
                dos dados da integração. Se o backup falhar, nada será apagado.
              </span>
            </div>

            {integracaoDesconexaoSelecionada?.modo_integracao ===
              "coexistence" && (
              <div className={styles.coexDisconnectNotice}>
                <strong>Desconecte primeiro no celular</strong>
                <span>
                  No WhatsApp Business App, abra Configurações → Conta →
                  Plataforma de negócios, selecione o Prosperity e toque em
                  Desconectar.
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmouDesconexaoCoexNoApp}
                    onChange={(event) =>
                      setConfirmouDesconexaoCoexNoApp(
                        event.target.checked
                      )
                    }
                  />
                  Já desconectei a plataforma no WhatsApp Business App.
                </label>
              </div>
            )}

            {erroDesconexao && (
              <div className={styles.disconnectError} role="alert">
                {erroDesconexao}
              </div>
            )}
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={fecharModalDesconexao}
              disabled={desconectando}
            >
              Manter integração
            </button>

            <button
              type="button"
              className={styles.confirmDisconnectButton}
              onClick={desconectarIntegracao}
              disabled={
                desconectando ||
                (integracaoDesconexaoSelecionada?.modo_integracao ===
                  "coexistence" &&
                  !confirmouDesconexaoCoexNoApp)
              }
            >
              {desconectando
                ? "Salvando backup e desconectando..."
                : "Confirmar e desconectar"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
