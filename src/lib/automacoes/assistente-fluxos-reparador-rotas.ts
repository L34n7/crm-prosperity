import { randomUUID } from "crypto";

import type {
  AssistenteAutomacaoConexao,
  AssistenteAutomacaoNo,
} from "./assistente-fluxos-base";
import {
  clonarConexao,
  clonarNo,
  conteudoNo,
  ehAbrirLocalizacao,
  ehAgendamento,
  ehAntesDepois,
  ehEspecialista,
  ehFaq,
  ehLocalizacao,
  ehMenuFaq,
  ehTerminal,
  ehValores,
  ehVoltarMenu,
  encontrarPorTipo,
  normalizar,
  opcoesNo,
  respostaCorrespondeFaq,
  servicoDoNo,
  servicoDoTexto,
  type OpcaoNo,
  type Servico,
} from "./assistente-fluxos-reparador-semantica";

export function criarConexaoSempre(
  origem: string,
  destino: string,
  ordem: number,
  rotulo = "Sempre seguir"
): AssistenteAutomacaoConexao {
  return {
    id: randomUUID(),
    no_origem_id: origem,
    no_destino_id: destino,
    rotulo,
    ordem,
    condicao_json: { tipo: "sempre" },
    usar_ia: false,
    descricao_ia: null,
  };
}

export function criarConexaoOpcao(params: {
  origem: string;
  destino: string;
  opcao: OpcaoNo;
  ordem: number;
}): AssistenteAutomacaoConexao {
  return {
    id: randomUUID(),
    no_origem_id: params.origem,
    no_destino_id: params.destino,
    rotulo: params.opcao.titulo,
    ordem: params.ordem,
    condicao_json: {
      tipo: "resposta_contem",
      valor: params.opcao.id,
    },
    usar_ia: false,
    descricao_ia: null,
  };
}

export function idsAlcancaveis(
  nos: AssistenteAutomacaoNo[],
  conexoes: AssistenteAutomacaoConexao[]
) {
  const inicio = nos.find((no) => no.tipo_no === "inicio");
  const alcancaveis = new Set<string>();
  if (!inicio) return alcancaveis;

  const fila = [inicio.id];
  while (fila.length > 0) {
    const atual = fila.shift();
    if (!atual || alcancaveis.has(atual)) continue;
    alcancaveis.add(atual);

    for (const conexao of conexoes) {
      if (
        conexao.no_origem_id === atual &&
        !alcancaveis.has(conexao.no_destino_id)
      ) {
        fila.push(conexao.no_destino_id);
      }
    }
  }
  return alcancaveis;
}

export function criarNoEncerrar(): AssistenteAutomacaoNo {
  return {
    id: randomUUID(),
    tipo_no: "encerrar",
    titulo: "Encerrar atendimento",
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: {
      mensagem: "Obrigado pelo contato. Permanecemos à disposição.",
      resultado_fluxo: "positivo",
      valor_conversao_tipo: "sem_valor",
    },
    delay_segundos: 3,
  };
}

export function criarNoFallback(opcao: OpcaoNo): AssistenteAutomacaoNo {
  return {
    id: randomUUID(),
    tipo_no: "enviar_texto",
    titulo: opcao.titulo.slice(0, 120) || "Informações",
    descricao: null,
    posicao_x: 0,
    posicao_y: 0,
    configuracao_json: {
      mensagem: `Você escolheu “${opcao.titulo}”. Em seguida, selecione como deseja continuar.`,
    },
    delay_segundos: 3,
  };
}

export function escolherDestinoSemantico(params: {
  origem: AssistenteAutomacaoNo;
  opcao: OpcaoNo;
  nos: AssistenteAutomacaoNo[];
  usados: Set<string>;
  mainMenu: AssistenteAutomacaoNo | null;
  menusProcedimento: Map<Servico, AssistenteAutomacaoNo>;
  primeirosConteudos: Map<Servico, AssistenteAutomacaoNo>;
  menusFaq: Map<Servico, AssistenteAutomacaoNo>;
  ordemNos: Map<string, number>;
}) {
  const {
    origem,
    opcao,
    nos,
    usados,
    mainMenu,
    menusProcedimento,
    primeirosConteudos,
    menusFaq,
    ordemNos,
  } = params;
  const servicoOpcao = servicoDoTexto(opcao.titulo);
  const servicoOrigem = servicoDoNo(origem);
  const origemFaq = ehMenuFaq(origem, servicoOrigem);
  const diretos: Array<AssistenteAutomacaoNo | null | undefined> = [];

  if (ehVoltarMenu(opcao.titulo)) {
    diretos.push(
      origemFaq && servicoOrigem
        ? menusProcedimento.get(servicoOrigem)
        : mainMenu
    );
  }
  if (servicoOpcao) {
    diretos.push(
      primeirosConteudos.get(servicoOpcao),
      menusProcedimento.get(servicoOpcao)
    );
  }
  if (ehAgendamento(opcao.titulo)) {
    diretos.push(
      encontrarPorTipo(nos, ["agenda_escolher_horario"]),
      encontrarPorTipo(nos, ["agenda_criar_agendamento"])
    );
  }
  if (ehAbrirLocalizacao(opcao.titulo)) {
    diretos.push(encontrarPorTipo(nos, ["botao_redirect"]));
  } else if (ehLocalizacao(opcao.titulo)) {
    diretos.push(
      nos.find(
        (no) =>
          no.id !== origem.id &&
          !ehTerminal(no) &&
          ehLocalizacao(conteudoNo(no)) &&
          no.tipo_no !== "botao_redirect"
      ),
      encontrarPorTipo(nos, ["botao_redirect"])
    );
  }
  if (ehEspecialista(opcao.titulo)) {
    diretos.push(encontrarPorTipo(nos, ["transferir_setor"]));
  }
  if (ehAntesDepois(opcao.titulo)) {
    diretos.push(
      nos.find(
        (no) =>
          no.id !== origem.id &&
          no.tipo_no === "enviar_imagem" &&
          (!servicoOrigem ||
            !servicoDoNo(no) ||
            servicoDoNo(no) === servicoOrigem)
      ),
      nos.find(
        (no) =>
          no.id !== origem.id &&
          ehAntesDepois(conteudoNo(no)) &&
          (!servicoOrigem ||
            !servicoDoNo(no) ||
            servicoDoNo(no) === servicoOrigem)
      )
    );
  }
  if (ehValores(opcao.titulo)) {
    diretos.push(
      nos.find(
        (no) =>
          no.id !== origem.id &&
          ehValores(conteudoNo(no)) &&
          (!servicoOrigem ||
            !servicoDoNo(no) ||
            servicoDoNo(no) === servicoOrigem)
      )
    );
  }
  if (ehFaq(opcao.titulo) && !origemFaq) {
    diretos.push(
      servicoOrigem ? menusFaq.get(servicoOrigem) : null,
      nos.find((no) => no.id !== origem.id && ehMenuFaq(no, servicoOrigem))
    );
  }
  if (origemFaq) {
    diretos.push(
      nos.find(
        (no) =>
          no.id !== origem.id &&
          respostaCorrespondeFaq(opcao, no) &&
          (!servicoOrigem || servicoDoNo(no) === servicoOrigem) &&
          !usados.has(no.id)
      )
    );
  }

  for (const candidato of diretos) {
    if (candidato && candidato.id !== origem.id && !usados.has(candidato.id)) {
      return candidato;
    }
  }

  if (origemFaq) {
    const reutilizavel = nos.find(
      (no) =>
        no.id !== origem.id &&
        respostaCorrespondeFaq(opcao, no) &&
        (!servicoOrigem || servicoDoNo(no) === servicoOrigem)
    );
    if (reutilizavel) return reutilizavel;

    // Uma FAQ sem resposta semanticamente correspondente e insegura para
    // reparo por similaridade. A validacao posterior deve bloquear o plano e
    // solicitar nova geracao, em vez de trocar dor por duracao, por exemplo.
    return null;
  }

  const alvo = normalizar(opcao.titulo);
  const classificados = nos
    .filter(
      (no) =>
        no.id !== origem.id &&
        !ehTerminal(no) &&
        !usados.has(no.id) &&
        no.tipo_no !== "inicio"
    )
    .map((no) => {
      const conteudo = conteudoNo(no);
      const servicoNo = servicoDoNo(no);
      let pontos = 0;

      for (const palavra of alvo.split(" ").filter((item) => item.length >= 3)) {
        if (conteudo.includes(palavra)) pontos += 8;
      }
      if (servicoOrigem && servicoNo === servicoOrigem) pontos += 15;
      if (servicoOpcao && servicoNo === servicoOpcao) pontos += 40;
      if (origemFaq && no.tipo_no === "enviar_texto") pontos += 20;
      if (no.tipo_no === "enviar_texto") pontos += 3;

      return {
        no,
        pontos,
        ordem: ordemNos.get(no.id) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem);

  return classificados[0]?.pontos > 0 ? classificados[0].no : null;
}

export function clonarDestinoParaOpcao(params: {
  destino: AssistenteAutomacaoNo;
  opcao: OpcaoNo;
  nos: AssistenteAutomacaoNo[];
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const clone: AssistenteAutomacaoNo = {
    ...clonarNo(params.destino),
    id: randomUUID(),
    titulo: `${params.destino.titulo} · ${params.opcao.titulo}`.slice(0, 120),
  };
  params.nos.push(clone);

  for (const saida of params.conexoes.filter(
    (conexao) => conexao.no_origem_id === params.destino.id
  )) {
    params.conexoes.push({
      ...clonarConexao(saida),
      id: randomUUID(),
      no_origem_id: clone.id,
    });
  }
  return clone;
}

export function substituirSempre(params: {
  origem: AssistenteAutomacaoNo;
  destino: AssistenteAutomacaoNo;
  conexoes: AssistenteAutomacaoConexao[];
}) {
  const conexoes = params.conexoes.filter(
    (conexao) =>
      !(
        conexao.no_origem_id === params.origem.id &&
        conexao.condicao_json?.tipo === "sempre"
      )
  );
  conexoes.push(
    criarConexaoSempre(
      params.origem.id,
      params.destino.id,
      conexoes.length + 1
    )
  );
  return conexoes;
}

export function deduplicarSempre(
  conexoes: AssistenteAutomacaoConexao[],
  avisos: string[]
) {
  const vistas = new Set<string>();
  let removidas = 0;
  const resultado = [...conexoes]
    .sort((a, b) => a.ordem - b.ordem)
    .filter((conexao) => {
      if (conexao.condicao_json?.tipo !== "sempre") return true;
      if (vistas.has(conexao.no_origem_id)) {
        removidas += 1;
        return false;
      }
      vistas.add(conexao.no_origem_id);
      return true;
    });

  if (removidas > 0) {
    avisos.push(
      `${removidas} conexão(ões) incondicional(is) excedente(s) foram removidas.`
    );
  }
  return resultado;
}

export function pontuarAncora(
  no: AssistenteAutomacaoNo,
  candidato: AssistenteAutomacaoNo
) {
  const servico = servicoDoNo(no);
  const conteudo = conteudoNo(candidato);
  const palavras = new Set(
    conteudoNo(no)
      .split(" ")
      .filter((palavra) => palavra.length >= 4)
  );
  let pontos = 0;

  if (servico && servicoDoNo(candidato) === servico) pontos += 100;
  if (ehFaq(conteudoNo(no)) && ehFaq(conteudo)) pontos += 80;
  if (ehValores(conteudoNo(no)) && ehValores(conteudo)) pontos += 80;
  if (
    (ehAntesDepois(conteudoNo(no)) || no.tipo_no === "enviar_imagem") &&
    (ehAntesDepois(conteudo) || candidato.tipo_no === "enviar_imagem")
  ) {
    pontos += 80;
  }
  if (
    (ehLocalizacao(conteudoNo(no)) || no.tipo_no === "botao_redirect") &&
    (ehLocalizacao(conteudo) || candidato.tipo_no === "botao_redirect")
  ) {
    pontos += 80;
  }
  if (
    (ehAgendamento(conteudoNo(no)) || no.tipo_no.startsWith("agenda_")) &&
    (ehAgendamento(conteudo) || candidato.tipo_no.startsWith("agenda_"))
  ) {
    pontos += 80;
  }
  for (const palavra of palavras) {
    if (conteudo.includes(palavra)) pontos += 2;
  }
  return pontos;
}

export function opcoesDaPergunta(no: AssistenteAutomacaoNo) {
  return opcoesNo(no);
}
