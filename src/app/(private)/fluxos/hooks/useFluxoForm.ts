"use client";

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  escoposIntegracaoConflitam,
  montarEscopoIntegracoesFluxo,
  normalizarEscopoIntegracoesFluxo,
} from "../fluxo-integracoes";
import type {
  EscopoIntegracoesModo,
  Fluxo,
  GatilhoFluxo,
  IntegracaoWhatsappOpcao,
} from "../types";

type GatilhoNovoFluxo = {
  valor: string;
  condicao: GatilhoFluxo["condicao"];
  ativo?: boolean;
};

type UnidadeInatividade = "minutos" | "horas";

type UseFluxoFormOptions = {
  fluxos: Fluxo[];
  fluxoSelecionado: Fluxo | null;
  setFluxoSelecionado: Dispatch<SetStateAction<Fluxo | null>>;
  integracoesWhatsapp: IntegracaoWhatsappOpcao[];
  limiteIntegracoesWhatsappFluxos: number;
  carregarFluxos: () => Promise<void>;
  gatilhosNovoFluxo: GatilhoNovoFluxo[];
  resetarGatilhosNovoFluxo: () => void;
  resetarNovoGatilho: () => void;
  setGatilhosFluxo: Dispatch<SetStateAction<GatilhoFluxo[]>>;
  carregarGatilhosFluxo: (fluxoId: string) => Promise<void>;
  navegarParaFluxo: (fluxoId: string) => void;
  onErroEdicao: (message: string) => void;
  onErroCriacao: (message: string) => void;
  onClearError: () => void;
  onClearSuccess: () => void;
  onSuccess: (message: string) => void;
};

const MENSAGEM_INATIVIDADE_PADRAO =
  "Como não tivemos retorno, este atendimento será encerrado. Caso precise de ajuda, envie uma nova mensagem.";

export default function useFluxoForm({
  fluxos,
  fluxoSelecionado,
  setFluxoSelecionado,
  integracoesWhatsapp,
  limiteIntegracoesWhatsappFluxos,
  carregarFluxos,
  gatilhosNovoFluxo,
  resetarGatilhosNovoFluxo,
  resetarNovoGatilho,
  setGatilhosFluxo,
  carregarGatilhosFluxo,
  navegarParaFluxo,
  onErroEdicao,
  onErroCriacao,
  onClearError,
  onClearSuccess,
  onSuccess,
}: UseFluxoFormOptions) {
  const [abrirCriacao, setAbrirCriacao] = useState(false);
  const [descricaoNovoFluxo, setDescricaoNovoFluxo] = useState("");
  const [novoFluxoNome, setNovoFluxoNome] = useState("");
  const [novoFluxoPadrao, setNovoFluxoPadrao] = useState(false);
  const [
    novoFluxoEscopoIntegracoesModo,
    setNovoFluxoEscopoIntegracoesModo,
  ] = useState<EscopoIntegracoesModo>("todas");
  const [novoFluxoIntegracoesIds, setNovoFluxoIntegracoesIds] = useState<
    string[]
  >([]);

  const [editandoFluxo, setEditandoFluxo] = useState(false);
  const [fluxoEmEdicao, setFluxoEmEdicao] = useState<Fluxo | null>(null);
  const [nomeFluxoEdicao, setNomeFluxoEdicao] = useState("");
  const [descricaoFluxoEdicao, setDescricaoFluxoEdicao] = useState("");
  const [fluxoPadraoEdicao, setFluxoPadraoEdicao] = useState(false);
  const [
    fluxoEscopoIntegracoesModoEdicao,
    setFluxoEscopoIntegracoesModoEdicao,
  ] = useState<EscopoIntegracoesModo>("todas");
  const [fluxoIntegracoesIdsEdicao, setFluxoIntegracoesIdsEdicao] =
    useState<string[]>([]);

  const [
    encerrarInatividadeQuantidade,
    setEncerrarInatividadeQuantidade,
  ] = useState("23");
  const [
    encerrarInatividadeUnidade,
    setEncerrarInatividadeUnidade,
  ] = useState<UnidadeInatividade>("horas");
  const [
    encerrarInatividadeMensagem,
    setEncerrarInatividadeMensagem,
  ] = useState(MENSAGEM_INATIVIDADE_PADRAO);

  const deveMostrarEscopoIntegracoesFluxo =
    limiteIntegracoesWhatsappFluxos > 1 || integracoesWhatsapp.length > 1;

  const resetarEncerramentoInatividadePadrao = useCallback(() => {
    setEncerrarInatividadeQuantidade("23");
    setEncerrarInatividadeUnidade("horas");
    setEncerrarInatividadeMensagem(MENSAGEM_INATIVIDADE_PADRAO);
  }, []);

  const alternarIntegracaoEscopoNovoFluxo = useCallback(
    (integracaoId: string) => {
      setNovoFluxoIntegracoesIds((atuais) =>
        atuais.includes(integracaoId)
          ? atuais.filter((id) => id !== integracaoId)
          : [...atuais, integracaoId]
      );
    },
    []
  );

  const alternarIntegracaoEscopoEdicao = useCallback(
    (integracaoId: string) => {
      setFluxoIntegracoesIdsEdicao((atuais) =>
        atuais.includes(integracaoId)
          ? atuais.filter((id) => id !== integracaoId)
          : [...atuais, integracaoId]
      );
    },
    []
  );

  const jaExisteFluxoPadrao = useMemo(() => {
    const escopoNovo = montarEscopoIntegracoesFluxo(
      deveMostrarEscopoIntegracoesFluxo
        ? novoFluxoEscopoIntegracoesModo
        : "todas",
      deveMostrarEscopoIntegracoesFluxo ? novoFluxoIntegracoesIds : []
    );

    return fluxos.some(
      (fluxo) =>
        fluxo.fluxo_padrao &&
        fluxo.status !== "arquivado" &&
        escoposIntegracaoConflitam(
          escopoNovo,
          normalizarEscopoIntegracoesFluxo(fluxo.configuracao_json)
        )
    );
  }, [
    deveMostrarEscopoIntegracoesFluxo,
    fluxos,
    novoFluxoEscopoIntegracoesModo,
    novoFluxoIntegracoesIds,
  ]);

  const obterFluxoAlvoEdicao = useCallback(
    () => fluxoEmEdicao || fluxoSelecionado,
    [fluxoEmEdicao, fluxoSelecionado]
  );

  const existeOutroFluxoPadraoNaEmpresa = useCallback(() => {
    const fluxoParaEditar = obterFluxoAlvoEdicao();

    if (!fluxoParaEditar) return false;

    const escopoEdicao = montarEscopoIntegracoesFluxo(
      deveMostrarEscopoIntegracoesFluxo
        ? fluxoEscopoIntegracoesModoEdicao
        : "todas",
      deveMostrarEscopoIntegracoesFluxo
        ? fluxoIntegracoesIdsEdicao
        : []
    );

    return fluxos.some(
      (fluxo) =>
        fluxo.fluxo_padrao &&
        fluxo.status !== "arquivado" &&
        fluxo.id !== fluxoParaEditar.id &&
        escoposIntegracaoConflitam(
          escopoEdicao,
          normalizarEscopoIntegracoesFluxo(fluxo.configuracao_json)
        )
    );
  }, [
    deveMostrarEscopoIntegracoesFluxo,
    fluxoEscopoIntegracoesModoEdicao,
    fluxoIntegracoesIdsEdicao,
    fluxos,
    obterFluxoAlvoEdicao,
  ]);

  const abrirCriacaoFluxo = useCallback(() => {
    onErroCriacao("");
    setNovoFluxoNome("");
    setDescricaoNovoFluxo("");
    setNovoFluxoPadrao(false);
    setNovoFluxoEscopoIntegracoesModo("todas");
    setNovoFluxoIntegracoesIds([]);
    resetarGatilhosNovoFluxo();
    resetarNovoGatilho();
    resetarEncerramentoInatividadePadrao();
    setAbrirCriacao(true);
  }, [
    onErroCriacao,
    resetarEncerramentoInatividadePadrao,
    resetarGatilhosNovoFluxo,
    resetarNovoGatilho,
  ]);

  const fecharCriacaoFluxo = useCallback(() => {
    onErroCriacao("");
    setAbrirCriacao(false);
  }, [onErroCriacao]);

  const criarFluxoRapido = useCallback(async () => {
    try {
      onClearError();
      onErroEdicao("");
      onClearSuccess();
      onErroCriacao("");

      const nome = novoFluxoNome.trim();

      if (!nome) {
        onErroCriacao("Informe o nome do fluxo.");
        return;
      }

      const fluxoPadraoFinal = !jaExisteFluxoPadrao && novoFluxoPadrao;
      const gatilhosValidos = gatilhosNovoFluxo.filter((gatilho) =>
        String(gatilho.valor || "").trim()
      );

      if (!fluxoPadraoFinal && gatilhosValidos.length === 0) {
        onErroCriacao(
          "Adicione pelo menos uma palavra-chave para iniciar o fluxo."
        );
        return;
      }

      const quantidadeInformada = Number(
        encerrarInatividadeQuantidade || 0
      );
      const segundosInatividade =
        encerrarInatividadeUnidade === "horas"
          ? quantidadeInformada * 60 * 60
          : quantidadeInformada * 60;

      if (
        !Number.isFinite(segundosInatividade) ||
        quantidadeInformada <= 0
      ) {
        onErroCriacao(
          "Informe um tempo válido para o encerramento por inatividade."
        );
        return;
      }

      if (segundosInatividade < 5 * 60) {
        onErroCriacao(
          "O tempo mínimo para encerramento por inatividade é de 5 minutos."
        );
        return;
      }

      if (segundosInatividade > 23 * 60 * 60) {
        onErroCriacao(
          "O tempo máximo para encerramento por inatividade é de 23 horas."
        );
        return;
      }

      const escopoIntegracoes = montarEscopoIntegracoesFluxo(
        deveMostrarEscopoIntegracoesFluxo
          ? novoFluxoEscopoIntegracoesModo
          : "todas",
        deveMostrarEscopoIntegracoesFluxo ? novoFluxoIntegracoesIds : []
      );

      if (
        deveMostrarEscopoIntegracoesFluxo &&
        novoFluxoEscopoIntegracoesModo === "selecionadas" &&
        escopoIntegracoes.ids.length === 0
      ) {
        onErroCriacao(
          "Selecione pelo menos uma integração WhatsApp."
        );
        return;
      }

      const res = await fetch("/api/automacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          descricao: descricaoNovoFluxo,
          canal: "whatsapp",
          status: "rascunho",
          fluxo_padrao: fluxoPadraoFinal,
          gatilhos: fluxoPadraoFinal
            ? []
            : gatilhosValidos.map((gatilho) => ({
                tipo_gatilho: "palavra_chave",
                valor: gatilho.valor,
                condicao: gatilho.condicao,
                ativo: gatilho.ativo !== false,
              })),
          configuracao_json: {
            integracoes_whatsapp: escopoIntegracoes,
            encerramento_inatividade: {
              ativo: true,
              tempo_quantidade: quantidadeInformada,
              tempo_unidade: encerrarInatividadeUnidade,
              mensagem: encerrarInatividadeMensagem.trim(),
            },
          },
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao criar fluxo.");
      }

      const fluxoCriado = json.fluxo as Fluxo;

      setNovoFluxoNome("");
      setDescricaoNovoFluxo("");
      resetarGatilhosNovoFluxo();
      setNovoFluxoPadrao(false);
      setNovoFluxoEscopoIntegracoesModo("todas");
      setNovoFluxoIntegracoesIds([]);
      resetarNovoGatilho();
      resetarEncerramentoInatividadePadrao();
      setAbrirCriacao(false);

      onSuccess("Fluxo criado com sucesso.");
      await carregarFluxos();
      setFluxoSelecionado(fluxoCriado);
      navegarParaFluxo(fluxoCriado.id);
    } catch (error: unknown) {
      onErroCriacao(
        error instanceof Error ? error.message : "Erro ao criar fluxo."
      );
    }
  }, [
    carregarFluxos,
    descricaoNovoFluxo,
    deveMostrarEscopoIntegracoesFluxo,
    encerrarInatividadeMensagem,
    encerrarInatividadeQuantidade,
    encerrarInatividadeUnidade,
    gatilhosNovoFluxo,
    jaExisteFluxoPadrao,
    navegarParaFluxo,
    novoFluxoEscopoIntegracoesModo,
    novoFluxoIntegracoesIds,
    novoFluxoNome,
    novoFluxoPadrao,
    onClearError,
    onClearSuccess,
    onErroCriacao,
    onErroEdicao,
    onSuccess,
    resetarEncerramentoInatividadePadrao,
    resetarGatilhosNovoFluxo,
    resetarNovoGatilho,
    setFluxoSelecionado,
  ]);

  const abrirEdicaoFluxo = useCallback(
    (fluxoAlvo?: Fluxo) => {
      const fluxoParaEditar = fluxoAlvo || fluxoSelecionado;
      if (!fluxoParaEditar) return;

    if (fluxoPadraoEdicao && existeOutroFluxoPadraoNaEmpresa()) {
      onErroEdicao(
        "Já existe outro fluxo padrão cadastrado. Desmarque o fluxo padrão atual antes de definir este fluxo como padrão."
      );
      return;
    }

      onErroEdicao("");
      onClearError();
      setFluxoEmEdicao(fluxoParaEditar);
      setEditandoFluxo(true);
      setNomeFluxoEdicao(fluxoParaEditar.nome || "");
      setDescricaoFluxoEdicao(fluxoParaEditar.descricao || "");
      setFluxoPadraoEdicao(Boolean(fluxoParaEditar.fluxo_padrao));

      const config = fluxoParaEditar.configuracao_json || {};
      const escopoIntegracoes = normalizarEscopoIntegracoesFluxo(config);
      setFluxoEscopoIntegracoesModoEdicao(escopoIntegracoes.modo);
      setFluxoIntegracoesIdsEdicao(escopoIntegracoes.ids);

      const encerramento = config.encerramento_inatividade || {};
      const unidadeEncerramento: UnidadeInatividade =
        encerramento.tempo_unidade === "minutos" ? "minutos" : "horas";
      const quantidadePadraoEncerramento =
        unidadeEncerramento === "minutos" ? 1380 : 23;

      setEncerrarInatividadeQuantidade(
        String(
          encerramento.tempo_quantidade || quantidadePadraoEncerramento
        )
      );
      setEncerrarInatividadeUnidade(unidadeEncerramento);
      setEncerrarInatividadeMensagem(
        String(encerramento.mensagem || MENSAGEM_INATIVIDADE_PADRAO)
      );

      resetarNovoGatilho();

      if (fluxoParaEditar.fluxo_padrao) {
        setGatilhosFluxo([]);
      } else {
        void carregarGatilhosFluxo(fluxoParaEditar.id);
      }
    },
    [
      carregarGatilhosFluxo,
      fluxoSelecionado,
      onClearError,
      resetarNovoGatilho,
      setGatilhosFluxo,
      existeOutroFluxoPadraoNaEmpresa,
      fluxoPadraoEdicao,
      onErroEdicao,
    ]
  );

  const fecharEdicaoFluxo = useCallback(() => {
    onErroEdicao("");
    setEditandoFluxo(false);
    setFluxoEmEdicao(null);
  }, [onErroEdicao]);

  const salvarEdicaoFluxo = useCallback(async () => {
    const fluxoParaEditar = obterFluxoAlvoEdicao();
    if (!fluxoParaEditar) return;

    const quantidadeInformada = Number(
      encerrarInatividadeQuantidade || 0
    );
    const segundosInatividade =
      encerrarInatividadeUnidade === "horas"
        ? quantidadeInformada * 60 * 60
        : quantidadeInformada * 60;

    if (
      !Number.isFinite(segundosInatividade) ||
      quantidadeInformada <= 0
    ) {
      onErroEdicao(
        "Informe um tempo válido para o encerramento por inatividade."
      );
      return;
    }

    if (segundosInatividade < 5 * 60) {
      onErroEdicao(
        "O tempo mínimo para encerramento por inatividade é de 5 minutos."
      );
      return;
    }

    if (segundosInatividade > 23 * 60 * 60) {
      onErroEdicao(
        "O tempo máximo para encerramento por inatividade é de 23 horas."
      );
      return;
    }

    const escopoIntegracoes = montarEscopoIntegracoesFluxo(
      deveMostrarEscopoIntegracoesFluxo
        ? fluxoEscopoIntegracoesModoEdicao
        : "todas",
      deveMostrarEscopoIntegracoesFluxo
        ? fluxoIntegracoesIdsEdicao
        : []
    );

    if (
      deveMostrarEscopoIntegracoesFluxo &&
      fluxoEscopoIntegracoesModoEdicao === "selecionadas" &&
      escopoIntegracoes.ids.length === 0
    ) {
      onErroEdicao(
        "Selecione pelo menos uma integração WhatsApp."
      );
      return;
    }

    try {
      onClearError();
      onClearSuccess();

      const res = await fetch("/api/automacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: fluxoParaEditar.id,
          nome: nomeFluxoEdicao,
          descricao: descricaoFluxoEdicao,
          fluxo_padrao: fluxoPadraoEdicao,
          configuracao_json: {
            ...(fluxoParaEditar.configuracao_json || {}),
            integracoes_whatsapp: escopoIntegracoes,
            encerramento_inatividade: {
              ativo: true,
              tempo_quantidade: quantidadeInformada,
              tempo_unidade: encerrarInatividadeUnidade,
              mensagem: encerrarInatividadeMensagem.trim(),
            },
          },
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erro ao editar fluxo.");
      }

      onSuccess("Fluxo atualizado com sucesso.");
      setEditandoFluxo(false);
      setFluxoEmEdicao(null);
      setFluxoSelecionado(json.fluxo);
      await carregarFluxos();
    } catch (error: unknown) {
      onErroEdicao(
        error instanceof Error ? error.message : "Erro ao editar fluxo."
      );
    }
  }, [
    carregarFluxos,
    descricaoFluxoEdicao,
    deveMostrarEscopoIntegracoesFluxo,
    encerrarInatividadeMensagem,
    encerrarInatividadeQuantidade,
    encerrarInatividadeUnidade,
    fluxoEscopoIntegracoesModoEdicao,
    fluxoIntegracoesIdsEdicao,
    fluxoPadraoEdicao,
    nomeFluxoEdicao,
    obterFluxoAlvoEdicao,
    onClearError,
    onClearSuccess,
    onSuccess,
    onErroEdicao,
    setFluxoSelecionado,
  ]);

  const obterLimitesInatividade = useCallback(
    (unidade: UnidadeInatividade) =>
      unidade === "horas"
        ? { min: 1, max: 23 }
        : { min: 5, max: 1380 },
    []
  );

  const limitarQuantidadeInatividade = useCallback(
    (valor: string, unidade: UnidadeInatividade) => {
      const somenteNumeros = valor.replace(/\D/g, "");
      if (!somenteNumeros) return "";

      const numero = Number(somenteNumeros);
      const limites = obterLimitesInatividade(unidade);

      if (!Number.isFinite(numero)) return "";
      if (numero > limites.max) return String(limites.max);

      return String(numero);
    },
    [obterLimitesInatividade]
  );

  const corrigirQuantidadeMinimaInatividade = useCallback(
    (valor: string, unidade: UnidadeInatividade) => {
      const numero = Number(valor || 0);
      const limites = obterLimitesInatividade(unidade);

      if (!Number.isFinite(numero) || numero < limites.min) {
        return String(limites.min);
      }

      if (numero > limites.max) return String(limites.max);
      return String(numero);
    },
    [obterLimitesInatividade]
  );

  return {
    abrirCriacao,
    descricaoNovoFluxo,
    setDescricaoNovoFluxo,
    novoFluxoNome,
    setNovoFluxoNome,
    novoFluxoPadrao,
    setNovoFluxoPadrao,
    novoFluxoEscopoIntegracoesModo,
    setNovoFluxoEscopoIntegracoesModo,
    novoFluxoIntegracoesIds,
    setNovoFluxoIntegracoesIds,
    deveMostrarEscopoIntegracoesFluxo,
    jaExisteFluxoPadrao,
    alternarIntegracaoEscopoNovoFluxo,
    abrirCriacaoFluxo,
    fecharCriacaoFluxo,
    criarFluxoRapido,
    editandoFluxo,
    fluxoEmEdicao,
    nomeFluxoEdicao,
    setNomeFluxoEdicao,
    descricaoFluxoEdicao,
    setDescricaoFluxoEdicao,
    fluxoPadraoEdicao,
    setFluxoPadraoEdicao,
    fluxoEscopoIntegracoesModoEdicao,
    setFluxoEscopoIntegracoesModoEdicao,
    fluxoIntegracoesIdsEdicao,
    setFluxoIntegracoesIdsEdicao,
    alternarIntegracaoEscopoEdicao,
    existeOutroFluxoPadraoNaEmpresa,
    abrirEdicaoFluxo,
    fecharEdicaoFluxo,
    salvarEdicaoFluxo,
    encerrarInatividadeQuantidade,
    setEncerrarInatividadeQuantidade,
    encerrarInatividadeUnidade,
    setEncerrarInatividadeUnidade,
    encerrarInatividadeMensagem,
    setEncerrarInatividadeMensagem,
    resetarEncerramentoInatividadePadrao,
    limitarQuantidadeInatividade,
    corrigirQuantidadeMinimaInatividade,
  };
}
