import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileCheck2,
  Image as ImageIcon,
  Info,
  Link2,
  ListChecks,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Header from "@/components/Header";
import VideoTutoriais from "@/components/VideoTutoriais";
import { obterVideosDoModulo } from "@/lib/central-de-conhecimento/videos";
import styles from "../central-de-conhecimento.module.css";

const indice = [
  { id: "preparacao", titulo: "O que é um template?" },
  { id: "imagem-e-cabecalho", titulo: "1. Imagem e cabeçalho" },
  { id: "conteudo-e-botoes", titulo: "2. Corpo, rodapé e botões" },
  { id: "integracao-e-categoria", titulo: "3. Integração, nome e categoria" },
  { id: "aprovacao", titulo: "Enviar para análise" },
  { id: "status", titulo: "Status e sincronização" },
  { id: "duvidas", titulo: "Dúvidas frequentes" },
  { id: "videos", titulo: "Vídeos tutoriais" },
];

export default function DocumentacaoTemplatesPage() {
  return (
    <>
      <Header title="Central de Conhecimento" subtitle="Documentação completa para utilizar o CRM Prosperity." />
      <main className={styles.pagina}>
        <nav className={styles.caminho} aria-label="Navegação da documentação">
          <Link href="/central-de-conhecimento"><ArrowLeft size={16} /> Central de Conhecimento</Link>
          <span>/</span>
          <span>Templates WhatsApp</span>
        </nav>

        <header className={styles.artigoHero}>
          <span className={styles.sobretitulo}><BookOpen size={16} /> Guia completo · WhatsApp</span>
          <h1>Templates WhatsApp</h1>
          <p>Aprenda a criar modelos de mensagem, incluir imagens, personalizar variáveis, configurar botões, escolher a categoria e acompanhar a aprovação da Meta.</p>
          <div className={styles.artigoAcoes}>
            <Link href="/templates-whatsapp" className={styles.acaoPrincipal}>
              Abrir Templates <ArrowRight size={17} />
            </Link>
            <Link href="/disparos-whatsapp" className={styles.acaoSecundaria}>Ir para Disparos</Link>
          </div>
        </header>

        <div className={styles.layoutArtigo}>
          <aside className={styles.indice} aria-label="Índice desta documentação">
            <strong>Neste artigo</strong>
            <nav>{indice.map((item) => <a key={item.id} href={`#${item.id}`}>{item.titulo}</a>)}</nav>
            <div className={styles.indiceAjuda}>
              <FileCheck2 size={19} aria-hidden="true" />
              <span>O guia lateral de Templates resume cada campo enquanto você cria o modelo.</span>
            </div>
          </aside>

          <article className={styles.artigo}>
            <section id="preparacao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Conceito e preparação</span>
              <h2>O que é um template WhatsApp?</h2>
              <p>Um <strong>template</strong> é um modelo de mensagem que precisa passar pela análise da Meta antes de ser usado em disparos ou em outras situações que exigem mensagem pré-aprovada. Ele pode conter texto, variáveis, cabeçalho, imagem, rodapé e botões.</p>
              <p>Você cria o modelo no CRM Prosperity e o envia para a Meta. Depois, acompanha seu status no próprio módulo. <strong>Criar não significa que o template já está aprovado.</strong></p>
              <div className={styles.fluxoResumo}>
                <span>Preparar conteúdo</span><ArrowRight size={17} />
                <span>Enviar à Meta</span><ArrowRight size={17} />
                <span>Aguardar análise</span><ArrowRight size={17} />
                <span>Usar se aprovado</span>
              </div>
              <div className={styles.subtopico}>
                <h3><ShieldCheck size={21} /> O que é necessário?</h3>
                <p>Tenha um <strong>número oficial do WhatsApp conectado</strong> ao CRM e permissão para criar templates. A criação é feita em <Link href="/templates-whatsapp">Templates WhatsApp</Link>, pelo botão <strong>Criar template</strong>.</p>
                <p>Antes de escrever, defina se a mensagem é operacional ou promocional. Envie conteúdo verdadeiro e compatível com sua finalidade, sem tentar alterar a categoria usando links, variáveis ou outros artifícios.</p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>Se o número ainda não estiver conectado, conclua a integração em <strong>Configurar Ambiente</strong> antes de criar o modelo. Um template disponível em uma conta WhatsApp Business não é automaticamente compartilhado com outra conta.</p>
              </div>
            </section>

            <section id="imagem-e-cabecalho" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 1 de 3</span>
              <h2>Imagem e cabeçalho</h2>
              <p>Defina a apresentação inicial da mensagem. Imagem e cabeçalho são opcionais; o corpo da mensagem será configurado na etapa seguinte.</p>
              <div id="imagem" className={styles.subtopico}>
                <h3><ImageIcon size={21} /> Adicionar imagem</h3>
                <p>Ative o interruptor <strong>Adicionar imagem</strong> para incluir uma mídia no template. Selecione um arquivo <strong>JPG, JPEG ou PNG de até 5 MB</strong>. O CRM mostra a prévia e permite trocar ou remover a imagem antes de enviar para análise.</p>
                <p>Ao ativar a opção, é obrigatório selecionar um arquivo. O CRM prepara a imagem para o envio à Meta. Se a imagem não for necessária, deixe o interruptor desativado.</p>
                <p>Modelos com imagem podem ser classificados como Marketing dependendo do conteúdo; a categoria final depende da análise da Meta. A presença de imagem não garante aprovação nem define sozinha a categoria.</p>
              </div>
              <div id="cabecalho" className={styles.subtopico}>
                <h3>Cabeçalho de texto</h3>
                <p>Você pode adicionar um título curto com até <strong>60 caracteres</strong>, por exemplo, <strong>Confirmação de atendimento</strong>.</p>
                <p>Se não houver imagem, o texto pode ser usado como cabeçalho. Quando a imagem está ativada, o CRM apresenta essa frase como título visual abaixo da mídia e a incorpora ao início do corpo. Nesse caso, também é preciso respeitar o limite do texto final.</p>
              </div>
              <div className={styles.nota}>
                <Info size={19} aria-hidden="true" />
                <p>A prévia à esquerda do assistente mostra como a composição da mensagem ficará no WhatsApp. Confira o resultado antes de avançar.</p>
              </div>
            </section>

            <section id="conteudo-e-botoes" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 2 de 3</span>
              <h2>Corpo, variáveis, rodapé e botões</h2>
              <div id="corpo" className={styles.subtopico}>
                <h3><MessageSquareText size={21} /> Corpo da mensagem</h3>
                <p>Escreva a mensagem principal que será enviada ao contato. Este campo é <strong>obrigatório</strong>. O CRM valida o tamanho do texto final, que deve ter até <strong>1.024 caracteres</strong>, incluindo o título incorporado abaixo de uma imagem, quando houver.</p>
                <p>Prefira mensagens claras, específicas e coerentes com a categoria escolhida. Evite informações ambíguas, promessas enganosas e conteúdo incompatível com as políticas da Meta.</p>
              </div>
              <div id="variaveis" className={styles.subtopico}>
                <h3>Variáveis e exemplos</h3>
                <p>Variáveis são espaços reservados para informações que podem mudar de destinatário para destinatário. Use o botão <strong>+ Variável</strong> para adicionar até <strong>6 variáveis</strong> ao corpo, na sequência <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> e assim por diante.</p>
                <p>Por exemplo: <strong>Olá {"{{1}}"}, seu protocolo é {"{{2}}"}.</strong> Os valores poderão ser preenchidos posteriormente no envio, conforme as opções oferecidas pelo CRM.</p>
                <p>Informe um <strong>exemplo para cada variável</strong> usada, como <em>João</em> para o nome e <em>ABC-123456</em> para o protocolo. A Meta utiliza esses exemplos durante a análise; sem eles, o CRM impede que você prossiga.</p>
              </div>
              <div id="rodape" className={styles.subtopico}>
                <h3>Rodapé automático</h3>
                <p>O rodapé é preenchido pelo sistema com uma orientação para o contato deixar de receber mensagens (<strong>opt-out</strong>). Esse campo aparece bloqueado no assistente e não pode ser editado manualmente.</p>
                <p>O rodapé faz parte das medidas de respeito às preferências do destinatário, mas não substitui a necessidade de autorização adequada para comunicações de marketing.</p>
              </div>
              <div id="botoes" className={styles.subtopico}>
                <h3><ListChecks size={21} /> Botões de resposta e links</h3>
                <p>Os botões são opcionais. O assistente permite adicionar <strong>até 3 botões no total</strong>, sendo no máximo <strong>2 do tipo Redirect</strong>. O texto de cada botão pode ter até <strong>25 caracteres</strong>.</p>
                <p><strong>Texto — resposta rápida:</strong> o usuário toca em uma opção, como <em>Quero saber mais</em>, e a resposta é enviada na conversa. <strong>Redirect:</strong> abre um site externo, como <em>Acessar catálogo</em>.</p>
                <p>Botões Redirect devem usar uma URL válida iniciada por <code>https://</code> ou <code>http://</code>. O CRM não aceita variáveis na URL nem links diretos para WhatsApp, como <code>wa.me</code> e <code>api.whatsapp.com</code>. Para receber a resposta no WhatsApp, use um botão de resposta rápida.</p>
                <p>O CRM organiza os botões em grupos compatíveis com a Meta antes de solicitar a aprovação.</p>
              </div>
            </section>

            <section id="integracao-e-categoria" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 3 de 3</span>
              <h2>Integração, nome e categoria</h2>
              <div id="numero" className={styles.subtopico}>
                <h3>Número WhatsApp</h3>
                <p>Selecione a <strong>integração</strong> em que deseja cadastrar o template. Se a empresa usa vários números, confira a conexão escolhida. Templates pertencem à conta WhatsApp Business associada ao número, e contas distintas não compartilham necessariamente os mesmos modelos.</p>
              </div>
              <div id="nome" className={styles.subtopico}>
                <h3>Nome do template</h3>
                <p>Dê um identificador interno ao modelo, por exemplo, <code>confirmacao_agendamento</code>. O campo é obrigatório e os espaços digitados são convertidos automaticamente em <strong>sublinhados (_)</strong>.</p>
                <p>Utilize um nome que facilite identificar o assunto do template na lista e posteriormente durante a criação de disparos.</p>
              </div>
              <div id="categoria" className={styles.subtopico}>
                <h3>Categoria: Utilidade ou Marketing</h3>
                <p><strong>Utilidade (Utility):</strong> mensagens operacionais, transacionais e de serviço, relacionadas a uma ação ou necessidade do cliente. Exemplos: atualizações de pedido e confirmação de atendimento.</p>
                <p><strong>Marketing:</strong> ofertas, promoções, campanhas de divulgação, recuperação de clientes e outras comunicações comerciais.</p>
                <p>O CRM permite selecionar essas duas categorias na criação. A Meta analisa o conteúdo e pode aprovar, rejeitar ou <strong>reclassificar</strong> o modelo. A categoria também pode influenciar a cobrança quando a mensagem é enviada.</p>
                <Link href="/central-de-conhecimento/disparos#cobranca" className={styles.linkInterno}>Entender cobrança dos disparos <ArrowRight size={16} /></Link>
              </div>
            </section>

            <section id="aprovacao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Conclusão</span>
              <h2>Enviar o template para análise</h2>
              <p>Após revisar a mensagem, a mídia, os exemplos das variáveis, os botões, a integração, o nome e a categoria, clique em <strong>Criar template</strong>.</p>
              <p>O CRM valida o preenchimento e envia a solicitação à Meta. Caso exista um problema — por exemplo, imagem inválida, texto fora do limite, variável sem exemplo ou botão com link incorreto — o formulário apresenta uma mensagem para correção.</p>
              <p>O registro do template é salvo e seu status pode permanecer pendente até a análise. A Meta determina o resultado e o prazo da revisão.</p>
              <div className={styles.nota}><AlertTriangle size={19} /><p><strong>Não use o template em disparos enquanto estiver pendente.</strong> Apenas modelos aprovados ficam disponíveis para seleção nas campanhas.</p></div>
            </section>

            <section id="status" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Acompanhamento</span>
              <h2>Consultar status e sincronizar</h2>
              <p>A tela <Link href="/templates-whatsapp">Templates WhatsApp</Link> mostra os templates cadastrados, com nome, categoria, conteúdo, botões e informações de status. Utilize os cards de resumo para filtrar:</p>
              <div className={styles.tabelaFalhas}>
                <div><strong><CheckCircle2 size={16} /> Aprovados</strong><p>Modelos liberados pela Meta e elegíveis para uso em disparos, respeitando as condições da integração.</p></div>
                <div><strong>Pendentes</strong><p>Templates enviados para análise; a aprovação ainda não foi confirmada.</p></div>
                <div><strong>Rejeitados</strong><p>Modelos recusados ou com erro de envio. Verifique o motivo apresentado, corrija o conteúdo e crie um modelo adequado, se necessário.</p></div>
                <div><strong>Total</strong><p>Visão de todos os registros, independentemente do status.</p></div>
              </div>
              <div className={styles.subtopico}>
                <h3><RefreshCw size={21} /> Atualizar lista x Sincronizar com a Meta</h3>
                <p><strong>Atualizar lista</strong> consulta novamente os registros disponíveis no CRM. Já <strong>Sincronizar com a Meta</strong> consulta os modelos da conta oficial e atualiza os registros locais conforme o retorno da plataforma.</p>
                <p>Se você utiliza mais de uma integração, escolha a conta no filtro antes de sincronizar. Para comparar diretamente com o Gerenciador da Meta, use o botão <strong>Ver templates na Meta</strong>.</p>
                <a className={styles.linkInterno} href="https://business.facebook.com/latest/whatsapp_manager/message_templates" target="_blank" rel="noopener noreferrer">
                  <Link2 size={16} /> Abrir Gerenciador de Templates da Meta
                </a>
              </div>
              <div className={styles.subtopico}>
                <h3>Prévia e histórico da lista</h3>
                <p>Cada registro inclui uma prévia no estilo WhatsApp, categoria, status, conteúdo e outros detalhes disponíveis. Você pode selecionar a integração, navegar pelas páginas e localizar o modelo que será usado em uma campanha.</p>
                <p>Se o modelo estiver aprovado, abra <Link href="/disparos-whatsapp">Disparos</Link>, selecione o número correspondente e escolha o template.</p>
              </div>
            </section>

            <section id="duvidas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Resolução de dúvidas</span>
              <h2>Perguntas frequentes</h2>
              <div className={styles.faq}>
                <details><summary>O template aparece como Pendente. Posso realizar disparos?</summary><p>Não. Aguarde a aprovação da Meta e sincronize a lista se o status não tiver sido atualizado.</p></details>
                <details><summary>Posso usar o mesmo template em todos os números?</summary><p>Depende da conta WhatsApp Business associada. Números pertencentes a contas diferentes não compartilham automaticamente os templates cadastrados.</p></details>
                <details><summary>Por que não consigo avançar com as variáveis?</summary><p>O CRM exige que as variáveis estejam em sequência, no máximo seis, e com um exemplo preenchido para cada posição utilizada.</p></details>
                <details><summary>Por que o rodapé está bloqueado?</summary><p>Ele é preenchido automaticamente para oferecer uma orientação de opt-out ao destinatário. Não é necessário editá-lo.</p></details>
                <details><summary>Posso adicionar um botão para abrir outra conversa no WhatsApp?</summary><p>O assistente não permite links diretos para WhatsApp em botões Redirect. Para obter uma resposta na conversa, adicione um botão Texto (resposta rápida).</p></details>
                <details><summary>O template foi rejeitado. O que faço?</summary><p>Confira o motivo e a categoria no CRM ou na Meta. Ajuste o conteúdo e faça uma nova solicitação adequada às regras da plataforma.</p></details>
                <details><summary>O que fazer quando não encontro um template aprovado?</summary><p>Confirme se a integração é a correta e utilize Sincronizar com a Meta para atualizar os modelos dessa conta.</p></details>
              </div>
            </section>

            <section id="videos" className={styles.videoArtigo} aria-label="Tutoriais em vídeo">
              <div>
                <span className={styles.artigoEtiqueta}>Aprenda na prática</span>
                <h2>Vídeos de Templates</h2>
                <p>Os tutoriais de Templates serão publicados nesta área, incluindo criação, variáveis e aprovação de modelos.</p>
              </div>
              <VideoTutoriais videos={obterVideosDoModulo("templates")} tituloPendente="Como criar um template" />
            </section>

            <div className={styles.artigoFim}>
              <Link href="/central-de-conhecimento"><ArrowLeft size={17} /> Voltar à Central</Link>
              <Link href="/templates-whatsapp">Ir para Templates <ArrowRight size={17} /></Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
