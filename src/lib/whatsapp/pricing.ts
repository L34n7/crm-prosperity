export const WHATSAPP_TEMPLATE_PRICING = {
  marketing: {
    usd: 0.0625,
  },
  utility: {
    usd: 0.0068,
  },
} as const;

export const USD_BRL_EXCHANGE_RATE = 5.0;

export type CategoriaTemplateCobranca = keyof typeof WHATSAPP_TEMPLATE_PRICING;