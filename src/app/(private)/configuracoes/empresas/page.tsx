"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, Download, Eye, EyeOff, Mail, RotateCcw, Save, ShieldCheck, Trash2, X } from "lucide-react";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import { PERMISSAO_INTERNA_EMPRESAS } from "@/lib/permissoes/internas";
import {
  getBuyerEmailSuggestion,
  isValidBuyerEmail,
} from "@/lib/checkout/buyer-validation";
import styles from "./empresas.module.css";

const OPCOES_LIMITE = Array.from({ length: 10 }, (_, index) => index + 1);

type Plano = {
  id: string;
  nome: string;
  slug: string;
  preco_mensal_centavos?: number | null;
  limite_usuarios: number | null;
  limite_integracoes_whatsapp: number | null;
};

type Nicho = {
  id: string;
  codigo: string;
  nome: string;
};

type StatusEmpresa = "ativa" | "inativa" | "suspensa" | "cancelada" | "excluida";
type FiltroStatusEmpresa = "todos" | "ativa" | "vencida" | "bloqueada" | "cancelada" | "excluida";

type SaldoTokensEmpresa = {
  limite_mensal: number | null;
  tokens_restantes: number | null;
  saldo_mensal_restante: number | null;
  saldo_avulso_restante: number;
  tokens_mensais_usados: number;
  tokens_avulsos_usados: number;
  periodo_inicio: string;
  periodo_fim: string;
  updated_at: string;
};

type LeadEmpresa = {
  id: string;
  nome: string;
  empresa: string | null;
  email: string;
  telefone: string | null;
  categoria: string;
  plano_slug: string;
  status: string;
  pago: boolean;
  created_at: string | null;
};

type ImpactoExclusaoEmpresa = {
  usuarios: number;
  contatos: number;
  conversas: number;
  mensagens: number;
  automacoes: number;
  integracoes_whatsapp: number;
  leads: number;
  pagamentos: number;
  midias: number;
};

type Empresa = {
  id: string;
  nome_fantasia: string;
  razao_social: string | null;
  documento: string | null;
  email: string;
  telefone: string | null;
  nome_responsavel: string | null;
  status: StatusEmpresa;
  white_label_id?: string | null;
  white_label_tipo?: string | null;
  created_at?: string | null;
  cancelada_em?: string | null;
  excluida_em?: string | null;
  encerramento_backup_solicitado_em?: string | null;
  exclusao_prevista_em?: string | null;
  encerramento_backup_estado?: "pendente" | "processando" | "pronto" | "erro" | null;
  encerramento_backup_path?: string | null;
  encerramento_backup_gerado_em?: string | null;
  encerramento_backup_erro?: string | null;
  timezone: string;
  logo_url: string | null;
  observacoes: string | null;
  plano_id: string;
  limite_integracoes_whatsapp: number | null;
  limite_usuarios: number | null;
  assinatura_status?: string | null;
  restauracao_pendente_pagamento_em?: string | null;
  assinatura_inicio_em?: string | null;
  assinatura_vencimento_em?: string | null;
  assinatura_bloqueio_em?: string | null;
  assinatura_renovada_em?: string | null;
  assinatura_gateway?: string | null;
  assinatura_referencia?: string | null;
  empresa_tokens_ia?: SaldoTokensEmpresa | SaldoTokensEmpresa[] | null;
  nicho_id: string;
  nichos?: Nicho | null;
  planos?: {
    id: string;
    nome: string;
    slug: string;
    preco_mensal_centavos?: number | null;
    limite_usuarios: number | null;
    limite_integracoes_whatsapp: number | null;
  } | null;
};

function getStatusVisual(empresa: Empresa): StatusEmpresa | "vencida" | "bloqueada" {
  if (empresa.status === "cancelada" || empresa.status === "excluida")
    return empresa.status;
  if (empresa.status !== "ativa") return empresa.status;
  if (empresa.restauracao_pendente_pagamento_em || empresa.assinatura_status === "bloqueada")
    return "bloqueada";
  if (empresa.assinatura_status === "vencida") return "vencida";
  return "ativa";
}

function getStatusLabel(status: StatusEmpresa | "vencida" | "bloqueada") {
  switch (status) {
    case "ativa": return "Ativa";
    case "vencida": return "Vencido";
    case "bloqueada": return "Bloqueado";
    case "inativa": return "Inativa";
    case "suspensa": return "Suspensa";
    case "cancelada": return "Cancelado";
    case "excluida": return "Excluído";
    default: return status;
  }
}

function getStatusClass(status: StatusEmpresa | "vencida" | "bloqueada") {
  switch (status) {
    case "ativa": return styles.statusAtiva;
    case "vencida": return styles.statusVencida;
    case "bloqueada": return styles.statusBloqueada;
    case "inativa": return styles.statusInativa;
    case "suspensa": return styles.statusSuspensa;
    case "cancelada": return styles.statusCancelada;
    case "excluida": return styles.statusExcluida;
    default: return styles.statusPadrao;
  }
}

function getIniciais(nome: string) {
  const partes = nome.trim().split(" ").filter(Boolean);

  if (partes.length === 0) return "EM";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

function getOpcaoLimiteLabel(quantidade: number, limitePlano: number) {
  if (quantidade === limitePlano) {
    return `${quantidade} (incluído no plano)`;
  }

  if (quantidade > limitePlano) {
    const extras = quantidade - limitePlano;
    return `${quantidade} (${extras} extra${extras > 1 ? "s" : ""})`;
  }

  return String(quantidade);
}

function getSaldoTokensEmpresa(empresa: Empresa) {
  const saldo = empresa.empresa_tokens_ia;

  if (Array.isArray(saldo)) {
    return saldo[0] ?? null;
  }

  return saldo ?? null;
}

function formatarTokens(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function formatarMoedaCentavos(valor: number | null | undefined) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return "—";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor / 100);
}

function formatarDataAssinatura(valor: string | null | undefined) {
  if (!valor) return "—";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function formatarSomenteDataAssinatura(valor: string | null | undefined) {
  if (!valor) return "Não informado";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

function valorInputParaCentavos(valor: string) {
  const limpo = valor.trim().replace(/[^\d,.-]/g, "");
  if (!limpo) return null;

  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;

  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || numero <= 0) return null;

  const centavos = Math.round(numero * 100);
  return Number.isSafeInteger(centavos) ? centavos : null;
}

function valorCentavosParaInput(valor: number | null | undefined) {
  if (!valor || !Number.isFinite(valor)) return "";
  return (valor / 100).toFixed(2).replace(".", ",");
}

function getAssinaturaStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "ativa":
      return "Ativa";
    case "vencida":
      return "Vencida";
    case "bloqueada":
      return "Bloqueada";
    default:
      return status || "—";
  }
}

function formatarDataLead(valor: string | null) {
  if (!valor) return "—";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}


export default function EmpresasPage() {
  const { permissoes } = useHeaderUser();
  const podeEditarEmpresas = permissoes.includes("empresas.editar");
  const podeAlterarStatusEmpresas = permissoes.includes(
    "empresas.alterar_status"
  );
  const podeAcessarTemporariamente = permissoes.includes(
    PERMISSAO_INTERNA_EMPRESAS
  );
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [nichos, setNichos] = useState<Nicho[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusEmpresa>("todos");
  const [filtroPlano, setFiltroPlano] = useState("todos");
  const [filtroNicho, setFiltroNicho] = useState("todos");

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");
  const [mostrarApiKey, setMostrarApiKey] = useState(false);
  const [mostrarWebhookSecret, setMostrarWebhookSecret] = useState(false);
  const [alterandoApiKey, setAlterandoApiKey] = useState(false);
  const [alterandoWebhookSecret, setAlterandoWebhookSecret] = useState(false);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [reenviandoAcessoId, setReenviandoAcessoId] = useState<string | null>(null);
  const [acessandoEmpresaId, setAcessandoEmpresaId] = useState<string | null>(null);
  const [empresaEmailModal, setEmpresaEmailModal] = useState<Empresa | null>(null);
  const [novoEmailAcesso, setNovoEmailAcesso] = useState("");
  const [emailSuspeitoConfirmado, setEmailSuspeitoConfirmado] = useState(false);
  const [corrigindoEmailAcesso, setCorrigindoEmailAcesso] = useState(false);
  const [erroEmailAcesso, setErroEmailAcesso] = useState("");
  const [empresaRenovacaoModal, setEmpresaRenovacaoModal] = useState<Empresa | null>(null);
  const [valorRenovacao, setValorRenovacao] = useState("");
  const [confirmouRenovacao, setConfirmouRenovacao] = useState(false);
  const [renovandoMensalidade, setRenovandoMensalidade] = useState(false);
  const [erroRenovacao, setErroRenovacao] = useState("");
  const [empresaTokensModal, setEmpresaTokensModal] = useState<Empresa | null>(null);
  const [acaoTokens, setAcaoTokens] = useState<
    "restaurar_mensal" | "adicionar_avulso"
  >("adicionar_avulso");
  const [quantidadeTokensExtras, setQuantidadeTokensExtras] = useState("100000");
  const [motivoTokens, setMotivoTokens] = useState("");
  const [ajustandoTokens, setAjustandoTokens] = useState(false);
  const [leadsModalAberto, setLeadsModalAberto] = useState(false);
  const [leadsEmpresa, setLeadsEmpresa] = useState<LeadEmpresa[]>([]);
  const [leadsCarregando, setLeadsCarregando] = useState(false);
  const [leadsErro, setLeadsErro] = useState("");
  const [leadsPagina, setLeadsPagina] = useState(1);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsTotalPaginas, setLeadsTotalPaginas] = useState(1);
  const [empresaExclusaoModal, setEmpresaExclusaoModal] = useState<Empresa | null>(null);
  const [impactoExclusao, setImpactoExclusao] = useState<ImpactoExclusaoEmpresa | null>(null);
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState("");
  const [confirmouBackupBaixado, setConfirmouBackupBaixado] = useState(false);
  const [carregandoExclusao, setCarregandoExclusao] = useState(false);
  const [excluindoEmpresa, setExcluindoEmpresa] = useState(false);
  const [erroExclusao, setErroExclusao] = useState("");
  const [operandoEncerramentoId, setOperandoEncerramentoId] = useState<string | null>(null);
  const [arquivosBackup, setArquivosBackup] = useState<Record<string, Array<{nome:string;bytes:number;sha256:string;url:string}>>>({});
  const [progressoBackup, setProgressoBackup] = useState<Record<string,number>>({});

  const [editNomeFantasia, setEditNomeFantasia] = useState("");
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editDocumento, setEditDocumento] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editNomeResponsavel, setEditNomeResponsavel] = useState("");
  const [editPlanoId, setEditPlanoId] = useState("");
  const [editLimiteWhatsapp, setEditLimiteWhatsapp] = useState("1");
  const [editLimiteUsuarios, setEditLimiteUsuarios] = useState("2");
  const [editNichoId, setEditNichoId] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/Sao_Paulo");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editStatus, setEditStatus] = useState<StatusEmpresa>("ativa");
  const [emailMarketingConfig, setEmailMarketingConfig] = useState({
    habilitado: false,
    dominio: "",
    remetente_nome: "",
    remetente_email: "",
    api_key_configurada: false,
    webhook_configurado: false,
    webhook_url: "",
    api_key_mascarada: null as string | null,
    webhook_mascarado: null as string | null,
  });
  const [emailMarketingApiKey, setEmailMarketingApiKey] = useState("");
  const [emailMarketingWebhookSecret, setEmailMarketingWebhookSecret] = useState("");
  const [carregandoEmailMarketing, setCarregandoEmailMarketing] = useState(false);
  const [emailMarketingCarregado, setEmailMarketingCarregado] = useState(false);

  async function carregarEmailMarketingEmpresa(empresaId: string): Promise<boolean> {
    setEmailMarketingCarregado(false);
    setCarregandoEmailMarketing(true);
    try {
      const response = await fetch(`/api/empresas/${empresaId}/email-marketing`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.configuracao) {
        throw new Error(data.error || "Erro ao consultar configuração.");
      }
      setEmailMarketingConfig(data.configuracao);
      setEmailMarketingCarregado(true);
      setEmailMarketingApiKey("");
      setEmailMarketingWebhookSecret("");
      setMostrarApiKey(false);
      setMostrarWebhookSecret(false);
      setAlterandoApiKey(false);
      setAlterandoWebhookSecret(false);
      return true;
    } catch (error) {
      setEmailMarketingCarregado(false);
      setErroEdicao(error instanceof Error ? error.message : "Erro ao carregar E-mail Marketing.");
      return false;
    } finally {
      setCarregandoEmailMarketing(false);
    }
  }

  async function carregarEmpresas() {
    setErro("");

    const res = await fetch("/api/empresas", { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      setErro(data.error || "Erro ao carregar empresas");
      return;
    }

    setEmpresas(data.empresas || []);
  }

  async function carregarPlanos() {
    const res = await fetch("/api/planos", { cache: "no-store" });

    if (!res.ok) return;

    const data = await res.json();
    setPlanos(data.planos || []);
  }

  async function carregarNichos() {
    const res = await fetch("/api/nichos", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setNichos(data.nichos || []);
  }

  function iniciarEdicao(empresa: Empresa) {
    const limiteWhatsappPlano =
      empresa.planos?.limite_integracoes_whatsapp ?? 1;
    const limiteUsuariosPlano = empresa.planos?.limite_usuarios ?? 2;

    setEditandoId(empresa.id);
    setErroEdicao("");
    setMostrarApiKey(false);
    setMostrarWebhookSecret(false);
    setAlterandoApiKey(false);
    setAlterandoWebhookSecret(false);
    setEmailMarketingCarregado(false);
    setEmailMarketingApiKey("");
    setEmailMarketingWebhookSecret("");
    setEmailMarketingConfig({
      habilitado: false, dominio: "", remetente_nome: "", remetente_email: "",
      api_key_configurada: false, webhook_configurado: false, webhook_url: "",
      api_key_mascarada: null, webhook_mascarado: null,
    });
    setEditNomeFantasia(empresa.nome_fantasia);
    setEditRazaoSocial(empresa.razao_social || "");
    setEditDocumento(empresa.documento || "");
    setEditEmail(empresa.email);
    setEditTelefone(empresa.telefone || "");
    setEditNomeResponsavel(empresa.nome_responsavel || "");
    setEditPlanoId(empresa.plano_id);
    setEditLimiteWhatsapp(
      String(empresa.limite_integracoes_whatsapp ?? limiteWhatsappPlano)
    );
    setEditLimiteUsuarios(
      String(empresa.limite_usuarios ?? limiteUsuariosPlano)
    );
    setEditNichoId(empresa.nicho_id);
    setEditTimezone(empresa.timezone || "America/Sao_Paulo");
    setEditLogoUrl(empresa.logo_url || "");
    setEditObservacoes(empresa.observacoes || "");
    setEditStatus(empresa.status);
    void carregarEmailMarketingEmpresa(empresa.id);
    setMensagem("");
    setErro("");
  }

  function alterarPlanoEdicao(novoPlanoId: string) {
    const plano = planos.find((item) => item.id === novoPlanoId);
    const limiteWhatsappPlano = plano?.limite_integracoes_whatsapp ?? 1;
    const limiteUsuariosPlano = plano?.limite_usuarios ?? 2;

    setEditPlanoId(novoPlanoId);
    setEditLimiteWhatsapp((atual) =>
      String(Math.max(Number(atual) || 1, limiteWhatsappPlano))
    );
    setEditLimiteUsuarios((atual) =>
      String(Math.max(Number(atual) || 1, limiteUsuariosPlano))
    );
  }

  function cancelarEdicao() {
    if (salvandoEdicao) return;
    setEditandoId(null);
    setAlterandoApiKey(false);
    setAlterandoWebhookSecret(false);
    setErroEdicao("");
    setEmailMarketingApiKey("");
    setEmailMarketingWebhookSecret("");
    setMostrarApiKey(false);
    setMostrarWebhookSecret(false);
  }

  async function persistirEmailMarketing(empresaId: string) {
    const response = await fetch(`/api/empresas/${empresaId}/email-marketing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        habilitado: emailMarketingConfig.habilitado,
        dominio: emailMarketingConfig.dominio,
        remetente_nome: emailMarketingConfig.remetente_nome,
        remetente_email: emailMarketingConfig.remetente_email,
        api_key: emailMarketingApiKey,
        webhook_secret: emailMarketingWebhookSecret,
      }),
    });
    const resultado = await response.json().catch(() => ({}));
    if (!response.ok || !resultado.ok) {
      throw new Error(resultado.error || "Não foi possível salvar o E-mail Marketing.");
    }
  }

  async function salvarEdicao() {
    if (!editandoId || salvandoEdicao || carregandoEmailMarketing || !emailMarketingCarregado) return;
    setErroEdicao("");
    setMensagem("");
    setSalvandoEdicao(true);
    try {
      const response = await fetch(`/api/empresas/${editandoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome_fantasia: editNomeFantasia, razao_social: editRazaoSocial,
          documento: editDocumento, email: editEmail, telefone: editTelefone,
          nome_responsavel: editNomeResponsavel, plano_id: editPlanoId,
          limite_integracoes_whatsapp: Number(editLimiteWhatsapp),
          limite_usuarios: Number(editLimiteUsuarios), nicho_id: editNichoId,
          timezone: editTimezone, logo_url: editLogoUrl,
          observacoes: editObservacoes, status: editStatus,
        }),
      });
      const resultadoEmpresa = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErroEdicao(resultadoEmpresa.error || "Não foi possível salvar a empresa.");
        return;
      }

      try {
        await persistirEmailMarketing(editandoId);
      } catch (error) {
        setErroEdicao(
          "Os dados da empresa foram salvos, mas o E-mail Marketing não: " +
          (error instanceof Error ? error.message : "Verifique a configuração informada.")
        );
        await carregarEmpresas();
        return;
      }
      setEmailMarketingApiKey("");
      setEmailMarketingWebhookSecret("");
      setMensagem("Empresa e E-mail Marketing salvos com sucesso.");
      setEditandoId(null);
      await carregarEmpresas();
    } catch {
      setErroEdicao("Erro de comunicação ao salvar. Confira os dados e tente novamente.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function atualizarLinksBackup(empresaId: string) {
    try {
      const resposta=await fetch(`/api/empresas/${empresaId}/backup`,{cache:"no-store"});
      const download=await resposta.json();
      if(!resposta.ok || !download.ok || !Array.isArray(download.partes))
        throw new Error(download.error||"Não foi possível abrir os arquivos do backup.");
      setArquivosBackup((atual)=>({...atual,[empresaId]:download.partes}));
    } catch(error) {
      setArquivosBackup((atual)=>({...atual,[empresaId]:[]}));
      setErro(error instanceof Error?error.message:"Falha ao recuperar o backup.");
    }
  }

  function toggleExpandir(empresaId: string) {
    const abrindo=expandidoId!==empresaId;
    setExpandidoId(abrindo?empresaId:null);
    const empresa=empresas.find((item)=>item.id===empresaId);
    if(abrindo && empresa?.status==="cancelada" && empresa.encerramento_backup_estado==="pronto"){
      void atualizarLinksBackup(empresaId);
    }
  }

  async function reenviarPrimeiroAcessoAlternativo(empresa: Empresa) {
    const confirmado = window.confirm(
      `Enviar o acesso alternativo para ${empresa.email}? O link de primeiro acesso padrão continuará válido até ser utilizado ou expirar.`
    );

    if (!confirmado) return;

    setMensagem("");
    setErro("");
    setReenviandoAcessoId(empresa.id);

    try {
      const response = await fetch(
        `/api/empresas/${empresa.id}/reenviar-primeiro-acesso-alternativo`,
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível enviar o acesso alternativo.");
        return;
      }

      setMensagem(
        data.message ||
          `Acesso alternativo enviado para ${empresa.email} com sucesso.`
      );
    } catch {
      setErro("Não foi possível enviar o acesso alternativo.");
    } finally {
      setReenviandoAcessoId(null);
    }
  }

  function abrirCorrecaoEmailAcesso(empresa: Empresa) {
    setEmpresaEmailModal(empresa);
    setNovoEmailAcesso("");
    setEmailSuspeitoConfirmado(false);
    setErroEmailAcesso("");
    setMensagem("");
    setErro("");
  }

  function fecharCorrecaoEmailAcesso() {
    if (corrigindoEmailAcesso) return;
    setEmpresaEmailModal(null);
    setNovoEmailAcesso("");
    setEmailSuspeitoConfirmado(false);
    setErroEmailAcesso("");
  }

  async function confirmarCorrecaoEmailAcesso() {
    if (!empresaEmailModal || corrigindoEmailAcesso) return;

    const novoEmail = novoEmailAcesso.trim().toLowerCase();

    if (!isValidBuyerEmail(novoEmail)) {
      setErroEmailAcesso("Informe um e-mail válido.");
      return;
    }

    if (novoEmail === empresaEmailModal.email.trim().toLowerCase()) {
      setErroEmailAcesso("Informe um e-mail diferente do atual.");
      return;
    }

    const sugestao = getBuyerEmailSuggestion(novoEmail);
    if (sugestao && !emailSuspeitoConfirmado) {
      setErroEmailAcesso(
        `Confira o novo e-mail. Você quis dizer ${sugestao}?`
      );
      return;
    }

    setCorrigindoEmailAcesso(true);
    setErroEmailAcesso("");
    setMensagem("");
    setErro("");

    try {
      const response = await fetch(
        `/api/empresas/${empresaEmailModal.id}/corrigir-email-acesso`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            novo_email: novoEmail,
            confirmar_email_suspeito: emailSuspeitoConfirmado,
          }),
        }
      );
      const data = await response.json();

      if (data?.email_sugerido && data?.requer_confirmacao_email) {
        setEmailSuspeitoConfirmado(false);
        setErroEmailAcesso(
          data.error || `Confira o e-mail. Você quis dizer ${data.email_sugerido}?`
        );
        return;
      }

      if (data?.email_corrigido) {
        setEmpresas((atuais) =>
          atuais.map((empresa) =>
            empresa.id === empresaEmailModal.id
              ? { ...empresa, email: novoEmail }
              : empresa
          )
        );
      }

      if (!response.ok || !data?.ok) {
        setErroEmailAcesso(
          data?.error || "Não foi possível corrigir o e-mail de acesso."
        );
        return;
      }

      setEmpresas((atuais) =>
        atuais.map((empresa) =>
          empresa.id === empresaEmailModal.id
            ? { ...empresa, email: data.email || novoEmail }
            : empresa
        )
      );
      setMensagem(
        data.message ||
          "E-mail de acesso corrigido e sincronizado com sucesso."
      );
      setEmpresaEmailModal(null);
      setNovoEmailAcesso("");
      setEmailSuspeitoConfirmado(false);
      await carregarEmpresas();
    } catch {
      setErroEmailAcesso("Não foi possível corrigir o e-mail de acesso.");
    } finally {
      setCorrigindoEmailAcesso(false);
    }
  }

  async function acessarTemporariamente(empresa: Empresa) {
    const confirmado = window.confirm(
      `Iniciar uma sessão administrativa temporária para ${empresa.nome_fantasia}? A sessão dura 30 minutos, não altera a senha do cliente e fica registrada na auditoria.`
    );

    if (!confirmado) return;

    setMensagem("");
    setErro("");
    setAcessandoEmpresaId(empresa.id);

    try {
      const response = await fetch("/api/empresas/acesso-temporario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa.id }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível iniciar a sessão temporária.");
        return;
      }

      window.location.assign(data.redirect || "/painel/ao-vivo");
    } catch {
      setErro("Não foi possível iniciar a sessão temporária.");
    } finally {
      setAcessandoEmpresaId(null);
    }
  }

  function abrirRenovacaoMensalidade(empresa: Empresa) {
    setEmpresaRenovacaoModal(empresa);
    setValorRenovacao(
      valorCentavosParaInput(empresa.planos?.preco_mensal_centavos)
    );
    setConfirmouRenovacao(false);
    setErroRenovacao("");
    setMensagem("");
    setErro("");
  }

  function fecharRenovacaoMensalidade() {
    if (renovandoMensalidade) return;
    setEmpresaRenovacaoModal(null);
    setValorRenovacao("");
    setConfirmouRenovacao(false);
    setErroRenovacao("");
  }

  async function confirmarRenovacaoMensalidade() {
    if (!empresaRenovacaoModal || renovandoMensalidade) return;

    const valorCentavos = valorInputParaCentavos(valorRenovacao);

    if (!valorCentavos) {
      setErroRenovacao("Informe o valor pago da mensalidade.");
      return;
    }

    if (!confirmouRenovacao) {
      setErroRenovacao(
        "Confirme que o pagamento foi recebido antes de renovar."
      );
      return;
    }

    setRenovandoMensalidade(true);
    setErroRenovacao("");
    setMensagem("");
    setErro("");

    try {
      const response = await fetch(
        `/api/empresas/${empresaRenovacaoModal.id}/renovar-mensalidade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valor_centavos: valorCentavos,
            confirmado: true,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        setErroRenovacao(
          data?.error || "Não foi possível renovar a mensalidade."
        );
        return;
      }

      setMensagem(
        `Mensalidade de ${empresaRenovacaoModal.nome_fantasia} renovada manualmente até ${formatarDataAssinatura(
          data?.renovacao?.vencimento_em
        )}.`
      );
      setEmpresaRenovacaoModal(null);
      setValorRenovacao("");
      setConfirmouRenovacao(false);
      await carregarEmpresas();
    } catch {
      setErroRenovacao("Não foi possível renovar a mensalidade.");
    } finally {
      setRenovandoMensalidade(false);
    }
  }

  function abrirAjusteTokens(
    empresa: Empresa,
    acao: "restaurar_mensal" | "adicionar_avulso"
  ) {
    setEmpresaTokensModal(empresa);
    setAcaoTokens(acao);
    setQuantidadeTokensExtras("100000");
    setMotivoTokens("");
    setMensagem("");
    setErro("");
  }

  function fecharAjusteTokens() {
    if (ajustandoTokens) return;
    setEmpresaTokensModal(null);
  }

  async function confirmarAjusteTokens() {
    if (!empresaTokensModal || ajustandoTokens) return;

    const quantidade =
      acaoTokens === "adicionar_avulso"
        ? Number(quantidadeTokensExtras)
        : null;

    if (
      acaoTokens === "adicionar_avulso" &&
      (!Number.isSafeInteger(Number(quantidade)) || Number(quantidade) <= 0)
    ) {
      setErro("Informe uma quantidade válida de tokens extras.");
      return;
    }

    setAjustandoTokens(true);
    setMensagem("");
    setErro("");

    try {
      const response = await fetch(
        `/api/empresas/${empresaTokensModal.id}/tokens`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: acaoTokens,
            quantidade,
            motivo: motivoTokens,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErro(data.error || "Não foi possível ajustar os tokens.");
        return;
      }

      if (data.saldo) {
        setEmpresas((atuais) =>
          atuais.map((empresa) =>
            empresa.id === empresaTokensModal.id
              ? { ...empresa, empresa_tokens_ia: data.saldo }
              : empresa
          )
        );
      } else {
        await carregarEmpresas();
      }

      setMensagem(data.message || "Tokens ajustados com sucesso.");
      setEmpresaTokensModal(null);
    } catch {
      setErro("Não foi possível ajustar os tokens da empresa.");
    } finally {
      setAjustandoTokens(false);
    }
  }

  async function carregarLeads(pagina = 1) {
    setLeadsCarregando(true);
    setLeadsErro("");

    try {
      const response = await fetch(
        `/api/empresas/leads?page=${pagina}&limit=25`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setLeadsErro(data.error || "Não foi possível carregar os leads.");
        return;
      }

      setLeadsEmpresa(data.leads || []);
      setLeadsPagina(data.pagination?.page || pagina);
      setLeadsTotal(data.pagination?.total || 0);
      setLeadsTotalPaginas(data.pagination?.total_pages || 1);
    } catch {
      setLeadsErro("Não foi possível carregar os leads.");
    } finally {
      setLeadsCarregando(false);
    }
  }

  function abrirLeads() {
    setLeadsModalAberto(true);
    setLeadsEmpresa([]);
    setLeadsPagina(1);
    setLeadsTotal(0);
    setLeadsTotalPaginas(1);
    setLeadsErro("");
    void carregarLeads(1);
  }

  function fecharLeads() {
    if (leadsCarregando) return;
    setLeadsModalAberto(false);
    setLeadsEmpresa([]);
    setLeadsErro("");
  }

  function alterarPaginaLeads(novaPagina: number) {
    if (
      leadsCarregando ||
      novaPagina < 1 ||
      novaPagina > leadsTotalPaginas
    ) {
      return;
    }

    void carregarLeads(novaPagina);
  }

  async function baixarBackupEmpresa(empresa: Empresa) {
    if(operandoEncerramentoId)return;
    setOperandoEncerramentoId(empresa.id);
    setErro("");setMensagem("");
    try {
      if(empresa.encerramento_backup_estado!=="pronto"){
        // O processamento avança somente enquanto o administrador mantém esta ação em andamento.
        let terminou=false;
        for(let tentativa=0;tentativa<500;tentativa++){
          const response=await fetch(`/api/empresas/${empresa.id}/backup`,{method:"POST"});
          const json=await response.json();
          if(!response.ok || !json.ok)throw new Error(json.error||"Falha ao preparar backup.");
          setProgressoBackup((anterior)=>({...anterior,[empresa.id]:Number(json.partes||0)}));
          if(json.concluido){terminou=true;break;}
        }
        if(!terminou)throw new Error("O backup possui muitas partes. Clique novamente para continuar.");
      }
      const resposta=await fetch(`/api/empresas/${empresa.id}/backup`,{cache:"no-store"});
      const download=await resposta.json();
      if(!resposta.ok || !download.ok || !Array.isArray(download.partes))
        throw new Error(download.error||"Backup indisponível.");
      setArquivosBackup((anterior)=>({...anterior,[empresa.id]:download.partes}));
      setMensagem(download.partes.length===1
        ? "Backup pronto. Clique em Baixar arquivo."
        : `Backup dividido em ${download.partes.length} arquivos. Baixe todas as partes.`);
      await carregarEmpresas();
    }catch(error){
      setErro(error instanceof Error?error.message:"Erro ao baixar backup.");
      await carregarEmpresas();
    }finally{
      setOperandoEncerramentoId(null);
    }
  }

  async function restaurarClienteCancelado(empresa: Empresa) {
    if (operandoEncerramentoId) return;
    if (!window.confirm(`Restaurar ${empresa.nome_fantasia}? Os usuários voltarão a acessar o CRM, mas o plano permanecerá BLOQUEADO por pendência financeira até uma nova renovação. WhatsApp e automações precisarão ser reconfigurados.`)) return;
    setOperandoEncerramentoId(empresa.id);
    setErro("");
    try {
      const resposta = await fetch(`/api/empresas/${empresa.id}/encerramento`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({confirmacao: empresa.nome_fantasia}),
      });
      const resultado = await resposta.json();
      if (!resposta.ok || !resultado.ok) throw new Error(resultado.error || "Não foi possível restaurar.");
      setMensagem(resultado.message || "Empresa restaurada com bloqueio financeiro.");
      await carregarEmpresas();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao restaurar cliente.");
    } finally {
      setOperandoEncerramentoId(null);
    }
  }

  async function abrirExclusaoEmpresa(empresa: Empresa) {
    setEmpresaExclusaoModal(empresa);
    setImpactoExclusao(null);
    setConfirmacaoExclusao("");
    setConfirmouBackupBaixado(false);
    setErroExclusao("");
    setCarregandoExclusao(true);

    try {
      const response = await fetch(
        `/api/empresas/${empresa.id}/exclusao-definitiva`,
        { cache: "no-store" }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErroExclusao(
          data.error || "Não foi possível calcular o impacto da exclusão."
        );
        return;
      }

      setImpactoExclusao(data.impacto || null);
    } catch {
      setErroExclusao("Não foi possível calcular o impacto da exclusão.");
    } finally {
      setCarregandoExclusao(false);
    }
  }

  function fecharExclusaoEmpresa() {
    if (excluindoEmpresa) return;
    setEmpresaExclusaoModal(null);
    setImpactoExclusao(null);
    setConfirmacaoExclusao("");
    setErroExclusao("");
  }

  async function confirmarExclusaoEmpresa() {
    if (
      !empresaExclusaoModal ||
      excluindoEmpresa ||
      confirmacaoExclusao.trim() !== empresaExclusaoModal.nome_fantasia.trim() ||
      (empresaExclusaoModal.status === "cancelada" &&
        Boolean(empresaExclusaoModal.exclusao_prevista_em) &&
        new Date(empresaExclusaoModal.exclusao_prevista_em!).getTime() > Date.now() &&
        !confirmouBackupBaixado)
    ) {
      return;
    }

    setExcluindoEmpresa(true);
    setErroExclusao("");
    setMensagem("");
    setErro("");

    try {
      const encerramentoInicial = empresaExclusaoModal.status !== "cancelada";
      const response = await fetch(
        `/api/empresas/${empresaExclusaoModal.id}/${encerramentoInicial ? "encerramento" : "exclusao-definitiva"}`,
        {
          method: encerramentoInicial ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmacao: confirmacaoExclusao.trim(),
            confirmacao_backup_baixado: confirmouBackupBaixado,
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErroExclusao(data.error || "Não foi possível excluir a empresa.");
        return;
      }

      if (encerramentoInicial) {
        await carregarEmpresas();
      } else {
        setEmpresas((atuais) =>
          atuais.filter((empresa) => empresa.id !== empresaExclusaoModal.id)
        );
      }

      if (expandidoId === empresaExclusaoModal.id) {
        setExpandidoId(null);
      }

      if (editandoId === empresaExclusaoModal.id) {
        setEditandoId(null);
      }

      const avisos = [
        ...(Array.isArray(data.avisos) ? data.avisos.filter(Boolean) : []),
        ...(data.resultado?.warning ? [data.resultado.warning] : []),
      ];

      setMensagem(
        avisos.length > 0
          ? `${data.message} Aviso: ${avisos.join(" ")}`
          : data.message || "Empresa excluída definitivamente."
      );

      setEmpresaExclusaoModal(null);
      setImpactoExclusao(null);
      setConfirmacaoExclusao("");
    } catch {
      setErroExclusao("Não foi possível excluir a empresa.");
    } finally {
      setExcluindoEmpresa(false);
    }
  }

  useEffect(() => {
    carregarEmpresas();
    carregarPlanos();
    carregarNichos();
  }, []);

  useEffect(() => {
    if (empresas.length === 0 || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("acao") !== "corrigir-email") return;

    const empresaId = params.get("empresa");
    if (!empresaId) return;

    const empresa = empresas.find((item) => item.id === empresaId);
    if (!empresa) return;

    setBusca("");
    setFiltroStatus("todos");
    setFiltroPlano("todos");
    setFiltroNicho("todos");
    setExpandidoId(empresa.id);
    abrirCorrecaoEmailAcesso(empresa);

    params.delete("acao");
    params.delete("empresa");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`
    );

    window.setTimeout(() => {
      document
        .querySelector(`[data-company-id="${empresa.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [empresas]);

  useEffect(() => {
    if (!leadsModalAberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function fecharComEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !leadsCarregando) {
        setLeadsModalAberto(false);
      }
    }

    window.addEventListener("keydown", fecharComEscape);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", fecharComEscape);
    };
  }, [leadsModalAberto, leadsCarregando]);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");

    return empresas.filter((empresa) => {
      const correspondeBusca =
        !termo ||
        [
          empresa.nome_fantasia,
          empresa.razao_social,
          empresa.documento,
          empresa.email,
          empresa.telefone,
          empresa.nome_responsavel,
          empresa.planos?.nome,
          empresa.nichos?.nome,
        ]
          .filter(Boolean)
          .some((valor) =>
            String(valor).toLocaleLowerCase("pt-BR").includes(termo)
          );

      const correspondeStatus =
        filtroStatus === "todos" || getStatusVisual(empresa) === filtroStatus;
      const correspondePlano =
        filtroPlano === "todos" || empresa.plano_id === filtroPlano;
      const correspondeNicho =
        filtroNicho === "todos" || empresa.nicho_id === filtroNicho;

      return (
        correspondeBusca &&
        correspondeStatus &&
        correspondePlano &&
        correspondeNicho
      );
    });
  }, [busca, empresas, filtroNicho, filtroPlano, filtroStatus]);

  const empresaEditando = empresas.find((empresa) => empresa.id === editandoId) || null;
  const planoEmpresaEditando = planos.find((plano) => plano.id === editPlanoId);
  const limiteWhatsappPlano = Math.max(
    1, planoEmpresaEditando?.limite_integracoes_whatsapp ??
      empresaEditando?.planos?.limite_integracoes_whatsapp ?? 1
  );
  const limiteUsuariosPlano = Math.max(
    1, planoEmpresaEditando?.limite_usuarios ??
      empresaEditando?.planos?.limite_usuarios ?? 2
  );

  useEffect(() => {
    if (!editandoId) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [editandoId]);

  const filtrosAtivos =
    Boolean(busca.trim()) ||
    filtroStatus !== "todos" ||
    filtroPlano !== "todos" ||
    filtroNicho !== "todos";

  function limparFiltros() {
    setBusca("");
    setFiltroStatus("todos");
    setFiltroPlano("todos");
    setFiltroNicho("todos");
  }

  return (
    <>
      <Header
        title="Empresas"
        subtitle="Consulte, filtre e gerencie as empresas cadastradas no CRM."
      />

      <div className={styles.pageContent}>
        <FeedbackToast
          success={mensagem}
          onSuccessDismiss={() => setMensagem("")}
        />
        {erro && <div className={styles.alertError}>{erro}</div>}

        <section className={styles.card}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Gestão</p>
              <h2 className={styles.cardTitle}>Empresas cadastradas</h2>
              <p className={styles.cardDescription}>
                Use a busca e os filtros para localizar rapidamente uma empresa
                e expanda o card para visualizar ou editar os dados.
              </p>
            </div>

            <span className={styles.infoBadge}>
              {empresasFiltradas.length} de {empresas.length} empresa(s)
            </span>
          </div>

          <div className={styles.filtersPanel}>
            <div className={styles.searchField}>
              <label className={styles.filterLabel} htmlFor="busca-empresa">
                Buscar empresa
              </label>
              <input
                id="busca-empresa"
                className={styles.input}
                type="search"
                placeholder="Nome, e-mail, documento, telefone ou responsável..."
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filtro-status">
                Status
              </label>
              <select
                id="filtro-status"
                className={styles.select}
                value={filtroStatus}
                onChange={(event) =>
                  setFiltroStatus(
                    event.target.value as FiltroStatusEmpresa
                  )
                }
              >
                <option value="todos">Todos</option>
                <option value="ativa">Ativas</option>
                <option value="vencida">Vencidos</option>
                <option value="bloqueada">Bloqueados</option>
                <option value="cancelada">Canceladas</option>
                <option value="excluida">Excluídas</option>
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filtro-plano">
                Plano
              </label>
              <select
                id="filtro-plano"
                className={styles.select}
                value={filtroPlano}
                onChange={(event) => setFiltroPlano(event.target.value)}
              >
                <option value="todos">Todos os planos</option>
                {planos.map((plano) => (
                  <option key={plano.id} value={plano.id}>
                    {plano.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="filtro-segmento">
                Segmento
              </label>
              <select
                id="filtro-segmento"
                className={styles.select}
                value={filtroNicho}
                onChange={(event) => setFiltroNicho(event.target.value)}
              >
                <option value="todos">Todos os segmentos</option>
                {nichos.map((nicho) => (
                  <option key={nicho.id} value={nicho.id}>
                    {nicho.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={limparFiltros}
                disabled={!filtrosAtivos}
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {empresas.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma empresa cadastrada ainda.
            </div>
          ) : empresasFiltradas.length === 0 ? (
            <div className={styles.emptyState}>
              Nenhuma empresa encontrada com os filtros selecionados.
            </div>
          ) : (
            <div className={styles.list}>
              {empresasFiltradas.map((empresa) => {
                const expandido = expandidoId === empresa.id;
                const editando = editandoId === empresa.id;
                const planoEdicao = planos.find(
                  (plano) => plano.id === editPlanoId
                );
                const limiteWhatsappPlano = Math.max(
                  1,
                  planoEdicao?.limite_integracoes_whatsapp ??
                    empresa.planos?.limite_integracoes_whatsapp ??
                    1
                );
                const limiteUsuariosPlano = Math.max(
                  1,
                  planoEdicao?.limite_usuarios ??
                    empresa.planos?.limite_usuarios ??
                    2
                );
                const limiteWhatsappEfetivo =
                  empresa.limite_integracoes_whatsapp ??
                  empresa.planos?.limite_integracoes_whatsapp ??
                  1;
                const limiteUsuariosEfetivo =
                  empresa.limite_usuarios ??
                  empresa.planos?.limite_usuarios ??
                  2;
                const saldoTokensEmpresa = getSaldoTokensEmpresa(empresa);
                const saldoMensalTokens =
                  saldoTokensEmpresa?.saldo_mensal_restante ?? 0;
                const saldoAvulsoTokens =
                  saldoTokensEmpresa?.saldo_avulso_restante ?? 0;
                const totalTokensDisponiveis =
                  empresa.assinatura_status === "ativa"
                    ? saldoMensalTokens + saldoAvulsoTokens
                    : 0;

                return (
                  <article
                    key={empresa.id}
                    data-company-id={empresa.id}
                    className={`${styles.itemCard} ${empresa.status === "cancelada" ? styles.itemCardCancelled : ""} ${empresa.status === "excluida" ? styles.itemCardDeleted : ""}`}
                  >
                    <div className={styles.itemSummary}>
                      <div className={styles.itemLeft}>
                        <div className={styles.avatar}>
                          {getIniciais(empresa.nome_fantasia)}
                        </div>

                        <div className={styles.itemIdentity}>
                          <div className={styles.itemTopRow}>
                            <h3 className={styles.itemTitle}>
                              {empresa.nome_fantasia}
                            </h3>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(
                                getStatusVisual(empresa)
                              )}`}
                            >
                              {getStatusLabel(getStatusVisual(empresa))}
                            </span>
                          </div>

                          {empresa.status !== "excluida" && <p className={styles.itemSubline}>{empresa.email}</p>}

                          {empresa.status !== "excluida" && <div className={styles.summaryMeta}>
                            <span className={styles.metaItem}>
                              <strong>Plano:</strong> {empresa.planos?.nome ?? "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Segmento:</strong>{" "}
                              {empresa.nichos?.nome ?? "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Responsável:</strong>{" "}
                              {empresa.nome_responsavel ?? "—"}
                            </span>
                            <span className={styles.metaItem}>
                              <strong>Timezone:</strong> {empresa.timezone || "—"}
                            </span>
                          </div>}
                          {empresa.status === "excluida" && (
                            <div className={styles.summaryMeta}>
                              <span className={styles.metaItem}>Registro histórico · somente consulta</span>
                              <span className={styles.metaItem}>Excluída em {formatarDataAssinatura(empresa.excluida_em)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={styles.itemRight}>
                        {!editando && podeAcessarTemporariamente && empresa.status !== "cancelada" && empresa.status !== "excluida" && (
                          <div className={styles.itemPrimaryActions}>
                            <button
                              type="button"
                              onClick={() => acessarTemporariamente(empresa)}
                              className={styles.supportButton}
                              disabled={acessandoEmpresaId === empresa.id}
                            >
                              {acessandoEmpresaId === empresa.id
                                ? "Acessando..."
                                : "Acessar ambiente"}
                            </button>

                            {podeEditarEmpresas && (
                              <button
                                type="button"
                                onClick={() =>
                                  abrirRenovacaoMensalidade(empresa)
                                }
                                className={styles.renewalButton}
                              >
                                Renovar mensalidade
                              </button>
                            )}
                          </div>
                        )}

                        {!editando && podeEditarEmpresas && (
                          <div className={styles.itemSecondaryActions}>
                            <button
                              onClick={() => toggleExpandir(empresa.id)}
                              className={styles.secondaryButton}
                            >
                              {expandido ? "Recolher" : "Expandir"}
                            </button>

                            {empresa.status !== "cancelada" && empresa.status !== "excluida" && (
                              <button
                                type="button"
                                onClick={() => iniciarEdicao(empresa)}
                                className={styles.secondaryButton}
                              >
                                Editar
                              </button>
                            )}

                            {podeAcessarTemporariamente && empresa.status !== "cancelada" && empresa.status !== "excluida" && (
                              <button
                                type="button"
                                onClick={() => abrirExclusaoEmpresa(empresa)}
                                className={styles.dangerOutlineButton}
                              >
                                Encerrar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {expandido && empresa.status !== "excluida" && (
                      <div className={styles.itemExpanded}>
                        <div className={styles.subscriptionDatesBar} aria-label="Datas da assinatura">
                          <div className={styles.subscriptionDateCard}>
                            <div className={styles.subscriptionDateIcon}>
                              <CalendarClock size={18} aria-hidden="true"/>
                            </div>
                            <div className={styles.subscriptionDateText}>
                              <span>Data de início do plano</span>
                              <strong>{formatarSomenteDataAssinatura(empresa.assinatura_inicio_em)}</strong>
                            </div>
                          </div>
                          <div className={styles.subscriptionDateCard}>
                            <div className={styles.subscriptionDateIcon}>
                              <CalendarClock size={18} aria-hidden="true"/>
                            </div>
                            <div className={styles.subscriptionDateText}>
                              <span>Data de vencimento do plano</span>
                              <strong>{formatarSomenteDataAssinatura(empresa.assinatura_vencimento_em)}</strong>
                            </div>
                          </div>
                        </div>
                        <div className={styles.detailsGrid}>
                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Razão social</span>
                              <span className={styles.infoValue}>
                                {empresa.razao_social || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Documento</span>
                              <span className={styles.infoValue}>
                                {empresa.documento || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Telefone</span>
                              <span className={styles.infoValue}>
                                {empresa.telefone || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Plano</span>
                              <span className={styles.infoValue}>
                                {empresa.planos?.nome ?? "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Números WhatsApp
                              </span>
                              <span className={styles.infoValue}>
                                {limiteWhatsappEfetivo}
                                {empresa.limite_integracoes_whatsapp !== null
                                  ? " (liberação comercial)"
                                  : " (plano)"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>
                                Usuários liberados
                              </span>
                              <span className={styles.infoValue}>
                                {limiteUsuariosEfetivo}
                                {empresa.limite_usuarios !== null
                                  ? " (liberação comercial)"
                                  : " (plano)"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Timezone</span>
                              <span className={styles.infoValue}>
                                {empresa.timezone || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlock}>
                              <span className={styles.infoLabel}>Logo URL</span>
                              <span className={styles.infoValue}>
                                {empresa.logo_url || "—"}
                              </span>
                            </div>

                            <div className={styles.infoBlockFull}>
                              <span className={styles.infoLabel}>Observações</span>
                              <span className={styles.infoValue}>
                                {empresa.observacoes || "Sem observações"}
                              </span>
                            </div>

                            {podeEditarEmpresas && empresa.status !== "cancelada" && (
                              <div className={styles.tokensManagementBlock}>
                                <div className={styles.tokensManagementHeader}>
                                  <div>
                                    <span className={styles.infoLabel}>
                                      Tokens de IA
                                    </span>
                                    <strong className={styles.tokensManagementTitle}>
                                      Gerenciar saldo da empresa
                                    </strong>
                                    <p className={styles.tokensManagementDescription}>
                                      Restaure a franquia mensal ou conceda saldo
                                      avulso sem alterar plano, vencimento ou pagamento.
                                    </p>
                                  </div>

                                  <span className={styles.tokensTotalBadge}>
                                    {formatarTokens(totalTokensDisponiveis)} disponíveis
                                  </span>
                                </div>

                                <div className={styles.tokensStatsGrid}>
                                  <div>
                                    <span>Franquia</span>
                                    <strong>
                                      {formatarTokens(
                                        saldoTokensEmpresa?.limite_mensal
                                      )}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Mensal restante</span>
                                    <strong>
                                      {formatarTokens(
                                        saldoTokensEmpresa?.saldo_mensal_restante
                                      )}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Saldo avulso</span>
                                    <strong>
                                      {formatarTokens(
                                        saldoTokensEmpresa?.saldo_avulso_restante
                                      )}
                                    </strong>
                                  </div>
                                </div>

                                <div className={styles.tokensManagementActions}>
                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() =>
                                      abrirAjusteTokens(
                                        empresa,
                                        "restaurar_mensal"
                                      )
                                    }
                                  >
                                    Restaurar tokens mensais
                                  </button>

                                  <button
                                    type="button"
                                    className={styles.primaryButton}
                                    onClick={() =>
                                      abrirAjusteTokens(
                                        empresa,
                                        "adicionar_avulso"
                                      )
                                    }
                                  >
                                    Adicionar tokens extras
                                  </button>
                                </div>
                              </div>
                            )}

                            {podeEditarEmpresas && (
                              <div className={styles.accessBlock}>
                                <div>
                                  <span className={styles.infoLabel}>
                                    Acesso e e-mail
                                  </span>
                                  <span className={styles.infoValue}>
                                    Corrija o e-mail de acesso de forma sincronizada
                                    ou envie o modelo alternativo do Supabase Auth
                                    como contingência.
                                  </span>
                                </div>

                                <div className={styles.accessActions}>
                                  {podeAcessarTemporariamente && (
                                    <button
                                      type="button"
                                      className={styles.primaryButton}
                                      onClick={() =>
                                        abrirCorrecaoEmailAcesso(empresa)
                                      }
                                    >
                                      Corrigir e-mail de acesso
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className={styles.secondaryButton}
                                    onClick={() =>
                                      reenviarPrimeiroAcessoAlternativo(empresa)
                                    }
                                    disabled={reenviandoAcessoId === empresa.id}
                                  >
                                    {reenviandoAcessoId === empresa.id
                                      ? "Enviando..."
                                      : "Reenviar primeiro acesso alternativo"}
                                  </button>
                                </div>
                              </div>
                            )}

                            {empresa.status === "cancelada" && (
                              <section className={styles.offboardingCard} aria-label="Encerramento da empresa">
                                <div className={styles.offboardingHeader}>
                                  <span className={styles.offboardingIcon} aria-hidden="true">
                                    <Archive size={21} strokeWidth={1.8} />
                                  </span>
                                  <div className={styles.offboardingIntro}>
                                    <span className={styles.offboardingEyebrow}>HISTÓRICO E ENCERRAMENTO</span>
                                    <h4>Empresa cancelada</h4>
                                    <p>
                                      Este registro permanece no CRM para consulta administrativa.
                                      Os acessos e envios foram interrompidos. O histórico fica disponível durante
                                      o período de retenção para exportação ou restauração.
                                    </p>
                                  </div>
                                  <span className={styles.offboardingState}>Encerrada</span>
                                </div>

                                <div className={styles.offboardingDataGrid}>
                                  <div className={styles.offboardingDataItem}>
                                    <span className={styles.offboardingDataLabel}>
                                      <CalendarClock size={15} /> Cancelado em
                                    </span>
                                    <strong>{empresa.cancelada_em ? formatarDataLead(empresa.cancelada_em) : "Data não registrada"}</strong>
                                    <small>Data do encerramento administrativo.</small>
                                  </div>
                                  <div className={styles.offboardingDataItem}>
                                    <span className={styles.offboardingDataLabel}><CalendarClock size={15}/> Início no CRM</span>
                                    <strong>{formatarDataAssinatura(empresa.created_at)}</strong>
                                    <small>Data do cadastro da empresa.</small>
                                  </div>
                                  <div className={styles.offboardingDataItem}>
                                    <span className={styles.offboardingDataLabel}>
                                      <CalendarClock size={15} /> Exclusão definitiva
                                    </span>
                                    <strong>{empresa.exclusao_prevista_em ? formatarDataLead(empresa.exclusao_prevista_em) : "Ainda não agendada"}</strong>
                                    <small>Exclusão na data indicada, ou antecipada com backup já baixado.</small>
                                  </div>
                                  <div className={styles.offboardingDataItem}>
                                    <span className={styles.offboardingDataLabel}>Origem da empresa</span>
                                    <strong>
                                      {empresa.white_label_id && empresa.white_label_tipo === "cliente"
                                        ? "Cliente White Label"
                                        : "Cliente CRM"}
                                    </strong>
                                    <small>Visível no painel administrativo Prosperity.</small>
                                  </div>
                                  <div className={styles.offboardingDataItem}>
                                    <span className={styles.offboardingDataLabel}><CalendarClock size={15}/> Backup solicitado em</span>
                                    <strong>{empresa.encerramento_backup_solicitado_em
                                      ? formatarDataAssinatura(empresa.encerramento_backup_solicitado_em)
                                      : "Não solicitado"}</strong>
                                    <small>A geração ocorre somente após solicitação.</small>
                                  </div>
                                </div>

                                <div className={styles.offboardingFooter}>
                                  <div className={styles.offboardingFooterCopy}>
                                    <strong>Gestão de dados e encerramento</strong>
                                    <p>
                                      {empresa.encerramento_backup_estado === "pronto"
                                        ? "Backup solicitado e gerado. Os arquivos ficam disponíveis até a data de exclusão."
                                        : empresa.encerramento_backup_estado === "erro"
                                          ? empresa.encerramento_backup_erro || "A geração não foi concluída; clique para retomar."
                                          : "O backup NÃO é automático. Solicite-o antes da data de exclusão definitiva indicada neste card. Após esse prazo, os dados operacionais são excluídos mesmo sem solicitação."}
                                      {operandoEncerramentoId === empresa.id && (
                                        <span> Partes preparadas: {progressoBackup[empresa.id] || 0}.</span>
                                      )}
                                    </p>
                                  </div>
                                  <div className={styles.offboardingActions}>
                                    <button type="button" className={styles.offboardingDownload}
                                      onClick={() => void baixarBackupEmpresa(empresa)}
                                      disabled={Boolean(operandoEncerramentoId) || !empresa.cancelada_em || !empresa.exclusao_prevista_em ||
                                        new Date(empresa.exclusao_prevista_em).getTime() <= Date.now()}
                                      title={!empresa.cancelada_em ? "Cancelamento anterior sem registro de retenção. Requer regularização administrativa." : undefined}>
                                      <Download size={16} />
                                      {operandoEncerramentoId === empresa.id
                                        ? "Preparando partes..."
                                        : empresa.encerramento_backup_estado === "pronto" ? "Ver downloads" : "Solicitar backup"}
                                    </button>
                                    <button type="button" className={styles.offboardingRestore}
                                      onClick={() => void restaurarClienteCancelado(empresa)}
                                      disabled={Boolean(operandoEncerramentoId) || empresa.encerramento_backup_estado === "processando" || !empresa.exclusao_prevista_em ||
                                        new Date(empresa.exclusao_prevista_em).getTime() <= Date.now()}>
                                      <RotateCcw size={16} /> Restaurar
                                    </button>
                                    {podeAcessarTemporariamente && (
                                      <button type="button" className={styles.offboardingDelete}
                                        disabled={Boolean(operandoEncerramentoId) ||
                                          empresa.encerramento_backup_estado === "processando" ||
                                          !empresa.exclusao_prevista_em ||
                                          (new Date(empresa.exclusao_prevista_em).getTime() > Date.now() &&
                                            empresa.encerramento_backup_estado !== "pronto")}
                                        title="Antes da data de exclusão, exige backup pronto e confirmação de download de todas as partes."
                                        onClick={() => abrirExclusaoEmpresa(empresa)}>
                                        <Trash2 size={16} /> Excluir definitivamente
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {arquivosBackup[empresa.id]?.length > 0 && (
                                  <div className={styles.offboardingFileList}>
                                    <strong><Download size={15} /> Arquivos disponíveis para download</strong>
                                    <p>Baixe todas as partes antes de {empresa.exclusao_prevista_em
                                      ? formatarDataLead(empresa.exclusao_prevista_em) : "o fim da retenção"}. Links temporários expiram em 5 minutos.</p>
                                    <div className={styles.offboardingFiles}>
                                      {arquivosBackup[empresa.id].map((arquivo) => (
                                        <a key={arquivo.nome} href={arquivo.url}
                                          target="_blank" rel="noopener noreferrer"
                                          className={styles.offboardingFileLink}>
                                          <Download size={14} />
                                          {arquivo.nome} ({(arquivo.bytes / 1024 / 1024).toFixed(1)} MB)
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </section>
                            )}
                          </div>
                      </div>
                    )}
                    {expandido && empresa.status === "excluida" && (
                      <div className={styles.itemExpanded}>
                        <section className={styles.deletedHistoryCard} aria-label="Histórico da empresa excluída">
                          <div className={styles.deletedHistoryHeader}>
                            <span className={styles.deletedHistoryIcon}><Archive size={19}/></span>
                            <div>
                              <strong>Histórico de encerramento</strong>
                              <p>Dados operacionais excluídos definitivamente. Registro mantido somente para consulta administrativa.</p>
                            </div>
                          </div>
                          <div className={styles.deletedHistoryGrid}>
                            <div><span>Início no CRM</span><strong>{formatarDataAssinatura(empresa.created_at)}</strong></div>
                            <div><span>Cancelamento</span><strong>{formatarDataAssinatura(empresa.cancelada_em)}</strong></div>
                            <div><span>Exclusão definitiva</span><strong>{formatarDataAssinatura(empresa.excluida_em)}</strong></div>
                            <div><span>Solicitação do backup</span><strong>{empresa.encerramento_backup_solicitado_em
                              ? formatarDataAssinatura(empresa.encerramento_backup_solicitado_em)
                              : "Não registrada"}</strong></div>
                          </div>
                        </section>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {editandoId && empresaEditando && (
        <div className={styles.companyEditOverlay} role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) cancelarEdicao(); }}>
          <section className={styles.companyEditModal} role="dialog" aria-modal="true"
            aria-labelledby="company-edit-title">
            <header className={styles.companyEditHeader}>
              <div className={styles.companyEditHeaderTop}>
                <span className={styles.companyEditEyebrow}>ADMINISTRAÇÃO DE EMPRESAS</span>
                <button type="button" className={styles.companyEditClose}
                  onClick={cancelarEdicao} disabled={salvandoEdicao} aria-label="Fechar edição">
                  <X size={20} />
                </button>
              </div>
              <div className={styles.companyEditIdentity}>
                <div className={styles.companyEditAvatar}>{getIniciais(empresaEditando.nome_fantasia)}</div>
                <div>
                  <h2 id="company-edit-title">{empresaEditando.nome_fantasia}</h2>
                  <p>{empresaEditando.email}</p>
                  <div className={styles.companyEditMeta}>
                    <span>{empresaEditando.planos?.nome || "Sem plano"}</span>
                    <span>{empresaEditando.nichos?.nome || "Sem segmento"}</span>
                    <span>{getStatusLabel(empresaEditando.status)}</span>
                    {empresaEditando.nome_responsavel ? (
                      <span>Responsável: {empresaEditando.nome_responsavel}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </header>
            <div className={styles.companyEditScroll}>
              <div className={styles.companyEditSectionTitle}>
                <span>01 / DADOS DA EMPRESA</span>
                <h3>Informações e recursos</h3>
                <p>Atualize os dados administrativos e o acesso aos módulos.</p>
              </div>
                          <div className={styles.editGrid}>
                            <div className={styles.field}>
                              <label className={styles.label}>Nome fantasia</label>
                              <input
                                className={styles.input}
                                value={editNomeFantasia}
                                onChange={(e) => setEditNomeFantasia(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Razão social</label>
                              <input
                                className={styles.input}
                                value={editRazaoSocial}
                                onChange={(e) => setEditRazaoSocial(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Documento</label>
                              <input
                                className={styles.input}
                                value={editDocumento}
                                onChange={(e) => setEditDocumento(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>E-mail de acesso</label>
                              <input
                                className={styles.input}
                                value={editEmail}
                                readOnly
                                disabled
                                aria-describedby="email-access-edit-help"
                              />
                              <span
                                id="email-access-edit-help"
                                className={styles.fieldHelp}
                              >
                                Para alterar este endereço, use “Corrigir e-mail de acesso”.
                              </span>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Telefone</label>
                              <input
                                className={styles.input}
                                value={editTelefone}
                                onChange={(e) => setEditTelefone(e.target.value)}
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Responsável</label>
                              <input
                                className={styles.input}
                                value={editNomeResponsavel}
                                onChange={(e) =>
                                  setEditNomeResponsavel(e.target.value)
                                }
                              />
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Plano</label>
                              <select
                                className={styles.select}
                                value={editPlanoId}
                                onChange={(e) => alterarPlanoEdicao(e.target.value)}
                              >
                                <option value="">Selecione um plano</option>
                                {planos.map((plano) => (
                                  <option key={plano.id} value={plano.id}>
                                    {plano.nome}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Segmento</label>
                              <select
                                className={styles.select}
                                value={editNichoId}
                                onChange={(e) => setEditNichoId(e.target.value)}
                              >
                                {nichos.map((nicho) => (
                                  <option key={nicho.id} value={nicho.id}>
                                    {nicho.nome}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>
                                Números WhatsApp liberados
                              </label>
                              <select
                                className={styles.select}
                                value={editLimiteWhatsapp}
                                onChange={(e) => setEditLimiteWhatsapp(e.target.value)}
                              >
                                {OPCOES_LIMITE.map((quantidade) => (
                                  <option
                                    key={quantidade}
                                    value={quantidade}
                                    disabled={quantidade < limiteWhatsappPlano}
                                  >
                                    {getOpcaoLimiteLabel(
                                      quantidade,
                                      limiteWhatsappPlano
                                    )}
                                  </option>
                                ))}
                              </select>
                              <span className={styles.eyebrow}>
                                Total permitido para a empresa. O plano inclui {limiteWhatsappPlano}.
                              </span>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>
                                Usuários liberados
                              </label>
                              <select
                                className={styles.select}
                                value={editLimiteUsuarios}
                                onChange={(e) => setEditLimiteUsuarios(e.target.value)}
                              >
                                {OPCOES_LIMITE.map((quantidade) => (
                                  <option
                                    key={quantidade}
                                    value={quantidade}
                                    disabled={quantidade < limiteUsuariosPlano}
                                  >
                                    {getOpcaoLimiteLabel(
                                      quantidade,
                                      limiteUsuariosPlano
                                    )}
                                  </option>
                                ))}
                              </select>
                              <span className={styles.eyebrow}>
                                Total permitido para a empresa. O plano inclui {limiteUsuariosPlano}.
                              </span>
                            </div>

                            <div className={styles.field}>
                              <label className={styles.label}>Status</label>
                              <select
                                className={styles.select}
                                value={editStatus}
                                disabled={!podeAlterarStatusEmpresas}
                                onChange={(e) =>
                                  setEditStatus(e.target.value as StatusEmpresa)
                                }
                              >
                                <option value="ativa">Ativa</option>
                                <option value="inativa">Inativa</option>
                                <option value="suspensa">Suspensa</option>
                                <option value="cancelada">Cancelada</option>
                              </select>
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>Timezone</label>
                              <input
                                className={styles.input}
                                value={editTimezone}
                                onChange={(e) => setEditTimezone(e.target.value)}
                              />
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>URL da logo</label>
                              <input
                                className={styles.input}
                                value={editLogoUrl}
                                onChange={(e) => setEditLogoUrl(e.target.value)}
                              />
                            </div>

                            <div className={styles.fieldFull}>
                              <label className={styles.label}>Observações</label>
                              <textarea
                                className={styles.textarea}
                                rows={4}
                                value={editObservacoes}
                                onChange={(e) =>
                                  setEditObservacoes(e.target.value)
                                }
                              />
                            </div>

                            <div className={styles.emailMarketingCard}>
                              <div className={styles.emailMarketingHeading}>
                                <span className={styles.companyEditIcon}><Mail size={20} /></span>
                                <div className={styles.emailMarketingIntro}>
                                  <strong>E-mail Marketing</strong>
                                  <p>Configure o remetente e as credenciais. Clique em Salvar para aplicar todas as alterações.</p>
                                </div>
                                <label className={styles.emailMarketingToggle}>
                                  <input type="checkbox"
                                    checked={emailMarketingConfig.habilitado}
                                    disabled={carregandoEmailMarketing || salvandoEdicao}
                                    onChange={(event) => {
                                      setEmailMarketingConfig((atual) => ({ ...atual, habilitado: event.target.checked }));
                                    }} />
                                  <span className={styles.emailMarketingSwitch} aria-hidden="true"/>
                                  <span>{emailMarketingConfig.habilitado ? "Habilitado" : "Desabilitado"}</span>
                                </label>
                              </div>
                              {carregandoEmailMarketing ? (
                                <p className={styles.fieldHelp}>Carregando E-mail Marketing...</p>
                              ) : emailMarketingConfig.habilitado ? (
                                <>
                                  <div className={styles.emailMarketingFields}>
                                    <label className={styles.field}>
                                      <span className={styles.label}>Domínio verificado no Resend</span>
                                      <input className={styles.input} disabled={salvandoEdicao} placeholder="marketing.seudominio.com"
                                        value={emailMarketingConfig.dominio}
                                        onChange={(event) => setEmailMarketingConfig((atual) => ({ ...atual, dominio: event.target.value }))}/>
                                    </label>
                                    <label className={styles.field}>
                                      <span className={styles.label}>Nome do remetente</span>
                                      <input className={styles.input} disabled={salvandoEdicao} placeholder="Minha Empresa"
                                        value={emailMarketingConfig.remetente_nome}
                                        onChange={(event) => setEmailMarketingConfig((atual) => ({ ...atual, remetente_nome: event.target.value }))}/>
                                    </label>
                                    <label className={styles.field}>
                                      <span className={styles.label}>E-mail remetente</span>
                                      <input className={styles.input} disabled={salvandoEdicao} type="email" placeholder="marketing@seudominio.com"
                                        value={emailMarketingConfig.remetente_email}
                                        onChange={(event) => setEmailMarketingConfig((atual) => ({ ...atual, remetente_email: event.target.value }))}/>
                                    </label>
                                  </div>
                                  <div className={styles.emailMarketingCredentials}>
                                    <div className={styles.emailMarketingCredential}>
                                      <div className={styles.emailMarketingCredentialHeading}>
                                        <strong>Resend API Key</strong>
                                        <span className={emailMarketingConfig.api_key_configurada ? styles.keyConfigured : styles.keyMissing}>
                                          {emailMarketingConfig.api_key_configurada ? "Configurada" : "Não configurada"}
                                        </span>
                                      </div>
                                      <div className={styles.secretField}>
                                        <input
                                          className={styles.input}
                                          type={emailMarketingConfig.api_key_configurada && !alterandoApiKey ? "text" : mostrarApiKey ? "text" : "password"}
                                          autoComplete="new-password"
                                          aria-label="Resend API Key"
                                          readOnly={emailMarketingConfig.api_key_configurada && !alterandoApiKey}
                                          disabled={salvandoEdicao}
                                          placeholder={emailMarketingConfig.api_key_configurada ? "Chave já configurada" : "re_..."}
                                          value={emailMarketingConfig.api_key_configurada && !alterandoApiKey
                                            ? emailMarketingConfig.api_key_mascarada || "••••••••••"
                                            : emailMarketingApiKey}
                                          onChange={(event) => {
                                            setEmailMarketingApiKey(event.target.value);
                                                }}
                                        />
                                        {(!emailMarketingConfig.api_key_configurada || alterandoApiKey) ? (
                                          <button type="button" className={styles.secretReveal}
                                            aria-label={mostrarApiKey ? "Ocultar API Key digitada" : "Exibir API Key digitada"}
                                            title={mostrarApiKey ? "Ocultar código digitado" : "Conferir código digitado"}
                                            onClick={() => setMostrarApiKey((valor) => !valor)}>
                                            {mostrarApiKey ? <EyeOff size={18}/> : <Eye size={18}/>}
                                          </button>
                                        ) : (
                                          <span className={styles.secretSavedIcon} title="Chave salva e mascarada"><ShieldCheck size={17}/></span>
                                        )}
                                      </div>
                                      {emailMarketingConfig.api_key_configurada ? (
                                        <div className={styles.secretFieldActions}>
                                          <span>Chave salva · somente um trecho fica visível por segurança.</span>
                                          <button type="button" disabled={salvandoEdicao}
                                            onClick={() => {
                                              if (alterandoApiKey) {
                                                setEmailMarketingApiKey("");
                                                setMostrarApiKey(false);
                                              }
                                              setAlterandoApiKey((valor) => !valor);
                                            }}>
                                            {alterandoApiKey ? "Cancelar substituição" : "Substituir chave"}
                                          </button>
                                        </div>
                                      ) : <span className={styles.fieldHelp}>Use o ícone de olho para conferir a chave antes de salvar.</span>}
                                    </div>
                                    <div className={styles.emailMarketingCredential}>
                                      <div className={styles.emailMarketingCredentialHeading}>
                                        <strong>Webhook Signing Secret</strong>
                                        <span className={emailMarketingConfig.webhook_configurado ? styles.keyConfigured : styles.keyMissing}>
                                          {emailMarketingConfig.webhook_configurado ? "Configurado" : "Não configurado"}
                                        </span>
                                      </div>
                                      <div className={styles.secretField}>
                                        <input
                                          className={styles.input}
                                          type={emailMarketingConfig.webhook_configurado && !alterandoWebhookSecret ? "text" : mostrarWebhookSecret ? "text" : "password"}
                                          autoComplete="new-password"
                                          aria-label="Webhook Signing Secret"
                                          readOnly={emailMarketingConfig.webhook_configurado && !alterandoWebhookSecret}
                                          disabled={salvandoEdicao}
                                          placeholder={emailMarketingConfig.webhook_configurado ? "Segredo já configurado" : "whsec_..."}
                                          value={emailMarketingConfig.webhook_configurado && !alterandoWebhookSecret
                                            ? emailMarketingConfig.webhook_mascarado || "••••••••••"
                                            : emailMarketingWebhookSecret}
                                          onChange={(event) => {
                                            setEmailMarketingWebhookSecret(event.target.value);
                                                }}
                                        />
                                        {(!emailMarketingConfig.webhook_configurado || alterandoWebhookSecret) ? (
                                          <button type="button" className={styles.secretReveal}
                                            aria-label={mostrarWebhookSecret ? "Ocultar Signing Secret digitado" : "Exibir Signing Secret digitado"}
                                            title={mostrarWebhookSecret ? "Ocultar código digitado" : "Conferir código digitado"}
                                            onClick={() => setMostrarWebhookSecret((valor) => !valor)}>
                                            {mostrarWebhookSecret ? <EyeOff size={18}/> : <Eye size={18}/>}
                                          </button>
                                        ) : (
                                          <span className={styles.secretSavedIcon} title="Segredo salvo e mascarado"><ShieldCheck size={17}/></span>
                                        )}
                                      </div>
                                      {emailMarketingConfig.webhook_configurado ? (
                                        <div className={styles.secretFieldActions}>
                                          <span>Segredo salvo · somente um trecho fica visível por segurança.</span>
                                          <button type="button" disabled={salvandoEdicao}
                                            onClick={() => {
                                              if (alterandoWebhookSecret) {
                                                setEmailMarketingWebhookSecret("");
                                                setMostrarWebhookSecret(false);
                                              }
                                              setAlterandoWebhookSecret((valor) => !valor);
                                            }}>
                                            {alterandoWebhookSecret ? "Cancelar substituição" : "Substituir segredo"}
                                          </button>
                                        </div>
                                      ) : <span className={styles.fieldHelp}>Use o ícone de olho para conferir o segredo antes de salvar.</span>}
                                    </div>
                                  </div>
                                  <div className={styles.emailMarketingWebhook}>
                                    <span className={styles.label}>Webhook exclusivo da empresa</span>
                                    <code>{emailMarketingConfig.webhook_url}</code>
                                    <span className={styles.fieldHelp}>Cadastre esta URL na conta Resend. Os valores completos das chaves não são retornados pelo servidor após salvar.</span>
                                  </div>
                                </>
                              ) : (
                                <div className={styles.emailMarketingDisabled}>
                                  <ShieldCheck size={18}/>
                                  <span>O módulo está desabilitado. Ative o interruptor para configurar as credenciais e liberar as permissões.</span>
                                </div>
                              )}
                            </div>
                          </div>

              {erroEdicao && <div className={styles.companyEditError} role="alert">{erroEdicao}</div>}
            </div>
            <footer className={styles.companyEditFooter}>
              <span><ShieldCheck size={16} /> Salva a empresa e o E-mail Marketing em uma única ação.</span>
              <div className={styles.companyEditFooterActions}>
                <button type="button" className={styles.secondaryButton}
                  disabled={salvandoEdicao} onClick={cancelarEdicao}>Cancelar</button>
                <button type="button" className={styles.primaryButton}
                  disabled={salvandoEdicao || carregandoEmailMarketing || !emailMarketingCarregado}
                  onClick={() => void salvarEdicao()}>
                  <Save size={16} /> {salvandoEdicao ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      <button
        type="button"
        className={styles.leadsLauncher}
        onClick={abrirLeads}
      >
        Leads
      </button>

      {leadsModalAberto && (
        <div
          className={styles.leadsModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharLeads();
            }
          }}
        >
          <section
            className={styles.leadsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="company-leads-modal-title"
          >
            <div className={styles.leadsModalHeader}>
              <div>
                <span className={styles.leadsModalEyebrow}>Leads</span>
                <h2 id="company-leads-modal-title">
                  Leads da empresa
                </h2>
                <p>
                  Todos os leads cadastrados no CRM, do mais novo para o mais antigo.
                </p>
              </div>

              <div className={styles.leadsModalHeaderRight}>
                <span className={styles.leadsCountBadge}>
                  {leadsTotal} {leadsTotal === 1 ? "lead" : "leads"}
                </span>
                <button
                  type="button"
                  className={styles.leadsModalClose}
                  onClick={fecharLeads}
                  disabled={leadsCarregando}
                  aria-label="Fechar leads"
                >
                  ×
                </button>
              </div>
            </div>

            <div className={styles.leadsModalSummary}>
              <div>
                <span>Ordenação</span>
                <strong>Mais novos primeiro</strong>
              </div>
              <div>
                <span>Página</span>
                <strong>
                  {leadsPagina} de {leadsTotalPaginas}
                </strong>
              </div>
              <div>
                <span>Exibindo</span>
                <strong>{leadsEmpresa.length} registros</strong>
              </div>
            </div>

            <div className={styles.leadsTableShell}>
              {leadsCarregando ? (
                <div className={styles.leadsLoadingState}>
                  <span className={styles.leadsLoadingSpinner} />
                  <strong>Carregando leads...</strong>
                  <p>Buscando os registros mais recentes da empresa.</p>
                </div>
              ) : leadsErro ? (
                <div className={styles.leadsErrorState}>
                  <strong>Não foi possível carregar os leads</strong>
                  <p>{leadsErro}</p>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => void carregarLeads(leadsPagina)}
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : leadsEmpresa.length === 0 ? (
                <div className={styles.leadsEmptyState}>
                  <div className={styles.leadsEmptyIcon}>L</div>
                  <strong>Nenhum lead vinculado</strong>
                  <p>
                    Ainda não existem leads cadastrados para esta empresa.
                  </p>
                </div>
              ) : (
                <div className={styles.leadsTableScroll}>
                  <table className={styles.leadsTable}>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Nome empresa</th>
                        <th>E-mail</th>
                        <th>Número</th>
                        <th>Categoria</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadsEmpresa.map((lead) => (
                        <tr key={lead.id}>
                          <td>
                            <div className={styles.leadIdentity}>
                              <span className={styles.leadAvatar}>
                                {getIniciais(lead.nome || "Lead")}
                              </span>
                              <strong>{lead.nome || "—"}</strong>
                            </div>
                          </td>
                          <td>
                            <span className={styles.leadCompany}>
                              {lead.empresa || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadEmail}>
                              {lead.email || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadPhone}>
                              {lead.telefone || "—"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadCategoryBadge}>
                              {lead.categoria || "Não informado"}
                            </span>
                          </td>
                          <td>
                            <span className={styles.leadDate}>
                              {formatarDataLead(lead.created_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!leadsCarregando && !leadsErro && leadsTotal > 0 && (
              <div className={styles.leadsPagination}>
                <span>
                  {(leadsPagina - 1) * 25 + 1}–
                  {Math.min(leadsPagina * 25, leadsTotal)} de {leadsTotal}
                </span>

                <div>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => alterarPaginaLeads(leadsPagina - 1)}
                    disabled={leadsPagina <= 1}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => alterarPaginaLeads(leadsPagina + 1)}
                    disabled={leadsPagina >= leadsTotalPaginas}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {empresaRenovacaoModal && (
        <div
          className={styles.renewalModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharRenovacaoMensalidade();
            }
          }}
        >
          <section
            className={styles.renewalModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="renewal-modal-title"
          >
            <button
              type="button"
              className={styles.renewalModalClose}
              onClick={fecharRenovacaoMensalidade}
              disabled={renovandoMensalidade}
              aria-label="Fechar"
            >
              ×
            </button>

            <span className={styles.renewalModalEyebrow}>
              Renovação manual
            </span>
            <h2 id="renewal-modal-title">Renovar mensalidade</h2>
            <p className={styles.renewalModalCompany}>
              {empresaRenovacaoModal.nome_fantasia}
            </p>

            <div className={styles.renewalSummaryGrid}>
              <div>
                <span>Plano</span>
                <strong>{empresaRenovacaoModal.planos?.nome || "—"}</strong>
              </div>
              <div>
                <span>Status atual</span>
                <strong>
                  {getAssinaturaStatusLabel(
                    empresaRenovacaoModal.assinatura_status
                  )}
                </strong>
              </div>
              <div>
                <span>Vencimento atual</span>
                <strong>
                  {formatarDataAssinatura(
                    empresaRenovacaoModal.assinatura_vencimento_em
                  )}
                </strong>
              </div>
              <div>
                <span>Nova vigência</span>
                <strong>30 dias a partir de hoje</strong>
              </div>
            </div>

            <div className={styles.renewalNotice}>
              <strong>Registro administrativo de pagamento</strong>
              <p>
                Esta ação será registrada como renovação manual. Ela não cria
                uma transação fictícia em Mercado Pago ou Prosperity Pay.
              </p>
              <p>
                A assinatura ficará ativa a partir de hoje, a franquia mensal
                de IA será recomposta e a operação ficará vinculada ao
                administrador responsável na auditoria.
              </p>
            </div>

            <div className={styles.renewalValueField}>
              <label className={styles.label} htmlFor="renewal-paid-value">
                Valor pago
              </label>
              <div className={styles.currencyInputWrap}>
                <span>R$</span>
                <input
                  id="renewal-paid-value"
                  className={styles.input}
                  type="text"
                  inputMode="decimal"
                  value={valorRenovacao}
                  onChange={(event) => {
                    setValorRenovacao(event.target.value);
                    setConfirmouRenovacao(false);
                    setErroRenovacao("");
                  }}
                  placeholder="0,00"
                  autoComplete="off"
                  disabled={renovandoMensalidade}
                />
              </div>
              {empresaRenovacaoModal.planos?.preco_mensal_centavos ? (
                <span className={styles.fieldHelp}>
                  Valor atual do plano:{" "}
                  {formatarMoedaCentavos(
                    empresaRenovacaoModal.planos.preco_mensal_centavos
                  )}
                </span>
              ) : null}
            </div>

            <label className={styles.renewalConfirmation}>
              <input
                type="checkbox"
                checked={confirmouRenovacao}
                onChange={(event) => {
                  setConfirmouRenovacao(event.target.checked);
                  setErroRenovacao("");
                }}
                disabled={renovandoMensalidade}
              />
              <span>
                Confirmo que este pagamento foi recebido e autorizo renovar a
                mensalidade desta empresa a partir de hoje.
              </span>
            </label>

            {erroRenovacao && (
              <div className={styles.renewalError}>{erroRenovacao}</div>
            )}

            <div className={styles.renewalModalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={fecharRenovacaoMensalidade}
                disabled={renovandoMensalidade}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarRenovacaoMensalidade}
                disabled={
                  renovandoMensalidade ||
                  !confirmouRenovacao ||
                  !valorInputParaCentavos(valorRenovacao)
                }
              >
                {renovandoMensalidade
                  ? "Renovando..."
                  : "Confirmar renovação"}
              </button>
            </div>
          </section>
        </div>
      )}

      {empresaEmailModal && (
        <div
          className={styles.emailAccessOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharCorrecaoEmailAcesso();
            }
          }}
        >
          <section
            className={styles.emailAccessModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-access-title"
          >
            <button
              type="button"
              className={styles.emailAccessClose}
              onClick={fecharCorrecaoEmailAcesso}
              disabled={corrigindoEmailAcesso}
              aria-label="Fechar"
            >
              ×
            </button>

            <span className={styles.emailAccessEyebrow}>
              Contingência de acesso
            </span>
            <h2 id="email-access-title">Corrigir e-mail de acesso</h2>
            <p className={styles.emailAccessCompany}>
              {empresaEmailModal.nome_fantasia}
            </p>

            <div className={styles.emailAccessCurrent}>
              <span>E-mail atual</span>
              <strong>{empresaEmailModal.email}</strong>
            </div>

            <div className={styles.emailAccessInfo}>
              <strong>Uma única correção sincronizada</strong>
              <p>
                O novo endereço será atualizado no CRM Prosperity, no usuário
                de autenticação e na assinatura da Prosperity Pay. Links de
                primeiro acesso ainda não utilizados serão invalidados.
              </p>
              <p>
                Se o cliente ainda não criou a senha, um novo primeiro acesso
                será enviado automaticamente para o novo e-mail.
              </p>
            </div>

            <div className={styles.emailAccessField}>
              <label className={styles.label} htmlFor="novo-email-acesso">
                Novo e-mail
              </label>
              <input
                id="novo-email-acesso"
                className={styles.input}
                type="email"
                value={novoEmailAcesso}
                onChange={(event) => {
                  setNovoEmailAcesso(event.target.value);
                  setEmailSuspeitoConfirmado(false);
                  setErroEmailAcesso("");
                }}
                placeholder="cliente@empresa.com.br"
                autoComplete="off"
                disabled={corrigindoEmailAcesso}
              />
            </div>

            {getBuyerEmailSuggestion(novoEmailAcesso) &&
              !emailSuspeitoConfirmado && (
                <div className={styles.emailAccessSuggestion}>
                  <div>
                    <strong>Confira o domínio</strong>
                    <span>
                      Você quis dizer{" "}
                      <b>{getBuyerEmailSuggestion(novoEmailAcesso)}</b>?
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        const sugestao =
                          getBuyerEmailSuggestion(novoEmailAcesso);
                        if (!sugestao) return;
                        setNovoEmailAcesso(sugestao);
                        setEmailSuspeitoConfirmado(false);
                        setErroEmailAcesso("");
                      }}
                      disabled={corrigindoEmailAcesso}
                    >
                      Usar sugerido
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setEmailSuspeitoConfirmado(true);
                        setErroEmailAcesso("");
                      }}
                      disabled={corrigindoEmailAcesso}
                    >
                      Manter como digitado
                    </button>
                  </div>
                </div>
              )}

            {emailSuspeitoConfirmado &&
              getBuyerEmailSuggestion(novoEmailAcesso) && (
                <div className={styles.emailAccessConfirmed}>
                  Domínio confirmado manualmente pelo administrador.
                </div>
              )}

            {erroEmailAcesso && (
              <div className={styles.emailAccessError}>{erroEmailAcesso}</div>
            )}

            <div className={styles.emailAccessActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={fecharCorrecaoEmailAcesso}
                disabled={corrigindoEmailAcesso}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarCorrecaoEmailAcesso}
                disabled={
                  corrigindoEmailAcesso ||
                  !novoEmailAcesso.trim() ||
                  novoEmailAcesso.trim().toLowerCase() ===
                    empresaEmailModal.email.trim().toLowerCase()
                }
              >
                {corrigindoEmailAcesso
                  ? "Sincronizando..."
                  : "Corrigir e sincronizar"}
              </button>
            </div>
          </section>
        </div>
      )}

      {empresaExclusaoModal && (
        <div
          className={styles.deleteCompanyOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharExclusaoEmpresa();
            }
          }}
        >
          <section
            className={styles.deleteCompanyModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-company-title"
          >
            <button
              type="button"
              className={styles.deleteCompanyClose}
              onClick={fecharExclusaoEmpresa}
              disabled={excluindoEmpresa}
              aria-label="Fechar"
            >
              ×
            </button>

            <span className={styles.deleteCompanyEyebrow}>
              {empresaExclusaoModal.status === "cancelada" ? "EXCLUSÃO DEFINITIVA" : "ENCERRAMENTO DE CONTRATO"}
            </span>
            <h2 id="delete-company-title">
              {empresaExclusaoModal.status === "cancelada" ? "Excluir definitivamente" : "Encerrar empresa"}
            </h2>
            <p className={styles.deleteCompanyName}>
              {empresaExclusaoModal.nome_fantasia}
            </p>

            <div className={styles.deleteCompanyWarning}>
              <strong>{empresaExclusaoModal.status === "cancelada" ? "Exclusão irreversível" : "Encerramento com retenção de 60 dias"}</strong>
              <p>
                {empresaExclusaoModal.status === "cancelada"
                  ? "Esta operação é irreversível. Após o prazo indicado neste card, os dados operacionais serão excluídos. A exclusão antecipada exige backup concluído e confirmação de download de todos os arquivos."
                  : "Os acessos e automações serão bloqueados. Os dados ficarão disponíveis para solicitar backup por até 60 dias após o cancelamento. A geração NÃO é automática. Sem solicitação dentro do prazo, os dados operacionais serão excluídos."}
              </p>
            </div>

            {carregandoExclusao ? (
              <div className={styles.deleteCompanyLoading}>
                Calculando o impacto da exclusão...
              </div>
            ) : erroExclusao ? (
              <div className={styles.deleteCompanyError}>
                {erroExclusao}
              </div>
            ) : impactoExclusao ? (
              <div className={styles.deleteCompanyImpact}>
                <div>
                  <span>Usuários</span>
                  <strong>{impactoExclusao.usuarios}</strong>
                </div>
                <div>
                  <span>Contatos</span>
                  <strong>{impactoExclusao.contatos}</strong>
                </div>
                <div>
                  <span>Conversas</span>
                  <strong>{impactoExclusao.conversas}</strong>
                </div>
                <div>
                  <span>Mensagens</span>
                  <strong>{impactoExclusao.mensagens}</strong>
                </div>
                <div>
                  <span>Automações</span>
                  <strong>{impactoExclusao.automacoes}</strong>
                </div>
                <div>
                  <span>WhatsApp</span>
                  <strong>{impactoExclusao.integracoes_whatsapp}</strong>
                </div>
                <div>
                  <span>Leads</span>
                  <strong>{impactoExclusao.leads}</strong>
                </div>
                <div>
                  <span>Pagamentos</span>
                  <strong>{impactoExclusao.pagamentos}</strong>
                </div>
                <div>
                  <span>Mídias</span>
                  <strong>{impactoExclusao.midias}</strong>
                </div>
              </div>
            ) : null}

            {!carregandoExclusao && !erroExclusao && impactoExclusao && (
              <>
                <div className={styles.deleteCompanyConfirm}>
                  <label htmlFor="confirmar-exclusao-empresa">
                    Para confirmar, digite exatamente:
                    <strong>{empresaExclusaoModal.nome_fantasia}</strong>
                  </label>
                  <input
                    id="confirmar-exclusao-empresa"
                    className={styles.input}
                    value={confirmacaoExclusao}
                    onChange={(event) =>
                      setConfirmacaoExclusao(event.target.value)
                    }
                    autoComplete="off"
                    placeholder="Digite o nome da empresa"
                    disabled={excluindoEmpresa}
                  />
                </div>

                {empresaExclusaoModal.status === "cancelada" &&
                  Boolean(empresaExclusaoModal.exclusao_prevista_em) &&
                  new Date(empresaExclusaoModal.exclusao_prevista_em!).getTime() > Date.now() && (
                    <label className={styles.offboardingEarlyConfirm}>
                      <input type="checkbox" checked={confirmouBackupBaixado}
                        onChange={(e)=>setConfirmouBackupBaixado(e.target.checked)}
                        disabled={excluindoEmpresa}/>
                      <span>Confirmo que <strong>baixei e conferi todas as partes do backup</strong> desta empresa e autorizo a exclusão definitiva antes do prazo de retenção.</span>
                    </label>
                  )}

                <div className={styles.deleteCompanyActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={fecharExclusaoEmpresa}
                    disabled={excluindoEmpresa}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={confirmarExclusaoEmpresa}
                    disabled={
                      excluindoEmpresa ||
                      confirmacaoExclusao.trim() !==
                        empresaExclusaoModal.nome_fantasia.trim() ||
                      (empresaExclusaoModal.status === "cancelada" &&
                        Boolean(empresaExclusaoModal.exclusao_prevista_em) &&
                        new Date(empresaExclusaoModal.exclusao_prevista_em!).getTime()>Date.now() &&
                        !confirmouBackupBaixado)
                    }
                  >
                    {excluindoEmpresa
                      ? empresaExclusaoModal.status === "cancelada" ? "Excluindo..." : "Encerrando..."
                      : empresaExclusaoModal.status === "cancelada" ? "Excluir definitivamente" : "Encerrar empresa"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {empresaTokensModal && (
        <div
          className={styles.tokenModalOverlay}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharAjusteTokens();
            }
          }}
        >
          <section
            className={styles.tokenModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="token-admin-modal-title"
          >
            <button
              type="button"
              className={styles.tokenModalClose}
              onClick={fecharAjusteTokens}
              disabled={ajustandoTokens}
              aria-label="Fechar"
            >
              ×
            </button>

            <span className={styles.tokenModalEyebrow}>Tokens de IA</span>
            <h2 id="token-admin-modal-title">
              Gerenciar tokens
            </h2>
            <p className={styles.tokenModalCompany}>
              {empresaTokensModal.nome_fantasia}
            </p>

            <div className={styles.tokenActionTabs}>
              <button
                type="button"
                className={
                  acaoTokens === "restaurar_mensal"
                    ? styles.tokenActionTabActive
                    : styles.tokenActionTab
                }
                onClick={() => setAcaoTokens("restaurar_mensal")}
                disabled={ajustandoTokens}
              >
                Restaurar mensal
              </button>
              <button
                type="button"
                className={
                  acaoTokens === "adicionar_avulso"
                    ? styles.tokenActionTabActive
                    : styles.tokenActionTab
                }
                onClick={() => setAcaoTokens("adicionar_avulso")}
                disabled={ajustandoTokens}
              >
                Adicionar extras
              </button>
            </div>

            {acaoTokens === "restaurar_mensal" ? (
              <div className={styles.tokenRestorePanel}>
                <span>Franquia mensal atual</span>
                <strong>
                  {formatarTokens(
                    getSaldoTokensEmpresa(empresaTokensModal)?.limite_mensal
                  )}
                </strong>
                <p>
                  Recompõe a franquia mensal deste ciclo para o limite total.
                  O saldo avulso é preservado e o vencimento não é alterado.
                </p>
              </div>
            ) : (
              <div className={styles.tokenAmountPanel}>
                <label className={styles.label} htmlFor="tokens-extras">
                  Quantidade de tokens extras
                </label>
                <input
                  id="tokens-extras"
                  className={styles.input}
                  type="number"
                  min="1"
                  max="1000000000"
                  step="1000"
                  value={quantidadeTokensExtras}
                  onChange={(event) =>
                    setQuantidadeTokensExtras(event.target.value)
                  }
                />

                <div className={styles.tokenQuickAmounts}>
                  {[50000, 100000, 200000, 500000].map((quantidade) => (
                    <button
                      key={quantidade}
                      type="button"
                      onClick={() =>
                        setQuantidadeTokensExtras(String(quantidade))
                      }
                      disabled={ajustandoTokens}
                    >
                      +{formatarTokens(quantidade)}
                    </button>
                  ))}
                </div>

                <p>
                  Tokens extras entram no saldo avulso, não expiram e são
                  consumidos antes da franquia mensal.
                </p>
              </div>
            )}

            <div className={styles.tokenReasonField}>
              <label className={styles.label} htmlFor="tokens-motivo">
                Motivo do ajuste <span>(opcional)</span>
              </label>
              <textarea
                id="tokens-motivo"
                className={styles.textarea}
                rows={3}
                maxLength={500}
                placeholder="Ex.: cortesia comercial, correção de saldo..."
                value={motivoTokens}
                onChange={(event) => setMotivoTokens(event.target.value)}
              />
            </div>

            <div className={styles.tokenModalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={fecharAjusteTokens}
                disabled={ajustandoTokens}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={confirmarAjusteTokens}
                disabled={ajustandoTokens}
              >
                {ajustandoTokens
                  ? "Aplicando..."
                  : acaoTokens === "restaurar_mensal"
                    ? "Restaurar franquia"
                    : "Adicionar tokens"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
