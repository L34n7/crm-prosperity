/**
 * Grupos visuais compartilhados pelas permissões de perfis e usuários.
 * Não altera códigos, vínculos nem comportamento da autorização.
 */
export const MODULOS_PERMISSOES_ORDEM = [
  "Painel",
  "Conversas",
  "Disparos WhatsApp",
  "Templates WhatsApp",
  "Agenda",
  "Fluxos",
  "Automações por API",
  "Tokens de IA",
  "Contatos",
  "Clientes e pacientes",
  "Kanban",
  "Rastreamento de leads",
  "E-mail Marketing",
  "Estoque",
  "Catálogo",
  "Compras",
  "Vendas",
  "PDV",
  "Financeiro",
  "Fiscal",
  "Imóveis",
  "Cotação veicular",
  "Prontuários",
  "Odontograma",
  "Usuários",
  "Setores",
  "Perfis",
  "Permissões e políticas",
  "Empresas",
  "Planos e assinaturas",
  "Configurar Ambiente",
  "Perfil WhatsApp",
  "Relatórios",
  "Auditoria",
  "Sistema",
  "Relatórios internos",
  "WhatsApp Web local"
] as const;

const MODULO_POR_PREFIXO: Record<string, string> = {
  "dashboard": "Painel",
  "conversas": "Conversas",
  "mensagens": "Conversas",
  "whatsapp_templates": "Templates WhatsApp",
  "agendas": "Agenda",
  "fluxos": "Fluxos",
  "automacoes_api": "Automações por API",
  "ia": "Tokens de IA",
  "contatos": "Contatos",
  "pessoas": "Clientes e pacientes",
  "kanban": "Kanban",
  "rastreamento": "Rastreamento de leads",
  "email_marketing": "E-mail Marketing",
  "estoque": "Estoque",
  "catalogo": "Catálogo",
  "compras": "Compras",
  "vendas": "Vendas",
  "pdv": "PDV",
  "financeiro": "Financeiro",
  "fiscal": "Fiscal",
  "imoveis": "Imóveis",
  "cotacoes": "Cotação veicular",
  "prontuarios": "Prontuários",
  "odontograma": "Odontograma",
  "usuarios": "Usuários",
  "setores": "Setores",
  "perfis": "Perfis",
  "permissoes": "Permissões e políticas",
  "empresas": "Empresas",
  "assinaturas": "Planos e assinaturas",
  "relatorios": "Relatórios",
  "auditoria": "Auditoria",
  "sistema": "Sistema",
  "relatorios_internos": "Relatórios internos",
  "whatsapp_web_local": "WhatsApp Web local"
};

export function getModuloPermissao(codigo: string): string {
  const partes = codigo.split(".");
  const prefixo = partes[0]?.trim() || "";
  // Os recursos WhatsApp pertencem a módulos distintos na navegação.
  if (prefixo === "whatsapp") {
    if (partes[1] === "disparos") return "Disparos WhatsApp";
    if (partes[1] === "integracao") return "Configurar Ambiente";
    if (partes[1] === "perfil") return "Perfil WhatsApp";
    return "WhatsApp — outras configurações";
  }
  // Prefixos futuros ficam em grupos próprios, sem misturar tudo em Outros.
  return MODULO_POR_PREFIXO[prefixo] ||
    (prefixo ? "Outros — " + prefixo.replaceAll("_", " ") : "Outros");
}

export function compararModulosPermissoes(a: string, b: string): number {
  const indexA = MODULOS_PERMISSOES_ORDEM.indexOf(a as (typeof MODULOS_PERMISSOES_ORDEM)[number]);
  const indexB = MODULOS_PERMISSOES_ORDEM.indexOf(b as (typeof MODULOS_PERMISSOES_ORDEM)[number]);
  if (indexA >= 0 && indexB >= 0) return indexA - indexB;
  if (indexA >= 0) return -1;
  if (indexB >= 0) return 1;
  return a.localeCompare(b, "pt-BR");
}
