/**
 * Catálogo de vídeos da Central de Conhecimento.
 * Acrescente novos itens ao array do módulo correspondente.
 * Use somente o ID público do YouTube, nunca uma URL fornecida dinamicamente.
 */
export type VideoTutorial = {
  id: string;
  titulo: string;
  assunto: string;
  descricao?: string;
};

export type ModuloTutorial =
  | "configurar-ambiente"
  | "disparos"
  | "templates"
  | "contatos"
  | "perfil-whatsapp";

export const VIDEOS_TUTORIAIS: Record<ModuloTutorial, readonly VideoTutorial[]> = {
  "configurar-ambiente": [
    {
      id: "AkmeChLShVk",
      titulo: "Integração Desconectada",
      assunto: "Problemas comuns",
      descricao: "Orientações em vídeo sobre a situação de integração desconectada.",
    },
  ],
  disparos: [
    {
      id: "mTdZoPeCe3I",
      titulo: "Disparos em massa — CRM Prosperity",
      assunto: "Como realizar disparos",
      descricao: "Passo a passo para configurar e realizar disparos em massa no CRM Prosperity.",
    },
    {
      id: "kwYvitLZvig",
      titulo: "Forma de pagamento — CRM Prosperity",
      assunto: "Pagamento na Meta",
      descricao: "Orientações para configurar a forma de pagamento necessária aos disparos.",
    },
    {
      id: "gmxJ3VcL3ZU",
      titulo: "Capacidade de disparo e Contatos reservas — CRM Prosperity",
      assunto: "Capacidade e contatos reserva",
      descricao: "Entenda o planejamento de capacidade de envio e o uso de contatos reserva.",
    },
  ],
  templates: [
    {
      id: "z2BK8l4P7FQ",
      titulo: "Criar templates — CRM Prosperity",
      assunto: "Criação de templates",
      descricao: "Tutorial para criar modelos de mensagens WhatsApp no CRM Prosperity.",
    },
  ],
  contatos: [
    {
      id: "7JLRauFK2TU",
      titulo: "Importar lista de contatos",
      assunto: "Importação",
      descricao: "Tutorial em vídeo sobre a importação de listas de contatos.",
    },
  ],
  "perfil-whatsapp": [
    {
      id: "AkmeChLShVk",
      titulo: "Integração Desconectada",
      assunto: "Problemas comuns",
      descricao: "Orientações em vídeo sobre a situação de integração desconectada.",
    },
  ],
};

export function obterVideosDoModulo(modulo: string): readonly VideoTutorial[] {
  if (!Object.prototype.hasOwnProperty.call(VIDEOS_TUTORIAIS, modulo)) return [];
  return VIDEOS_TUTORIAIS[modulo as ModuloTutorial];
}
