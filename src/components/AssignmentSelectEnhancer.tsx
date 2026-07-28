"use client";

import { useEffect } from "react";

type SetorOpcao = {
  id: string;
  nome: string;
};

type AtendenteOpcao = {
  id: string;
  nome: string;
  email?: string | null;
  setor_ids?: string[];
  is_administrador?: boolean;
};

type OpcoesSetoresResponse = {
  ok?: boolean;
  setores?: SetorOpcao[];
  atendentes?: AtendenteOpcao[];
};

type OpcoesUsuariosResponse = {
  ok?: boolean;
  setores?: SetorOpcao[];
  usuarios?: Array<{
    id: string;
    nome: string | null;
    is_administrador?: boolean;
  }>;
  error?: string;
};

const ATRIBUIR_URL_PATTERN = /\/api\/conversas\/[^/]+\/atribuir(?:\?|$)/;

function normalizarTexto(valor: string | null | undefined) {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function rotuloAtendente(atendente: {
  nome?: string | null;
  email?: string | null;
  is_administrador?: boolean;
}) {
  const nome = String(atendente.nome || "Usuário").trim() || "Usuário";
  const perfil = atendente.is_administrador ? " — Administrador" : "";
  const email = atendente.email ? ` — ${atendente.email}` : "";

  return `${nome}${perfil}${email}`;
}

function criarOpcao(value: string, label: string) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function obterUrlFetch(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function obterMetodoFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function encontrarPainelAtribuicao() {
  const titulo = Array.from(document.querySelectorAll<HTMLHeadingElement>("h3")).find(
    (elemento) => normalizarTexto(elemento.textContent) === "atribuir responsável"
  );

  const cabecalho = titulo?.parentElement;
  const painel = cabecalho?.parentElement;
  const corpo = cabecalho?.nextElementSibling as HTMLElement | null;

  if (!titulo || !cabecalho || !painel || !corpo) return null;
  if (!normalizarTexto(painel.textContent).includes("novo responsável")) return null;

  return { painel, corpo };
}

function atualizarValorSelectReact(
  select: HTMLSelectElement,
  valor: string,
  emitirEvento = true
) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  if (valueSetter) {
    valueSetter.call(select, valor);
  } else {
    select.value = valor;
  }

  if (emitirEvento) {
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export default function AssignmentSelectEnhancer() {
  useEffect(() => {
    let ativo = true;
    let framePendente: number | null = null;
    let opcoesGeraisPromise: Promise<OpcoesSetoresResponse | null> | null = null;
    let setoresAtribuicaoPromise: Promise<SetorOpcao[]> | null = null;
    let conversaAtiva = "";
    let setorSelecionado = "";
    let usuarioSelecionado = "";

    const usuariosPorSetor = new Map<
      string,
      Array<{ id: string; nome: string | null; is_administrador?: boolean }>
    >();

    const fetchOriginal = window.fetch.bind(window);

    function conversaIdAtual() {
      const params = new URLSearchParams(window.location.search);
      return params.get("id") || params.get("conversaId") || "";
    }

    async function carregarOpcoesGerais() {
      if (!opcoesGeraisPromise) {
        opcoesGeraisPromise = fetchOriginal("/api/setores/opcoes", {
          cache: "no-store",
          credentials: "same-origin",
        })
          .then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as OpcoesSetoresResponse;
          })
          .catch(() => null);
      }

      return await opcoesGeraisPromise;
    }

    async function carregarSetoresAtribuicao() {
      if (!setoresAtribuicaoPromise) {
        setoresAtribuicaoPromise = fetchOriginal(
          "/api/usuarios/opcoes-atribuicao",
          {
            cache: "no-store",
            credentials: "same-origin",
          }
        )
          .then(async (response) => {
            const payload = (await response.json().catch(() => null)) as
              | OpcoesUsuariosResponse
              | null;

            if (!response.ok || !payload?.ok) return [];
            return Array.isArray(payload.setores) ? payload.setores : [];
          })
          .catch(() => []);
      }

      return await setoresAtribuicaoPromise;
    }

    async function carregarUsuariosDoSetor(setorId: string) {
      if (usuariosPorSetor.has(setorId)) {
        return usuariosPorSetor.get(setorId) || [];
      }

      const response = await fetchOriginal(
        `/api/usuarios/opcoes-atribuicao?setor_id=${encodeURIComponent(setorId)}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | OpcoesUsuariosResponse
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Não foi possível carregar os usuários do setor.");
      }

      const usuarios = Array.isArray(payload.usuarios) ? payload.usuarios : [];
      usuariosPorSetor.set(setorId, usuarios);
      return usuarios;
    }

    function aplicarRotulosAdministradores(
      atendentes: AtendenteOpcao[],
      raiz: ParentNode = document
    ) {
      const administradores = new Map(
        atendentes
          .filter((atendente) => atendente.is_administrador)
          .map((atendente) => [atendente.id, atendente])
      );

      if (administradores.size === 0) return;

      raiz.querySelectorAll<HTMLOptionElement>("option[value]").forEach((option) => {
        const administrador = administradores.get(option.value);
        if (!administrador) return;

        const proximoRotulo = rotuloAtendente(administrador);
        if (option.textContent !== proximoRotulo) {
          option.textContent = proximoRotulo;
        }
      });
    }

    function prepararSelectResponsavel(
      select: HTMLSelectElement,
      usuarios: Array<{
        id: string;
        nome: string | null;
        is_administrador?: boolean;
      }>,
      estado: "selecione_setor" | "carregando" | "pronto" | "erro"
    ) {
      const valorAtual = usuarioSelecionado;
      let placeholder = "Selecione um responsável";

      if (estado === "selecione_setor") placeholder = "Selecione primeiro o setor";
      if (estado === "carregando") placeholder = "Carregando usuários...";
      if (estado === "erro") placeholder = "Não foi possível carregar os usuários";

      const options: HTMLOptionElement[] = [criarOpcao("", placeholder)];

      if (estado === "pronto") {
        usuarios.forEach((usuario) => {
          options.push(
            criarOpcao(
              usuario.id,
              rotuloAtendente({
                nome: usuario.nome,
                is_administrador: usuario.is_administrador,
              })
            )
          );
        });
      }

      const assinaturaAtual = Array.from(select.options)
        .map((option) => `${option.value}:${option.textContent}`)
        .join("|");
      const assinaturaNova = options
        .map((option) => `${option.value}:${option.textContent}`)
        .join("|");

      if (assinaturaAtual !== assinaturaNova) {
        select.replaceChildren(...options);
      }

      select.disabled = estado !== "pronto";

      const valorPermitido =
        estado === "pronto" &&
        valorAtual &&
        usuarios.some((usuario) => usuario.id === valorAtual)
          ? valorAtual
          : "";

      if (select.value !== valorPermitido) {
        atualizarValorSelectReact(select, valorPermitido, false);
      }
    }

    async function enriquecerPainelAtribuicao(
      setoresPermitidos: SetorOpcao[]
    ) {
      const estrutura = encontrarPainelAtribuicao();
      if (!estrutura) return;

      const { painel, corpo } = estrutura;
      const conversaId = conversaIdAtual();

      if (conversaAtiva !== conversaId) {
        conversaAtiva = conversaId;
        setorSelecionado = "";
        usuarioSelecionado = "";
      }

      const labelResponsavel = Array.from(corpo.querySelectorAll<HTMLElement>("label")).find(
        (label) => normalizarTexto(label.textContent) === "novo responsável"
      );
      const selectResponsavel = Array.from(
        corpo.querySelectorAll<HTMLSelectElement>("select")
      ).find((select) => select.dataset.crmSetorAtribuicao !== "true");

      if (!labelResponsavel || !selectResponsavel) return;

      let selectSetor = corpo.querySelector<HTMLSelectElement>(
        'select[data-crm-setor-atribuicao="true"]'
      );

      if (!selectSetor) {
        const labelSetor = document.createElement("label");
        labelSetor.className = labelResponsavel.className;
        labelSetor.textContent = "Setor dos usuários";
        labelSetor.dataset.crmSetorAtribuicaoLabel = "true";

        selectSetor = document.createElement("select");
        selectSetor.className = selectResponsavel.className;
        selectSetor.dataset.crmSetorAtribuicao = "true";
        selectSetor.setAttribute("aria-label", "Setor dos usuários");
        selectSetor.replaceChildren(
          criarOpcao("", "Selecione um setor"),
          ...setoresPermitidos.map((setor) => criarOpcao(setor.id, setor.nome))
        );
        selectSetor.value = setorSelecionado;

        selectSetor.addEventListener("change", async () => {
          setorSelecionado = selectSetor?.value || "";
          usuarioSelecionado = "";
          atualizarValorSelectReact(selectResponsavel, "");

          if (!setorSelecionado) {
            prepararSelectResponsavel(selectResponsavel, [], "selecione_setor");
            return;
          }

          prepararSelectResponsavel(selectResponsavel, [], "carregando");

          try {
            const usuarios = await carregarUsuariosDoSetor(setorSelecionado);
            if (!ativo || !selectResponsavel.isConnected) return;
            prepararSelectResponsavel(selectResponsavel, usuarios, "pronto");
          } catch {
            if (!ativo || !selectResponsavel.isConnected) return;
            prepararSelectResponsavel(selectResponsavel, [], "erro");
          }
        });

        corpo.insertBefore(labelSetor, labelResponsavel);
        corpo.insertBefore(selectSetor, labelResponsavel);

        const ajuda = document.createElement("p");
        ajuda.dataset.crmSetorAtribuicaoAjuda = "true";
        ajuda.textContent =
          "Escolha o setor para listar seus usuários. Administradores aparecem em todos os setores.";
        ajuda.style.margin = "6px 0 0";
        ajuda.style.color = "#64748b";
        ajuda.style.fontSize = "12px";
        ajuda.style.lineHeight = "1.4";
        selectResponsavel.insertAdjacentElement("afterend", ajuda);

        atualizarValorSelectReact(selectResponsavel, "");
      }

      painel.dataset.crmAtribuicaoSetorAtiva = setorSelecionado;

      if (selectResponsavel.dataset.crmUsuarioListener !== "true") {
        selectResponsavel.dataset.crmUsuarioListener = "true";
        selectResponsavel.addEventListener(
          "change",
          () => {
            usuarioSelecionado = selectResponsavel.value;
          },
          { capture: true }
        );
      }

      if (!setorSelecionado) {
        prepararSelectResponsavel(selectResponsavel, [], "selecione_setor");
        return;
      }

      selectSetor.value = setorSelecionado;
      const usuarios = usuariosPorSetor.get(setorSelecionado);

      if (usuarios) {
        prepararSelectResponsavel(selectResponsavel, usuarios, "pronto");
      }
    }

    async function sincronizarInterface() {
      if (!ativo) return;

      const opcoesGerais = await carregarOpcoesGerais();
      if (!ativo) return;

      if (opcoesGerais) {
        aplicarRotulosAdministradores(
          Array.isArray(opcoesGerais.atendentes) ? opcoesGerais.atendentes : []
        );
      }

      if (!encontrarPainelAtribuicao()) return;

      const setoresPermitidos = await carregarSetoresAtribuicao();
      if (!ativo) return;
      await enriquecerPainelAtribuicao(setoresPermitidos);
    }

    function agendarSincronizacao() {
      if (!ativo || framePendente !== null) return;

      framePendente = window.requestAnimationFrame(() => {
        framePendente = null;
        void sincronizarInterface();
      });
    }

    const fetchInterceptado: typeof window.fetch = async (input, init) => {
      const url = obterUrlFetch(input);
      const metodo = obterMetodoFetch(input, init);

      if (
        metodo === "POST" &&
        ATRIBUIR_URL_PATTERN.test(url) &&
        setorSelecionado &&
        typeof init?.body === "string"
      ) {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          return await fetchOriginal(input, {
            ...init,
            body: JSON.stringify({
              ...body,
              setor_id: setorSelecionado,
            }),
          });
        } catch {
          return await fetchOriginal(input, init);
        }
      }

      return await fetchOriginal(input, init);
    };

    window.fetch = fetchInterceptado;

    const observer = new MutationObserver(agendarSincronizacao);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    agendarSincronizacao();

    return () => {
      ativo = false;
      observer.disconnect();

      if (framePendente !== null) {
        window.cancelAnimationFrame(framePendente);
      }

      if (window.fetch === fetchInterceptado) {
        window.fetch = fetchOriginal;
      }
    };
  }, []);

  return null;
}
