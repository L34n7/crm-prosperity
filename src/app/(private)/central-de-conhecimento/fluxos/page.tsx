import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Bot, CalendarClock,
  CheckCircle2, Clock3, Copy, FileCheck2, GitBranch, Info,
  ListChecks, MessageSquare, PlayCircle, Settings2, ShieldCheck,
  Workflow, Zap,
} from "lucide-react";
import Header from "@/components/Header";
import VideoTutoriais from "@/components/VideoTutoriais";
import { obterVideosDoModulo } from "@/lib/central-de-conhecimento/videos";
import styles from "../central-de-conhecimento.module.css";

const indice = [
  { id: "visao-geral", titulo: "O que são fluxos?" },
  { id: "criar-manual", titulo: "1. Criar ou importar" },
  { id: "integracoes", titulo: "2. Definir início e horários" },
  { id: "blocos", titulo: "3. Montar blocos e conexões" },
  { id: "salvar", titulo: "4. Salvar, testar e ativar" },
  { id: "gerenciar", titulo: "5. Gerenciar automações" },
  { id: "duvidas", titulo: "Perguntas frequentes" },
  { id: "videos", titulo: "Vídeos tutoriais" },
];

export default function DocumentacaoFluxosPage() {
  return (
    <>
      <Header
        title="Central de Conhecimento"
        subtitle="Documentação completa para criar e gerenciar fluxos no CRM Prosperity."
      />
      <main className={styles.pagina}>
        <nav className={styles.caminho} aria-label="Navegação da documentação">
          <Link href="/central-de-conhecimento"><ArrowLeft size={16} /> Central de Conhecimento</Link>
          <span>/</span><span>Fluxos</span>
        </nav>

        <header className={styles.artigoHero}>
          <span className={styles.sobretitulo}><Workflow size={16} /> Guia completo · Automações</span>
          <h1>Fluxos de automação</h1>
          <p>
            Configure atendimentos automáticos no WhatsApp utilizando um editor visual.
            Aprenda a criar fluxos, definir como começam, adicionar mensagens e ações,
            conectar caminhos, testar e ativar suas automações.
          </p>
          <div className={styles.artigoAcoes}>
            <Link href="/fluxos" className={styles.acaoPrincipal}>Abrir Fluxos <ArrowRight size={17} /></Link>
            <Link href="/central-de-conhecimento/configurar-ambiente" className={styles.acaoSecundaria}>Configurar Ambiente</Link>
          </div>
        </header>

        <div className={styles.layoutArtigo}>
          <aside className={styles.indice} aria-label="Índice da documentação de fluxos">
            <strong>Neste artigo</strong>
            <nav>{indice.map(item => <a key={item.id} href={`#${item.id}`}>{item.titulo}</a>)}</nav>
            <div className={styles.indiceAjuda}>
              <BookOpen size={19} aria-hidden="true" />
              <span>O guia lateral Ajuda resume cada etapa enquanto você utiliza o módulo Fluxos.</span>
            </div>
          </aside>

          <article className={styles.artigo}>
            <section id="visao-geral" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Visão geral</span>
              <h2>O que são fluxos de automação?</h2>
              <p>
                Um fluxo organiza o atendimento em uma sequência de <strong>blocos</strong> e
                <strong> conexões</strong>. Cada bloco realiza uma ação, como enviar uma mensagem,
                fazer uma pergunta, consultar informações, transferir a conversa ou encerrar o atendimento.
                As conexões determinam o próximo passo com base nas respostas ou condições.
              </p>
              <div className={styles.fluxoResumo}>
                <span>Criar</span><ArrowRight size={17} /><span>Definir gatilho</span>
                <ArrowRight size={17} /><span>Conectar blocos</span><ArrowRight size={17} />
                <span>Salvar e ativar</span>
              </div>
              <p>
                Na lateral esquerda, você encontra a lista de fluxos e os filtros por status.
                No editor central, os blocos formam um diagrama. Ao selecionar um bloco ou uma conexão,
                o painel de propriedades permite ajustar seu comportamento.
              </p>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>
                  Os botões e ações disponíveis dependem das permissões do seu perfil.
                  Um fluxo <strong>rascunho, pausado ou arquivado</strong> não deve ser considerado ativo
                  apenas porque aparece na lista.
                </p>
              </div>
            </section>

            <section id="criar-manual" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 1</span>
              <h2><Zap size={23} /> Criar um fluxo</h2>
              <p>O módulo oferece criação manual, assistente com inteligência artificial e importação por código.</p>
              <div className={styles.subtopico}>
                <h3>Criação manual</h3>
                <p>
                  Em <Link href="/fluxos">Fluxos</Link>, clique no botão de
                  <strong> novo fluxo (+)</strong> da lista lateral. No modal
                  <strong> Criar automação</strong>, preencha o <strong>Nome do fluxo</strong> e,
                  opcionalmente, a descrição. Configure as integrações e regras de início antes de criar.
                </p>
                <p>
                  Exemplo: um fluxo chamado <strong>Atendimento comercial</strong> pode enviar
                  uma saudação, apresentar opções, coletar o interesse e transferir
                  para o setor responsável.
                </p>
              </div>
              <div id="assistente-ia" className={styles.subtopico}>
                <h3><Bot size={21} /> Criar com IA</h3>
                <p>
                  Abra o botão <strong>Assistente IA</strong> no editor. Descreva o atendimento
                  que deseja automatizar, incluindo objetivo, mensagens, perguntas,
                  condições e resultado esperado. O assistente pode solicitar detalhes
                  e gerar blocos e conexões para revisão.
                </p>
                <p>
                  O CRM mostra uma <strong>estimativa de consumo de tokens</strong> antes
                  da geração. Depois, abra a estrutura proposta, confira mensagens,
                  destinos, configurações obrigatórias e integrações. O assistente
                  ajuda a montar o fluxo, mas não substitui a revisão e a ativação manual.
                </p>
                <p>
                  A ferramenta também oferece opções para trabalhar sobre um fluxo existente.
                  Revise o resultado gerado e suas alterações antes de colocá-lo em funcionamento.
                </p>
              </div>
              <div id="importar" className={styles.subtopico}>
                <h3>Importar um fluxo por código</h3>
                <p>
                  Utilize a opção <strong>Importar por código</strong> na lista de fluxos.
                  Cole o código fornecido, no formato mostrado no modal, e confirme.
                  A operação cria uma <strong>cópia em rascunho</strong> para ser revisada e ativada.
                </p>
                <p>
                  <strong>Mídias não são copiadas</strong> pelo compartilhamento.
                  Antes de usar um fluxo importado, confira arquivos, templates,
                  integrações, setores e outros recursos que dependem da sua empresa.
                </p>
              </div>
            </section>

            <section id="integracoes" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 2</span>
              <h2><Settings2 size={23} /> Definir quando e onde o fluxo começa</h2>
              <div className={styles.subtopico}>
                <h3>Integrações WhatsApp</h3>
                <p>
                  Em <strong>Integrações WhatsApp</strong>, escolha
                  <strong> Todas as integrações</strong> ou
                  <strong> Integrações selecionadas</strong>.
                  O segundo modo permite marcar os números que podem iniciar
                  aquele fluxo. Assim, é possível usar automações diferentes
                  para Comercial e Suporte, por exemplo.
                </p>
              </div>
              <div id="gatilhos" className={styles.subtopico}>
                <h3><GitBranch size={21} /> Fluxo padrão e gatilhos de palavras-chave</h3>
                <p>
                  <strong>Fluxo padrão:</strong> inicia automaticamente quando não é
                  identificado um gatilho de outro fluxo no escopo configurado.
                  Cada integração pode ter <strong>um único fluxo padrão</strong>,
                  mas o mesmo fluxo pode ser padrão em mais de uma integração.
                </p>
                <p>
                  <strong>Gatilhos:</strong> iniciam o fluxo quando a mensagem do
                  cliente corresponde à regra cadastrada. Informe uma palavra
                  ou expressão e selecione a condição:
                  <strong> Contém, Exata, Inicia com</strong> ou <strong>Regex</strong>.
                  Por exemplo, o gatilho <em>orçamento</em> pode abrir
                  uma jornada de cotação.
                </p>
                <p>
                  Os gatilhos podem ser ativados, desativados e removidos conforme
                  suas permissões. Revise regras muito genéricas para evitar
                  iniciar um fluxo diferente do desejado.
                </p>
              </div>
              <div id="horarios" className={styles.subtopico}>
                <h3><Clock3 size={21} /> Horários, inatividade e execução única</h3>
                <p>
                  A opção <strong>Executar este fluxo apenas uma vez por conversa</strong>
                  evita que ele inicie novamente quando já tiver sido executado
                  na mesma conversa.
                </p>
                <p>
                  Em <strong>Horário de atendimento</strong>, você pode ativar um
                  limite de funcionamento, escolher dias, hora inicial e final e
                  definir o fuso horário. Fora do período, o fluxo aguarda
                  a próxima abertura, conforme as regras configuradas.
                </p>
                <p>
                  O <strong>encerramento por inatividade</strong> permite definir
                  quanto tempo o contato pode ficar sem responder e uma mensagem
                  antes de encerrar. Configure o período com cuidado para evitar
                  encerramentos precoces de conversas.
                </p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>
                  As regras de início e horário podem ser modificadas em
                  <strong> Editar fluxo</strong>, sem precisar reconstruir todos
                  os blocos do diagrama.
                </p>
              </div>
            </section>

            <section id="blocos" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 3</span>
              <h2><Workflow size={23} /> Montar o fluxo no editor visual</h2>
              <p>
                Selecione um fluxo na lateral. No menu do editor, use
                <strong> + Bloco</strong> para inserir uma mensagem ou o menu
                <strong> de três pontos (⋮)</strong> para escolher outros tipos de bloco.
                Os blocos aparecem no canvas; arraste-os para organizar a
                leitura do fluxo.
              </p>
              <div className={styles.subtopico}>
                <h3><MessageSquare size={21} /> Mensagens e respostas</h3>
                <p>
                  <strong>Mensagem:</strong> envia texto ao cliente.
                  <strong> Pergunta</strong> e <strong>Pergunta IA:</strong>
                  solicitam respostas e permitem seguir diferentes caminhos.
                  <strong> Capturar resposta:</strong> registra informações
                  em uma variável.
                  <strong> Pergunta com botões:</strong> oferece opções de interação.
                  <strong> Botão redirect:</strong> apresenta um link externo.
                </p>
              </div>
              <div className={styles.subtopico}>
                <h3>Conteúdo, atendimento e encerramento</h3>
                <p>
                  Os blocos de <strong>Imagem, Vídeo, Áudio e Arquivo</strong> permitem
                  enviar mídias. <strong>Transferência</strong> encaminha
                  o atendimento ao destino configurado.
                  <strong> Encerramento</strong> finaliza o fluxo e pode registrar
                  um resultado positivo, negativo ou neutro.
                  <strong> Avaliação</strong> permite coletar uma nota ao final do atendimento.
                </p>
              </div>
              <div className={styles.subtopico}>
                <h3><CalendarClock size={21} /> Agenda e outras integrações</h3>
                <p>
                  O menu inclui <strong>Buscar agendamento</strong>,
                  <strong> Escolher horário</strong>, <strong>Criar agendamento</strong>,
                  <strong> Remarcar agendamento</strong> e
                  <strong> Cancelar agendamento</strong>.
                  Há também blocos de <strong>Agendar disparo</strong>,
                  <strong> Consultar estoque</strong>,
                  <strong> Checkout / pagamento</strong> e
                  <strong> Interpretar arquivo IA</strong>.
                </p>
                <p>
                  Configure os dados próprios de cada recurso. Algumas opções
                  dependem de módulos, integrações ou informações cadastradas
                  na empresa. Agendar disparo exige atenção aos templates e
                  à conta WhatsApp escolhida.
                </p>
              </div>

              <div id="conexoes" className={styles.subtopico}>
                <h3><GitBranch size={21} /> Conectar blocos e configurar condições</h3>
                <p>
                  Ligue a saída de um bloco ao próximo destino. Ao selecionar
                  uma conexão, configure seu <strong>nome</strong>,
                  <strong> tipo de condição</strong> e
                  <strong> resposta esperada</strong> quando aplicável.
                  Caminhos diferentes podem levar a respostas, ações ou setores distintos.
                </p>
                <p>
                  Nas conexões compatíveis, marque
                  <strong> Usar IA para interpretar esta conexão</strong> e
                  descreva a intenção do cliente, como
                  <em> quer saber preço, orçamento ou contratar</em>.
                  A descrição indica <strong>quando seguir aquele caminho</strong>,
                  e não qual mensagem o bot deve enviar.
                </p>
                <p>
                  O editor também pode gerar descrições de intenção com IA.
                  Revise os textos antes de salvar. Para perguntas que exigem
                  resposta, considere saídas de erro, resposta inválida,
                  tempo esgotado e excesso de tentativas.
                </p>
              </div>

              <div id="variaveis" className={styles.subtopico}>
                <h3><ListChecks size={21} /> Variáveis, mídia e recursos</h3>
                <p>
                  As variáveis personalizam mensagens e armazenam respostas.
                  Exemplos de dados disponíveis incluem
                  <code>{"{{nome_contato}}"}</code>,
                  <code>{"{{interesse}}"}</code>,
                  <code>{"{{origem}}"}</code> e
                  <code>{"{{protocolo_atual}}"}</code>.
                  Use o gerenciador de variáveis do editor para conferir os campos
                  disponíveis e o formato correto.
                </p>
                <p>
                  O módulo conta com gerenciador de mídias. A capacidade
                  reservada a mídias da empresa e os limites por tipo de arquivo
                  são controlados pelo sistema. Ao importar ou clonar um fluxo,
                  confira se os arquivos necessários continuam vinculados.
                </p>
                <p>
                  Nos blocos compatíveis, também é possível configurar
                  <strong> atraso de envio</strong>,
                  <strong> notificação</strong> e limites de tentativas de resposta.
                </p>
              </div>
              <div className={styles.nota}>
                <AlertTriangle size={19} aria-hidden="true" />
                <p>
                  O bloco <strong>Interpretar arquivo IA</strong> precisa de uma
                  saída identificada como <strong>ERRO</strong> para tratar falhas
                  de interpretação ou indisponibilidade de tokens.
                  O CRM sinaliza essa ausência durante a edição e validação.
                </p>
              </div>
            </section>

            <section id="salvar" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 4</span>
              <h2><CheckCircle2 size={23} /> Salvar, conferir a prévia e ativar</h2>
              <p>
                Depois de editar os blocos e as conexões, clique em
                <strong> Salvar fluxo</strong> no cabeçalho do editor.
                Aguarde a confirmação antes de sair da página.
              </p>
              <div id="previa" className={styles.subtopico}>
                <h3><PlayCircle size={21} /> Prévia do WhatsApp</h3>
                <p>
                  A prévia mostra como a jornada de mensagens poderá ser
                  apresentada ao contato. Quando houver opções de resposta,
                  selecione os caminhos para acompanhar a sequência.
                  Use-a para encontrar textos incompletos, perguntas repetidas
                  e conexões que não levam ao destino esperado.
                </p>
                <p>
                  A prévia é uma <strong>simulação visual</strong>.
                  Ela não substitui um atendimento de teste em condições reais
                  após a ativação.
                </p>
              </div>
              <div id="validacao" className={styles.subtopico}>
                <h3><ShieldCheck size={21} /> Validações antes de ativar</h3>
                <p>
                  O CRM verifica a estrutura antes de ativar, incluindo
                  o <strong>bloco de início</strong>, conexões necessárias,
                  destinos obrigatórios, configurações de IA e recursos externos.
                  Se houver erro, uma mensagem explica o item a corrigir.
                </p>
                <p>
                  Por exemplo, uma conexão de IA pode exigir uma descrição;
                  uma transferência precisa do setor ou atendente apropriado;
                  blocos de disparo podem precisar de templates por integração,
                  sobretudo quando o fluxo opera em WABAs diferentes.
                </p>
              </div>
              <div id="ativar" className={styles.subtopico}>
                <h3>Ativar ou pausar</h3>
                <p>
                  Clique em <strong>Ativar fluxo</strong> quando a estrutura
                  estiver pronta. O CRM valida o conteúdo e salva a estrutura
                  quando necessário antes de alterar o status para ativo.
                  Se houver bloqueio de assinatura ou configuração inválida,
                  a ativação não é concluída.
                </p>
                <p>
                  Para interromper a execução, use <strong>Pausar fluxo</strong>
                  nas ações do fluxo. Fluxos fixos do sistema podem possuir
                  proteção contra pausa, arquivamento ou outras alterações.
                </p>
              </div>
            </section>

            <section id="gerenciar" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 5</span>
              <h2>Administrar fluxos existentes</h2>
              <p>
                Na lista lateral, busque pelo nome e use os filtros
                <strong> Todos, Fluxos do sistema, Ativos, Rascunhos, Pausados</strong>
                e <strong>Arquivados</strong>. Selecione um fluxo para
                abrir seu editor.
              </p>
              <div className={styles.subtopico}>
                <h3>Editar fluxo</h3>
                <p>
                  A ação <strong>Editar fluxo</strong> permite alterar nome,
                  descrição, fluxo padrão, execução única, escopo de integrações,
                  gatilhos, horários e inatividade. Use o editor visual para
                  modificar blocos e conexões.
                </p>
              </div>
              <div id="compartilhar" className={styles.subtopico}>
                <h3><Copy size={21} /> Clonar e compartilhar</h3>
                <p>
                  Use <strong>Clonar fluxo</strong> para obter uma cópia
                  que pode ser ajustada sem reconstruir a automação original.
                  Para disponibilizar um modelo a outra empresa, clique em
                  <strong> Compartilhar fluxo</strong> e copie o código exibido.
                  A outra empresa poderá importá-lo em rascunho.
                </p>
                <p>
                  O código pode ser atualizado pelo modal de compartilhamento.
                  Como as mídias não são copiadas, o destinatário deve
                  configurá-las novamente e revisar suas integrações.
                </p>
              </div>
              <div id="arquivar" className={styles.subtopico}>
                <h3>Arquivar, restaurar e excluir</h3>
                <p>
                  A ação <strong>Apagar fluxo</strong> no menu pode abrir a
                  confirmação de <strong>arquivamento</strong>. Um fluxo
                  arquivado deixa de executar e de ser editado, mas pode
                  ser <strong>restaurado</strong> depois.
                  O filtro Arquivados permite localizar esses registros.
                </p>
                <p>
                  Para registros arquivados, a opção de
                  <strong> exclusão definitiva</strong> pode aparecer
                  conforme a permissão do usuário. Confira o modal antes de
                  confirmar: arquivar e excluir definitivamente são ações distintas.
                </p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>
                  As permissões de visualizar, criar, editar, ativar, arquivar
                  e excluir fluxos são independentes. Algumas ações
                  podem estar ocultas para determinados perfis.
                </p>
              </div>
            </section>

            <section id="duvidas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Dúvidas frequentes</span>
              <h2>Perguntas e soluções</h2>
              <div className={styles.faq}>
                <details>
                  <summary>Qual a diferença entre fluxo padrão e gatilho?</summary>
                  <p>O fluxo padrão é iniciado quando não se encontra um gatilho específico de outro fluxo no escopo. Já o gatilho é uma condição vinculada à mensagem recebida, como uma palavra-chave.</p>
                </details>
                <details>
                  <summary>Posso usar o mesmo fluxo em mais de um WhatsApp?</summary>
                  <p>Sim, de acordo com o escopo selecionado. Revise se os templates, agendas e outros recursos estão disponíveis nas integrações correspondentes.</p>
                </details>
                <details>
                  <summary>Preciso ativar o fluxo depois de criar com IA?</summary>
                  <p>Sim. Revise a estrutura, corrija configurações e conexões e ative o fluxo depois de validar sua utilização.</p>
                </details>
                <details>
                  <summary>Por que o CRM não deixa ativar?</summary>
                  <p>A validação pode encontrar bloco de início ausente, conexões sem configuração, destinos obrigatórios ou outros problemas. Leia a mensagem de erro e corrija o item indicado.</p>
                </details>
                <details>
                  <summary>Um botão sem caminho configurado funciona?</summary>
                  <p>Para que o fluxo prossiga conforme a escolha, configure e salve a conexão correspondente à saída ou resposta do bloco.</p>
                </details>
                <details>
                  <summary>O que acontece quando a pessoa não responde?</summary>
                  <p>Depende das regras de inatividade, tempo limite e tentativas configuradas no fluxo ou no bloco. Confira o destino escolhido para cada situação.</p>
                </details>
                <details>
                  <summary>O código compartilhado também copia mídias?</summary>
                  <p>Não. O próprio modal de compartilhamento informa que as mídias não são copiadas. Revise os arquivos ao importar.</p>
                </details>
                <details>
                  <summary>Arquivar é o mesmo que excluir?</summary>
                  <p>Não. Um fluxo arquivado não executa e pode ser restaurado. A exclusão definitiva é uma ação separada, apresentada apenas quando permitida.</p>
                </details>
              </div>
            </section>

            <section id="videos" className={styles.videoArtigo} aria-label="Tutoriais em vídeo do módulo Fluxos">
              <div>
                <span className={styles.artigoEtiqueta}>Aprenda na prática</span>
                <h2>Vídeos tutoriais de Fluxos</h2>
                <p>
                  A biblioteca de vídeos já está preparada para receber
                  tutoriais de criação, gatilhos, blocos, conexões, testes e
                  solução de problemas do módulo.
                </p>
              </div>
              <VideoTutoriais
                videos={obterVideosDoModulo("fluxos")}
                tituloPendente="Como criar e configurar fluxos"
              />
            </section>

            <div className={styles.artigoFim}>
              <Link href="/central-de-conhecimento"><ArrowLeft size={17} /> Voltar à Central</Link>
              <Link href="/fluxos">Abrir Fluxos <ArrowRight size={17} /></Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
