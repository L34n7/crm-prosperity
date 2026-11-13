import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  FileCheck2,
  Info,
  KeyRound,
  MessagesSquare,
  ShieldCheck,
  Smartphone,
  Workflow,
} from "lucide-react";
import Header from "@/components/Header";
import VideoTutoriais from "@/components/VideoTutoriais";
import { obterVideosDoModulo } from "@/lib/central-de-conhecimento/videos";
import styles from "../central-de-conhecimento.module.css";

const indice = [
  { id: "introducao", titulo: "Visão geral e pré-requisitos" },
  { id: "segmento", titulo: "1. Segmento ou identificação" },
  { id: "modo-meta", titulo: "2. Conectar conta Meta" },
  { id: "ativacao", titulo: "3. Ativar o número" },
  { id: "webhook", titulo: "4. Webhook e conclusão" },
  { id: "pagamento", titulo: "Cobrança e próximos ajustes" },
  { id: "problemas", titulo: "Problemas frequentes" },
  { id: "videos", titulo: "Vídeos tutoriais" },
];

export default function DocumentacaoConfigurarAmbientePage() {
  return (
    <>
      <Header
        title="Central de Conhecimento"
        subtitle="Documentação completa para configurar o WhatsApp oficial no CRM Prosperity."
      />
      <main className={styles.pagina}>
        <nav aria-label="Navegação da documentação" className={styles.caminho}>
          <Link href="/central-de-conhecimento"><ArrowLeft size={16} /> Central de Conhecimento</Link>
          <span>/</span>
          <span>Configurar Ambiente</span>
        </nav>

        <header className={styles.artigoHero}>
          <span className={styles.sobretitulo}><BookOpen size={16} /> Guia completo · Configuração WhatsApp</span>
          <h1>Configurar Ambiente</h1>
          <p>
            Configure sua empresa, conecte a conta Meta, ative um número WhatsApp e
            finalize o webhook para utilizar a integração oficial no CRM Prosperity.
            Este guia também explica a conexão por Coexistência, novos números,
            pagamento e problemas comuns.
          </p>
          <div className={styles.artigoAcoes}>
            <Link href="/configurar-ambiente" className={styles.acaoPrincipal}>
              Abrir Configurar Ambiente <ArrowRight size={17} />
            </Link>
            <Link href="/perfil-whatsapp" className={styles.acaoSecundaria}>
              Ver Perfil WhatsApp
            </Link>
          </div>
        </header>

        <div className={styles.layoutArtigo}>
          <aside className={styles.indice} aria-label="Índice da documentação">
            <strong>Neste artigo</strong>
            <nav>{indice.map((item) => <a key={item.id} href={`#${item.id}`}>{item.titulo}</a>)}</nav>
            <div className={styles.indiceAjuda}>
              <CircleHelp size={19} aria-hidden="true" />
              <span>Abra a aba Ajuda durante a configuração para consultar orientações sobre a etapa atual.</span>
            </div>
          </aside>

          <article className={styles.artigo}>
            <section id="introducao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Conheça o assistente</span>
              <h2>Como funciona a configuração do ambiente?</h2>
              <p>
                O assistente conduz a conexão do CRM à <strong>WhatsApp Business Platform</strong>,
                utilizando o processo oficial da Meta. Ele começa pela identificação da
                empresa, continua pela associação do número e termina com a ativação
                da integração e do webhook.
              </p>
              <div className={styles.fluxoResumo}>
                <span>Preparar empresa</span><ArrowRight size={17} />
                <span>Conectar Meta</span><ArrowRight size={17} />
                <span>Ativar número</span><ArrowRight size={17} />
                <span>Concluir webhook</span>
              </div>
              <div id="preparacao" className={styles.subtopico}>
                <h3><FileCheck2 size={21} /> O que preparar antes de começar</h3>
                <p>
                  Tenha acesso autorizado à conta empresarial da Meta, ao portfólio
                  empresarial e à conta WhatsApp Business que deseja utilizar.
                  Confira também o telefone e o acesso ao método de verificação
                  oferecido pela Meta, quando aplicável.
                </p>
                <p>
                  O número precisa ser elegível para o modo escolhido.
                  Na <strong>Cloud API</strong>, o número não deve permanecer conectado
                  ao aplicativo WhatsApp/WhatsApp Business.
                  Na <strong>Coexistência</strong>, a proposta é manter o WhatsApp
                  Business App funcionando junto ao CRM, sujeito à elegibilidade da Meta.
                </p>
                <p>
                  Se for um número adicional, confirme que seu plano permite mais
                  integrações. O assistente poderá iniciar diretamente na
                  identificação da nova conexão sem alterar o segmento da empresa.
                </p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>
                  O guia lateral <strong>Ajuda</strong> acompanha todas as etapas.
                  Se ele estiver recolhido, clique na aba Ajuda à direita
                  para consultar as instruções e os vídeos.
                </p>
              </div>
            </section>

            <section id="segmento" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 1</span>
              <h2>Identificar a empresa ou o novo número</h2>
              <div className={styles.subtopico}>
                <h3>Primeira integração: segmento da empresa</h3>
                <p>
                  Clique em <strong>Começar</strong> na introdução. Na etapa seguinte,
                  escolha em <strong>Segmento de atuação</strong> a atividade da sua empresa.
                  O nicho selecionado determina quais recursos e módulos são
                  apresentados no CRM. Clique em <strong>Avançar</strong> para salvar.
                </p>
                <p>
                  Em contas White Label, o segmento pode estar previamente
                  definido e não aceitar alterações nessa etapa. Nesse caso,
                  mantenha a seleção informada e prossiga.
                </p>
              </div>
              <div id="numero-adicional" className={styles.subtopico}>
                <h3><Smartphone size={21} /> Número adicional: nome da integração</h3>
                <p>
                  Ao conectar um segundo número ou outro número adicional,
                  a primeira etapa solicita um <strong>Nome da integração</strong>.
                  Escolha um identificador interno com <strong>3 a 80 caracteres</strong>,
                  como <em>Comercial</em>, <em>Suporte</em> ou <em>Unidade Centro</em>.
                </p>
                <p>
                  O nome serve para identificar o canal nos seletores do CRM
                  e não modifica o nome comercial de exibição do WhatsApp.
                  O segmento e as configurações gerais já cadastradas são mantidos.
                </p>
              </div>
            </section>

            <section id="modo-meta" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 2</span>
              <h2>Conectar a conta Meta</h2>
              <p>
                Nesta etapa, escolha a forma de uso do número e inicie a
                conexão oficial com a Meta. A conta e os identificadores técnicos
                serão associados automaticamente à integração quando a operação
                for concluída.
              </p>

              <div id="modos" className={styles.subtopico}>
                <h3><MessagesSquare size={21} /> Cloud API ou Coexistência?</h3>
                <p>
                  <strong>Cloud API — Conectar somente no CRM:</strong> indicada
                  para um número que será operado pelo CRM e não ficará ativo
                  no WhatsApp/WhatsApp Business App. Durante o processo da Meta,
                  use a opção apropriada para adicionar e verificar o número.
                </p>
                <p>
                  <strong>Coexistência — Conectar no CRM e no app:</strong>
                  permite, quando a Meta autoriza, utilizar o mesmo número
                  no WhatsApp Business App e no CRM. Escolha essa modalidade
                  quando precisar continuar usando o aplicativo no celular.
                  Não remova o número do app como se fosse uma conexão exclusiva por Cloud API.
                </p>
                <p>
                  Depois de escolher o modo, clique em <strong>Conectar com a Meta</strong>
                  ou <strong>Conectar WhatsApp Business</strong>.
                  A opção <strong>Avançar</strong> fica disponível após
                  a conclusão da conexão.
                </p>
              </div>

              <div id="meta-conta" className={styles.subtopico}>
                <h3>O que fazer na janela da Meta</h3>
                <p>
                  Faça login com a conta autorizada e siga as etapas apresentadas.
                  Confira o <strong>portfólio empresarial</strong> e a
                  <strong> conta WhatsApp Business (WABA)</strong>.
                  Revise os dados da empresa e selecione o número correto.
                </p>
                <p>
                  Para Cloud API, a Meta pode solicitar a inclusão de um novo número
                  na plataforma. Para Coexistência, selecione o número já
                  utilizado no WhatsApp Business App e siga o fluxo específico
                  de vinculação. Os passos disponíveis dependem da elegibilidade
                  e da configuração da conta.
                </p>
              </div>

              <div id="verificacao" className={styles.subtopico}>
                <h3><ShieldCheck size={21} /> Verificação do telefone</h3>
                <p>
                  Antes de solicitar códigos, confira o <strong>DDI, DDD e telefone</strong>
                  e se o número pode receber SMS ou ligação conforme a forma
                  de validação oferecida. A Meta limita as tentativas:
                  solicitações repetidas podem bloquear temporariamente
                  novas verificações.
                </p>
                <p>
                  Se a janela for fechada ou o processo falhar, verifique o
                  status da integração no CRM antes de tentar conectar novamente.
                  Evite criar repetidamente registros de telefone sem confirmar
                  o resultado anterior.
                </p>
              </div>
              <div className={styles.nota}>
                <AlertTriangle size={19} aria-hidden="true" />
                <p>
                  A escolha do modo é importante: o número pode continuar
                  no aplicativo apenas se estiver em um fluxo de Coexistência
                  elegível. Não siga instruções de remoção do aplicativo
                  quando estiver configurando esse modo.
                </p>
              </div>
            </section>

            <section id="ativacao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 3</span>
              <h2>Ativar o número do WhatsApp</h2>
              <p>
                Depois que a conexão Meta for confirmada, o assistente mostra o
                número associado e seu status de ativação. Os controles diferem
                entre Cloud API e Coexistência.
              </p>
              <div id="pin" className={styles.subtopico}>
                <h3><KeyRound size={21} /> Cloud API: informar o PIN de seis dígitos</h3>
                <p>
                  Clique em <strong>Ativar número</strong>. O CRM abre a confirmação
                  de verificação em duas etapas para informar o
                  <strong> PIN de 6 dígitos</strong> do número.
                  Confira o código e clique em <strong>Confirmar PIN</strong>.
                </p>
                <p>
                  O PIN deve ser guardado com segurança, pois poderá ser
                  solicitado em futuras verificações ou migrações.
                  Se a Meta retornar PIN incorreto, confira o código antes
                  de uma nova tentativa. Em caso de excesso de tentativas,
                  aguarde o prazo indicado pela plataforma.
                </p>
              </div>
              <div id="importacao-coexistencia" className={styles.subtopico}>
                <h3><MessagesSquare size={21} /> Coexistência: ativar e importar dados</h3>
                <p>
                  Confira o vínculo com o WhatsApp Business App e selecione
                  como deseja tratar os dados anteriores:
                  <strong> importar apenas contatos</strong> ou
                  <strong> contatos e conversas anteriores</strong>,
                  quando a Meta permitir essa escolha.
                </p>
                <p>
                  Clique em <strong>Ativar Coexistência</strong> e aguarde a
                  confirmação. Os painéis de sincronização exibem o
                  andamento ou avisos da importação. O processamento de
                  conversas antigas é separado do funcionamento das mensagens
                  novas, que podem estar disponíveis antes do fim da importação.
                </p>
                <p>
                  Se houver avisos, revise os detalhes do painel.
                  A ativação do vínculo não deve ser repetida apenas porque
                  uma importação ainda está pendente.
                </p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>
                  Clique em <strong>Avançar</strong> somente depois que o
                  número for identificado como ativado pelo CRM.
                </p>
              </div>
            </section>

            <section id="webhook" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 4</span>
              <h2>Configurar webhook e concluir a integração</h2>
              <p>
                O <strong>webhook</strong> permite receber mensagens,
                confirmações de entrega, status e outros eventos do WhatsApp
                no CRM. O assistente mostra o estado da assinatura antes
                de permitir a finalização.
              </p>
              <div className={styles.subtopico}>
                <h3><Workflow size={21} /> Configurar o webhook</h3>
                <p>
                  Confira o indicador <strong>Webhook</strong>. Se estiver
                  pendente, clique em <strong>Configurar webhook</strong> e
                  aguarde a confirmação. Essa operação depende das permissões
                  e da configuração da aplicação autorizada na Meta.
                </p>
                <p>
                  Se surgir um alerta de permissão, verifique
                  <code>whatsapp_business_management</code>, a conta empresarial
                  e a autorização do aplicativo antes de repetir.
                  O CRM mostra o detalhe do erro, quando disponível.
                </p>
              </div>
              <div id="finalizacao" className={styles.subtopico}>
                <h3><CheckCircle2 size={21} /> Finalizar ambiente</h3>
                <p>
                  Com o webhook confirmado, clique em <strong>Concluir configuração</strong>
                  ou <strong>Concluir novo número</strong>. O CRM valida
                  as condições e, quando tudo está correto, exibe o
                  resultado como ambiente configurado.
                </p>
                <p>
                  Revise <strong>Status da integração</strong>,
                  <strong> WABA ID</strong>, <strong>ID do número</strong>
                  e <strong>Webhook verificado</strong>.
                  Em Coexistência, o painel de sincronização pode continuar
                  mostrando tarefas de importação ainda em processamento.
                </p>
              </div>
              <div className={styles.nota}>
                <AlertTriangle size={19} aria-hidden="true" />
                <p>
                  O reconhecimento da conexão pela Meta não basta para
                  finalizar o ambiente: a ativação do número e a configuração
                  do webhook também precisam ser confirmadas.
                </p>
              </div>
            </section>

            <section id="pagamento" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Depois de conectar</span>
              <h2><CreditCard size={22} /> Cobrança, permissões e próximos passos</h2>
              <p>
                Uma integração ativa permite configurar os próximos recursos do
                CRM, mas isso não significa que mensagens cobradas pela Meta
                já estejam liberadas sem uma forma de pagamento válida.
              </p>
              <div className={styles.subtopico}>
                <h3>Configurar cobrança na conta da Meta</h3>
                <p>
                  Acesse a <strong>Central de Cobrança da Meta</strong>,
                  escolha a conta empresarial associada à integração
                  e verifique o método de pagamento.
                  Templates e conversas podem gerar cobranças conforme
                  a categoria, o tipo de mensagem e as regras vigentes da Meta.
                </p>
                <a
                  href="https://business.facebook.com/latest/billing_hub/accounts/details/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkInterno}
                >
                  Abrir Central de Cobrança da Meta <ArrowRight size={16} />
                </a>
                <p>
                  Saiba mais em <Link href="/central-de-conhecimento/disparos#cobranca">
                    Como funciona a cobrança dos disparos
                  </Link>.
                </p>
              </div>
              <div id="proximos-passos" className={styles.subtopico}>
                <h3>O que configurar após concluir</h3>
                <p>
                  Na primeira integração, o assistente direciona para
                  <strong> Permissões</strong>, onde você pode revisar as regras
                  de acesso da empresa. Em números adicionais, o próximo
                  destino é <Link href="/perfil-whatsapp">Perfil WhatsApp</Link>,
                  para gerenciar as conexões.
                </p>
                <p>
                  Depois, confira os <Link href="/templates-whatsapp">Templates WhatsApp</Link>,
                  o atendimento em <Link href="/conversas">Conversas</Link>,
                  os fluxos de automação e a configuração de campanhas.
                </p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>
                  Se o número adicional pertencer a outra WABA, os templates
                  da conta anterior não são necessariamente compartilhados.
                  Revise a integração escolhida em cada disparo, template e fluxo.
                </p>
              </div>
            </section>

            <section id="problemas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Solução de problemas</span>
              <h2><CircleHelp size={22} /> Dúvidas e falhas comuns</h2>
              <div id="desconectado" className={styles.subtopico}>
                <h3>Integração desconectada</h3>
                <p>
                  Se o CRM mostrar a integração como desconectada, confira
                  o estado do número, o vínculo com a Meta e os alertas exibidos.
                  Utilize as opções de verificação ou reconexão disponíveis,
                  sem excluir uma conta ou refazer todo o cadastro sem necessidade.
                </p>
                <p>
                  Há um vídeo específico sobre esse problema na seção
                  <a href="#videos"> Vídeos tutoriais</a> desta página
                  e também na aba Ajuda de Configurar Ambiente.
                </p>
              </div>
              <div className={styles.tabelaFalhas}>
                <div>
                  <strong>PIN incorreto ou excesso de tentativas</strong>
                  <p>Confira o PIN de seis dígitos e evite tentativas consecutivas enquanto houver restrição da Meta.</p>
                </div>
                <div>
                  <strong>Webhook não configurado</strong>
                  <p>Confira a assinatura da conta, a autorização do app e a permissão whatsapp_business_management.</p>
                </div>
                <div>
                  <strong>Integração Meta pendente</strong>
                  <p>Confira portfólio, conta WhatsApp Business, número escolhido e conclusão da janela oficial.</p>
                </div>
                <div>
                  <strong>Contatos ou histórico não importados</strong>
                  <p>Em Coexistência, consulte o status e os avisos individuais de sincronização antes de repetir o processo.</p>
                </div>
              </div>
              <h3>Perguntas frequentes</h3>
              <div className={styles.faq}>
                <details>
                  <summary>Posso manter o WhatsApp Business no celular?</summary>
                  <p>Somente quando o número for elegível para o modo Coexistência, que permite uso simultâneo no app e no CRM. Cloud API exclusiva segue regras diferentes.</p>
                </details>
                <details>
                  <summary>Não consigo avançar da etapa Meta. O que verificar?</summary>
                  <p>Confirme que a janela da Meta foi concluída e que o CRM reconheceu a WABA e o ID do número. Use a ação de atualização de status antes de iniciar outra conexão.</p>
                </details>
                <details>
                  <summary>Preciso digitar o PIN para Coexistência?</summary>
                  <p>O assistente apresenta o PIN de seis dígitos no fluxo de ativação Cloud API. A Coexistência utiliza seu próprio processo de ativação e elegibilidade pela Meta.</p>
                </details>
                <details>
                  <summary>O número foi ativado, mas o ambiente continua pendente.</summary>
                  <p>Confira a etapa final: pode faltar configurar o webhook ou concluir o ambiente no botão correspondente.</p>
                </details>
                <details>
                  <summary>O CRM está ativo, mas meus disparos falham por pagamento.</summary>
                  <p>Verifique o método de pagamento e as condições financeiras da conta WhatsApp Business na Meta. Ativação técnica e cobrança são verificações diferentes.</p>
                </details>
                <details>
                  <summary>Preciso refazer o segmento ao adicionar outro número?</summary>
                  <p>Não. O fluxo de número adicional mantém o segmento e pede apenas um nome interno para identificar a nova integração.</p>
                </details>
              </div>
            </section>

            <section id="videos" className={styles.videoArtigo} aria-label="Vídeos de Configurar Ambiente">
              <div>
                <span className={styles.artigoEtiqueta}>Vídeos de ajuda</span>
                <h2>Configuração de ambiente e problemas comuns</h2>
                <p>
                  Assista ao tutorial sobre integração desconectada.
                  Outros vídeos sobre conexão, ativação e webhook poderão
                  ser adicionados a esta seção.
                </p>
              </div>
              <VideoTutoriais videos={obterVideosDoModulo("configurar-ambiente")} />
            </section>

            <div className={styles.artigoFim}>
              <Link href="/central-de-conhecimento"><ArrowLeft size={17} /> Voltar à Central</Link>
              <Link href="/configurar-ambiente">Abrir Configurar Ambiente <ArrowRight size={17} /></Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
