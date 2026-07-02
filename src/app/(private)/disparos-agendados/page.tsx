"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import FeedbackToast from "@/components/FeedbackToast";
import Header from "@/components/Header";
import { useHeaderUser } from "@/components/header-user-context";
import { solicitarAtualizacaoDisparosPendentesHeader } from "@/lib/header-summary/events";
import { podeRealizarDisparos as usuarioPodeRealizarDisparos } from "@/lib/whatsapp/disparo-permissoes";
import styles from "./disparos-agendados.module.css";

type StatusDisparo = "todos" | "pendente" | "executado" | "cancelado" | "erro";

const ITENS_POR_PAGINA = 20;

type ContatoOptOutLike = {
  whatsapp_opt_out?: boolean;
  whatsapp_opt_out_geral?: boolean;
  whatsapp_opt_out_marketing?: boolean;
  whatsapp_opt_out_utility?: boolean;
  origem?: string | null;
  campanha?: string | null;
  origem_exibicao?: string | null;
  campanha_exibicao?: string | null;
};

function obterOrigemContato(contato: ContatoOptOutLike) {
  return contato.origem_exibicao || contato.origem || "";
}

function obterCampanhaContato(contato: ContatoOptOutLike) {
  return contato.campanha_exibicao || contato.campanha || "";
}

function contatoTemOptOutParaCategoria(
  contato: ContatoOptOutLike,
  categoria: string
) {
  if (contato.whatsapp_opt_out_geral === true) return true;

  const possuiEscoposDetalhados =
    contato.whatsapp_opt_out_marketing !== undefined ||
    contato.whatsapp_opt_out_utility !== undefined ||
    contato.whatsapp_opt_out_geral !== undefined;

  if (!possuiEscoposDetalhados && contato.whatsapp_opt_out === true) {
    return true;
  }

  if (categoria === "marketing") {
    return contato.whatsapp_opt_out_marketing === true;
  }

  if (categoria === "utility") {
    return contato.whatsapp_opt_out_utility === true;
  }

  return false;
}

function contatoTemAlgumOptOut(contato: ContatoOptOutLike) {
  return (
    contato.whatsapp_opt_out === true ||
    contato.whatsapp_opt_out_geral === true ||
    contato.whatsapp_opt_out_marketing === true ||
    contato.whatsapp_opt_out_utility === true
  );
}

function rotuloOptOutContato(contato: ContatoOptOutLike) {
  if (contato.whatsapp_opt_out_geral === true) return "Opt-out de disparos";

  const marketing = contato.whatsapp_opt_out_marketing === true;
  const utility = contato.whatsapp_opt_out_utility === true;

  if (marketing && utility) return "Opt-out Marketing e Utility";
  if (marketing) return "Opt-out Marketing";
  if (utility) return "Opt-out Utility";
  return contato.whatsapp_opt_out === true ? "Opt-out de disparos" : null;
}

type DisparoAgendado = {
  id: string;
  execucao_id: string | null;
  fluxo_id: string | null;
  no_id: string | null;
  tipo_agendamento: string;
  executar_em: string;
  status: "pendente" | "executando" | "executado" | "cancelado" | "erro";
  payload_json: Record<string, any>;
  created_at: string;
  executed_at: string | null;
  automacao_fluxos?: {
    id: string;
    nome: string;
  } | null;
  automacao_nos?: {
    id: string;
    titulo: string;
    tipo_no: string;
  } | null;
  envio_status?: "falha" | "sucesso" | "processando" | null;
  envio_label?: string | null;
  envio_message_id?: string | null;
  envio_erro_codigo_meta?: number | string | null;
  envio_erro_tecnico?: string | null;
  envio_erro_amigavel?: string | null;
};

function formatarData(valor?: string | null) {
  if (!valor) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(valor));
  } catch {
    return "-";
  }
} 

function statusLabel(status: string) {
  if (status === "pendente") return "Pendente";
  if (status === "executando") return "Em processamento";
  if (status === "executado") return "Executado";
  if (status === "cancelado") return "Cancelado";
  if (status === "erro") return "Erro";
  return status;
}

function statusClass(status: string) {
  if (status === "pendente") return `${styles.badge} ${styles.badgeYellow}`;
  if (status === "executando") return `${styles.badge} ${styles.badgeYellow}`;
  if (status === "executado") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "cancelado") return `${styles.badge} ${styles.badgeCancel}`;
  if (status === "erro") return `${styles.badge} ${styles.badgeRed}`;
  return `${styles.badge} ${styles.badgeCancel}`;
}

function envioStatusClass(status?: string | null) {
  if (status === "falha") return `${styles.badge} ${styles.badgeRed}`;
  if (status === "sucesso") return `${styles.badge} ${styles.badgeGreen}`;
  if (status === "processando") return `${styles.badge} ${styles.badgeYellow}`;
  return `${styles.badge} ${styles.badgeYellow}`;
}

function renderizarTextoTemplate(payload: Record<string, any>) {
  const templatePayload = payload?.template_payload;

  if (!templatePayload?.components?.length) {
    if (payload?.conteudo_renderizado) {
      return String(payload.conteudo_renderizado);
    }

    if (payload?.template_nome) {
      return `Template: ${payload.template_nome}`;
    }

    return "Não foi possível gerar a prévia do template.";
  }

  const variaveis = Array.isArray(payload?.variaveis_resolvidas)
    ? payload.variaveis_resolvidas
    : Array.isArray(payload?.variaveis)
    ? payload.variaveis
    : [];

  function substituirVariaveis(texto: string) {
    return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
      const index = Number(numero) - 1;
      return variaveis[index] || `{{${numero}}}`;
    });
  }

  const partes: string[] = [];

  const header = templatePayload.components.find(
    (item: any) => item.type === "HEADER"
  );

  const body = templatePayload.components.find(
    (item: any) => item.type === "BODY"
  );

  const footer = templatePayload.components.find(
    (item: any) => item.type === "FOOTER"
  );

  if (header?.text) {
    partes.push(`📌 ${substituirVariaveis(header.text)}`);
  }

  if (body?.text) {
    partes.push(substituirVariaveis(body.text));
  }

  if (footer?.text) {
    partes.push(substituirVariaveis(footer.text));
  }

  return partes.join("\n\n").trim() || "Não foi possível gerar a prévia do template.";
}

function contarVariaveisTemplate(template: any) {
  if (!template?.payload?.components?.length) return 0;

  const components = template.payload.components;

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const buttons = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  function contarTexto(texto?: string | null) {
    const matches = String(texto || "").match(/\{\{\d+\}\}/g) || [];

    const numeros = matches
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((numero) => !Number.isNaN(numero));

    if (numeros.length === 0) return 0;

    return Math.max(...numeros);
  }

  const totalHeader = contarTexto(header?.text);
  const totalBody = contarTexto(body?.text);

  const totalBotoes = (buttons?.buttons || []).reduce(
    (total: number, button: any) =>
      String(button?.type || "").toUpperCase() === "URL"
        ? total + contarTexto(button?.url)
        : total,
    0
  );

  return totalHeader + totalBody + totalBotoes;
}

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

function substituirPreviewSequencial(
  texto: string,
  variaveis: string[],
  offset: number
) {
  return String(texto || "").replace(/\{\{(\d+)\}\}/g, (_, numero) => {
    const index = offset + Number(numero) - 1;

    const variavel = variaveis[index]?.trim();

    return variavel ? `{{${variavel}}}` : `{{${numero}}}`;
  });
}

function montarPreviewTemplateAgendado(
  template: any,
  variaveis: string[]
) {
  if (!template) {
    return "Selecione um template.";
  }

  const components = Array.isArray(template?.payload?.components)
    ? template.payload.components
    : [];

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const footer = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  const partes: string[] = [];

  let offset = 0;

  if (header?.text) {
    partes.push(
      substituirPreviewSequencial(header.text, variaveis, offset)
    );

    const variaveisHeader =
      String(header.text || "").match(/\{\{\d+\}\}/g) || [];

    const numerosHeader = variaveisHeader
      .map((item) => Number(item.replace(/[{}]/g, "")))
      .filter((numero) => !Number.isNaN(numero));

    offset +=
      numerosHeader.length > 0 ? Math.max(...numerosHeader) : 0;
  }

  if (body?.text) {
    partes.push(
      substituirPreviewSequencial(body.text, variaveis, offset)
    );
  }

  if (footer?.text) {
    partes.push(String(footer.text));
  }

  return partes.join("\n\n").trim() || "Template sem conteúdo para prévia.";
}

function extrairPreviewTemplateCompleto(payload: any) {
  const components = Array.isArray(payload?.components)
    ? payload.components
    : [];

  const header = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "HEADER"
  );

  const body = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BODY"
  );

  const footer = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "FOOTER"
  );

  const buttons = components.find(
    (item: any) => String(item.type || "").toUpperCase() === "BUTTONS"
  );

  const partes: string[] = [];

  if (header?.text) {
    partes.push(header.text);
  }

  if (body?.text) {
    partes.push(body.text);
  }

  if (footer?.text) {
    partes.push(footer.text);
  }

  return partes.join("\n\n");
}

function limparNumero(valor: string | null | undefined) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefone(numero: string | null | undefined) {
  const limpo = limparNumero(numero);

  if (!limpo) return "Sem telefone";
  return limpo;
}

function contatoTemTelefoneValido(contato: any) {
  const telefone = limparNumero(contato.telefone);
  return telefone.length >= 10;
}

function DisparosAgendadosPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const headerUser = useHeaderUser();
  const disparoParam = searchParams.get("disparo");
  const mobileDetailActive = Boolean(disparoParam);
  const podeRealizarDisparos = usuarioPodeRealizarDisparos(headerUser);

  const [disparos, setDisparos] = useState<DisparoAgendado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<StatusDisparo>("todos");
  const [paginaAtual, setPaginaAtual] = useState(1);

  const [disparoSelecionado, setDisparoSelecionado] =
    useState<DisparoAgendado | null>(null);

  const [disparoParaCancelar, setDisparoParaCancelar] =
    useState<DisparoAgendado | null>(null);

  const [cancelando, setCancelando] = useState(false);
  const [modalNovoDisparo, setModalNovoDisparo] = useState(false);
  const [integracoes] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [integracaoSelecionada, setIntegracaoSelecionada] = useState("");
  const [templateSelecionado, setTemplateSelecionado] = useState("");
  const [templateVariavel1, setTemplateVariavel1] = useState("nome_contato");
  const [templateVariavel2, setTemplateVariavel2] = useState("campanha");
  const [templateVariavel3, setTemplateVariavel3] =
    useState("numero_contato");
  const [agendamentoData, setAgendamentoData] = useState("");
  const [agendamentoHora, setAgendamentoHora] = useState("");
  const [loadingModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [contatos, setContatos] = useState<any[]>([]);
  const [contatosSelecionados, setContatosSelecionados] = useState<any[]>([]);
  const [buscaContato, setBuscaContato] = useState("");
  const [salvandoDisparo, setSalvandoDisparo] = useState(false);
  const [loadingContatos, setLoadingContatos] = useState(false);
  const [totalContatosDisponiveis, setTotalContatosDisponiveis] = useState(0);
  const [origemFiltro, setOrigemFiltro] = useState("");
  const [origensDisponiveis, setOrigensDisponiveis] = useState<string[]>([]);
  const [campanhaFiltro, setCampanhaFiltro] = useState("");
  const [campanhasDisponiveis, setCampanhasDisponiveis] = useState<string[]>([]);
  const [erroModal, setErroModal] = useState("");
  const [
    modalResponsabilidadeListaFriaAberto,
    setModalResponsabilidadeListaFriaAberto,
  ] = useState(false);
  const [
    confirmacaoResponsabilidadeListaFria,
    setConfirmacaoResponsabilidadeListaFria,
  ] = useState(false);
  const [previewCusto, setPreviewCusto] = useState<{
    categoria: string;
    totalSelecionados: number;
    totalIsentos: number;
    totalCobrados: number;
    valorUnitarioUsd: number;
    valorTotalUsd: number;
    cotacaoUsdBrl: number;
    valorTotalBrlEstimado: number;
    valorTotalBrlMin: number;
    valorTotalBrlMax: number;
    margemMinPercent: number;
    margemMaxPercent: number;
    fonteCotacao?: string;
    cotacaoDataHora?: string | null;
    cotacaoFallback?: boolean;
  } | null>(null);
  const [loadingPreviewCusto, setLoadingPreviewCusto] = useState(false);

  async function carregarDisparos() {
    try {
      setCarregando(true);
      setErro("");
      setSucesso("");

      const params = new URLSearchParams();

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      const query = params.toString();
      const res = await fetch(`/api/disparos-agendados${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar disparos agendados.");
      }

      const listaDisparos = json.disparos || [];
      setDisparos(listaDisparos);

      const disparoDaUrl = disparoParam
        ? listaDisparos.find((item: DisparoAgendado) => item.id === disparoParam)
        : null;

      if (disparoDaUrl) {
        setDisparoSelecionado(disparoDaUrl);
      }
    } catch (error: any) {
      setErro(error?.message || "Erro ao carregar disparos agendados.");
    } finally {
      setCarregando(false);
    }
  }

  async function cancelarDisparo() {
    if (!disparoParaCancelar) return;
    if (!podeRealizarDisparos) {
      setErro("Você não tem permissão para cancelar disparos.");
      setDisparoParaCancelar(null);
      return;
    }

    try {
      setCancelando(true);
      setErro("");
      setSucesso("");

      const res = await fetch(
        `/api/disparos-agendados/${disparoParaCancelar.id}/cancelar`,
        {
          method: "PATCH",
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao cancelar disparo.");
      }

      setSucesso("Disparo cancelado com sucesso.");
      setDisparoParaCancelar(null);
      setDisparoSelecionado(null);
      router.push("/disparos-agendados");
      solicitarAtualizacaoDisparosPendentesHeader();

      await carregarDisparos();
    } catch (error: any) {
      setErro(error?.message || "Erro ao cancelar disparo.");
    } finally {
      setCancelando(false);
    }
  }

  async function carregarContatos(busca = "", origem = "", campanha = "") {
    try {
      setLoadingContatos(true);
      const params = new URLSearchParams({
        pagina: "1",
        limite: "2000",
      });

      if (busca.trim()) params.set("busca", busca.trim());
      if (origem.trim()) params.set("origem", origem.trim());
      if (campanha.trim()) params.set("campanha", campanha.trim());

      const res = await fetch(`/api/contatos?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao carregar contatos.");
      }

      setContatos(Array.isArray(json.contatos) ? json.contatos : []);
      setTotalContatosDisponiveis(Number(json.total || 0));
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar contatos."
      );
    } finally {
      setLoadingContatos(false);
    }
  }

  async function carregarOpcoesContatos() {
    try {
      const res = await fetch("/api/contatos/opcoes", {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar filtros de contatos.");
      }

      setOrigensDisponiveis(
        Array.isArray(json.origens) ? json.origens : []
      );
      setCampanhasDisponiveis(
        Array.isArray(json.campanhas) ? json.campanhas : []
      );
    } catch (error) {
      console.warn(
        "[DISPAROS AGENDADOS] Erro ao carregar filtros de contatos:",
        error
      );
    }
  }

  async function carregarTemplates(integracaoId: string) {
    try {
      if (!integracaoId) {
        setTemplates([]);
        return;
      }

      setLoadingTemplates(true);
      const res = await fetch(
        `/api/whatsapp/templates?integracao_whatsapp_id=${encodeURIComponent(
          integracaoId
        )}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao carregar templates.");
      }

      setTemplates(
        (Array.isArray(json.data) ? json.data : []).filter(
          (item: any) =>
            String(item.status || "").toUpperCase() === "APPROVED"
        )
      );
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Erro ao carregar templates."
      );
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function criarDisparoAgendado() {
    try {
      setErroModal("");

      if (!podeRealizarDisparos) {
        setErroModal("Você não tem permissão para agendar disparos.");
        return;
      }

      if (!integracaoSelecionada) {
        setErroModal("Selecione uma integração.");
        return;
      }

      if (!templateSelecionado) {
        setErroModal("Selecione um template.");
        return;
      }

      if (!agendamentoData || !agendamentoHora) {
        setErroModal("Selecione data e hora.");
        return;
      }

      if (contatosSelecionados.length === 0) {
        setErroModal("Selecione pelo menos um contato.");
        return;
      }

      if (temContatosOptOut) {
        setErroModal(
          "A seleção possui contatos com opt-out para a categoria do template. Remova-os para continuar."
        );
        return;
      }

      if (marketingComListaFria) {
        setErroModal(
          "Templates de marketing não podem ser enviados para contatos de lista fria. Remova os contatos sem opt-in para continuar."
        );
        return;
      }

      if (utilityListaFriaSemOptOut) {
        setErroModal(
          "Este template utility não possui o rodapé de opt-out. Recrie o template com a instrução para responder SAIR."
        );
        return;
      }

      if (totalVariaveis > 3) {
        setErroModal(
          "Este template usa mais de 3 variáveis. Selecione um template com no máximo 3 variáveis."
        );
        return;
      }

      const variaveisObrigatorias = variaveisTemplate
        .slice(0, totalVariaveis)
        .map((variavel) =>
          normalizarEntradaVariavelTemplate(variavel)
        );

      if (variaveisObrigatorias.some((variavel) => !variavel)) {
        setErroModal(
          "Preencha todas as variáveis exigidas pelo template."
        );
        return;
      }

      if (
        utilityComListaFria &&
        !confirmacaoResponsabilidadeListaFria
      ) {
        setModalResponsabilidadeListaFriaAberto(true);
        return;
      }

      setSalvandoDisparo(true);
      setErro("");
      setSucesso("");

      const executar_em = new Date(
        `${agendamentoData}T${agendamentoHora}:00`
      ).toISOString();

      const res = await fetch(
        "/api/disparos-agendados/criar",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            integracao_whatsapp_id: integracaoSelecionada,
            template_id: templateSelecionado,
            executar_em,

            variaveis: variaveisObrigatorias,
            confirmacao_responsabilidade_lista_fria:
              utilityComListaFria &&
              confirmacaoResponsabilidadeListaFria,

            contatos: contatosSelecionados.map((contato) => ({
              id: contato.id,
              nome: contato.nome,
              telefone: limparNumero(contato.telefone),
              email: contato.email || null,
              origem: obterOrigemContato(contato) || null,
              campanha: obterCampanhaContato(contato) || null,
              status_lead: contato.status_lead || null,
            })),
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(
          json.error || "Erro ao criar disparo."
        );
      }

      setSucesso("Disparo agendado com sucesso.");
      solicitarAtualizacaoDisparosPendentesHeader();

      setModalNovoDisparo(false);

      setIntegracaoSelecionada("");
      setTemplateSelecionado("");

      setTemplateVariavel1("nome_contato");
      setTemplateVariavel2("campanha");
      setTemplateVariavel3("numero_contato");

      setAgendamentoData("");
      setAgendamentoHora("");
      setContatosSelecionados([]);
      setBuscaContato("");
      setModalResponsabilidadeListaFriaAberto(false);
      setConfirmacaoResponsabilidadeListaFria(false);

      await carregarDisparos();
    } catch (error: any) {
        setErroModal(
          error?.message ||
          "Erro ao criar disparo."
        );
    } finally {
      setSalvandoDisparo(false);
    }
  }

  async function confirmarResponsabilidadeEAgendar() {
    if (!confirmacaoResponsabilidadeListaFria || !utilityComListaFria) return;

    setModalResponsabilidadeListaFriaAberto(false);
    await criarDisparoAgendado();
  }

  useEffect(() => {
    carregarDisparos();
    carregarOpcoesContatos();
  }, []);


  useEffect(() => {
    setTemplateSelecionado("");

    setTemplateVariavel1("nome_contato");
    setTemplateVariavel2("campanha");
    setTemplateVariavel3("numero_contato");

    if (integracaoSelecionada) {
      carregarTemplates(integracaoSelecionada);
    } else {
      setTemplates([]);
    }
  }, [integracaoSelecionada]);


  useEffect(() => {
    if (!modalNovoDisparo) return;

    const timer = setTimeout(() => {
      carregarContatos(buscaContato, origemFiltro, campanhaFiltro);
    }, 300);

    return () => clearTimeout(timer);
  }, [buscaContato, origemFiltro, campanhaFiltro, modalNovoDisparo]);


  const metricas = useMemo(() => {
    const total = disparos.length;
    const pendentes = disparos.filter((item) =>
      ["pendente", "executando"].includes(item.status)
    ).length;
    const executados = disparos.filter((item) => item.status === "executado").length;
    const cancelados = disparos.filter((item) => item.status === "cancelado").length;
    const erros = disparos.filter((item) => item.status === "erro").length;

    return {
      total,
      pendentes,
      executados,
      cancelados,
      erros,
    };
  }, [disparos]);

  const disparosFiltrados = useMemo(() => {
    if (filtroStatus === "todos") return disparos;

    return disparos.filter((item) =>
      filtroStatus === "pendente"
        ? ["pendente", "executando"].includes(item.status)
        : item.status === filtroStatus
    );
  }, [disparos, filtroStatus]);

  const totalPaginas = useMemo(() => {
    return Math.max(1, Math.ceil(disparosFiltrados.length / ITENS_POR_PAGINA));
  }, [disparosFiltrados.length]);

  const disparosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const fim = inicio + ITENS_POR_PAGINA;

    return disparosFiltrados.slice(inicio, fim);
  }, [disparosFiltrados, paginaAtual]);

  const primeiroItem =
    disparosFiltrados.length === 0 ? 0 : (paginaAtual - 1) * ITENS_POR_PAGINA + 1;

  const ultimoItem = Math.min(
    paginaAtual * ITENS_POR_PAGINA,
    disparosFiltrados.length
  );

  useEffect(() => {
    setPaginaAtual(1);
  }, [filtroStatus, disparos]);

  const templateAtual =
    templates.find((item) => item.id === templateSelecionado) || null;

  const categoriaTemplateAtual = String(templateAtual?.categoria || "")
    .trim()
    .toLowerCase();

  const contatosDisponiveis = useMemo(() => {
    const idsSelecionados = new Set(
      contatosSelecionados.map((item) => item.id)
    );

    return contatos.filter((item) => !idsSelecionados.has(item.id));
  }, [contatos, contatosSelecionados]);

  const contatosDisponiveisValidos = useMemo(() => {
    return contatosDisponiveis.filter(
      (contato) =>
        contatoTemTelefoneValido(contato) &&
        !contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual)
    );
  }, [contatosDisponiveis, categoriaTemplateAtual]);

  function adicionarContato(contato: any) {
    if (contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual)) {
      setErro(
        "Este contato solicitou opt-out para a categoria do template selecionado."
      );
      return;
    }

    const telefone = limparNumero(contato.telefone);

    if (!telefone || telefone.length < 10) {
      setErro("Este contato não possui telefone válido para disparo.");
      return;
    }

    setErro("");

    setContatosSelecionados((prev) => {
      if (prev.some((item) => item.id === contato.id)) return prev;
      return [...prev, contato];
    });
  }

  function adicionarTodosDisponiveis() {
    const mapaSelecionados = new Set(
      contatosSelecionados.map((item) => item.id)
    );

    const novos = contatosDisponiveisValidos.filter(
      (item) => !mapaSelecionados.has(item.id)
    );

    if (novos.length === 0) {
      setErro("Nenhum contato válido disponível para adicionar.");
      return;
    }

    setErro("");
    setContatosSelecionados((prev) => [...prev, ...novos]);
  }

  function removerContato(contatoId: string) {
    setContatosSelecionados((prev) =>
      prev.filter((item) => item.id !== contatoId)
    );
  }

  function limparSelecao() {
    setContatosSelecionados([]);
    setErro("");
  }

  function abrirDisparo(disparo: DisparoAgendado) {
    setDisparoSelecionado(disparo);
    router.push(`/disparos-agendados?disparo=${encodeURIComponent(disparo.id)}`);
  }

  async function calcularPreviewCustoAgendamento(
    categoria: string,
    contatosLista: any[]
  ) {
    try {
      if (!categoria || contatosLista.length === 0) {
        setPreviewCusto(null);
        return;
      }

      setLoadingPreviewCusto(true);

      const res = await fetch("/api/whatsapp/disparos/custo-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoria,
          contatos: contatosLista.map((contato) => ({
            id: contato.id,
            telefone: limparNumero(contato.telefone),
          })),
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao calcular custo do agendamento.");
      }

      const totalCobrados = Number(json.totalCobrados || 0);
      const valorTotalUsd = Number(json.valorTotalUsd || 0);

      const valorTotalBrlEstimado =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Number(json.valorTotalBrlEstimado || 0);

      const valorTotalBrlMin =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMin || 0));

      const valorTotalBrlMax =
        totalCobrados <= 0 || valorTotalUsd <= 0
          ? 0
          : Math.max(0, Number(json.valorTotalBrlMax || 0));

      setPreviewCusto({
        categoria: String(json.categoria || ""),
        totalSelecionados: Number(json.totalSelecionados || 0),
        totalIsentos: Number(json.totalIsentos || 0),
        totalCobrados,
        valorUnitarioUsd: Number(json.valorUnitarioUsd || 0),
        valorTotalUsd,
        cotacaoUsdBrl: Number(json.cotacaoUsdBrl || 0),
        valorTotalBrlEstimado,
        valorTotalBrlMin,
        valorTotalBrlMax,
        margemMinPercent: Number(json.margemMinPercent || 0),
        margemMaxPercent: Number(json.margemMaxPercent || 0),
        fonteCotacao: json.fonteCotacao || "",
        cotacaoDataHora: json.cotacaoDataHora || null,
        cotacaoFallback: Boolean(json.cotacaoFallback),
      });
    } catch (error: any) {
      setPreviewCusto(null);
      setErro(error?.message || "Erro ao calcular custo do agendamento.");
    } finally {
      setLoadingPreviewCusto(false);
    }
  }

  const totalContatosListaFria = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          !contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual) &&
          contato.opt_in_whatsapp !== true
      ).length,
    [contatosSelecionados, categoriaTemplateAtual]
  );
  const totalContatosOptOut = useMemo(
    () =>
      contatosSelecionados.filter(
        (contato) =>
          contatoTemOptOutParaCategoria(contato, categoriaTemplateAtual)
      ).length,
    [contatosSelecionados, categoriaTemplateAtual]
  );
  const temContatosOptOut = totalContatosOptOut > 0;
  const temContatosListaFria = totalContatosListaFria > 0;
  const marketingComListaFria =
    categoriaTemplateAtual === "marketing" && temContatosListaFria;
  const utilityComListaFria =
    categoriaTemplateAtual === "utility" && temContatosListaFria;
  const utilityListaFriaSemOptOut =
    utilityComListaFria &&
    templateAtual?.opt_out_habilitado !== true;

  const totalVariaveis = useMemo(() => {
    return contarVariaveisTemplate(templateAtual);
  }, [templateAtual]);

  const variaveisTemplate = useMemo(
    () => [
      templateVariavel1,
      templateVariavel2,
      templateVariavel3,
    ],
    [
      templateVariavel1,
      templateVariavel2,
      templateVariavel3,
    ]
  );

  const previewTemplate = useMemo(() => {
    return montarPreviewTemplateAgendado(
      templateAtual,
      variaveisTemplate
    );
  }, [templateAtual, variaveisTemplate]);


  useEffect(() => {
    const categoria = String(templateAtual?.categoria || "").toLowerCase();

    if (!modalNovoDisparo || !categoria || contatosSelecionados.length === 0) {
      setPreviewCusto(null);
      return;
    }

    calcularPreviewCustoAgendamento(categoria, contatosSelecionados);
  }, [
    modalNovoDisparo,
    templateAtual?.id,
    templateAtual?.categoria,
    contatosSelecionados,
  ]);

  useEffect(() => {
    setModalResponsabilidadeListaFriaAberto(false);
    setConfirmacaoResponsabilidadeListaFria(false);
  }, [templateSelecionado, contatosSelecionados]);
   
  return (
    <>
      <Header
        mobileBackHref={mobileDetailActive ? "/disparos-agendados" : undefined}
        mobileBackLabel="Voltar para disparos"
        title="Disparos agendados"
        subtitle="Acompanhe, gerencie e cancele disparos de templates WhatsApp criados pelos fluxos de automação."
      />

      <main
        className={`${styles.pageContent} ${
          mobileDetailActive ? styles.mobileDetailActive : ""
        }`}
      >
        <section className={styles.mainPanel}>
          <header className={styles.editorHeader}>
            <div>
              <p className={styles.eyebrow}>Agenda de templates</p>
              <h2 className={styles.editorTitle}>Disparos agendados</h2>
              <p className={styles.editorSubtitle}>
                Visualize disparos criados pelos blocos de automação.
              </p>
            </div>

          <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={carregarDisparos}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
                
              {podeRealizarDisparos ? (
                <Link
                  href="/disparos-whatsapp"
                  className={styles.primaryButton}
                >
                  + Novo disparo
                </Link>
              ) : null}
            </div>
          </header>

          {(erro || sucesso) && (
            <div className={styles.alertArea}>
              {erro && <div className={styles.errorAlert}>{erro}</div>}
            </div>
          )}
          <FeedbackToast
            success={sucesso}
            onSuccessDismiss={() => setSucesso("")}
          />

          <div className={styles.searchBar}>
            <input
              className={styles.input}
              placeholder="Buscar template, telefone..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  carregarDisparos();
                }
              }}
            />

            <button
              type="button"
              className={styles.primaryButton}
              onClick={carregarDisparos}
            >
              Buscar
            </button>
          </div>

          <div className={styles.metricsGrid}>
            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "todos" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("todos")}
            >
              <span>Total</span>
              <strong>{metricas.total}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "pendente" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("pendente")}
            >
              <span>Pendentes</span>
              <strong>{metricas.pendentes}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "executado" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("executado")}
            >
              <span>Executados</span>
              <strong>{metricas.executados}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "cancelado" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("cancelado")}
            >
              <span>Cancelados</span>
              <strong>{metricas.cancelados}</strong>
            </button>

            <button
              type="button"
              className={`${styles.metricCard} ${
                filtroStatus === "erro" ? styles.metricCardActive : ""
              }`}
              onClick={() => setFiltroStatus("erro")}
            >
              <span>Erros</span>
              <strong>{metricas.erros}</strong>
            </button>
          </div>

          <div className={styles.listArea}>
            {carregando ? (
              <div className={styles.emptyState}>Carregando disparos...</div>
            ) : disparosFiltrados.length === 0 ? (
              <div className={styles.emptyState}>
                Nenhum disparo agendado encontrado.
              </div>
            ) : (
              <div className={styles.disparosList}>
                {disparosPaginados.map((disparo) => {
                  const payload = disparo.payload_json || {};
                  const templateNome = payload.template_nome || "Template";
                  const numero = payload.numero_destino || "-";
                  const fluxoNome = disparo.automacao_fluxos?.nome || "Fluxo não encontrado";
                  const blocoTitulo =
                    disparo.automacao_nos?.titulo ||
                    payload.automacao_no_titulo ||
                    "Bloco não encontrado";

                  return (
                    <article
                      key={disparo.id}
                      className={styles.disparoCard}
                      onClick={() => abrirDisparo(disparo)}
                    >
                      <div className={styles.disparoMain}>
                        <div className={styles.disparoIcon}>📨</div>

                        <div className={styles.disparoInfo}>
                          <div className={styles.disparoTop}>
                            <strong className={styles.disparoTitle}>
                              {templateNome}
                            </strong>

                            <span className={statusClass(disparo.status)}>
                              {statusLabel(disparo.status)}
                            </span>
                          </div>

                          <div className={styles.disparoMetaRow}>
                            <p className={styles.disparoMeta}>
                              Número: <strong>{numero}</strong>
                            </p>

                            <p className={styles.disparoScheduledAt}>
                              Agendado: <strong>{formatarData(disparo.executar_em)}</strong>
                            </p>
                          </div>

                          <p className={styles.disparoMeta}>
                            Fluxo: {fluxoNome} · Bloco: {blocoTitulo}
                          </p>

                          {disparo.envio_status === "falha" && disparo.envio_erro_amigavel ? (
                            <details
                              className={styles.envioErroDetails}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <summary className={styles.envioErroSummary}>
                                <span>Falha no envio</span>
                                <small>Ver detalhes</small>
                              </summary>

                              <div className={styles.envioErroBox}>
                                <p>{disparo.envio_erro_amigavel}</p>

                                {disparo.envio_erro_tecnico ? (
                                  <small>Detalhe técnico: {disparo.envio_erro_tecnico}</small>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.disparoActions}>
                        {payload.conversa_id && (
                          <Link
                            href={`/conversas?conversaId=${payload.conversa_id}`}
                            className={styles.secondaryButton}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Abrir conversa
                          </Link>
                        )}

                        {disparo.status === "pendente" &&
                        podeRealizarDisparos ? (
                          <button
                            type="button"
                            className={styles.dangerButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDisparoParaCancelar(disparo);
                            }}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {disparosFiltrados.length > ITENS_POR_PAGINA ? (
                  <div className={styles.paginationBar}>
                    <span className={styles.paginationInfo}>
                      Exibindo {primeiroItem} a {ultimoItem} de{" "}
                      {disparosFiltrados.length} disparos
                    </span>

                    <div className={styles.paginationActions}>
                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          setPaginaAtual((prev) => Math.max(1, prev - 1))
                        }
                        disabled={paginaAtual <= 1}
                      >
                        Anterior
                      </button>

                      <span className={styles.paginationCurrent}>
                        Página {paginaAtual} de {totalPaginas}
                      </span>

                      <button
                        type="button"
                        className={styles.paginationButton}
                        onClick={() =>
                          setPaginaAtual((prev) =>
                            Math.min(totalPaginas, prev + 1)
                          )
                        }
                        disabled={paginaAtual >= totalPaginas}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>

        {disparoSelecionado && (
          <aside className={styles.detailsPanel}>
            <div className={styles.propertiesHeader}>
              <div>
                <p className={styles.eyebrow}>Detalhes</p>
                <h3 className={styles.propertiesTitle}>Disparo agendado</h3>
              </div>

              <button
                type="button"
                className={styles.closePanelButton}
                onClick={() => {
                  setDisparoSelecionado(null);
                  router.push("/disparos-agendados");
                }}
              >
                ×
              </button>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Resumo</h4>

              <div className={styles.detailsGrid}>
                <div className={styles.detailGroup}>
                  <span>Status</span>
                  <strong className={statusClass(disparoSelecionado.status)}>
                    {statusLabel(disparoSelecionado.status)}
                  </strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Status do envio</span>
                  <strong className={envioStatusClass(disparoSelecionado.envio_status)}>
                    {disparoSelecionado.envio_label || "Ainda não enviado"}
                  </strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Template</span>
                  <strong>{disparoSelecionado.payload_json?.template_nome || "-"}</strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Idioma</span>
                  <strong>{disparoSelecionado.payload_json?.template_idioma || "-"}</strong>
                </div>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Destino</h4>

              <div className={styles.detailGroup}>
                <span>Número</span>
                <strong>{disparoSelecionado.payload_json?.numero_destino || "-"}</strong>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Origem da automação</h4>

              <div className={styles.detailGroup}>
                <span>Fluxo</span>
                <strong>{disparoSelecionado.automacao_fluxos?.nome || "-"}</strong>
              </div>

              <div className={styles.detailGroup}>
                <span>Bloco</span>
                <strong>
                  {disparoSelecionado.automacao_nos?.titulo ||
                    disparoSelecionado.payload_json?.automacao_no_titulo ||
                    "-"}
                </strong>
              </div>
            </div>

            <div className={styles.detailsSection}>
              <h4 className={styles.detailsSectionTitle}>Datas</h4>

              <div className={styles.detailsGrid}>
                <div className={styles.detailGroup}>
                  <span>Criado em</span>
                  <strong>{formatarData(disparoSelecionado.created_at)}</strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Agendado para</span>
                  <strong>{formatarData(disparoSelecionado.executar_em)}</strong>
                </div>

                <div className={styles.detailGroup}>
                  <span>Executado em</span>
                  <strong>{formatarData(disparoSelecionado.executed_at)}</strong>
                </div>
              </div>
            </div>

            {disparoSelecionado.envio_status === "falha" &&
            disparoSelecionado.envio_erro_amigavel ? (
              <details className={styles.envioErroDetailsSelect}>
                <summary className={styles.envioErroSummary}>
                  <span>Falha no envio</span>
                  <small>Ver detalhes</small>
                </summary>

                <div className={styles.envioErroBox}>
                  <p>{disparoSelecionado.envio_erro_amigavel}</p>

                  {disparoSelecionado.envio_erro_tecnico ? (
                    <small>Detalhe técnico: {disparoSelecionado.envio_erro_tecnico}</small>
                  ) : null}
                </div>
              </details>
            ) : null}

            <div className={styles.detailGroupPrev}>
              <span>Prévia do template</span>

              <div className={styles.whatsappPreviewArea}>
                <div className={styles.whatsappBubble}>
                  <strong className={styles.whatsappPreviewTitle}>
                    {disparoSelecionado.payload_json?.template_nome || "Template WhatsApp"}
                  </strong>

                  <p className={styles.whatsappPreviewText}>
                    {renderizarTextoTemplate(disparoSelecionado.payload_json || {})}
                  </p>

                  <div className={styles.whatsappPreviewMeta}>
                    <p className={styles.whatsappPreviewFooter}>
                      Equipe de atendimento
                    </p>

                    <p className={styles.whatsappPreviewTime}>
                      {formatarData(disparoSelecionado.executar_em)}
                    </p>
                  </div>

                  {disparoSelecionado.payload_json?.template_payload?.components
                    ?.find((item: any) => String(item.type || "").toUpperCase() === "BUTTONS")
                    ?.buttons?.map((botao: any, index: number) => (
                      <div key={index} className={styles.whatsappPreviewButton}>
                        ↩ {botao.text || "Botão"}
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {disparoSelecionado.status === "pendente" &&
            podeRealizarDisparos ? (
              <button
                type="button"
                className={styles.dangerButtonFull}
                onClick={() => setDisparoParaCancelar(disparoSelecionado)}
              >
                Cancelar disparo
              </button>
            ) : null}
          </aside>
        )}

        {modalNovoDisparo && podeRealizarDisparos ? (
          <div
            className={styles.modalOverlay}
            onClick={() => setModalNovoDisparo(false)}
          >
            <div
              className={`${styles.modalCard} ${styles.modalDisparoCard}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>WhatsApp</p>

                  <h2 className={styles.modalTitle}>
                    Agendar disparo
                  </h2>

                  <p className={styles.modalSubtitle}>
                    Crie um disparo agendado manual de template WhatsApp.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => {
                    setErroModal("");
                    setModalNovoDisparo(false);

                    setTemplateVariavel1("nome_contato");
                    setTemplateVariavel2("campanha");
                    setTemplateVariavel3("numero_contato");
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                {erroModal && (
                  <div className={styles.errorAlert}>
                    {erroModal}
                  </div>
                )}
                {loadingModal ? (
                  <div className={styles.emptyState}>
                    Carregando dados do disparo...
                  </div>
                ) : (
                <div className={styles.disparoModalGrid}>
                  <div className={styles.disparoModalMain}>
                    <div className={styles.formSection}>
                      <div className={styles.formSectionHeader}>
                        <h3>Configurações</h3>
                        <p>Selecione integração, template e agendamento.</p>
                      </div>

                      <div className={styles.formGrid}>
                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Integração WhatsApp
                          </label>

                          <select
                            className={styles.input}
                            value={integracaoSelecionada}
                            onChange={(e) => {
                              setIntegracaoSelecionada(e.target.value);
                              setTemplateSelecionado("");
                            }}
                          >
                            <option value="">Selecionar integração</option>

                            {integracoes.map((integracao) => (
                              <option
                                key={integracao.id}
                                value={integracao.id}
                              >
                              {integracao.nome_conexao
                                ? `${integracao.nome_conexao} • ${integracao.numero || "Sem número"}`
                                : integracao.numero || "Integração sem nome"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Template
                          </label>

                          <select
                            className={styles.input}
                            value={templateSelecionado}
                            onChange={(e) => setTemplateSelecionado(e.target.value)}
                          >
                            <option value="">Selecionar template</option>

                            {integracaoSelecionada && !loadingTemplates && templates.length === 0 && (
                              <option value="" disabled>
                                Nenhum template aprovado para esta integração
                              </option>
                            )}

                            {templates.map((template) => (
                              <option
                                key={template.id}
                                value={template.id}
                              >
                                {template.nome} • {template.idioma}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Data
                          </label>

                        <input
                          type="date"
                          className={styles.input}
                          value={agendamentoData}
                          onChange={(e) => setAgendamentoData(e.target.value)}
                        />
                        </div>

                        <div className={styles.fieldGroup}>
                          <label className={styles.label}>
                            Hora
                          </label>

                          <input
                            type="time"
                            className={styles.input}
                            value={agendamentoHora}
                            onChange={(e) => setAgendamentoHora(e.target.value)}
                          />
                        </div>

                      </div>
                        {totalVariaveis > 0 ? (
                          <div className={styles.templateVariablesSection}>
                            <div className={styles.templateVariablesHint}>
                              Este template usa <strong>{totalVariaveis}</strong>{" "}
                              variável(is).

                              {" "}Variável 1 substitui{" "}
                              <strong>{"{{1}}"}</strong>

                              {totalVariaveis >= 2 ? (
                                <>
                                  , Variável 2 substitui{" "}
                                  <strong>{"{{2}}"}</strong>
                                </>
                              ) : null}

                              {totalVariaveis >= 3 ? (
                                <>
                                  {" "}e Variável 3 substitui{" "}
                                  <strong>{"{{3}}"}</strong>
                                </>
                              ) : null}
                              .
                            </div>

                            <div className={styles.templateVariablesGrid}>
                              <div className={styles.fieldGroup}>
                                <label className={styles.label}>
                                  Variável 1
                                </label>

                                <input
                                  type="text"
                                  className={styles.input}
                                  value={templateVariavel1}
                                  onChange={(e) =>
                                    setTemplateVariavel1(
                                      normalizarEntradaVariavelTemplate(
                                        e.target.value
                                      )
                                    )
                                  }
                                  placeholder="nome_contato"
                                />
                              </div>

                              {totalVariaveis >= 2 ? (
                                <div className={styles.fieldGroup}>
                                  <label className={styles.label}>
                                    Variável 2
                                  </label>

                                  <input
                                    type="text"
                                    className={styles.input}
                                    value={templateVariavel2}
                                    onChange={(e) =>
                                      setTemplateVariavel2(
                                        normalizarEntradaVariavelTemplate(
                                          e.target.value
                                        )
                                      )
                                    }
                                    placeholder="campanha"
                                  />
                                </div>
                              ) : null}

                              {totalVariaveis >= 3 ? (
                                <div className={styles.fieldGroup}>
                                  <label className={styles.label}>
                                    Variável 3
                                  </label>

                                  <input
                                    type="text"
                                    className={styles.input}
                                    value={templateVariavel3}
                                    onChange={(e) =>
                                      setTemplateVariavel3(
                                        normalizarEntradaVariavelTemplate(
                                          e.target.value
                                        )
                                      )
                                    }
                                    placeholder="numero_contato"
                                  />
                                </div>
                              ) : null}
                            </div>

                            <span className={styles.templateVariablesHelp}>
                                Variáveis fixas: {"{{nome_whatsapp}}"}, {"{{nome_contato}}"}, {"{{email_contato}}"}, {"{{numero_contato}}"}, {"{{campanha}}"}, {"{{origem}}"}, {"{{status_lead}}"}, {"{{protocolo_atual}}"} e {"{{ultimo_protocolo}}"}.
                            </span>
                          </div>
                        ) : templateAtual ? (
                          <div className={styles.templateWithoutVariables}>
                            Este template não possui variáveis.
                          </div>
                        ) : null}
                    </div>

                    <div className={styles.formSection}>
                      <div className={styles.formSectionHeader}>
                        <h3>Destinatários</h3>
                        <p>Selecione quem receberá o disparo.</p>
                      </div>

                        <div className={styles.contactsSearchRow}>
                          <div className={styles.field}>
                            <label className={styles.label}>Buscar contatos salvos</label>
                            <input
                              value={buscaContato}
                              onChange={(e) => setBuscaContato(e.target.value)}
                              className={styles.input}
                              placeholder="Busque por nome, telefone, email, campanha..."
                            />
                          </div>

                          <div className={styles.field}>
                            <label className={styles.label}>Filtrar por origem</label>
                            <select
                              value={origemFiltro}
                              onChange={(e) => setOrigemFiltro(e.target.value)}
                              className={styles.input}
                            >
                            <option value="">
                              {origensDisponiveis.length > 0
                                ? "Todas as origens"
                                : "Sem origens"}
                            </option>

                              {origensDisponiveis.map((origem) => (
                                <option key={origem} value={origem}>
                                  {origem}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className={styles.field}>
                            <label className={styles.label}>Filtrar por campanha</label>

                            <select
                              value={campanhaFiltro}
                              onChange={(e) => setCampanhaFiltro(e.target.value)}
                              className={styles.input}
                            >
                            <option value="">
                              {campanhasDisponiveis.length > 0
                                ? "Todas as campanhas"
                                : "Sem campanhas"}
                            </option>

                            {campanhasDisponiveis.map((campanha) => (
                              <option key={campanha} value={campanha}>
                                {campanha}
                              </option>
                            ))}
                            </select>
                          </div>
                        </div>
                    </div>

                    <div className={styles.contactsSection}>
                      <div className={styles.contactsColumn}>
                        <div className={styles.contactsHeader}>
                          <h3 className={styles.contactsTitle}>
                            Disponíveis
                          </h3>

                          <div className={styles.contactsHeaderActions}>
                            <button
                              type="button"
                              className={styles.TextButtonAdd}
                              onClick={adicionarTodosDisponiveis}
                              disabled={contatosDisponiveisValidos.length === 0}
                            >
                              Add todos
                            </button>

                            <span className={styles.contactsCount}>
                              {contatosDisponiveis.length}
                            </span>
                          </div>
                        </div>

                        <div className={styles.contactsList}>
                          {loadingContatos ? (
                            <div className={styles.emptyMiniState}>Carregando contatos...</div>
                          ) : contatosDisponiveis.length === 0 ? (
                            <div className={styles.emptyMiniState}>
                              Nenhum contato disponível.
                            </div>
                          ) : (
                            contatosDisponiveis.map((contato) => {
                              const telefoneValido = contatoTemTelefoneValido(contato);

                              return (
                                <div key={contato.id} className={styles.contactCard}>
                                  <div className={styles.contactMain}>
                                    <strong className={styles.contactName}>
                                      {contato.nome || contato.telefone || "Sem nome"}
                                    </strong>

                                    <p className={styles.contactMeta}>
                                      {formatarTelefone(contato.telefone)}
                                    </p>

                                    {contato.email ? (
                                      <p className={styles.contactMeta}>{contato.email}</p>
                                    ) : null}

                                    <div className={styles.contactBadges}>
                                      {obterOrigemContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterOrigemContato(contato)}
                                        </span>
                                      ) : null}

                                      {contato.status_lead ? (
                                        <span className={styles.contactBadge}>
                                          {contato.status_lead}
                                        </span>
                                      ) : null}

                                      {obterCampanhaContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterCampanhaContato(contato)}
                                        </span>
                                      ) : null}

                                      <span
                                        className={
                                          contatoTemAlgumOptOut(contato)
                                            ? styles.contactBadgeOptOut
                                            : contato.opt_in_whatsapp === true
                                            ? styles.contactBadgeOptIn
                                            : styles.contactBadgeCold
                                        }
                                      >
                                        {contatoTemAlgumOptOut(contato)
                                          ? rotuloOptOutContato(contato)
                                          : contato.opt_in_whatsapp === true
                                          ? "Opt-in WhatsApp"
                                          : "Lista fria"}
                                      </span>

                                      {!telefoneValido ? (
                                        <span className={styles.contactBadgeWarning}>
                                          Sem telefone válido
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className={styles.ButtonAdd}
                                    onClick={() => adicionarContato(contato)}
                                    disabled={
                                      !telefoneValido ||
                                      contatoTemOptOutParaCategoria(
                                        contato,
                                        categoriaTemplateAtual
                                      )
                                    }
                                  >
                                    Adicionar
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className={styles.contactsColumn}>
                        <div className={styles.contactsHeader}>
                          <h3 className={styles.contactsTitle}>
                            Selecionados
                          </h3>

                          <div className={styles.contactsHeaderActions}>
                            <button
                              type="button"
                              className={styles.TextButtonRemover}
                              onClick={() => setContatosSelecionados([])}
                              disabled={contatosSelecionados.length === 0}
                            >
                              Remover todos
                            </button>

                            <span className={styles.contactsCount}>
                              {contatosSelecionados.length}
                            </span>
                          </div>
                        </div>

                        <div className={styles.contactsList}>
                          {contatosSelecionados.length === 0 ? (
                            <div className={styles.emptyMiniState}>
                              Nenhum contato selecionado.
                            </div>
                          ) : (
                            contatosSelecionados.map((contato) => (
                              <div key={contato.id} className={styles.contactCardSelected}>
                                  <div className={styles.contactMain}>
                                    <strong className={styles.contactName}>
                                      {contato.nome || contato.telefone || "Sem nome"}
                                    </strong>

                                    <p className={styles.contactMeta}>
                                      {formatarTelefone(contato.telefone)}
                                    </p>

                                    {contato.email ? (
                                      <p className={styles.contactMeta}>{contato.email}</p>
                                    ) : null}

                                    <div className={styles.contactBadges}>
                                      {obterOrigemContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterOrigemContato(contato)}
                                        </span>
                                      ) : null}

                                      {contato.status_lead ? (
                                        <span className={styles.contactBadge}>
                                          {contato.status_lead}
                                        </span>
                                      ) : null}

                                      {obterCampanhaContato(contato) ? (
                                        <span className={styles.contactBadge}>
                                          {obterCampanhaContato(contato)}
                                        </span>
                                      ) : null}

                                      <span
                                        className={
                                          contatoTemAlgumOptOut(contato)
                                            ? styles.contactBadgeOptOut
                                            : contato.opt_in_whatsapp === true
                                            ? styles.contactBadgeOptIn
                                            : styles.contactBadgeCold
                                        }
                                      >
                                        {contatoTemAlgumOptOut(contato)
                                          ? rotuloOptOutContato(contato)
                                          : contato.opt_in_whatsapp === true
                                          ? "Opt-in WhatsApp"
                                          : "Lista fria"}
                                      </span>
                                    </div>
                                  </div>

                                <button
                                  type="button"
                                  className={styles.dangerButton}
                                  onClick={() => removerContato(contato.id)}
                                >
                                  Remover
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {temContatosOptOut ? (
                      <div
                        className={`${styles.coldListNotice} ${styles.coldListNoticeBlocked}`}
                        role="alert"
                      >
                        <strong>Agendamento bloqueado por opt-out</strong>
                        <p>
                          {totalContatosOptOut} contato(s) selecionado(s)
                          solicitaram o bloqueio da categoria do template
                          selecionado. Remova-os para continuar.
                        </p>
                      </div>
                    ) : null}

                    {temContatosListaFria ? (
                      <div
                        className={`${styles.coldListNotice} ${
                          marketingComListaFria || utilityListaFriaSemOptOut
                            ? styles.coldListNoticeBlocked
                            : styles.coldListNoticeWarning
                        }`}
                        role={
                          marketingComListaFria || utilityListaFriaSemOptOut
                            ? "alert"
                            : "status"
                        }
                      >
                        <strong>
                          {marketingComListaFria
                            ? "Agendamento de marketing bloqueado"
                            : utilityListaFriaSemOptOut
                            ? "Template sem opt-out"
                            : `${totalContatosListaFria} contato(s) de lista fria selecionado(s)`}
                        </strong>
                        <p>
                          {marketingComListaFria
                            ? "Remova os contatos sem opt-in para agendar um template de marketing."
                            : utilityListaFriaSemOptOut
                            ? "Recrie este template utility com o rodapé obrigatório para responder SAIR antes de utilizá-lo com lista fria."
                            : "O template utility exigirá a confirmação de responsabilidade antes do agendamento."}
                        </p>
                        <span>
                          O contato possui opt-in quando já existe uma mensagem
                          recebida dele no WhatsApp da empresa.
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <aside className={styles.disparoPreviewSidebar}>
                    <div className={styles.previewCard}>
                      <span className={styles.previewBadge}>Prévia</span>

                      <div className={styles.whatsappPreviewArea}>
                        <div className={styles.whatsappBubble}>
                          <strong className={styles.whatsappPreviewTitle}>
                            {templateAtual?.nome || "Template WhatsApp"}
                          </strong>

                          <p className={styles.whatsappPreviewText}>
                            {templateAtual
                              ? previewTemplate
                              : "Selecione um template para visualizar a mensagem."}
                          </p>

                          <div className={styles.whatsappPreviewMeta}>
                            <span className={styles.whatsappPreviewFooter}>
                              Equipe de atendimento
                            </span>

                            <span className={styles.whatsappPreviewTime}>
                              {agendamentoHora || "--:--"}
                            </span>
                          </div>

                          {templateAtual?.payload?.components
                            ?.find((item: any) => item.type === "BUTTONS")
                            ?.buttons?.map((botao: any, index: number) => (
                              <div key={index} className={styles.whatsappPreviewButton}>
                                ↩ {botao.text || "Botão"}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles.scheduleCard}>
                      <span className={styles.scheduleLabel}>
                        Agendamento
                      </span>

                      <strong className={styles.scheduleDate}>
                        {agendamentoData && agendamentoHora
                          ? `${agendamentoData} às ${agendamentoHora}`
                          : "Nenhuma data selecionada"}
                      </strong>

                      <p className={styles.scheduleDescription}>
                        O disparo será enviado automaticamente
                        na data configurada.
                      </p>
                    </div>
                                        
                    {templateAtual && contatosSelecionados.length > 0 && (
                      <div className={styles.disparoCustoBox}>
                        <div className={styles.disparoCustoHeader}>
                          <span className={styles.disparoCustoEyebrow}>
                            Estimativa de cobrança
                          </span>

                          <span className={styles.disparoCustoCategoria}>
                            {String(previewCusto?.categoria || templateAtual?.categoria || "-").toUpperCase()}
                          </span>
                        </div>

                        <div className={styles.disparoCustoMain}>
                          <div className={styles.disparoCustoValorPrincipal}>
                            {loadingPreviewCusto
                              ? "Calculando..."
                              : `R$ ${(previewCusto?.valorTotalBrlMin ?? 0).toFixed(2)} ~ R$ ${(previewCusto?.valorTotalBrlMax ?? 0).toFixed(2)}`}
                          </div>

                          <div className={styles.disparoCustoMetaLinha}>
                            <span>
                              <strong>USD:</strong>{" "}
                              {`US$ ${(previewCusto?.valorTotalUsd ?? 0).toFixed(4)}`}
                            </span>

                            <span>
                              <strong>Cobrados:</strong>{" "}
                              {previewCusto?.totalCobrados ?? 0}
                            </span>

                            <span>
                              <strong>Isentos:</strong>{" "}
                              {previewCusto?.totalIsentos ?? 0}
                            </span>
                          </div>
                        </div>

                        <div className={styles.disparoCustoAviso}>
                          A cobrança pode ser processada pela Meta usando o método de pagamento
                          vinculado à conta empresarial. O valor final pode variar conforme câmbio,
                          impostos, IOF, taxas e regras de cobrança.
                        </div>
                      </div>
                    )}

                  </aside>
                </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setErroModal("");
                    setModalNovoDisparo(false);

                    setTemplateVariavel1("nome_contato");
                    setTemplateVariavel2("campanha");
                    setTemplateVariavel3("numero_contato");
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={criarDisparoAgendado}
                  disabled={
                    salvandoDisparo ||
                    marketingComListaFria ||
                    temContatosOptOut ||
                    utilityListaFriaSemOptOut
                  }
                >
                  {temContatosOptOut
                    ? "Opt-out bloqueado"
                    : utilityListaFriaSemOptOut
                    ? "Template sem opt-out"
                    : marketingComListaFria
                    ? "Marketing bloqueado"
                    : salvandoDisparo
                    ? "Agendando..."
                    : "Agendar disparo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {modalResponsabilidadeListaFriaAberto &&
        podeRealizarDisparos &&
        utilityComListaFria ? (
          <div
            className={styles.modalOverlay}
            onClick={() => {
              setModalResponsabilidadeListaFriaAberto(false);
              setConfirmacaoResponsabilidadeListaFria(false);
            }}
          >
            <div
              className={styles.modalCard}
              role="dialog"
              aria-modal="true"
              aria-labelledby="responsabilidade-agendamento-titulo"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Lista fria</p>
                  <h3
                    id="responsabilidade-agendamento-titulo"
                    className={styles.modalTitle}
                  >
                    Confirmar responsabilidade
                  </h3>
                  <p className={styles.modalSubtitle}>
                    O template utility será agendado para{" "}
                    {totalContatosListaFria} contato(s) sem histórico de
                    mensagem recebida.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  aria-label="Fechar"
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);
                  }}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.riskBox}>
                  <strong>Este envio possui risco para a conta WhatsApp.</strong>
                  <p>
                    O conteúdo deve ser estritamente transacional ou de
                    serviço. Promoção, prospecção ou oferta em template utility
                    pode resultar em denúncias, limitação ou banimento pela
                    Meta.
                  </p>
                </div>

                <label className={styles.responsibilityCheckbox}>
                  <input
                    type="checkbox"
                    checked={confirmacaoResponsabilidadeListaFria}
                    onChange={(e) =>
                      setConfirmacaoResponsabilidadeListaFria(e.target.checked)
                    }
                  />
                  <span>
                    Confirmo que o conteúdo é utility, que possuo base legal
                    para o contato e que assumo integralmente os riscos deste
                    envio à lista fria.
                  </span>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setModalResponsabilidadeListaFriaAberto(false);
                    setConfirmacaoResponsabilidadeListaFria(false);
                  }}
                >
                  Voltar
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={confirmarResponsabilidadeEAgendar}
                  disabled={
                    !confirmacaoResponsabilidadeListaFria || salvandoDisparo
                  }
                >
                  {salvandoDisparo ? "Agendando..." : "Assumir e agendar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {disparoParaCancelar && podeRealizarDisparos ? (
          <div className={styles.modalOverlay}>
            <div className={`${styles.modalCard}`}>
              <div className={styles.modalHeader}>
                <div>
                  <p className={styles.eyebrow}>Cancelar disparo</p>
                  <h3 className={styles.modalTitle}>Confirmar cancelamento</h3>
                </div>

                <button
                  type="button"
                  className={styles.closePanelButton}
                  onClick={() => setDisparoParaCancelar(null)}
                >
                  ×
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.warningBox}>
                  <strong>Cancelando esse disparo não será enviado.</strong>
                  <p>
                    O template{" "}
                    <strong>
                      {disparoParaCancelar.payload_json?.template_nome || "selecionado"}
                    </strong>{" "}
                    está agendado para{" "}
                    <strong>{formatarData(disparoParaCancelar.executar_em)}</strong>.
                  </p>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setDisparoParaCancelar(null)}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={cancelarDisparo}
                  disabled={cancelando}
                >
                  {cancelando ? "Cancelando..." : "Cancelar disparo"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </>
  );
}

export default function DisparosAgendadosPage() {
  return (
    <Suspense fallback={null}>
      <DisparosAgendadosPageContent />
    </Suspense>
  );
}
