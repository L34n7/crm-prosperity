export type DiagnosticoFalhaInternaDisparo = {
  nome: string;
  significado: string;
  resumo: string;
  acao: string;
};

/**
 * Identifica falhas locais que não possuem código de erro da Meta.
 * Preserva o marcador e o campo configurado para orientar a correção.
 */
export function diagnosticarFalhaInternaDisparo(
  erro?: string | null
): DiagnosticoFalhaInternaDisparo | null {
  const texto = String(erro || "").trim();
  const falhaVariaveis = texto.match(
    /^Template agendado com vari[aá]veis obrigat[oó]rias sem valor:\s*(.+)$/i
  );

  if (!falhaVariaveis) return null;

  const componentes = Array.from(
    falhaVariaveis[1].matchAll(
      /\b(corpo|cabecalho|cabeçalho|botao_url_\d+)\s*(\{\{\d+\}\})(?:\s*\(([^)]+)\))?/gi
    ),
    ([, componente, marcador, campo]) =>
      `${componente} ${marcador}${campo ? ` (${campo.trim()})` : ""}`
  );
  const variaveis = componentes.length
    ? componentes.join(", ")
    : falhaVariaveis[1].replace(/\.+$/, "").trim();
  const singular = componentes.length === 1;
  const orientacaoNome = /\{\{1\}\}\s*\(campo_contato\)/i.test(variaveis)
    ? ' Se {{1}} representa o nome do cliente, selecione "nome" no lugar de "campo_contato" ou preencha esse campo nos contatos.'
    : "";

  return {
    nome: singular ? "Variável obrigatória sem valor" : "Variáveis obrigatórias sem valor",
    resumo: `Sem valor para ${variaveis}.`,
    significado:
      `O CRM não conseguiu preencher ${singular ? "a variável obrigatória" : "as variáveis obrigatórias"} ${variaveis} antes do envio. ` +
      "A mensagem não chegou à Meta.",
    acao:
      "Revise o mapeamento das variáveis do template no agendamento e confirme que os campos escolhidos estão preenchidos para os contatos antes de reagendar." +
      orientacaoNome,
  };
}
