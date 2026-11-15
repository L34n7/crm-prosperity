export type GuiaPasso = {
  titulo: string;
  descricao: string;
  ancora?: string;
};

export type GuiaModuloConfig = {
  id: string;
  titulo: string;
  introducao: string;
  documentoUrl: string;
  tituloPreRequisitos?: string;
  preRequisitos?: GuiaPasso[];
  etapas: { titulo: string; passos: GuiaPasso[] }[];
  resumo?: GuiaPasso;
  videoTitulo: string;
};

export const GUIA_CONTATOS: GuiaModuloConfig = {
  id: "contatos",
  titulo: "Guia de Contatos",
  introducao: "Encontre, cadastre, importe e organize seus contatos em poucos passos.",
  documentoUrl: "/central-de-conhecimento/contatos",
  etapas: [
    {
      titulo: "Buscar e filtrar",
      passos: [
        { titulo: "Integração WhatsApp", descricao: "Selecione um número para consultar opt-in, opt-out e conversas dessa conexão.", ancora: "integracao" },
        { titulo: "Buscar contatos", descricao: "Pesquise por nome, WhatsApp, telefone ou e-mail.", ancora: "busca" },
        { titulo: "Filtros avançados", descricao: "Refine por campanha, origem, lista, classificação, conversa e outros critérios.", ancora: "filtros" },
      ],
    },
    {
      titulo: "Cadastrar e editar",
      passos: [
        { titulo: "Novo contato", descricao: "Cadastre nome e pelo menos um telefone ou e-mail.", ancora: "novo-contato" },
        { titulo: "Editar informações", descricao: "Abra os detalhes do contato para corrigir ou complementar seu cadastro.", ancora: "editar" },
        { titulo: "Classificação e consentimento", descricao: "Confira a classificação, o opt-in e as preferências de opt-out.", ancora: "consentimento" },
      ],
    },
    {
      titulo: "Importar e organizar",
      passos: [
        { titulo: "Importar contatos", descricao: "Envie um arquivo CSV ou Excel e informe o nome da lista.", ancora: "importacao" },
        { titulo: "Revisar a prévia", descricao: "Confira válidos, alertas, duplicados, inválidos e e-mails recuperáveis antes de confirmar.", ancora: "preview" },
        { titulo: "Listas", descricao: "Organize contatos por origem ou por listas personalizadas.", ancora: "listas" },
      ],
    },
    {
      titulo: "Gerenciar registros",
      passos: [
        { titulo: "Ações em massa", descricao: "Selecione contatos para atualizar origem, campanha ou listas.", ancora: "massa" },
        { titulo: "Revisar telefones", descricao: "Use a central de revisão para conferir números marcados com problemas.", ancora: "revisao" },
        { titulo: "Exportar ou excluir", descricao: "Exporte os contatos filtrados ou exclua registros com confirmação.", ancora: "exportacao" },
      ],
    },
  ],
  resumo: {
    titulo: "Uso responsável dos contatos",
    descricao: "Respeite a autorização de envio e os pedidos para não receber mensagens.",
    ancora: "consentimento",
  },
  videoTitulo: "Como cadastrar e organizar contatos",
};

export const GUIA_PERFIL_WHATSAPP: GuiaModuloConfig = {
  id: "perfil-whatsapp",
  titulo: "Guia do Perfil WhatsApp",
  introducao: "Atualize as informações comerciais e acompanhe a situação dos números conectados.",
  documentoUrl: "/central-de-conhecimento/perfil-whatsapp",
  tituloPreRequisitos: "Antes de editar o perfil",
  preRequisitos: [
    {
      titulo: "Conectar o WhatsApp",
      descricao: "Tenha uma integração configurada e com o processo de conexão concluído.",
      ancora: "conexao",
    },
  ],
  etapas: [
    {
      titulo: "Selecionar integração",
      passos: [
        { titulo: "Escolher o número", descricao: "Quando houver mais de um WhatsApp, selecione o perfil que deseja consultar.", ancora: "selecao" },
        { titulo: "Limites e qualidade", descricao: "Confira o limite apresentado, a capacidade restante e a qualidade do número.", ancora: "indicadores" },
        { titulo: "Tipo de conexão", descricao: "Números em coexistência têm informações gerenciadas pelo aplicativo WhatsApp Business.", ancora: "coexistencia" },
      ],
    },
    {
      titulo: "Editar dados comerciais",
      passos: [
        { titulo: "Foto de perfil", descricao: "Escolha uma imagem e ajuste o enquadramento antes de salvar.", ancora: "foto" },
        { titulo: "Nome de exibição", descricao: "Solicite a alteração do nome comercial. A Meta pode revisar o pedido.", ancora: "nome-exibicao" },
        { titulo: "Nome da integração", descricao: "Defina o identificador interno do número no CRM.", ancora: "nome-integracao" },
        { titulo: "Informações da empresa", descricao: "Atualize categoria, descrição, endereço, e-mail e sites.", ancora: "dados" },
      ],
    },
    {
      titulo: "Salvar e acompanhar",
      passos: [
        { titulo: "Salvar alterações", descricao: "Revise a prévia e clique em Salvar alterações.", ancora: "salvar" },
        { titulo: "Diagnósticos", descricao: "Leia os alertas de configuração e as orientações exibidas pelo CRM.", ancora: "diagnosticos" },
        { titulo: "Ajustar na Meta", descricao: "Abra o gerenciador oficial quando a alteração precisar ser feita diretamente na Meta.", ancora: "meta" },
      ],
    },
    {
      titulo: "Gerenciar números",
      passos: [
        { titulo: "Adicionar número", descricao: "Conecte outro WhatsApp quando o plano permitir.", ancora: "adicionar" },
        { titulo: "Desconectar integração", descricao: "Confira os impactos antes de remover um número do CRM.", ancora: "desconectar" },
        { titulo: "Cancelamento agendado", descricao: "Consulte a data de encerramento e a possibilidade de desfazer.", ancora: "cancelamento" },
      ],
    },
  ],
  resumo: {
    titulo: "Perfil em coexistência",
    descricao: "Nesse modo, apenas o nome da integração é editável no CRM; os demais dados ficam no aplicativo ou na Meta.",
    ancora: "coexistencia",
  },
  videoTitulo: "Como configurar o Perfil WhatsApp",
};


export const GUIA_FLUXOS: GuiaModuloConfig = {
  id: "fluxos",
  titulo: "Guia de Fluxos",
  introducao: "Monte automações visuais para responder, coletar informações e direcionar atendimentos no WhatsApp.",
  documentoUrl: "/central-de-conhecimento/fluxos",
  etapas: [
    {
      titulo: "Criar um fluxo",
      passos: [
        { titulo: "Novo fluxo", descricao: "Clique em + na lista para nomear e criar uma automação.", ancora: "criar-manual" },
        { titulo: "Assistente IA", descricao: "Descreva o atendimento desejado para gerar uma estrutura que poderá ser revisada.", ancora: "assistente-ia" },
        { titulo: "Importar por código", descricao: "Cole o código de compartilhamento para criar uma cópia em rascunho.", ancora: "importar" },
      ],
    },
    {
      titulo: "Configurar o início",
      passos: [
        { titulo: "Integrações", descricao: "Escolha em quais números WhatsApp o fluxo poderá iniciar.", ancora: "integracoes" },
        { titulo: "Fluxo padrão ou gatilhos", descricao: "Defina se inicia automaticamente ou por palavras-chave e condições.", ancora: "gatilhos" },
        { titulo: "Horários e execução única", descricao: "Ajuste atendimento, encerramento por inatividade e execução uma vez por conversa.", ancora: "horarios" },
      ],
    },
    {
      titulo: "Montar os blocos",
      passos: [
        { titulo: "Adicionar blocos", descricao: "Use + Bloco para inserir uma mensagem ou o menu ⋮ para escolher outros tipos.", ancora: "blocos" },
        { titulo: "Conectar os blocos", descricao: "Ligue as saídas aos destinos e configure condições de resposta.", ancora: "conexoes" },
        { titulo: "Variáveis e recursos", descricao: "Use dados do contato, mídias, agenda, estoque e outras ações disponíveis.", ancora: "variaveis" },
      ],
    },
    {
      titulo: "Salvar e ativar",
      passos: [
        { titulo: "Salvar fluxo", descricao: "Salve os blocos e as conexões após editar o canvas.", ancora: "salvar" },
        { titulo: "Conferir prévia", descricao: "Simule os caminhos na prévia do WhatsApp antes de ativar.", ancora: "previa" },
        { titulo: "Ativar fluxo", descricao: "O CRM valida início, conexões e configurações obrigatórias.", ancora: "ativar" },
      ],
    },
    {
      titulo: "Gerenciar fluxos",
      passos: [
        { titulo: "Editar ou pausar", descricao: "Atualize regras e gatilhos ou pause um fluxo que não deve executar.", ancora: "gerenciar" },
        { titulo: "Clonar e compartilhar", descricao: "Duplique fluxos ou gere um código para outra empresa importar.", ancora: "compartilhar" },
        { titulo: "Arquivar ou restaurar", descricao: "Arquive fluxos sem uso e restaure quando necessário.", ancora: "arquivar" },
      ],
    },
  ],
  resumo: {
    titulo: "Antes de ativar",
    descricao: "Revise todas as saídas e os campos obrigatórios. Ativar um fluxo não substitui a verificação de seus caminhos.",
    ancora: "validacao",
  },
  videoTitulo: "Como criar e configurar fluxos",
};
