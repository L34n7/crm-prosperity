export const IA_TOKENS_REFRESH_EVENT = "crm:ia-tokens-refresh";

export type IaTokensRefreshEventDetail = {
  saldo?: unknown;
};

export function solicitarAtualizacaoSaldoTokensIa(
  detail: IaTokensRefreshEventDetail = {}
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<IaTokensRefreshEventDetail>(IA_TOKENS_REFRESH_EVENT, {
      detail,
    })
  );
}
