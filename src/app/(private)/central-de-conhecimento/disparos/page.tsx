import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  Info,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import styles from "../central-de-conhecimento.module.css";

const indice = [
  { id: "preparacao", titulo: "Etapas obrigatórias para disparar" },
  { id: "mensagem", titulo: "1. Mensagem e variáveis" },
  { id: "planejamento", titulo: "2. Capacidade e horário" },
  { id: "destinatarios", titulo: "3. Contatos e reservas" },
  { id: "revisao", titulo: "4. Revisão e envio" },
  { id: "acompanhamento", titulo: "Resultados e cancelamentos" },
  { id: "problemas", titulo: "Falhas e dúvidas frequentes" },
];

export default function DocumentacaoDisparosPage() {
  return (
    <>
      <Header title="Central de Conhecimento" subtitle="Documentação completa para usar os recursos do CRM Prosperity." />
      <main className={styles.pagina}>
        <nav aria-label="Navegação da documentação" className={styles.caminho}>
          <Link href="/central-de-conhecimento"><ArrowLeft size={16} /> Central de Conhecimento</Link>
          <span>/</span>
          <span>Disparos WhatsApp</span>
        </nav>

        <header className={styles.artigoHero}>
          <span className={styles.sobretitulo}><BookOpen size={16} /> Guia completo · WhatsApp</span>
          <h1>Disparos WhatsApp</h1>
          <p>Do primeiro template ao relatório da campanha: entenda os campos, limites, cobranças, agendamentos e resultados antes de enviar mensagens aos seus contatos.</p>
          <div className={styles.artigoAcoes}>
            <Link href="/disparos-whatsapp" className={styles.acaoPrincipal}>Abrir Disparos <ArrowRight size={17} /></Link>
            <Link href="/templates-whatsapp" className={styles.acaoSecundaria}>Gerenciar Templates</Link>
          </div>
        </header>

        <div className={styles.layoutArtigo}>
          <aside className={styles.indice} aria-label="Índice desta documentação">
            <strong>Neste artigo</strong>
            <nav>
              {indice.map((item) => <a href={`#${item.id}`} key={item.id}>{item.titulo}</a>)}
            </nav>
            <div className={styles.indiceAjuda}>
              <FileCheck2 size={19} aria-hidden="true" />
              <span>O guia lateral de Disparos resume cada etapa durante o preenchimento.</span>
            </div>
          </aside>

          <article className={styles.artigo}>
            <section className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Visão geral</span>
              <h2>Para que serve o módulo Disparos?</h2>
              <p>O módulo permite enviar um <strong>template aprovado pela Meta</strong> a diversos contatos por meio de uma integração oficial do WhatsApp. Você escolhe o número, personaliza variáveis, seleciona destinatários e define se a campanha será enviada agora ou agendada.</p>
              <p>O CRM acompanha a capacidade de envio, apresenta uma estimativa de cobrança e registra o histórico de resultados. O aceite do envio pela API não garante que a mensagem foi entregue: a confirmação é acompanhada posteriormente pelo WhatsApp.</p>
              <div className={styles.fluxoResumo}>
                <span>Preparar</span><ArrowRight size={17} /><span>Planejar</span><ArrowRight size={17} /><span>Selecionar</span><ArrowRight size={17} /><span>Confirmar</span>
              </div>
            </section>

            <section id="preparacao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Pré-requisitos</span>
              <h2>Etapas obrigatórias para disparar</h2>
              <p>Para realizar a campanha, tenha uma integração WhatsApp ativa, um template aprovado e a cobrança da Meta corretamente configurada.</p>

              <div id="templates" className={styles.subtopico}>
                <h3><FileCheck2 size={21} /> 1. Criar um template</h3>
                <p>Templates são modelos de mensagem enviados à Meta para avaliação. No CRM, abra <Link href="/templates-whatsapp">Templates WhatsApp</Link>, escolha a opção de criação e preencha as etapas do assistente: cabeçalho e imagem (quando aplicável), corpo, rodapé e botões, integração, nome e categoria.</p>
                <p>O conteúdo deve corresponder à finalidade da comunicação. <strong>Marketing</strong> é indicado para ofertas e campanhas promocionais; <strong>Utility (Utilidade)</strong> para mensagens transacionais ou de serviço. A Meta pode reclassificar, recusar ou restringir templates conforme suas regras.</p>
                <p>Depois de solicitar a aprovação, acompanhe o status no módulo. Apenas modelos <strong>aprovados</strong> poderão ser selecionados no envio em massa. Se necessário, sincronize a lista de templates.</p>
                <Link className={styles.linkInterno} href="/templates-whatsapp">Abrir módulo Templates <ArrowRight size={16} /></Link>
              </div>

              <div id="pagamento" className={styles.subtopico}>
                <h3><CreditCard size={21} /> 2. Configurar a forma de pagamento</h3>
                <p>A cobrança das mensagens é administrada pela <strong>Meta</strong>, conforme a conta comercial do WhatsApp vinculada à integração. Acesse a Central de Cobrança da Meta, identifique a conta correta e verifique se existe uma forma de pagamento válida e habilitada.</p>
                <p>É importante escolher a conta de WhatsApp Business correspondente ao número conectado ao CRM. Ausência de crédito, restrições financeiras ou problemas na conta podem impedir envios mesmo com um template aprovado.</p>
                <a className={styles.linkInterno} href="https://business.facebook.com/latest/billing_hub/accounts/details/" target="_blank" rel="noopener noreferrer">Abrir Central de Cobrança da Meta <ArrowRight size={16} /></a>
              </div>

              <div className={styles.nota}><Info size={19} /><p>O WhatsApp deve estar conectado em <strong>Configurar Ambiente</strong>. Os limites e as condições de pagamento são controlados pela Meta, não pelo CRM.</p></div>
            </section>

            <section id="mensagem" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 1</span>
              <h2>Mensagem e variáveis</h2>
              <p>Em <Link href="/disparos-whatsapp">Disparos</Link>, clique em <strong>Enviar disparos</strong> para iniciar a configuração.</p>

              <div id="integracao" className={styles.subtopico}>
                <h3>Integração WhatsApp</h3>
                <p>Selecione o número que enviará a campanha. Se sua empresa tiver mais de uma integração, confira qual WhatsApp é adequado ao público e à mensagem. A capacidade de envio e a conta de cobrança são vinculadas à integração escolhida.</p>
              </div>

              <div id="template-aprovado" className={styles.subtopico}>
                <h3>Template aprovado</h3>
                <p>Escolha um template disponível na integração. O envio em massa utiliza o conteúdo aprovado pela Meta; para alterar o texto ou criar outra finalidade, prepare um novo modelo em <Link href="/templates-whatsapp">Templates</Link> e aguarde aprovação.</p>
              </div>

              <div className={styles.subtopico}>
                <h3>Nome do disparo</h3>
                <p>Identifique internamente a campanha para localizá-la depois, por exemplo, <strong>Reativação de clientes - novembro</strong>. O campo é opcional e não altera o texto enviado ao destinatário.</p>
              </div>

              <div id="variaveis" className={styles.subtopico}>
                <h3>Variáveis da mensagem</h3>
                <p>Se o template contém campos como <code>{'{{1}}'}</code> e <code>{'{{2}}'}</code>, defina qual informação preencherá cada posição. Você pode utilizar dados disponíveis no CRM, como nome do contato e campanha, ou as opções de preenchimento apresentadas no assistente.</p>
                <p>Confira a prévia antes de continuar. Se um contato não tiver o dado necessário, revise o cadastro e o preenchimento da variável para evitar mensagens incompletas ou falhas.</p>
              </div>
            </section>

            <section id="planejamento" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 2</span>
              <h2>Capacidade e agendamento</h2>

              <div id="capacidade" className={styles.subtopico}>
                <h3>Entenda a capacidade de envio</h3>
                <p>A Meta limita quantos destinatários distintos um número pode alcançar dentro de uma <strong>janela móvel de 24 horas</strong>. O CRM apresenta a capacidade disponível e uma previsão de quando novas vagas poderão surgir. Essa previsão não é reserva de capacidade nem garantia de aprovação futura.</p>
                <p>Se o número não tiver capacidade suficiente, o assistente pode sugerir o envio da quantidade disponível, o agendamento para outro horário ou a divisão em campanhas menores.</p>
              </div>

              <div className={styles.subtopico}>
                <h3>Quantidade desejada</h3>
                <p>Informe a quantidade de contatos que deseja alcançar. Esse número orienta o planejamento, mas você precisará escolher os destinatários na etapa seguinte. A quantidade efetivamente enviada dependerá dos contatos elegíveis e dos limites aplicados durante o processamento.</p>
              </div>

              <div id="agendamento" className={styles.subtopico}>
                <h3><CalendarClock size={21} /> Enviar agora ou agendar</h3>
                <p><strong>Enviar agora:</strong> a campanha entra na fila e é processada gradualmente. <strong>Agendar:</strong> escolha data e hora futuras, respeitando a previsão de capacidade apresentada no assistente.</p>
                <p>No horário do agendamento, o CRM revalida as condições necessárias ao envio. Consulte os agendamentos ainda pendentes em <Link href="/disparos-agendados">Disparos agendados</Link>; eles podem ser cancelados antes do processamento.</p>
              </div>
              <div className={styles.nota}><AlertTriangle size={19} /><p>Não há envio instantâneo garantido para toda a lista. A operação depende da fila, do estado da integração e dos retornos da Meta.</p></div>
            </section>

            <section id="destinatarios" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 3</span>
              <h2>Contatos e reservas</h2>

              <div id="filtros" className={styles.subtopico}>
                <h3>Filtrar contatos</h3>
                <p>Busque contatos por nome, telefone ou e-mail, ou refine a seleção por origem, campanha, interesse, classificação e histórico de disparos. Os filtros avançados também permitem considerar a integração, o atendente anterior, o período de mensagens e os registros de opt-in e opt-out.</p>
                <p>Use os filtros para separar públicos relevantes. A ferramenta não substitui a verificação de autorização adequada para receber comunicações.</p>
              </div>

              <div id="selecionar" className={styles.subtopico}>
                <h3>Selecionar destinatários</h3>
                <p>Mova os contatos desejados da lista <strong>Disponíveis</strong> para <strong>Selecionados</strong>. Você pode adicionar ou remover vários contatos, respeitando o planejamento da campanha. Revise telefones inválidos, contatos com opt-out, pausas temporárias, marcações de revisão e possíveis conflitos de campanhas.</p>
                <p>Algumas restrições impedem o envio automaticamente. Corrija os dados ou retire os destinatários afetados antes de confirmar a campanha.</p>
              </div>

              <div id="contatos-reserva" className={styles.subtopico}>
                <h3><ListChecks size={21} /> Contatos reserva (opcional)</h3>
                <p>Na etapa <strong>Contatos</strong>, ative a opção de reserva caso deseje preparar substituições. O sistema permite selecionar contatos extras, dentro do limite indicado na tela, além dos destinatários principais.</p>
                <p>Os contatos de reserva aguardam em uma fila própria. Se um envio principal falhar <strong>definitivamente</strong>, um reserva pode substituí-lo, sem aumentar a quantidade desejada e respeitando a capacidade da Meta. Reservas não são acionadas apenas porque a confirmação de entrega está pendente.</p>
                <p>Selecione primeiro os contatos principais e depois os reservas. O assistente exibe a quantidade máxima permitida de reservas para aquele planejamento.</p>
              </div>

              <div id="autorizacoes" className={styles.subtopico}>
                <h3><ShieldCheck size={21} /> Opt-in, opt-out e lista fria</h3>
                <p><strong>Opt-in</strong> é o registro de autorização para receber mensagens; <strong>opt-out</strong> é a manifestação de que o contato não quer mais recebê-las. A ausência de opt-in no CRM não comprova que o usuário autorizou o envio por outro meio.</p>
                <p>Para listas sem opt-in registrado, o CRM mostra orientações e pode exigir confirmação adicional. Isso não dispensa a necessidade de uma autorização válida, nem permite ignorar pedidos de descadastramento. Para marketing, respeite as regras de consentimento e ofereça um meio claro para deixar de receber mensagens.</p>
              </div>
            </section>

            <section id="revisao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 4</span>
              <h2>Revisão, cobrança e confirmação</h2>
              <div className={styles.subtopico}>
                <h3>Revisar a campanha</h3>
                <p>Confira a integração, o nome da campanha, o template, o horário escolhido e a quantidade de destinatários. Revise também as variáveis e a prévia da mensagem.</p>
              </div>
              <div id="cobranca" className={styles.subtopico}>
                <h3><CreditCard size={21} /> Como funciona o custo estimado</h3>
                <p>O CRM apresenta a estimativa de mensagens cobradas e isentas, conforme os dados e as regras atuais de cobrança da Meta. O valor em reais é uma referência e pode variar com câmbio, tributos, tarifas e faturamento final.</p>
                <p>Templates de <strong>Marketing</strong> e <strong>Utility</strong> podem ter preços diferentes. Desde <strong>1º de outubro de 2026</strong>, o projeto considera a cobrança de Utility na janela comum de 24 horas; uma possível isenção Free Entry Point (FEP) é tratada separadamente quando identificada.</p>
                <p>O custo é cobrado pela Meta na conta comercial correspondente. Não confunda a confirmação de aceite da API com entrega efetiva nem com faturamento já concluído.</p>
              </div>
              <div id="confirmacao" className={styles.subtopico}>
                <h3><CheckCircle2 size={21} /> Confirmar envio</h3>
                <p>Marque a declaração de ciência sobre possíveis cobranças e clique para confirmar. Se houver contatos sem opt-in registrado, podem surgir verificações de responsabilidade adicionais. Ao concluir, o CRM agenda ou cria a campanha e inicia o processamento pela fila.</p>
              </div>
            </section>

            <section id="acompanhamento" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Após confirmar</span>
              <h2>Acompanhar resultados e gerenciar campanhas</h2>

              <div id="historico" className={styles.subtopico}>
                <h3>Histórico dos disparos</h3>
                <p>Em <Link href="/disparos-whatsapp">Disparos</Link>, cada campanha aparece em um card com os totais. Você pode pesquisar pelo nome, template e integração e abrir o relatório detalhado para conferir os destinatários e os resultados.</p>
              </div>

              <div id="status" className={styles.subtopico}>
                <h3>Diferença entre aceito, enviado e entregue</h3>
                <p><strong>Aceito pela API:</strong> a Meta recebeu a solicitação, mas o resultado final ainda pode estar pendente. <strong>Enviado:</strong> o WhatsApp confirmou o evento de envio. <strong>Entregue/lido:</strong> eventos posteriores, quando retornados pela Meta. <strong>Falha:</strong> o envio foi recusado ou retornou erro.</p>
                <p>Enquanto a campanha está processando, parte dos resultados pode aparecer como pendente. Os contadores são atualizados conforme as confirmações chegam.</p>
              </div>

              <div id="cancelamento" className={styles.subtopico}>
                <h3>Cancelar campanhas ou agendamentos</h3>
                <p>Em campanhas em andamento, utilize a ação de cancelamento disponível para interromper <strong>envios ainda não processados</strong>. Mensagens já aceitas ou enviadas não podem ser recolhidas do WhatsApp.</p>
                <p>Para campanhas futuras, abra <Link href="/disparos-agendados">Disparos agendados</Link>. É possível cancelar um disparo pendente ou os itens pendentes de uma campanha agrupada; a ação não desfaz mensagens já executadas.</p>
              </div>

              <div id="relatorios" className={styles.subtopico}>
                <h3><FileSpreadsheet size={21} /> Relatórios</h3>
                <p>Selecione uma campanha para analisar os destinatários, o status de cada envio e as ocorrências. Use <strong>Gerar relatório Excel</strong> para exportar dados da campanha. Quando houver duas ou mais campanhas, o módulo oferece também um relatório acumulado.</p>
              </div>
            </section>

            <section id="problemas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Soluções</span>
              <h2>Falhas comuns e como agir</h2>
              <p>O relatório mostra códigos e descrições de falhas. Clique em <strong>Saber mais</strong> no próprio CRM para verificar o significado, a ação sugerida e se a falha deixou aquele contato em pausa ou revisão.</p>
              <div id="falhas" className={styles.tabelaFalhas}>
                <div><strong>Falha 131042 — pagamento</strong><p>Indica problema de cobrança ou elegibilidade financeira. Confira a configuração da conta na Meta. Esse código, isoladamente, não coloca o contato em pausa ou revisão.</p></div>
                <div><strong>Falha 131026 — destinatário</strong><p>O CRM marca o telefone para revisão e aplica uma pausa temporária de 24 horas. Confira o número e os dados do contato antes de novas tentativas.</p></div>
                <div><strong>Falha 131049 — limite de marketing</strong><p>A Meta pode limitar a entrega de mensagens de marketing ao destinatário. Respeite a pausa indicada e não repita o envio imediatamente.</p></div>
                <div><strong>Falhas em massa ou pausas operacionais</strong><p>Uma campanha pode ser pausada para proteger o número após problemas recorrentes. Verifique o motivo exibido e corrija a causa antes de criar outra campanha.</p></div>
              </div>
              <div className={styles.nota}><AlertTriangle size={19} /><p>Uma campanha com alguns envios bem-sucedidos e outras falhas não significa que todos os contatos falharam. Consulte os detalhes por destinatário antes de qualquer reenvio.</p></div>

              <h3 id="duvidas">Perguntas frequentes</h3>
              <div className={styles.faq}>
                <details><summary>Posso enviar qualquer texto para todos os contatos?</summary><p>Não. Disparos em massa utilizam templates aprovados pela Meta, e o conteúdo deve respeitar a categoria aprovada e a autorização dos destinatários.</p></details>
                <details><summary>Agendar garante a capacidade que aparece hoje?</summary><p>Não. A projeção ajuda a planejar, mas a Meta revalida os limites na execução.</p></details>
                <details><summary>O disparo foi aceito, mas não aparece como entregue. Houve erro?</summary><p>Não necessariamente. O aceite da API não equivale à entrega. Aguarde o retorno de status e consulte o histórico da campanha.</p></details>
                <details><summary>O CRM cobra o valor estimado das mensagens?</summary><p>A cobrança pela utilização da plataforma WhatsApp é administrada pela Meta conforme a conta comercial vinculada. O CRM mostra uma estimativa de referência.</p></details>
                <details><summary>Contatos reserva recebem mensagens mesmo sem falhas?</summary><p>Não. Eles são utilizados para compensar falhas definitivas de destinatários principais, respeitando o limite da campanha.</p></details>
                <details><summary>Posso cancelar mensagens já enviadas?</summary><p>Não. O cancelamento atinge apenas itens ainda pendentes de processamento.</p></details>
              </div>
            </section>

            <section className={styles.videoArtigo} aria-label="Vídeo tutorial de Disparos">
              <div><span className={styles.artigoEtiqueta}>Aprenda na prática</span><h2>Vídeo demonstrativo</h2><p>O tutorial em vídeo será disponibilizado nesta seção. Enquanto isso, utilize o passo a passo acima e o guia lateral dentro do módulo.</p></div>
              <span className={styles.videoEmBreve}>Vídeo em preparação</span>
            </section>

            <div className={styles.artigoFim}>
              <Link href="/central-de-conhecimento"><ArrowLeft size={17} /> Voltar à Central</Link>
              <Link href="/disparos-whatsapp">Ir para Disparos <ArrowRight size={17} /></Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
