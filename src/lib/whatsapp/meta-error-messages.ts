export type DescricaoErroMetaWhatsApp = {
  codigo: number | null;
  nome: string;
  significado: string;
  acao: string;
};

const ERROS_META_WHATSAPP: Record<
  number,
  Omit<DescricaoErroMetaWhatsApp, "codigo">
> = {
  2: {
    nome: "API Service Error",
    significado: "A Meta apresentou uma falha temporária ao processar a mensagem.",
    acao: "Aguarde alguns minutos e tente novamente.",
  },
  190: {
    nome: "Authentication Error",
    significado: "A autenticação com a Meta falhou ou o token perdeu a validade/permissão.",
    acao: "Reconecte a integração e valide o token e as permissões do aplicativo.",
  },
  368: {
    nome: "Temporarily Blocked",
    significado: "A Meta bloqueou temporariamente o envio de mensagens desta conta.",
    acao: "Aguarde a liberação e verifique alertas de qualidade ou política no WhatsApp Manager.",
  },
  470: {
    nome: "Re-engagement Message",
    significado: "A janela de atendimento de 24 horas terminou e uma mensagem livre não pode iniciar a conversa.",
    acao: "Use um template aprovado para reabrir a conversa.",
  },
  130472: {
    nome: "User's Number Is Part of an Experiment",
    significado: "A Meta impediu a entrega para este destinatário por uma limitação experimental da plataforma.",
    acao: "Não insista no envio; aguarde e tente novamente mais tarde.",
  },
  130497: {
    nome: "Business Account Restricted",
    significado: "A conta está impedida de enviar mensagens para usuários deste país ou região.",
    acao: "Verifique as restrições geográficas da conta no WhatsApp Manager.",
  },
  131000: {
    nome: "Something Went Wrong",
    significado: "A Meta retornou uma falha genérica ao processar a mensagem.",
    acao: "Tente novamente mais tarde e, se persistir, revise o status da integração.",
  },
  131008: {
    nome: "Required Parameter Is Missing",
    significado: "Faltou um parâmetro obrigatório no template ou na mensagem enviada.",
    acao: "Revise as variáveis e os campos obrigatórios do template.",
  },
  131009: {
    nome: "Parameter Value Is Not Valid",
    significado: "Um número, variável ou outro parâmetro foi enviado em formato inválido.",
    acao: "Revise o telefone e os valores das variáveis antes de reenviar.",
  },
  131026: {
    nome: "Message Undeliverable",
    significado: "A Meta não conseguiu entregar a mensagem ao destinatário.",
    acao: "Confirme se o número está correto e possui WhatsApp ativo; evite tentativas repetidas.",
  },
  131031: {
    nome: "Account Locked",
    significado: "A conta WhatsApp Business está bloqueada ou desativada pela Meta.",
    acao: "Verifique o WhatsApp Manager e solicite análise à Meta quando disponível.",
  },
  131042: {
    nome: "Business Eligibility Payment Issue",
    significado: "A conta possui pendência de cobrança ou problema com a forma de pagamento na Meta.",
    acao: "Regularize a cobrança ou o método de pagamento no Gerenciador da Meta.",
  },
  131044: {
    nome: "Payment Method Issue",
    significado: "A Meta não conseguiu processar a cobrança pela forma de pagamento da conta WhatsApp Business.",
    acao: "Cadastre ou regularize a forma de pagamento no Gerenciador da Meta.",
  },
  131048: {
    nome: "Spam Rate Limit Hit",
    significado: "A Meta limitou temporariamente o número remetente por sinais de spam ou baixa aceitação dos envios.",
    acao: "Pause os disparos, aguarde a liberação e retome com menor volume e contatos com opt-in.",
  },
  131049: {
    nome: "Meta Chose Not to Deliver",
    significado: "A Meta decidiu não entregar esta mensagem de marketing ao destinatário por limite de frequência ou qualidade.",
    acao: "Não tente novamente imediatamente; aguarde e reduza a frequência de marketing para esse contato.",
  },
  131053: {
    nome: "Media Upload Error",
    significado: "A Meta não conseguiu acessar ou processar a mídia usada na mensagem.",
    acao: "Verifique se o arquivo ou URL está acessível e em formato suportado.",
  },
  131056: {
    nome: "Pair Rate Limit Hit",
    significado: "Houve mensagens demais em pouco tempo entre este número e o destinatário.",
    acao: "Interrompa os envios para esse contato e aguarde antes de tentar novamente.",
  },
  131058: {
    nome: "Hello World Template Restriction",
    significado: "O template de teste Hello World só pode ser usado com números públicos de teste da Meta.",
    acao: "Use um template próprio aprovado para o número de produção.",
  },
  132001: {
    nome: "Template Does Not Exist",
    significado: "O template informado não existe, não está aprovado ou não está disponível no idioma enviado.",
    acao: "Sincronize os templates e confirme nome, idioma e status aprovado.",
  },
  132012: {
    nome: "Template Parameter Format Mismatch",
    significado: "Os parâmetros enviados não correspondem ao formato aprovado do template.",
    acao: "Revise variáveis, cabeçalho e tipo de mídia para corresponder ao template aprovado.",
  },
  132015: {
    nome: "Template Is Paused",
    significado: "A Meta pausou temporariamente o template por problemas de qualidade.",
    acao: "Aguarde a reativação ou utilize outro template aprovado.",
  },
  132016: {
    nome: "Template Is Disabled",
    significado: "O template foi desativado pela Meta e não pode mais ser enviado.",
    acao: "Crie ou selecione outro template aprovado.",
  },
};

export function descreverErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
): DescricaoErroMetaWhatsApp {
  const numero = Number(codigo ?? 0);
  const codigoValido = Number.isFinite(numero) && numero > 0 ? numero : null;

  if (codigoValido && ERROS_META_WHATSAPP[codigoValido]) {
    return {
      codigo: codigoValido,
      ...ERROS_META_WHATSAPP[codigoValido],
    };
  }

  return {
    codigo: codigoValido,
    nome: codigoValido ? "Erro da Meta" : "Falha no envio",
    significado:
      "A mensagem não foi concluída e a Meta não forneceu uma classificação conhecida para esta falha.",
    acao: erroTecnico
      ? "Revise o detalhe técnico registrado e corrija os dados antes de tentar novamente."
      : "Tente novamente e, se o erro persistir, revise a integração e os dados do disparo.",
  };
}

export function formatarErroMetaWhatsApp(
  codigo?: number | string | null,
  erroTecnico?: string | null
) {
  const erro = descreverErroMetaWhatsApp(codigo, erroTecnico);
  const cabecalho = erro.codigo
    ? `${erro.codigo} · ${erro.nome}`
    : `Código não informado · ${erro.nome}`;

  return `${cabecalho} — ${erro.significado} O que fazer: ${erro.acao}`;
}
