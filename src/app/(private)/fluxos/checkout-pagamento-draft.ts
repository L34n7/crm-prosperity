import {
  MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO,
  MENSAGEM_RECUPERACAO_CHECKOUT_PADRAO,
} from "./checkout-pagamento-editor";

export type CheckoutPagamentoDraft = {
  mensagem: string;
  expiracao_minutos: string;
  recuperacao_ativa: boolean;
  recuperacao_apos_minutos: string;
  mensagem_recuperacao: string;
};

type DraftInterno = {
  valor: CheckoutPagamentoDraft;
  prontoParaAplicar: boolean;
};

const drafts = new Map<string, DraftInterno>();
const MENSAGEM_GENERICA_EDITOR = "Digite a mensagem aqui.";

function texto(valor: unknown) {
  return String(valor ?? "");
}

function mensagemCheckoutNormalizada(
  configuracao: Record<string, unknown>,
  mensagemEdicao?: string
) {
  const mensagemDoEditor = texto(mensagemEdicao).trim();
  const mensagemConfigurada = texto(configuracao.mensagem).trim();

  if (mensagemDoEditor && mensagemDoEditor !== MENSAGEM_GENERICA_EDITOR) {
    return texto(mensagemEdicao);
  }

  if (mensagemConfigurada && mensagemConfigurada !== MENSAGEM_GENERICA_EDITOR) {
    return texto(configuracao.mensagem);
  }

  return MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO;
}

export function normalizarDraftCheckoutPagamento(
  configuracao: Record<string, unknown> | null | undefined,
  mensagemEdicao?: string
): CheckoutPagamentoDraft {
  const config = configuracao || {};

  return {
    mensagem: mensagemCheckoutNormalizada(config, mensagemEdicao),
    expiracao_minutos: String(config.expiracao_minutos || 30),
    recuperacao_ativa: config.recuperacao_ativa === true,
    recuperacao_apos_minutos: String(config.recuperacao_apos_minutos || 10),
    mensagem_recuperacao:
      texto(config.mensagem_recuperacao).trim() ||
      MENSAGEM_RECUPERACAO_CHECKOUT_PADRAO,
  };
}

export function definirDraftCheckoutPagamento(
  noId: string,
  valor: CheckoutPagamentoDraft
) {
  if (!noId) return;

  drafts.set(noId, {
    valor: { ...valor },
    prontoParaAplicar: false,
  });
}

export function atualizarDraftCheckoutPagamento(
  noId: string,
  patch: Partial<CheckoutPagamentoDraft>
) {
  if (!noId) return;

  const atual = drafts.get(noId);
  const base =
    atual?.valor || normalizarDraftCheckoutPagamento(undefined, undefined);

  drafts.set(noId, {
    valor: { ...base, ...patch },
    // Preserva o estado de aplicação para evitar uma corrida entre o clique em
    // "Aplicar no bloco" e efeitos React que sincronizam a mesma mensagem.
    prontoParaAplicar: atual?.prontoParaAplicar === true,
  });
}

export function obterDraftCheckoutPagamento(noId: string) {
  return drafts.get(noId)?.valor || null;
}

export function validarDraftCheckoutPagamento(valor: CheckoutPagamentoDraft) {
  if (!String(valor.mensagem || "").trim()) {
    return "Informe a mensagem com o link de pagamento.";
  }

  const expiracao = Number(valor.expiracao_minutos);
  if (
    !Number.isInteger(expiracao) ||
    !Number.isFinite(expiracao) ||
    expiracao < 5 ||
    expiracao > 1440
  ) {
    return "O vencimento do checkout deve ficar entre 5 e 1440 minutos.";
  }

  if (valor.recuperacao_ativa) {
    const recuperacao = Number(valor.recuperacao_apos_minutos);

    if (
      !Number.isInteger(recuperacao) ||
      !Number.isFinite(recuperacao) ||
      recuperacao < 1
    ) {
      return "Informe depois de quantos minutos a recuperação deve ser enviada.";
    }

    if (recuperacao >= expiracao) {
      return "A recuperação precisa ser enviada antes do vencimento do checkout.";
    }

    if (!String(valor.mensagem_recuperacao || "").trim()) {
      return "Informe a mensagem de recuperação do checkout.";
    }
  }

  return "";
}

export function prepararDraftCheckoutPagamentoParaAplicar(noId: string) {
  const atual = drafts.get(noId);
  if (!atual) return { ok: true as const, checkout: false as const };

  const erro = validarDraftCheckoutPagamento(atual.valor);
  if (erro) {
    return {
      ok: false as const,
      checkout: true as const,
      error: erro,
    };
  }

  drafts.set(noId, {
    valor: { ...atual.valor },
    prontoParaAplicar: true,
  });

  return { ok: true as const, checkout: true as const };
}

export function consumirDraftCheckoutPagamentoParaAplicar(noId: string) {
  const atual = drafts.get(noId);
  if (!atual?.prontoParaAplicar) return null;

  drafts.delete(noId);

  const expiracao = Number(atual.valor.expiracao_minutos);
  const recuperacao = Number(atual.valor.recuperacao_apos_minutos);

  return {
    gateway: "mercado_pago",
    variavel_quantidade: "quantidade_desejada",
    mensagem:
      String(atual.valor.mensagem || "").trim() ||
      MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO,
    expiracao_minutos: expiracao,
    recuperacao_ativa: atual.valor.recuperacao_ativa,
    recuperacao_apos_minutos: recuperacao,
    mensagem_recuperacao:
      String(atual.valor.mensagem_recuperacao || "").trim() ||
      MENSAGEM_RECUPERACAO_CHECKOUT_PADRAO,
  };
}

export function limparDraftCheckoutPagamento(noId: string) {
  if (!noId) return;
  drafts.delete(noId);
}
