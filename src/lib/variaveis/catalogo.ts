export type VariavelCatalogo = {
  chave: string;
  exemplo: string;
  descricao: string;
  categoria: "Fixa" | "Personalizada";
};

export const VARIAVEIS_FIXAS_SISTEMA: VariavelCatalogo[] = [
  {
    chave: "nome_contato",
    exemplo: "{{nome_contato}}",
    descricao: "Nome salvo no cadastro do contato.",
    categoria: "Fixa",
  },
  {
    chave: "nome",
    exemplo: "{{nome}}",
    descricao: "Nome do contato.",
    categoria: "Fixa",
  },
  {
    chave: "nome_whatsapp",
    exemplo: "{{nome_whatsapp}}",
    descricao:
      "Nome do perfil do WhatsApp quando existir; se não existir, usa o nome salvo no contato.",
    categoria: "Fixa",
  },
  {
    chave: "nome_captura",
    exemplo: "{{nome_captura}}",
    descricao:
      "Último nome confirmado e capturado durante o atendimento/agendamento; se não existir, usa o nome do contato.",
    categoria: "Fixa",
  },
  {
    chave: "primeiro_nome_captura",
    exemplo: "{{primeiro_nome_captura}}",
    descricao:
      "Primeiro nome derivado do último nome confirmado e capturado durante o atendimento/agendamento.",
    categoria: "Fixa",
  },
  {
    chave: "email_contato",
    exemplo: "{{email_contato}}",
    descricao: "E-mail salvo no cadastro do contato.",
    categoria: "Fixa",
  },
  {
    chave: "numero_contato",
    exemplo: "{{numero_contato}}",
    descricao: "Número/telefone salvo no cadastro do contato.",
    categoria: "Fixa",
  },
  {
    chave: "empresa",
    exemplo: "{{empresa}}",
    descricao:
      "Empresa vinculada ao contato; quando vazia, pode usar um valor alternativo definido na campanha.",
    categoria: "Fixa",
  },
  {
    chave: "campo_contato",
    exemplo: "{{campo_contato}}",
    descricao:
      "Valor individual do contato. Quando a campanha usa listas, prioriza o valor salvo na primeira lista selecionada.",
    categoria: "Fixa",
  },
  {
    chave: "interesse",
    exemplo: "{{interesse}}",
    descricao: "Interesse principal salvo no cadastro do contato.",
    categoria: "Fixa",
  },
  {
    chave: "campanha",
    exemplo: "{{campanha}}",
    descricao: "Campanha/origem comercial vinculada ao contato.",
    categoria: "Fixa",
  },
  {
    chave: "origem",
    exemplo: "{{origem}}",
    descricao: "Origem do contato.",
    categoria: "Fixa",
  },
  {
    chave: "status_lead",
    exemplo: "{{status_lead}}",
    descricao: "Status atual do lead.",
    categoria: "Fixa",
  },
  {
    chave: "classificacao_lead",
    exemplo: "{{classificacao_lead}}",
    descricao: "Classificação global do lead.",
    categoria: "Fixa",
  },
  {
    chave: "protocolo_atual",
    exemplo: "{{protocolo_atual}}",
    descricao: "Protocolo ativo da conversa atual do contato.",
    categoria: "Fixa",
  },
  {
    chave: "ultimo_protocolo",
    exemplo: "{{ultimo_protocolo}}",
    descricao: "Último protocolo encerrado/inativo do contato.",
    categoria: "Fixa",
  },
];

export function normalizarChaveVariavel(valor: unknown) {
  return String(valor || "")
    .replace(/[{}]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function extrairChavesVariaveis(...conteudos: Array<string | null | undefined>) {
  const chaves = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  for (const conteudo of conteudos) {
    const texto = String(conteudo || "");
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(texto))) {
      const chave = normalizarChaveVariavel(match[1]);
      if (chave) chaves.add(chave);
    }
  }

  return Array.from(chaves);
}
