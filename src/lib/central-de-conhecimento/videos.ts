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
  disparos: [],
  templates: [],
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
