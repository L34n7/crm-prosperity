import { NextResponse } from "next/server";

import { getUsuarioContexto } from "@/lib/auth/get-usuario-contexto";
import {
  extrairUsoTokensIa,
  registrarUsoTokensIa,
  verificarSaldoTokensIa,
} from "@/lib/ia/tokens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const db = getSupabaseAdmin();
type Objeto = Record<string, unknown>;

type RespostaConversa = {
  pergunta_id?: unknown;
  pergunta?: unknown;
  resposta?: unknown;
  respondida_em?: unknown;
};

type ProblemaPlano = {
  codigo: string;
  ref: string | null;
  mensagem: string;
};

type RotaPlano = {
  origem: string;
  destino: string;
  condicao: string;
  valor: string | null;
  rotulo: string | null;
  descricao_ia: string | null;
  timeout_segundos: number | null;
};

type ReparoAplicado = {
  tipo: string;
  detalhe: string;
};

type NoPersistido = {
  id: string;
  tipo_no: string;
  titulo: string | null;
};

type ConexaoPersistida = {
  id: string;
  no_origem_id: string;
  no_destino_id: string;
};

const TERMINAIS = new Set(["transferir", "encerrar"]);
const PERGUNTAS = new Set([
  "pergunta_opcoes",
  "pergunta_botoes",
  "pergunta_livre_ia",
]);
const MARCADOR_ARQUITETURA =
  "[REGRAS_ARQUITETURA_REPARAVEL_V4_2026_07_25]";
const MAX_REPAROS_IA = 2;

const REGRAS_ARQUITETURA = `
${MARCADOR_ARQUITETURA}

REGRAS DEFINITIVAS DE ARQUITETURA E COPY

1. EXCESSO E TIMEOUT
- Existe uma configuracao padrao unica para excesso de tentativas e timeout do fluxo.
- Blocos comuns deixam setor_excesso_tentativas, estrategia_excesso_tentativas e atendente_excesso_tentativas como null.
- Preencha esses campos individualmente somente quando o pedido exigir destino realmente diferente.
- Nao replique a mesma configuracao em cada menu, FAQ ou captura.

2. FASES INTERNAS OBRIGATORIAS
- Primeiro monte e congele a arquitetura: etapas, refs, opcoes, rotas, retornos e terminais.
- Depois escreva as mensagens e titulos sem adicionar, remover ou redirecionar etapas.
- A copy nunca pode alterar o grafo ja congelado.

3. INVARIANTES DO GRAFO
- Toda etapa diferente de inicio deve possuir pelo menos uma entrada.
- Toda etapa diferente de transferir e encerrar deve possuir pelo menos uma saida.
- Toda etapa deve ser alcancavel partindo de inicio.
- Todo transferir ou encerrar deve possuir pelo menos uma entrada.
- Nao crie etapa sem uso. Nao crie encerrar apenas para satisfazer regra generica.
- Transferir ja e um terminal valido e nao exige encerrar adicional.

4. FAQ
- Para cada pergunta real do FAQ deve existir exatamente uma resposta exclusiva.
- A opcao deve apontar para a resposta correta.
- Cada resposta deve possuir uma rota sempre para o menu pos-FAQ do mesmo contexto.
- O menu pos-FAQ deve permitir outras duvidas, proximo passo e retorno ao contexto.
- E proibido terminar resposta de FAQ sem conexao de saida.

5. LIMITES
- pergunta_botoes: cada titulo deve possuir no maximo 20 unidades UTF-16.
- redirect: botao_texto deve possuir no maximo 20 unidades UTF-16.
- pergunta_opcoes: mantenha titulos curtos e objetivos, preferencialmente ate 24 unidades UTF-16.

6. AUDITORIA INTERNA
Antes de responder, confirme que estes totais sao zero:
- etapas sem entrada;
- etapas nao terminais sem saida;
- etapas inalcancaveis;
- opcoes sem rota;
- opcoes com mais de uma rota;
- respostas de FAQ sem retorno;
- terminais sem entrada.

Retorne o fluxo completo. Nao interrompa a criacao por falha reparavel.
`.trim();

function objeto(valor: unknown): Objeto {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Objeto)
    : {};
}

function texto(valor: unknown, limite = 160) {
  return String(valor || "").trim().slice(0, limite);
}

function normalizar(valor: unknown) {
  return texto(valor, 500)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function listasIguais(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, indice) => item === b[indice]);
}

function etapasPlano(plano: Objeto) {
  return Array.isArray(plano.etapas) ? plano.etapas.map(objeto) : [];
}

function rotasPlano(plano: Objeto): RotaPlano[] {
  return Array.isArray(plano.rotas)
    ? plano.rotas.map((item) => {
        const rota = objeto(item);
        return {
          origem: texto(rota.origem, 180),
          destino: texto(rota.destino, 180),
          condicao: texto(rota.condicao, 80) || "sempre",
          valor: texto(rota.valor, 200) || null,
          rotulo: texto(rota.rotulo, 200) || null,
          descricao_ia: texto(rota.descricao_ia, 700) || null,
          timeout_segundos:
            rota.timeout_segundos == null || rota.timeout_segundos === ""
              ? null
              : Number(rota.timeout_segundos),
        };
      })
    : [];
}

function rotaChave(rota: RotaPlano) {
  return `${rota.origem}|${rota.destino}|${rota.condicao}|${rota.valor || ""}`;
}

function assinaturaArquitetura(plano: Objeto) {
  const conteudo = JSON.stringify({
    etapas: etapasPlano(plano).map((etapa) => ({
      ref: texto(etapa.ref, 180),
      tipo: texto(etapa.tipo, 80),
      opcoes: opcoesEtapa(etapa).map((opcao) => ({
        id: opcaoId(opcao),
        titulo: opcaoTitulo(opcao),
      })),
    })),
    rotas: rotasPlano(plano),
  });
  let hash = 2166136261;
  for (let indice = 0; indice < conteudo.length; indice += 1) {
    hash ^= conteudo.charCodeAt(indice);
    hash = Math.imul(hash, 16777619);
  }
  return `v4:${(hash >>> 0).toString(16)}:${conteudo.length}`;
}

function comprimentoUtf16(valor: string) {
  return valor.length;
}

function cortarTitulo(valor: string, limite: number) {
  let titulo = valor.trim();
  if (comprimentoUtf16(titulo) <= limite) return titulo;

  titulo = titulo
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\bfalar com especialista\b/i, "Falar especialista")
    .replace(/\bfalar com atendente\b/i, "Falar atendente")
    .replace(/\bvoltar ao procedimento\b/i, "Voltar tratamento")
    .replace(/\bvoltar ao menu principal\b/i, "Menu principal")
    .replace(/\bvoltar ao menu\b/i, "Voltar menu")
    .replace(/\bdúvidas frequentes\b/i, "Dúvidas")
    .replace(/\bem quanto tempo vejo resultado\??/i, "Quando vejo resultado?")
    .replace(/\bquantas sessões são necessárias\??/i, "Quantas sessões?")
    .replace(/\ba harmonização fica natural\??/i, "Fica natural?")
    .replace(/\bquanto tempo dura o botox\??/i, "Duração do Botox")
    .trim();

  if (comprimentoUtf16(titulo) <= limite) return titulo;
  const cortado = titulo.slice(0, limite).replace(/\s+\S*$/, "").trim();
  return cortado || titulo.slice(0, limite).trim();
}

function tornarTitulosUnicos(
  opcoes: Objeto[],
  campo: "texto" | "titulo",
  limite: number
) {
  const usados = new Set<string>();
  return opcoes.map((opcao, indice) => {
    const original = texto(opcao[campo], 240);
    let titulo = cortarTitulo(original, limite);
    let tentativa = 1;
    while (usados.has(normalizar(titulo)) && tentativa < 10) {
      const sufixo = ` ${tentativa + 1}`;
      titulo = `${cortarTitulo(original, Math.max(1, limite - sufixo.length))}${sufixo}`;
      tentativa += 1;
    }
    usados.add(normalizar(titulo) || `opcao_${indice}`);
    return { ...opcao, [campo]: titulo };
  });
}

function opcaoId(opcao: Objeto) {
  return texto(opcao.id || opcao.valor, 180);
}

function opcaoTitulo(opcao: Objeto) {
  return texto(opcao.texto || opcao.titulo, 240);
}

function opcoesEtapa(etapa: Objeto) {
  return Array.isArray(etapa.opcoes) ? etapa.opcoes.map(objeto) : [];
}

function ehNavegacaoFaq(opcao: Objeto) {
  const alvo = normalizar(`${opcaoId(opcao)} ${opcaoTitulo(opcao)}`);
  return /(^|_)(voltar|menu|agendar|atendente|especialista|outras_duvidas|sair|encerrar)(_|$)/.test(
    alvo
  );
}

function contextoFaq(etapa: Objeto) {
  return normalizar(`${etapa.ref || ""} ${etapa.titulo || ""}`)
    .replace(/(^|_)(menu|faq|duvidas|frequentes|perguntas|lista|selecione)(_|$)/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function similaridade(a: string, b: string) {
  const aa = new Set(normalizar(a).split("_").filter((item) => item.length > 2));
  const bb = new Set(normalizar(b).split("_").filter((item) => item.length > 2));
  if (!aa.size || !bb.size) return 0;
  let comuns = 0;
  for (const item of aa) if (bb.has(item)) comuns += 1;
  return comuns / Math.max(aa.size, bb.size);
}

function encontrarMenuPrincipal(etapas: Objeto[]) {
  const candidatos = etapas.filter((etapa) => {
    const alvo = normalizar(`${etapa.ref || ""} ${etapa.titulo || ""}`);
    return PERGUNTAS.has(texto(etapa.tipo, 80)) && /menu_principal/.test(alvo);
  });
  return candidatos.length === 1 ? texto(candidatos[0].ref, 180) : null;
}

function encontrarRetornoFaq(params: {
  faq: Objeto;
  etapas: Objeto[];
  rotas: RotaPlano[];
}) {
  const faqRef = texto(params.faq.ref, 180);
  const opcoes = opcoesEtapa(params.faq);
  const idsNavegacao = new Set(
    opcoes.filter(ehNavegacaoFaq).map(opcaoId).filter(Boolean)
  );

  const rotaVoltar = params.rotas.find(
    (rota) =>
      rota.origem === faqRef &&
      rota.valor &&
      idsNavegacao.has(rota.valor) &&
      /voltar|menu|outras_duvidas/.test(
        normalizar(`${rota.valor || ""} ${rota.rotulo || ""}`)
      )
  );
  if (rotaVoltar) return rotaVoltar.destino;

  const contexto = contextoFaq(params.faq);
  const candidatos = params.etapas
    .filter((etapa) => /pos_faq/.test(normalizar(etapa.ref)))
    .map((etapa) => ({
      ref: texto(etapa.ref, 180),
      score: similaridade(
        contexto,
        `${etapa.ref || ""} ${etapa.titulo || ""}`
      ),
    }))
    .filter((item) => item.ref)
    .sort((a, b) => b.score - a.score);

  if (candidatos[0] && (candidatos[0].score > 0 || candidatos.length === 1)) {
    return candidatos[0].ref;
  }
  return null;
}

function diagnosticarPlano(plano: Objeto): ProblemaPlano[] {
  const etapas = etapasPlano(plano);
  const rotas = rotasPlano(plano);
  const refs = new Set(etapas.map((etapa) => texto(etapa.ref, 180)).filter(Boolean));
  const entradas = new Map<string, RotaPlano[]>();
  const saidas = new Map<string, RotaPlano[]>();

  for (const rota of rotas) {
    entradas.set(rota.destino, [...(entradas.get(rota.destino) || []), rota]);
    saidas.set(rota.origem, [...(saidas.get(rota.origem) || []), rota]);
  }

  const problemas: ProblemaPlano[] = [];
  const inicio = etapas.find((etapa) => texto(etapa.tipo, 80) === "inicio");
  const alcancaveis = new Set<string>();
  const fila = inicio ? [texto(inicio.ref, 180)] : [];
  while (fila.length) {
    const atual = fila.shift()!;
    if (!atual || alcancaveis.has(atual)) continue;
    alcancaveis.add(atual);
    for (const rota of saidas.get(atual) || []) {
      if (refs.has(rota.destino) && !alcancaveis.has(rota.destino)) {
        fila.push(rota.destino);
      }
    }
  }

  for (const etapa of etapas) {
    const ref = texto(etapa.ref, 180);
    const tipo = texto(etapa.tipo, 80);
    if (!ref) continue;
    if (tipo !== "inicio" && (entradas.get(ref) || []).length === 0) {
      problemas.push({
        codigo: TERMINAIS.has(tipo) ? "TERMINAL_SEM_ENTRADA" : "ETAPA_SEM_ENTRADA",
        ref,
        mensagem: `A etapa ${ref} não possui entrada.`,
      });
    }
    if (!TERMINAIS.has(tipo) && (saidas.get(ref) || []).length === 0) {
      problemas.push({
        codigo: "ETAPA_SEM_SAIDA",
        ref,
        mensagem: `A etapa ${ref} não possui saída.`,
      });
    }
    if (inicio && !alcancaveis.has(ref)) {
      problemas.push({
        codigo: "ETAPA_INALCANCAVEL",
        ref,
        mensagem: `A etapa ${ref} não é alcançável a partir do início.`,
      });
    }

    if (PERGUNTAS.has(tipo)) {
      const porValor = new Map<string, RotaPlano[]>();
      for (const rota of saidas.get(ref) || []) {
        if (!rota.valor) continue;
        porValor.set(rota.valor, [...(porValor.get(rota.valor) || []), rota]);
      }
      for (const opcao of opcoesEtapa(etapa)) {
        const id = opcaoId(opcao);
        if (!id) continue;
        const correspondentes = porValor.get(id) || [];
        if (correspondentes.length === 0) {
          problemas.push({
            codigo: "OPCAO_SEM_ROTA",
            ref,
            mensagem: `A opção ${id} de ${ref} não possui rota.`,
          });
        } else if (correspondentes.length > 1) {
          problemas.push({
            codigo: "OPCAO_COM_ROTAS_DUPLICADAS",
            ref,
            mensagem: `A opção ${id} de ${ref} possui rotas duplicadas.`,
          });
        }
      }
    }
  }

  for (const rota of rotas) {
    if (!refs.has(rota.origem) || !refs.has(rota.destino)) {
      problemas.push({
        codigo: "ROTA_COM_REF_AUSENTE",
        ref: rota.origem || rota.destino || null,
        mensagem: `Existe rota com origem ou destino ausente: ${rota.origem} → ${rota.destino}.`,
      });
    }
  }

  return problemas.filter(
    (problema, indice, todos) =>
      todos.findIndex(
        (item) =>
          item.codigo === problema.codigo &&
          item.ref === problema.ref &&
          item.mensagem === problema.mensagem
      ) === indice
  );
}

function repararPlanoDeterministico(planoBase: unknown) {
  const raiz = objeto(planoBase);
  const reparos: ReparoAplicado[] = [];
  let etapas = etapasPlano(raiz).map((etapa) => {
    const tipo = texto(etapa.tipo, 80);
    const opcoes = opcoesEtapa(etapa);
    let atualizada = { ...etapa };

    if (opcoes.length > 0) {
      const campo: "texto" | "titulo" = opcoes.some((opcao) => "texto" in opcao)
        ? "texto"
        : "titulo";
      const limite = tipo === "pergunta_botoes" ? 20 : 24;
      atualizada = {
        ...atualizada,
        opcoes: tornarTitulosUnicos(opcoes, campo, limite),
      };
    }

    if (tipo === "redirect" && texto(etapa.botao_texto, 80)) {
      atualizada.botao_texto = cortarTitulo(texto(etapa.botao_texto, 80), 20);
    }
    return atualizada;
  });
  let rotas = rotasPlano(raiz);

  // Referências duplicadas não podem ser distinguidas pelas rotas. Preserva a
  // primeira etapa e elimina somente as cópias ambíguas.
  const refsVistas = new Set<string>();
  etapas = etapas.filter((etapa) => {
    const ref = texto(etapa.ref, 180);
    if (!ref || !refsVistas.has(ref)) {
      if (ref) refsVistas.add(ref);
      return true;
    }
    reparos.push({
      tipo: "etapa_com_ref_duplicada_removida",
      detalhe: ref,
    });
    return false;
  });

  // Garante um único início técnico sem impedir a criação.
  let inicios = etapas.filter((etapa) => texto(etapa.tipo, 80) === "inicio");
  if (inicios.length === 0) {
    const refInicio = refsVistas.has("inicio") ? "inicio_fluxo" : "inicio";
    const inicio: Objeto = {
      ref: refInicio,
      tipo: "inicio",
      titulo: "Inicio",
      mensagem: null,
      variavel: null,
      tipo_captura: null,
      setor_id: null,
      setor_nome: null,
      resultado: null,
      midia_id: null,
      midia_nome: null,
      midia_tipo: null,
      midia_url: null,
      url: null,
      botao_texto: null,
      opcoes: [],
    };
    etapas = [inicio, ...etapas];
    refsVistas.add(refInicio);
    inicios = [inicio];
    reparos.push({
      tipo: "inicio_tecnico_criado",
      detalhe: refInicio,
    });
  } else if (inicios.length > 1) {
    const manter = inicios[0];
    const refManter = texto(manter.ref, 180);
    const extras = new Set(inicios.slice(1).map((item) => texto(item.ref, 180)));
    rotas = rotas.map((rota) =>
      extras.has(rota.origem) ? { ...rota, origem: refManter } : rota
    );
    etapas = etapas.filter(
      (etapa) =>
        texto(etapa.tipo, 80) !== "inicio" ||
        texto(etapa.ref, 180) === refManter
    );
    for (const ref of extras) {
      reparos.push({ tipo: "inicio_extra_removido", detalhe: ref });
    }
    inicios = [manter];
  }

  // IDs de opção precisam ser únicos. Quando há duplicidade, renomeia a opção
  // e, havendo rota correspondente disponível, atualiza somente aquela rota.
  etapas = etapas.map((etapa) => {
    if (!PERGUNTAS.has(texto(etapa.tipo, 80))) return etapa;
    const ref = texto(etapa.ref, 180);
    const usados = new Set<string>();
    const rotasUsadas = new Set<number>();
    const opcoes = opcoesEtapa(etapa).map((opcao, indice) => {
      const antigo = opcaoId(opcao);
      const base = antigo || normalizar(opcaoTitulo(opcao)) || `opcao_${indice + 1}`;
      let novo = base;
      let contador = 2;
      while (usados.has(novo)) {
        novo = `${base}_${contador}`;
        contador += 1;
      }
      usados.add(novo);
      if (novo === antigo) return opcao;

      const candidatos = rotas
        .map((rota, rotaIndice) => ({ rota, rotaIndice }))
        .filter(
          (item) =>
            !rotasUsadas.has(item.rotaIndice) &&
            item.rota.origem === ref &&
            (antigo ? item.rota.valor === antigo : !item.rota.valor)
        )
        .sort((a, b) => {
          const destinoA = etapas.find(
            (item) => texto(item.ref, 180) === a.rota.destino
          );
          const destinoB = etapas.find(
            (item) => texto(item.ref, 180) === b.rota.destino
          );
          return (
            similaridade(
              opcaoTitulo(opcao),
              `${destinoB?.ref || ""} ${destinoB?.titulo || ""}`
            ) -
            similaridade(
              opcaoTitulo(opcao),
              `${destinoA?.ref || ""} ${destinoA?.titulo || ""}`
            )
          );
        });
      if (candidatos[0]) {
        const escolhido = candidatos[0];
        rotasUsadas.add(escolhido.rotaIndice);
        rotas[escolhido.rotaIndice] = {
          ...escolhido.rota,
          valor: novo,
          rotulo: opcaoTitulo(opcao) || novo,
        };
      }
      reparos.push({
        tipo: "opcao_id_normalizado",
        detalhe: `${ref}.${antigo || "sem_id"} → ${novo}`,
      });
      return { ...opcao, id: novo };
    });
    return { ...etapa, opcoes };
  });

  const refInicio = texto(inicios[0]?.ref, 180);
  // Nunca permita retorno ao início técnico.
  const semRetornoInicio = rotas.filter((rota) => rota.destino !== refInicio);
  if (semRetornoInicio.length !== rotas.length) {
    reparos.push({
      tipo: "retornos_ao_inicio_removidos",
      detalhe: `${rotas.length - semRetornoInicio.length} rota(s) removida(s).`,
    });
    rotas = semRetornoInicio;
  }

  const refsIniciais = new Set(etapas.map((etapa) => texto(etapa.ref, 180)));
  const rotasValidas = rotas.filter(
    (rota) => refsIniciais.has(rota.origem) && refsIniciais.has(rota.destino)
  );
  if (rotasValidas.length !== rotas.length) {
    reparos.push({
      tipo: "rotas_invalidas_removidas",
      detalhe: `${rotas.length - rotasValidas.length} rota(s) com referência ausente foram removidas.`,
    });
    rotas = rotasValidas;
  }

  // O início deve ter exatamente uma saída sempre. Prefere boas-vindas,
  // abertura ou menu principal e preserva o restante do grafo.
  const saidasInicio = rotas.filter((rota) => rota.origem === refInicio);
  if (saidasInicio.length > 1) {
    const ordenadas = [...saidasInicio].sort((a, b) => {
      const etapaA = etapas.find((item) => texto(item.ref, 180) === a.destino);
      const etapaB = etapas.find((item) => texto(item.ref, 180) === b.destino);
      const prioridade = (etapa: Objeto | undefined) => {
        const alvo = normalizar(`${etapa?.ref || ""} ${etapa?.titulo || ""}`);
        if (/boas_vindas|abertura|saudacao/.test(alvo)) return 3;
        if (/menu_principal/.test(alvo)) return 2;
        return 1;
      };
      return prioridade(etapaB) - prioridade(etapaA);
    });
    const manter = ordenadas[0];
    const remover = new Set(ordenadas.slice(1));
    rotas = rotas.filter((rota) => !remover.has(rota));
    const indice = rotas.indexOf(manter);
    if (indice >= 0) {
      rotas[indice] = {
        ...manter,
        condicao: "sempre",
        valor: null,
        rotulo: manter.rotulo || "Iniciar",
        descricao_ia: null,
        timeout_segundos: null,
      };
    }
    reparos.push({
      tipo: "saidas_do_inicio_consolidadas",
      detalhe: `${refInicio} → ${manter.destino}`,
    });
  } else if (saidasInicio.length === 1) {
    const unica = saidasInicio[0];
    const indice = rotas.indexOf(unica);
    rotas[indice] = {
      ...unica,
      condicao: "sempre",
      valor: null,
      rotulo: unica.rotulo || "Iniciar",
      descricao_ia: null,
      timeout_segundos: null,
    };
  } else {
    const destinosComEntrada = new Set(rotas.map((rota) => rota.destino));
    const candidatos = etapas
      .filter(
        (etapa) =>
          texto(etapa.ref, 180) !== refInicio &&
          !destinosComEntrada.has(texto(etapa.ref, 180))
      )
      .sort((a, b) => {
        const prioridade = (etapa: Objeto) => {
          const alvo = normalizar(`${etapa.ref || ""} ${etapa.titulo || ""}`);
          if (/boas_vindas|abertura|saudacao/.test(alvo)) return 3;
          if (/menu_principal/.test(alvo)) return 2;
          return 1;
        };
        return prioridade(b) - prioridade(a);
      });
    const destino = texto((candidatos[0] || etapas.find(
      (etapa) => texto(etapa.ref, 180) !== refInicio
    ))?.ref, 180);
    if (destino) {
      rotas.push({
        origem: refInicio,
        destino,
        condicao: "sempre",
        valor: null,
        rotulo: "Iniciar",
        descricao_ia: null,
        timeout_segundos: null,
      });
      reparos.push({
        tipo: "inicio_reconectado",
        detalhe: `${refInicio} → ${destino}`,
      });
    }
  }

  // Remove repetições exatas criadas por remapeamentos anteriores.
  const chavesExatas = new Set<string>();
  rotas = rotas.filter((rota) => {
    const chave = rotaChave(rota);
    if (chavesExatas.has(chave)) return false;
    chavesExatas.add(chave);
    return true;
  });

  const etapasAtuaisPorRef = new Map(
    etapas.map((etapa) => [texto(etapa.ref, 180), etapa])
  );
  const registrarNovosTitulos = etapasPlano(raiz).some((etapa) => {
    const atual = etapasAtuaisPorRef.get(texto(etapa.ref, 180));
    return JSON.stringify(etapa.opcoes || []) !== JSON.stringify(atual?.opcoes || []);
  });
  if (registrarNovosTitulos) {
    reparos.push({
      tipo: "titulos_normalizados",
      detalhe: "Títulos de botões e listas foram reduzidos aos limites técnicos.",
    });
  }

  const saidas = () => {
    const mapa = new Map<string, RotaPlano[]>();
    for (const rota of rotas) {
      mapa.set(rota.origem, [...(mapa.get(rota.origem) || []), rota]);
    }
    return mapa;
  };
  const entradas = () => {
    const mapa = new Map<string, RotaPlano[]>();
    for (const rota of rotas) {
      mapa.set(rota.destino, [...(mapa.get(rota.destino) || []), rota]);
    }
    return mapa;
  };

  const porRef = new Map(etapas.map((etapa) => [texto(etapa.ref, 180), etapa]));

  // Mantém exatamente uma rota por opção, escolhendo o destino semanticamente mais próximo.
  for (const etapa of etapas.filter((item) => PERGUNTAS.has(texto(item.tipo, 80)))) {
    const ref = texto(etapa.ref, 180);
    const opcoes = new Map(opcoesEtapa(etapa).map((opcao) => [opcaoId(opcao), opcao]));
    const agrupadas = new Map<string, RotaPlano[]>();
    for (const rota of rotas.filter((item) => item.origem === ref && item.valor)) {
      agrupadas.set(rota.valor!, [...(agrupadas.get(rota.valor!) || []), rota]);
    }
    for (const [valor, lista] of agrupadas) {
      if (lista.length <= 1) continue;
      const opcao = opcoes.get(valor);
      const alvo = opcao ? `${opcaoId(opcao)} ${opcaoTitulo(opcao)}` : valor;
      const ordenadas = [...lista].sort((a, b) => {
        const destinoA = porRef.get(a.destino);
        const destinoB = porRef.get(b.destino);
        return (
          similaridade(alvo, `${destinoB?.ref || ""} ${destinoB?.titulo || ""}`) -
          similaridade(alvo, `${destinoA?.ref || ""} ${destinoA?.titulo || ""}`)
        );
      });
      const manter = ordenadas[0];
      const remover = new Set(ordenadas.slice(1));
      rotas = rotas.filter((rota) => !remover.has(rota));
      reparos.push({
        tipo: "rotas_duplicadas_consolidadas",
        detalhe: `${ref}.${valor} manteve o destino ${manter.destino}.`,
      });
    }
  }

  const chavesRotas = new Set(rotas.map(rotaChave));

  for (const faq of etapas.filter((etapa) => {
    const tipo = texto(etapa.tipo, 80);
    const alvo = normalizar(`${etapa.ref || ""} ${etapa.titulo || ""}`);
    return PERGUNTAS.has(tipo) && /(^|_)faq(_|$)|duvidas_frequentes/.test(alvo);
  })) {
    const faqRef = texto(faq.ref, 180);
    const retorno = encontrarRetornoFaq({ faq, etapas, rotas });
    if (!retorno || !porRef.has(retorno)) continue;
    const opcoes = opcoesEtapa(faq);
    const opcoesPorId = new Map(opcoes.map((opcao) => [opcaoId(opcao), opcao]));

    for (const rotaFaq of (saidas().get(faqRef) || []).filter((rota) => {
      const opcao = rota.valor ? opcoesPorId.get(rota.valor) : null;
      return opcao && !ehNavegacaoFaq(opcao);
    })) {
      const resposta = porRef.get(rotaFaq.destino);
      if (!resposta || TERMINAIS.has(texto(resposta.tipo, 80))) continue;
      if ((saidas().get(rotaFaq.destino) || []).length > 0) continue;
      const nova: RotaPlano = {
        origem: rotaFaq.destino,
        destino: retorno,
        condicao: "sempre",
        valor: null,
        rotulo: "Continuar",
        descricao_ia: null,
        timeout_segundos: null,
      };
      if (!chavesRotas.has(rotaChave(nova))) {
        rotas.push(nova);
        chavesRotas.add(rotaChave(nova));
        reparos.push({
          tipo: "faq_reconectada",
          detalhe: `${rotaFaq.destino} → ${retorno}`,
        });
      }
    }
  }

  // Completa opções sem rota quando existe um único destino semanticamente claro.
  for (const etapa of etapas.filter((item) => PERGUNTAS.has(texto(item.tipo, 80)))) {
    const ref = texto(etapa.ref, 180);
    const rotasSaida = saidas().get(ref) || [];
    const valoresUsados = new Set(rotasSaida.map((rota) => rota.valor).filter(Boolean));
    for (const opcao of opcoesEtapa(etapa)) {
      const id = opcaoId(opcao);
      if (!id || valoresUsados.has(id)) continue;
      const alvo = `${id} ${opcaoTitulo(opcao)}`;
      const candidatos = etapas
        .filter((destino) => texto(destino.ref, 180) !== ref)
        .map((destino) => ({
          ref: texto(destino.ref, 180),
          score: similaridade(alvo, `${destino.ref || ""} ${destino.titulo || ""}`),
        }))
        .filter((item) => item.ref && item.score >= 0.5)
        .sort((a, b) => b.score - a.score);
      if (!candidatos[0] || candidatos[0].score === candidatos[1]?.score) continue;
      const nova: RotaPlano = {
        origem: ref,
        destino: candidatos[0].ref,
        condicao: "ia",
        valor: id,
        rotulo: opcaoTitulo(opcao) || id,
        descricao_ia: `Use esta rota quando o contato escolher a opção “${opcaoTitulo(opcao) || id}”.`,
        timeout_segundos: null,
      };
      if (!chavesRotas.has(rotaChave(nova))) {
        rotas.push(nova);
        chavesRotas.add(rotaChave(nova));
        reparos.push({
          tipo: "opcao_reconectada",
          detalhe: `${ref}.${id} → ${candidatos[0].ref}`,
        });
      }
    }
  }

  // Remove apenas terminais comprovadamente órfãos. Isso não apaga conteúdo navegável.
  const entradasAtuais = entradas();
  const terminaisOrfaos = new Set(
    etapas
      .filter(
        (etapa) =>
          TERMINAIS.has(texto(etapa.tipo, 80)) &&
          (entradasAtuais.get(texto(etapa.ref, 180)) || []).length === 0
      )
      .map((etapa) => texto(etapa.ref, 180))
  );
  if (terminaisOrfaos.size > 0) {
    etapas = etapas.filter((etapa) => !terminaisOrfaos.has(texto(etapa.ref, 180)));
    rotas = rotas.filter(
      (rota) =>
        !terminaisOrfaos.has(rota.origem) && !terminaisOrfaos.has(rota.destino)
    );
    for (const ref of terminaisOrfaos) {
      reparos.push({
        tipo: "terminal_orfao_removido",
        detalhe: ref,
      });
    }
  }

  // Beco sem saída remanescente recebe retorno seguro ao único menu principal.
  const menuPrincipal = encontrarMenuPrincipal(etapas);
  if (menuPrincipal) {
    const saidasAtuais = saidas();
    for (const etapa of etapas) {
      const ref = texto(etapa.ref, 180);
      const tipo = texto(etapa.tipo, 80);
      if (
        !ref ||
        ref === menuPrincipal ||
        tipo === "inicio" ||
        TERMINAIS.has(tipo) ||
        PERGUNTAS.has(tipo) ||
        (saidasAtuais.get(ref) || []).length > 0
      ) {
        continue;
      }
      const nova: RotaPlano = {
        origem: ref,
        destino: menuPrincipal,
        condicao: "sempre",
        valor: null,
        rotulo: "Voltar ao menu",
        descricao_ia: null,
        timeout_segundos: null,
      };
      if (!chavesRotas.has(rotaChave(nova))) {
        rotas.push(nova);
        chavesRotas.add(rotaChave(nova));
        reparos.push({
          tipo: "beco_sem_saida_reparado",
          detalhe: `${ref} → ${menuPrincipal}`,
        });
      }
    }
  }

  return {
    plano: { ...raiz, etapas, rotas },
    reparos,
    problemas: diagnosticarPlano({ ...raiz, etapas, rotas }),
  };
}

function extrairTextoRespostaOpenAI(payload: Objeto) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const itemBase of output) {
    const item = objeto(itemBase);
    const content = Array.isArray(item.content) ? item.content : [];
    for (const parteBase of content) {
      const parte = objeto(parteBase);
      if (typeof parte.text === "string" && parte.text.trim()) return parte.text;
    }
  }
  return "";
}

async function solicitarPatchFocado(params: {
  plano: Objeto;
  problemas: ProblemaPlano[];
  empresaId: string;
  usuarioId: string;
  sessaoId: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || params.problemas.length === 0) return null;

  try {
    await verificarSaldoTokensIa(params.empresaId);
  } catch {
    // Sem saldo, preserva o reparo determinístico e continua a criação.
    return null;
  }

  const refs = new Set(etapasPlano(params.plano).map((etapa) => texto(etapa.ref, 180)));
  const body = {
    model: process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL || "gpt-5.4-mini",
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: `Você corrige somente a arquitetura de um fluxo existente. Não reescreva mensagens, não crie etapas e não altere copy. Retorne apenas um patch mínimo usando refs existentes. Priorize reconectar opções, respostas e subárvores. Remova somente etapas comprovadamente órfãs.`,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              problemas: params.problemas,
              etapas: etapasPlano(params.plano).map((etapa) => ({
                ref: etapa.ref,
                tipo: etapa.tipo,
                titulo: etapa.titulo,
                opcoes: etapa.opcoes,
              })),
              rotas: rotasPlano(params.plano),
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "reparo_fluxo_patch",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["rotas_adicionar", "rotas_remover", "etapas_remover"],
          properties: {
            rotas_adicionar: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "origem",
                  "destino",
                  "condicao",
                  "valor",
                  "rotulo",
                  "descricao_ia",
                  "timeout_segundos",
                ],
                properties: {
                  origem: { type: "string" },
                  destino: { type: "string" },
                  condicao: { type: "string" },
                  valor: { type: ["string", "null"] },
                  rotulo: { type: ["string", "null"] },
                  descricao_ia: { type: ["string", "null"] },
                  timeout_segundos: { type: ["number", "null"] },
                },
              },
            },
            rotas_remover: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["origem", "destino", "valor"],
                properties: {
                  origem: { type: "string" },
                  destino: { type: "string" },
                  valor: { type: ["string", "null"] },
                },
              },
            },
            etapas_remover: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const payload = objeto(await response.json().catch(() => ({})));
    const uso = extrairUsoTokensIa(payload.usage);
    if (uso.totalTokens > 0) {
      try {
        await registrarUsoTokensIa({
          empresaId: params.empresaId,
          usuarioId: params.usuarioId,
          origem: "assistente_fluxos",
          modelo: texto(payload.model, 120) ||
            process.env.OPENAI_ASSISTENTE_FLUXOS_MODEL ||
            "gpt-5.4-mini",
          uso,
          metadata: {
            etapa: "reparo_arquitetura_focado",
            sessao_id: params.sessaoId,
            fluxo_materializado: false,
          },
        });
      } catch (error) {
        console.error("[assistente-fluxos] falha ao registrar reparo focado", {
          sessaoId: params.sessaoId,
          erro: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const conteudo = extrairTextoRespostaOpenAI(payload);
    if (!conteudo) return null;
    const patch = objeto(JSON.parse(conteudo));

    // Segurança: descarta qualquer referência inventada antes de aplicar.
    const etapasPorRef = new Map(
      etapasPlano(params.plano).map((etapa) => [texto(etapa.ref, 180), etapa])
    );
    const adicionar = Array.isArray(patch.rotas_adicionar)
      ? patch.rotas_adicionar
          .map(objeto)
          .filter((rota) => {
            const origem = texto(rota.origem, 180);
            const destino = texto(rota.destino, 180);
            if (!refs.has(origem) || !refs.has(destino)) return false;
            const etapaOrigem = etapasPorRef.get(origem);
            if (!etapaOrigem || !PERGUNTAS.has(texto(etapaOrigem.tipo, 80))) {
              return true;
            }
            const valor = texto(rota.valor, 200);
            return opcoesEtapa(etapaOrigem).some((opcao) => opcaoId(opcao) === valor);
          })
      : [];
    const remover = Array.isArray(patch.rotas_remover)
      ? patch.rotas_remover.map(objeto)
      : [];
    const refsRemoviveis = new Set(
      params.problemas
        .filter((problema) =>
          [
            "TERMINAL_SEM_ENTRADA",
            "ETAPA_SEM_ENTRADA",
            "ETAPA_INALCANCAVEL",
          ].includes(problema.codigo)
        )
        .map((problema) => problema.ref)
        .filter((ref): ref is string => Boolean(ref))
    );
    const etapasRemover = Array.isArray(patch.etapas_remover)
      ? patch.etapas_remover
          .map((ref) => texto(ref, 180))
          .filter((ref) => refs.has(ref) && refsRemoviveis.has(ref))
      : [];
    return { adicionar, remover, etapasRemover };
  } catch {
    return null;
  }
}

function aplicarPatchFocado(planoBase: Objeto, patch: {
  adicionar: Objeto[];
  remover: Objeto[];
  etapasRemover: string[];
}) {
  const removidas = new Set(patch.etapasRemover);
  const etapas = etapasPlano(planoBase).filter(
    (etapa) => !removidas.has(texto(etapa.ref, 180))
  );
  let rotas = rotasPlano(planoBase).filter((rota) => {
    if (removidas.has(rota.origem) || removidas.has(rota.destino)) return false;
    return !patch.remover.some((item) => {
      const valor = texto(item.valor, 200) || null;
      return (
        texto(item.origem, 180) === rota.origem &&
        texto(item.destino, 180) === rota.destino &&
        valor === rota.valor
      );
    });
  });
  const refs = new Set(etapas.map((etapa) => texto(etapa.ref, 180)));
  const chaves = new Set(rotas.map(rotaChave));
  for (const item of patch.adicionar) {
    const rota: RotaPlano = {
      origem: texto(item.origem, 180),
      destino: texto(item.destino, 180),
      condicao: texto(item.condicao, 80) || "sempre",
      valor: texto(item.valor, 200) || null,
      rotulo: texto(item.rotulo, 200) || null,
      descricao_ia: texto(item.descricao_ia, 700) || null,
      timeout_segundos:
        item.timeout_segundos == null ? null : Number(item.timeout_segundos),
    };
    if (
      refs.has(rota.origem) &&
      refs.has(rota.destino) &&
      !chaves.has(rotaChave(rota))
    ) {
      rotas.push(rota);
      chaves.add(rotaChave(rota));
    }
  }
  return { ...planoBase, etapas, rotas };
}

async function repararPlanoComFallback(params: {
  plano: unknown;
  empresaId: string;
  usuarioId: string;
  sessaoId: string;
}) {
  let resultado = repararPlanoDeterministico(params.plano);
  const reparos = [...resultado.reparos];

  for (
    let tentativa = 0;
    tentativa < MAX_REPAROS_IA && resultado.problemas.length > 0;
    tentativa += 1
  ) {
    const patch = await solicitarPatchFocado({
      plano: resultado.plano,
      problemas: resultado.problemas,
      empresaId: params.empresaId,
      usuarioId: params.usuarioId,
      sessaoId: params.sessaoId,
    });
    if (!patch) break;
    const antes = JSON.stringify(resultado.plano);
    const aplicado = aplicarPatchFocado(resultado.plano, patch);
    if (JSON.stringify(aplicado) === antes) break;
    const candidato = repararPlanoDeterministico(aplicado);
    if (candidato.problemas.length >= resultado.problemas.length) break;
    reparos.push({
      tipo: "reparo_ia_focado",
      detalhe: `Rodada ${tentativa + 1}: patch arquitetural aplicado sem reescrever copy.`,
    });
    resultado = candidato;
    reparos.push(...resultado.reparos);
  }

  return { ...resultado, reparos };
}

function sanearInstrucao(instrucao: string) {
  let limpa = instrucao;
  limpa = limpa.replace(
    /2\. EXCESSO DE TENTATIVAS E TIMEOUT[\s\S]*?(?=\n3\. ACOES EXTERNAS E REDIRECT)/g,
    `2. EXCESSO DE TENTATIVAS E TIMEOUT\n- Use uma configuração padrão única de setor e distribuição para os blocos comuns.\n- Confirme individualmente somente situações explicitamente diferentes do padrão.\n- Não replique a mesma configuração em cada bloco.`
  );
  limpa = limpa.replace(
    /5\. EXCESSO E TIMEOUT[\s\S]*?(?=\nCHECKLIST FINAL|\nRevise o JSON)/g,
    `5. EXCESSO E TIMEOUT\n- O fluxo usa uma configuração padrão única.\n- Configurações individuais existem somente quando o destino for diferente por exigência do usuário.`
  );
  return limpa.includes(MARCADOR_ARQUITETURA)
    ? limpa
    : `${limpa}\n\n${REGRAS_ARQUITETURA}`;
}

async function ajustarRequest(request: Request) {
  if (request.method !== "POST") return request;
  const body = objeto(await request.clone().json().catch(() => ({})));
  if (texto(body.modo || "criar_fluxo", 80) !== "criar_fluxo") return request;
  const instrucao = String(body.instrucao || "").trim();
  if (!instrucao) return request;
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({
      ...body,
      instrucao: sanearInstrucao(instrucao),
      arquitetura_reparavel_versao: 4,
    }),
  });
}

async function respostaSessaoConcluida(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("id, automacao_id, status, resposta_ia_json, fluxo_gerado_json")
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();

  if (!sessao || sessao.status !== "concluido" || !sessao.automacao_id) {
    return null;
  }

  const { data: fluxo } = await db
    .from("automacao_fluxos")
    .select(
      "id, nome, descricao, status, canal, fluxo_padrao, created_at, updated_at, configuracao_json"
    )
    .eq("id", sessao.automacao_id)
    .eq("empresa_id", params.empresaId)
    .maybeSingle();

  if (!fluxo) return null;

  return NextResponse.json({
    ok: true,
    proposta_id: sessao.id,
    sessao_id: sessao.id,
    fase: "concluido",
    modo: "criar_fluxo",
    plano: sessao.resposta_ia_json,
    fluxo_gerado: sessao.fluxo_gerado_json,
    fluxo_criado: fluxo,
    materializado: true,
    recuperado: true,
    mensagem: "O fluxo já havia sido criado e foi recuperado com segurança.",
    validacao: { valido: true, erros: [], avisos: [] },
    avisos: [],
  });
}

/**
 * Repara sessões afetadas pela consolidação antiga sem alterar a fila de
 * perguntas. As respostas já registradas no histórico voltam a fazer parte de
 * perguntas_respondidas, evitando retorno a uma pergunta concluída.
 */
async function repararProgressoSessao(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("contexto_json")
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando")
    .maybeSingle();

  if (!sessao) return;

  const contexto = objeto(sessao.contexto_json);
  const conversa = objeto(contexto.conversa);
  const respondidasAtuais = Array.isArray(conversa.perguntas_respondidas)
    ? conversa.perguntas_respondidas
        .map((item) => texto(item, 260))
        .filter(Boolean)
    : [];
  const respostasAtuais = Array.isArray(conversa.respostas)
    ? (conversa.respostas as RespostaConversa[])
    : [];

  const respostasPorId = new Map<string, RespostaConversa>();
  const respostasSemId: RespostaConversa[] = [];

  for (const resposta of respostasAtuais) {
    const id = texto(resposta?.pergunta_id, 260);
    if (!id) {
      respostasSemId.push(resposta);
      continue;
    }
    if (!respostasPorId.has(id)) respostasPorId.set(id, resposta);
  }

  const respostasNormalizadas = [
    ...respostasSemId,
    ...Array.from(respostasPorId.values()),
  ];
  const respondidasNormalizadas = Array.from(
    new Set([...respondidasAtuais, ...respostasPorId.keys()])
  );

  const respostasMudaram = respostasNormalizadas.length !== respostasAtuais.length;
  const respondidasMudaram = !listasIguais(
    respondidasAtuais,
    respondidasNormalizadas
  );

  if (!respostasMudaram && !respondidasMudaram) return;

  await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: {
        ...contexto,
        conversa: {
          ...conversa,
          perguntas_respondidas: respondidasNormalizadas,
          respostas: respostasNormalizadas,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando");
}

async function repararPlanoSessao(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("id, status, resposta_ia_json, contexto_json")
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();
  if (!sessao || sessao.status !== "processando") return null;

  const atual = objeto(sessao.resposta_ia_json);
  if (etapasPlano(atual).length === 0) return null;
  const contexto = objeto(sessao.contexto_json);
  const auditoriaAnterior = objeto(contexto.auditoria_arquitetura_v4);
  const assinaturaAntes = assinaturaArquitetura(atual);
  const jaReparada = texto(auditoriaAnterior.assinatura_arquitetura, 120) === assinaturaAntes;
  const resultado = jaReparada
    ? repararPlanoDeterministico(atual)
    : await repararPlanoComFallback({
        plano: atual,
        empresaId: params.empresaId,
        usuarioId: params.usuarioId,
        sessaoId: params.sessaoId,
      });
  const auditoria = {
    executada_em: new Date().toISOString(),
    assinatura_arquitetura: assinaturaArquitetura(resultado.plano),
    reparos: resultado.reparos,
    problemas_remanescentes: resultado.problemas,
    reparo_ia_focado_tentado: resultado.reparos.some(
      (item) => item.tipo === "reparo_ia_focado"
    ),
    bloqueou_criacao: false,
  };

  const alterou = JSON.stringify(atual) !== JSON.stringify(resultado.plano);
  const { error } = await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      ...(alterou ? { resposta_ia_json: resultado.plano } : {}),
      contexto_json: {
        ...contexto,
        auditoria_arquitetura_v4: auditoria,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("status", "processando");
  if (error) throw error;
  return { ...resultado, alterou };
}

async function auditarPersistencia(params: {
  sessaoId: string;
  empresaId: string;
  usuarioId: string;
}) {
  const { data: sessao } = await db
    .from("automacao_assistente_ia_execucoes")
    .select("automacao_id, status, resposta_ia_json, contexto_json")
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId)
    .eq("modo", "criar_fluxo")
    .maybeSingle();
  if (!sessao?.automacao_id || sessao.status !== "concluido") return null;

  const [nosResultado, conexoesResultado] = await Promise.all([
    db
      .from("automacao_nos")
      .select("id, tipo_no, titulo")
      .eq("fluxo_id", sessao.automacao_id)
      .eq("empresa_id", params.empresaId),
    db
      .from("automacao_conexoes")
      .select("id, no_origem_id, no_destino_id")
      .eq("fluxo_id", sessao.automacao_id)
      .eq("empresa_id", params.empresaId),
  ]);
  if (nosResultado.error || conexoesResultado.error) return null;

  const nos = (nosResultado.data || []) as NoPersistido[];
  const conexoes = (conexoesResultado.data || []) as ConexaoPersistida[];
  const ids = new Set(nos.map((no) => no.id));
  const entradas = new Map<string, number>();
  const saidas = new Map<string, number>();
  for (const conexao of conexoes) {
    entradas.set(
      conexao.no_destino_id,
      (entradas.get(conexao.no_destino_id) || 0) + 1
    );
    saidas.set(
      conexao.no_origem_id,
      (saidas.get(conexao.no_origem_id) || 0) + 1
    );
  }

  const inicio = nos.find((no) => no.tipo_no === "inicio");
  const destinosPorOrigem = new Map<string, string[]>();
  for (const conexao of conexoes) {
    destinosPorOrigem.set(conexao.no_origem_id, [
      ...(destinosPorOrigem.get(conexao.no_origem_id) || []),
      conexao.no_destino_id,
    ]);
  }
  const alcancaveis = new Set<string>();
  const fila = inicio ? [inicio.id] : [];
  while (fila.length > 0) {
    const atual = fila.shift();
    if (!atual || alcancaveis.has(atual)) continue;
    alcancaveis.add(atual);
    for (const destino of destinosPorOrigem.get(atual) || []) {
      if (ids.has(destino) && !alcancaveis.has(destino)) fila.push(destino);
    }
  }

  const plano = objeto(sessao.resposta_ia_json);
  const auditoria = {
    executada_em: new Date().toISOString(),
    plano_etapas: etapasPlano(plano).length,
    plano_rotas: rotasPlano(plano).length,
    nos_salvos: nos.length,
    conexoes_salvas: conexoes.length,
    referencias_invalidas: conexoes.filter(
      (conexao) =>
        !ids.has(conexao.no_origem_id) || !ids.has(conexao.no_destino_id)
    ).length,
    blocos_sem_entrada: nos.filter(
      (no) => no.tipo_no !== "inicio" && !entradas.get(no.id)
    ).length,
    blocos_nao_terminais_sem_saida: nos.filter(
      (no) =>
        !["encerrar", "transferir_setor"].includes(no.tipo_no) &&
        !saidas.get(no.id)
    ).length,
    blocos_inalcancaveis: inicio
      ? nos.filter((no) => !alcancaveis.has(no.id)).length
      : nos.length,
    bloqueou_criacao: false,
  };

  const contexto = objeto(sessao.contexto_json);
  await db
    .from("automacao_assistente_ia_execucoes")
    .update({
      contexto_json: {
        ...contexto,
        auditoria_pos_persistencia_v4: auditoria,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.sessaoId)
    .eq("empresa_id", params.empresaId)
    .eq("usuario_id", params.usuarioId);
  return auditoria;
}

async function respostaComMetadados(
  response: Response,
  dadosExtras: Objeto
): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;
  const dados = objeto(await response.clone().json().catch(() => ({})));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  headers.set("content-type", "application/json");
  return NextResponse.json(
    { ...dados, ...dadosExtras },
    { status: response.status, headers }
  );
}

export async function executarComRecuperacaoSessao(
  request: Request,
  executar: (request: Request) => Promise<Response>
) {
  const requestAjustado = await ajustarRequest(request);
  const body = objeto(await requestAjustado.clone().json().catch(() => ({})));
  let sessaoId = texto(body.sessao_id || body.sessaoId, 120);
  const acao = texto(body.acao, 40);
  const contexto = await getUsuarioContexto();
  const empresaId = contexto.ok ? contexto.usuario.empresa_id : null;
  const usuarioId = contexto.ok ? contexto.usuario.id : null;

  if (empresaId && usuarioId && sessaoId) {
    const parametros = { sessaoId, empresaId, usuarioId };

    if (["retomar", "criar"].includes(acao)) {
      const concluida = await respostaSessaoConcluida(parametros);
      if (concluida) return concluida;
    }

    await repararProgressoSessao(parametros);
    // Antes de materializar, corrige o plano em vez de bloquear a criação.
    if (acao === "criar") await repararPlanoSessao(parametros);
  }

  const response = await executar(requestAjustado);
  const dadosResposta = objeto(await response.clone().json().catch(() => ({})));
  sessaoId = texto(dadosResposta.sessao_id || dadosResposta.proposta_id || sessaoId, 120);

  let reparo: Awaited<ReturnType<typeof repararPlanoSessao>> = null;
  let auditoria: Awaited<ReturnType<typeof auditarPersistencia>> = null;

  if (empresaId && usuarioId && sessaoId && response.ok) {
    const parametros = { sessaoId, empresaId, usuarioId };
    if (acao !== "criar") {
      await repararProgressoSessao(parametros);
      reparo = await repararPlanoSessao(parametros);
    } else {
      auditoria = await auditarPersistencia(parametros);
    }
  }

  if (!reparo && !auditoria) return response;
  return respostaComMetadados(response, {
    ...(reparo
      ? {
          reparo_arquitetura: {
            aplicado: reparo.alterou,
            reparos: reparo.reparos,
            problemas_remanescentes: reparo.problemas,
            bloqueou_criacao: false,
          },
        }
      : {}),
    ...(auditoria ? { auditoria_pos_persistencia: auditoria } : {}),
  });
}
