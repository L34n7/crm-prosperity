import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Camera,
  CheckCircle2, CreditCard, Info, MessageCircle, RefreshCw, ShieldCheck, Smartphone,
} from "lucide-react";
import Header from "@/components/Header";
import VideoTutoriais from "@/components/VideoTutoriais";
import { obterVideosDoModulo } from "@/lib/central-de-conhecimento/videos";
import styles from "../central-de-conhecimento.module.css";

const indice = [
  { id: "conexao", titulo: "Preparar a conexão" },
  { id: "selecao", titulo: "1. Escolher o número" },
  { id: "perfil", titulo: "2. Editar informações comerciais" },
  { id: "salvar", titulo: "3. Salvar e acompanhar" },
  { id: "adicionar", titulo: "4. Gerenciar integrações" },
  { id: "duvidas", titulo: "Perguntas frequentes" },
  { id: "videos", titulo: "Vídeos tutoriais" },
];

export default function DocumentacaoPerfilWhatsappPage() {
  return (
    <>
      <Header title="Central de Conhecimento" subtitle="Documentação completa para utilizar o CRM Prosperity." />
      <main className={styles.pagina}>
        <nav aria-label="Navegação da documentação" className={styles.caminho}>
          <Link href="/central-de-conhecimento"><ArrowLeft size={16} /> Central de Conhecimento</Link>
          <span>/</span><span>Perfil WhatsApp</span>
        </nav>

        <header className={styles.artigoHero}>
          <span className={styles.sobretitulo}><BookOpen size={16} /> Guia completo · WhatsApp Business</span>
          <h1>Perfil WhatsApp</h1>
          <p>Veja como escolher um número conectado, editar os dados comerciais do perfil, acompanhar indicadores da Meta e gerenciar integrações de forma segura.</p>
          <div className={styles.artigoAcoes}>
            <Link className={styles.acaoPrincipal} href="/perfil-whatsapp">Abrir Perfil WhatsApp <ArrowRight size={17} /></Link>
            <Link className={styles.acaoSecundaria} href="/central-de-conhecimento/templates">Conhecer Templates</Link>
          </div>
        </header>

        <div className={styles.layoutArtigo}>
          <aside className={styles.indice} aria-label="Índice do perfil WhatsApp">
            <strong>Neste artigo</strong>
            <nav>{indice.map((item) => <a key={item.id} href={`#${item.id}`}>{item.titulo}</a>)}</nav>
            <div className={styles.indiceAjuda}>
              <MessageCircle size={19} aria-hidden="true" />
              <span>O guia lateral do Perfil WhatsApp traz explicações rápidas para cada recurso.</span>
            </div>
          </aside>

          <article className={styles.artigo}>
            <section id="conexao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Antes de editar</span>
              <h2><Smartphone size={22} /> Conecte o WhatsApp ao CRM</h2>
              <p>O módulo <Link href="/perfil-whatsapp">Perfil WhatsApp</Link> apresenta as informações comerciais vinculadas às integrações oficiais da empresa. Para consultar e editar esses dados, primeiro é necessário conectar o número e concluir a configuração da conta na Meta.</p>
              <p>Se a conexão estiver incompleta, o CRM exibirá uma orientação para concluir o onboarding. Sem um número conectado, não há perfil para carregar.</p>
              <div className={styles.fluxoResumo}>
                <span>Conectar número</span><ArrowRight size={17} />
                <span>Selecionar perfil</span><ArrowRight size={17} />
                <span>Editar dados</span><ArrowRight size={17} />
                <span>Salvar</span>
              </div>
              <div className={styles.nota}>
                <Info size={19} />
                <p>O tipo de conexão define onde os dados podem ser alterados. Em modo de coexistência, vários campos ficam indisponíveis no CRM. Veja a diferença abaixo.</p>
              </div>
            </section>

            <section id="selecao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 1</span>
              <h2>Selecionar a integração e consultar o número</h2>
              <p>Quando a empresa possui mais de uma integração WhatsApp, a tela exibe a lista de números e permite alternar entre os perfis. Confira o nome da conexão e o telefone para não editar o número incorreto.</p>
              <p>Após selecionar uma integração, o CRM consulta os dados relacionados a ela e atualiza a prévia do perfil comercial.</p>
              <div id="indicadores" className={styles.subtopico}>
                <h3>Limites, qualidade e informações da conexão</h3>
                <p>Quando a Meta fornece os dados, um card apresenta <strong>limite, quantidade utilizada e saldo restante</strong>. Esses indicadores ajudam a acompanhar a capacidade informada para o número, mas não substituem a validação de capacidade realizada no módulo de Disparos no momento de cada campanha.</p>
                <p>A tela também pode exibir <strong>nome verificado, administrador responsável, qualidade do número e data de início da integração</strong>. Caso um dado não esteja disponível, o CRM apresenta a indicação correspondente.</p>
                <Link href="/central-de-conhecimento/disparos#capacidade" className={styles.linkInterno}>Entender capacidade para disparos <ArrowRight size={16} /></Link>
              </div>
              <div id="coexistencia" className={styles.subtopico}>
                <h3><Smartphone size={21} /> Perfil em coexistência</h3>
                <p>Uma integração em <strong>coexistência</strong> utiliza o WhatsApp Business App junto da plataforma. Nesse modo, os dados comerciais são gerenciados no aplicativo WhatsApp Business ou na Meta, e o CRM bloqueia a edição desses campos.</p>
                <p>Para esses números, você pode alterar normalmente o <strong>Nome da integração</strong>, que serve apenas à identificação interna no CRM. Para foto, nome de exibição, descrição e outras informações do perfil, utilize o aplicativo ou a ação <strong>Ajustar no Meta</strong>, conforme disponível.</p>
                <p>Se o campo estiver desabilitado, verifique primeiro o modo da conexão; isso não significa necessariamente que houve uma falha.</p>
              </div>
              <div className={styles.nota}><ShieldCheck size={19} /><p>Os números conectados pela Cloud API e os números em coexistência podem ter permissões e fluxos de atualização diferentes. O CRM respeita essas restrições para evitar alterações incompatíveis.</p></div>
            </section>

            <section id="perfil" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 2</span>
              <h2>Editar as informações comerciais</h2>
              <p>O formulário permite ajustar os dados que o cliente encontra no perfil comercial. Veja a prévia à esquerda da tela para conferir a apresentação antes de salvar.</p>

              <div id="foto" className={styles.subtopico}>
                <h3><Camera size={21} /> Foto do perfil</h3>
                <p>Na área <strong>Alterar foto</strong>, escolha uma imagem <strong>JPG ou PNG de até 5 MB</strong>. O CRM oferece uma etapa de ajuste de corte; confirme o enquadramento antes de salvar as alterações.</p>
                <p>Prefira uma imagem nítida e facilmente reconhecível, como o logotipo da empresa. Caso a integração esteja em coexistência, a foto deverá ser atualizada pelo aplicativo ou por meio da Meta.</p>
              </div>

              <div id="nome-exibicao" className={styles.subtopico}>
                <h3>Nome de exibição</h3>
                <p>O <strong>Nome de exibição</strong> é o nome comercial que pode aparecer no WhatsApp. Ele é diferente do identificador interno da conexão.</p>
                <p>Para solicitar uma mudança, clique em <strong>Alterar nome</strong>, informe o novo nome no modal e selecione <strong>Solicitar alteração</strong>. A Meta pode analisar o pedido antes de aplicar a modificação; o envio da solicitação não garante aprovação imediata.</p>
                <p>Utilize um nome que represente claramente sua empresa. Evite slogans, emojis, nomes genéricos e termos como <em>Oficial</em> ou <em>Verificado</em> quando não fizerem parte do nome empresarial aprovado.</p>
              </div>

              <div id="nome-integracao" className={styles.subtopico}>
                <h3>Nome da integração</h3>
                <p>Esse campo é a identificação interna do número, útil quando a empresa possui vários WhatsApps, como <strong>WhatsApp Comercial</strong> ou <strong>WhatsApp Suporte</strong>.</p>
                <p>O nome deve ter entre <strong>3 e 80 caracteres</strong>. A alteração é salva no CRM e não equivale a alterar o nome de exibição aprovado pela Meta. O campo continua editável mesmo quando o perfil está conectado em coexistência.</p>
              </div>

              <div id="dados" className={styles.subtopico}>
                <h3>Categoria, descrição e informações de contato</h3>
                <p>Atualize os campos disponíveis do formulário para apresentar sua empresa com clareza:</p>
                <div className={styles.tabelaFalhas}>
                  <div><strong>Categoria</strong><p>Escolha o segmento comercial correspondente à atividade da empresa.</p></div>
                  <div><strong>Descrição</strong><p>Resuma o que a empresa faz. O campo aceita até 256 caracteres.</p></div>
                  <div><strong>Endereço</strong><p>Informe um endereço comercial apropriado para o atendimento.</p></div>
                  <div><strong>E-mail</strong><p>Use um contato profissional para comunicação com clientes.</p></div>
                  <div><strong>Site principal</strong><p>Cadastre o endereço oficial da empresa, se houver.</p></div>
                  <div><strong>Site secundário</strong><p>Inclua outro endereço relevante, como uma página externa ou perfil social.</p></div>
                </div>
                <p>Os campos de site devem conter URLs completas, iniciadas por <code>https://</code> ou <code>http://</code>. Campos indisponíveis podem indicar restrições da integração ou pendências de configuração.</p>
              </div>
            </section>

            <section id="salvar" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 3</span>
              <h2>Salvar e acompanhar o resultado</h2>
              <div className={styles.subtopico}>
                <h3><CheckCircle2 size={21} /> Salvar alterações</h3>
                <p>Confira a prévia do perfil e clique em <strong>Salvar alterações</strong>. O botão é habilitado quando há mudanças válidas e a integração permite o salvamento. O CRM apresenta uma confirmação de sucesso ou um erro com orientação para corrigir os dados.</p>
                <p>Alterar o <strong>Nome de exibição</strong> segue uma solicitação separada, pois depende da análise da Meta. Já o <strong>Nome da integração</strong> é atualizado internamente no CRM.</p>
              </div>
              <div id="diagnosticos" className={styles.subtopico}>
                <h3>Diagnósticos e avisos da Meta</h3>
                <p>Se o CRM identificar um problema de configuração ou atualização do perfil, ele pode exibir um aviso com a descrição do problema, a ação recomendada e, quando disponível, um código de retorno da Meta.</p>
                <p>Siga a orientação apresentada na tela antes de repetir tentativas. Em caso de onboarding incompleto, conclua primeiro a configuração do número. Para orientações em vídeo sobre integração desconectada, consulte a seção <a href="#videos">Vídeos tutoriais</a>.</p>
              </div>
              <div id="meta" className={styles.subtopico}>
                <h3><RefreshCw size={21} /> Atualizar a prévia e ajustar na Meta</h3>
                <p>Use a ação de atualização na área de prévia para recarregar as informações do número. Se a alteração precisar ser feita fora do CRM, clique em <strong>Ajustar no Meta</strong> para acessar o gerenciador oficial do WhatsApp Business.</p>
                <a
                  href="https://business.facebook.com/latest/whatsapp_manager/phone_numbers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkInterno}
                >
                  Abrir números no Gerenciador da Meta <ArrowRight size={16} />
                </a>
              </div>
            </section>

            <section id="adicionar" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 4</span>
              <h2><CreditCard size={22} /> Gerenciar números e integrações</h2>
              <div className={styles.subtopico}>
                <h3>Adicionar outro número WhatsApp</h3>
                <p>O botão para cadastrar uma nova integração aparece conforme os <strong>limites do plano</strong> e as condições de acesso da empresa. Ao utilizá-lo, o CRM inicia o fluxo apropriado para conectar outro número.</p>
                <p>Se o plano não permitir conexões adicionais, o sistema poderá apresentar uma alternativa de ampliação ou um aviso de limite atingido.</p>
              </div>
              <div id="cancelamento" className={styles.subtopico}>
                <h3>Cancelamento agendado</h3>
                <p>Quando houver um cancelamento de integração programado para o fim do período contratado, o CRM exibe o nome do número, a data prevista e orientações sobre o encerramento.</p>
                <p>Conforme o estado do pagamento e as regras de segurança, pode existir a ação <strong>Desfazer cancelamento</strong>. Em algumas situações, o botão fica temporariamente indisponível ou bloqueado após a confirmação do pagamento.</p>
              </div>
              <div id="desconectar" className={styles.subtopico}>
                <h3><AlertTriangle size={21} /> Desconectar integração</h3>
                <p>Use <strong>Desconectar integração</strong> somente quando realmente desejar interromper a operação do número dentro do CRM. Se houver várias conexões, selecione explicitamente qual delas será removida.</p>
                <p>Antes de confirmar, o CRM apresenta um modal com os efeitos previstos. Entre eles estão a interrupção de novos envios e recebimentos, o cancelamento de itens pendentes associados à integração e a limpeza dos dados operacionais específicos dela.</p>
                <p>O processo <strong>preserva conversas, contatos, rastreamentos e logs existentes</strong>. O número e a conta WhatsApp Business continuam pertencendo à Meta; a desconexão é da integração com o CRM. O sistema registra o estado para backup e executa parte da limpeza em segundo plano.</p>
                <p>Em uma conexão por <strong>coexistência</strong>, primeiro desconecte a plataforma no aplicativo WhatsApp Business, em <strong>Configurações → Conta → Plataforma de negócios</strong>. Depois marque a confirmação no modal do CRM e conclua a desconexão.</p>
                <div className={styles.nota}>
                  <AlertTriangle size={19} />
                  <p>Desconectar o número é diferente de alterar o perfil comercial. A operação interrompe funcionalidades ativas dessa integração. Revise a seleção do número e os efeitos mostrados antes de prosseguir.</p>
                </div>
              </div>
            </section>

            <section id="duvidas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Ajuda rápida</span>
              <h2>Perguntas frequentes</h2>
              <div className={styles.faq}>
                <details><summary>Por que não consigo editar alguns campos?</summary><p>Confira se o número está conectado em modo coexistência ou se a configuração com a Meta ainda não foi concluída. Nesses casos, alguns campos ficam indisponíveis no CRM.</p></details>
                <details><summary>Alterar o nome da integração modifica o nome visto pelo cliente?</summary><p>Não. O Nome da integração é interno ao CRM. O Nome de exibição é um dado comercial que pode depender de aprovação da Meta.</p></details>
                <details><summary>Solicitei outro nome de exibição. Por que ele ainda não aparece?</summary><p>O pedido pode estar em análise pela Meta. A solicitação não é uma alteração imediata; acompanhe o retorno da plataforma.</p></details>
                <details><summary>Qual imagem posso usar na foto?</summary><p>O formulário aceita JPG ou PNG de até 5 MB e permite ajustar o corte antes de salvar.</p></details>
                <details><summary>Por que o botão Salvar alterações está desativado?</summary><p>Ele pode permanecer indisponível quando não há alterações, a conexão está carregando, existe uma restrição da integração ou um campo não pode ser editado nesse modo de conexão.</p></details>
                <details><summary>Como verificar a qualidade e os limites do número?</summary><p>Selecione a integração e consulte o card de indicadores. Para planejar uma campanha, confirme também a capacidade atual no assistente de Disparos.</p></details>
                <details><summary>Ao desconectar, meus contatos e conversas serão apagados?</summary><p>O fluxo de desconexão do CRM preserva os registros históricos de contatos e conversas; interrompe, porém, a operação ativa da integração selecionada e limpa itens operacionais dependentes dela.</p></details>
              </div>
            </section>

            <section id="videos" className={styles.videoArtigo} aria-label="Tutoriais em vídeo">
              <div>
                <span className={styles.artigoEtiqueta}>Aprenda na prática</span>
                <h2>Vídeos de Perfil WhatsApp</h2>
                <p>Consulte vídeos sobre problemas comuns de integração e orientações do Perfil WhatsApp. A biblioteca aceita novos tutoriais conforme forem produzidos.</p>
              </div>
              <VideoTutoriais videos={obterVideosDoModulo("perfil-whatsapp")} tituloPendente="Como configurar o Perfil WhatsApp" />
            </section>

            <div className={styles.artigoFim}>
              <Link href="/central-de-conhecimento"><ArrowLeft size={17} /> Voltar à Central</Link>
              <Link href="/perfil-whatsapp">Ir para Perfil WhatsApp <ArrowRight size={17} /></Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
