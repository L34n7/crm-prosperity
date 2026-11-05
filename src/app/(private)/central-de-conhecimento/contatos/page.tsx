import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2,
  ContactRound, FileSpreadsheet, Filter, Info, ListChecks, Search, ShieldCheck, Upload,
} from "lucide-react";
import Header from "@/components/Header";
import VideoTutoriais from "@/components/VideoTutoriais";
import { obterVideosDoModulo } from "@/lib/central-de-conhecimento/videos";
import styles from "../central-de-conhecimento.module.css";

const indice = [
  { id: "visao-geral", titulo: "Visão geral" },
  { id: "busca-e-filtros", titulo: "1. Buscar e filtrar" },
  { id: "cadastro", titulo: "2. Criar e editar contatos" },
  { id: "importacao", titulo: "3. Importar contatos" },
  { id: "listas", titulo: "4. Organizar em listas" },
  { id: "massa", titulo: "5. Ações em massa e revisão" },
  { id: "exportacao", titulo: "6. Exportar e excluir" },
  { id: "duvidas", titulo: "Perguntas frequentes" },
  { id: "videos", titulo: "Vídeos tutoriais" },
];

export default function DocumentacaoContatosPage() {
  return (
    <>
      <Header title="Central de Conhecimento" subtitle="Documentação completa para utilizar o CRM Prosperity." />
      <main className={styles.pagina}>
        <nav aria-label="Navegação da documentação" className={styles.caminho}>
          <Link href="/central-de-conhecimento"><ArrowLeft size={16} /> Central de Conhecimento</Link>
          <span>/</span><span>Contatos</span>
        </nav>

        <header className={styles.artigoHero}>
          <span className={styles.sobretitulo}><BookOpen size={16} /> Guia completo · Gestão de contatos</span>
          <h1>Contatos</h1>
          <p>Encontre, cadastre, importe, organize e mantenha a base de contatos da sua empresa. Saiba como usar filtros, listas, opt-in, revisão de telefones e operações em massa.</p>
          <div className={styles.artigoAcoes}>
            <Link className={styles.acaoPrincipal} href="/contatos">Abrir Contatos <ArrowRight size={17} /></Link>
            <Link className={styles.acaoSecundaria} href="/disparos-whatsapp">Ir para Disparos</Link>
          </div>
        </header>

        <div className={styles.layoutArtigo}>
          <aside className={styles.indice} aria-label="Índice da documentação de contatos">
            <strong>Neste artigo</strong>
            <nav>{indice.map((item) => <a href={`#${item.id}`} key={item.id}>{item.titulo}</a>)}</nav>
            <div className={styles.indiceAjuda}>
              <ContactRound size={19} aria-hidden="true" />
              <span>Abra a aba Ajuda no módulo Contatos para consultar instruções resumidas.</span>
            </div>
          </aside>

          <article className={styles.artigo}>
            <section id="visao-geral" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Visão geral</span>
              <h2>Para que serve o módulo Contatos?</h2>
              <p>O módulo concentra os cadastros da sua empresa, incluindo dados de identificação, telefone, e-mail, origem, campanha, interesse, observações e informações relacionadas ao atendimento por WhatsApp.</p>
              <p>Você pode cadastrar contatos manualmente, importar planilhas, aplicar filtros, organizar listas e acompanhar indicadores como classificação, status da conversa, autorização de recebimento e números que precisam de revisão.</p>
              <div className={styles.fluxoResumo}>
                <span>Localizar</span><ArrowRight size={17} /><span>Cadastrar ou importar</span>
                <ArrowRight size={17} /><span>Organizar</span><ArrowRight size={17} /><span>Manter</span>
              </div>
              <div className={styles.nota}>
                <Info size={19} />
                <p>O cadastro de um contato não significa que ele autorizou mensagens de marketing. Respeite as preferências de recebimento antes de incluí-lo em campanhas.</p>
              </div>
            </section>

            <section id="busca-e-filtros" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 1</span>
              <h2><Search size={22} /> Buscar e filtrar contatos</h2>
              <div id="integracao" className={styles.subtopico}>
                <h3>Integração WhatsApp</h3>
                <p>O filtro <strong>Integração WhatsApp</strong> permite consultar contatos no contexto de um número conectado. Selecione a integração quando precisar visualizar informações como opt-in, opt-out ou conversas relacionadas àquele WhatsApp.</p>
                <p>Na opção <strong>Todos os contatos</strong>, a lista mostra a base geral. Sem selecionar uma integração, os indicadores específicos de opt-in e opt-out da conexão podem aparecer como um traço (—).</p>
              </div>
              <div id="busca" className={styles.subtopico}>
                <h3>Campo Buscar</h3>
                <p>Localize pessoas por <strong>nome, nome do WhatsApp, telefone ou e-mail</strong>. Digite o termo e clique em <strong>Buscar</strong> para consultar os registros correspondentes.</p>
              </div>
              <div id="filtros" className={styles.subtopico}>
                <h3><Filter size={21} /> Campanha, origem, listas e demais filtros</h3>
                <p>Combine filtros como <strong>Campanha</strong>, <strong>Origem / Lista importação</strong>, <strong>Listas personalizadas</strong>, classificação e status da conversa para encontrar um grupo específico de contatos.</p>
                <p>Em <strong>Mais filtros</strong>, você encontra critérios adicionais, como último atendente, período de mensagens, opt-in, opt-out, telefone para revisar, ordenação e quantidade de itens por página.</p>
                <p>Use <strong>Limpar filtros</strong> para voltar à consulta geral. A seleção de integração também é redefinida ao limpar tudo.</p>
              </div>
              <div className={styles.nota}>
                <Info size={19} /><p>Filtros combinados podem reduzir bastante a lista. Se um contato não aparecer, revise a integração, a origem, as datas e os outros critérios ativos.</p>
              </div>
            </section>

            <section id="cadastro" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 2</span>
              <h2><ContactRound size={22} /> Criar e editar contatos</h2>
              <div id="novo-contato" className={styles.subtopico}>
                <h3>Novo contato</h3>
                <p>Em <Link href="/contatos">Contatos</Link>, clique em <strong>Novo contato</strong>. Preencha o nome e informe <strong>pelo menos um telefone ou e-mail</strong>. Não é obrigatório cadastrar os dois. Quando informar e-mail, use um endereço válido.</p>
                <p>Você também pode preencher <strong>Campo do contato</strong> (informação livre), <strong>Interesse</strong>, <strong>Origem</strong>, <strong>Campanha</strong> e <strong>Observações</strong> para ajudar a segmentar e acompanhar o relacionamento.</p>
                <p>Ao finalizar, clique no botão de criação. O CRM valida o cadastro e apresenta possíveis problemas, como e-mail inválido ou dados insuficientes.</p>
              </div>
              <div id="editar" className={styles.subtopico}>
                <h3>Consultar detalhes e editar</h3>
                <p>Na lista de contatos cadastrados, localize o registro e use <strong>Detalhes</strong> para expandir suas informações. A ação de edição permite corrigir nome, telefone, e-mail, interesse, origem, campanha e observações.</p>
                <p>Atualize dados com atenção, principalmente o telefone usado no WhatsApp. Alterações no cadastro não substituem a verificação de autorização para envios.</p>
              </div>
              <div className={styles.subtopico}>
                <h3>Classificação e status de conversa</h3>
                <p>A tabela exibe a classificação do contato, quando houver, e o estado de sua conversa. Entre as classificações previstas estão <strong>Novo, Qualificado, Convertido</strong> e <strong>Perdido</strong>.</p>
                <p>Os dados de conversa são úteis para acompanhar o atendimento. Utilize os filtros por classificação e status para localizar grupos e analisar sua base.</p>
              </div>
              <div id="consentimento" className={styles.subtopico}>
                <h3><ShieldCheck size={21} /> Opt-in e opt-out</h3>
                <p><strong>Opt-in</strong> registra a autorização do contato para receber comunicações por WhatsApp. <strong>Opt-out</strong> identifica uma preferência de não recebimento, podendo existir restrições gerais ou por categoria de mensagem.</p>
                <p>Escolha uma integração para consultar esses indicadores no contexto do número. Contatos sem opt-in registrado não devem ser tratados automaticamente como autorizados. Pedidos de descadastramento precisam ser respeitados.</p>
                <Link className={styles.linkInterno} href="/central-de-conhecimento/disparos#autorizacoes">Entender autorização e listas frias <ArrowRight size={16} /></Link>
              </div>
            </section>

            <section id="importacao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Etapa 3</span>
              <h2><Upload size={22} /> Importar contatos</h2>
              <p>O assistente de importação foi criado para revisar planilhas antes que seus dados entrem na base.</p>
              <div className={styles.subtopico}>
                <h3>1. Selecionar arquivo e nomear a lista</h3>
                <p>Clique em <strong>Importar contatos</strong> e escolha um arquivo <strong>CSV, XLS ou XLSX</strong>. A planilha pode conter telefone, e-mail ou ambos. A importação também reconhece nomes de coluna como <strong>Contato (e-mail)</strong>.</p>
                <p>Informe um <strong>Nome da lista</strong>, que é obrigatório e deve ser diferente do nome de listas de importação já existentes. Se precisar de um exemplo de estrutura, utilize <strong>Baixar modelo Excel</strong>.</p>
              </div>
              <div id="preview" className={styles.subtopico}>
                <h3>2. Analisar a prévia da importação</h3>
                <p>Antes de importar, use a ação de análise do arquivo. O CRM separa os registros em categorias e apresenta contagens para ajudar a identificar problemas: Assista também ao vídeo <a href="#videos">Importar lista de contatos</a>.</p>
                <div className={styles.tabelaFalhas}>
                  <div><strong><CheckCircle2 size={16} /> Válidos</strong><p>Registros identificados como aptos à importação.</p></div>
                  <div><strong>Alertas</strong><p>Dados que merecem atenção antes da confirmação.</p></div>
                  <div><strong>Duplicados no sistema</strong><p>Registros já encontrados na base do CRM.</p></div>
                  <div><strong>Duplicados no arquivo</strong><p>Repetições detectadas na própria planilha.</p></div>
                  <div><strong>Inválidos</strong><p>Linhas que precisam ser corrigidas para serem importadas.</p></div>
                  <div><strong>E-mails recuperáveis</strong><p>E-mails que podem ser adicionados a contatos existentes por correspondência de telefone, sem sobrescrever e-mails já cadastrados.</p></div>
                </div>
              </div>
              <div className={styles.subtopico}>
                <h3>3. Decidir sobre contatos existentes</h3>
                <p>A opção <strong>Permitir contatos repetidos entre listas</strong> controla o tratamento de registros já cadastrados. Avalie os itens duplicados antes de ativá-la; o sistema diferencia vínculo com outra lista de problemas de repetição na própria planilha.</p>
                <p>O recurso de <strong>recuperação de e-mails</strong> permite preencher endereços ausentes de contatos existentes quando há correspondência válida de telefone. Não é necessário criar um novo contato apenas para completar um e-mail que falta.</p>
              </div>
              <div className={styles.subtopico}>
                <h3>4. Confirmar importação</h3>
                <p>Depois da conferência, confirme o registro da lista. O CRM valida o nome e os itens disponíveis; arquivos grandes podem exigir processamento em fila. Consulte o retorno da operação antes de iniciar outra importação.</p>
              </div>
              <div className={styles.nota}>
                <AlertTriangle size={19} /><p>Uma planilha importada não significa que todas as linhas foram cadastradas. Revise os totais de válidos, alertas, recuperáveis, duplicados e inválidos para entender exatamente o que entrou na base.</p>
              </div>
            </section>

            <section id="listas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Organização</span>
              <h2><ListChecks size={22} /> Listas, origens e campanhas</h2>
              <div className={styles.subtopico}>
                <h3>Listas de importação</h3>
                <p>Ao importar, você nomeia uma lista para identificar o conjunto de registros. Depois, pode usar o filtro <strong>Origem / Lista importação</strong> para consultar os contatos relacionados a ela. Há ações para editar o nome da lista e solicitar a exclusão quando disponíveis.</p>
              </div>
              <div className={styles.subtopico}>
                <h3>Listas personalizadas</h3>
                <p>Em <strong>Listas personalizadas</strong>, selecione uma lista existente ou clique no botão de adição para gerenciar a organização. O modal permite criar e editar listas; as listas podem ser usadas como filtros e na gestão de contatos.</p>
              </div>
              <div className={styles.subtopico}>
                <h3>Campanha, origem e interesse</h3>
                <p><strong>Origem</strong> indica de onde o contato veio; <strong>Campanha</strong> identifica uma ação comercial; <strong>Interesse</strong> registra o produto ou serviço relacionado ao contato. Esses campos ajudam a localizar públicos sem depender apenas da busca por nome.</p>
              </div>
            </section>

            <section id="massa" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Manutenção</span>
              <h2>Seleção em massa e revisão de telefones</h2>
              <div className={styles.subtopico}>
                <h3>Selecionar vários contatos</h3>
                <p>Utilize as caixas de seleção na tabela ou a opção de selecionar todos os contatos da página. A barra de operações em massa permite atualizar <strong>Campanha</strong>, <strong>Origem</strong> ou <strong>Lista personalizada</strong> dos registros selecionados.</p>
                <p>Em cada campo, <strong>Não alterar</strong> conserva a informação atual. Revise a seleção e as opções antes de aplicar, pois a alteração atinge vários cadastros.</p>
              </div>
              <div id="revisao" className={styles.subtopico}>
                <h3>Central de revisão de telefones</h3>
                <p>A seção de revisão ajuda a verificar números marcados com possíveis problemas. Utilize o filtro <strong>Telefone para revisar</strong> para encontrá-los e a central específica para tratar os registros antes de novas campanhas.</p>
                <p>Não confunda <strong>telefone para revisar</strong> com opt-out. Uma marcação de revisão sinaliza necessidade de conferência do número; a preferência de não recebimento é um controle distinto.</p>
              </div>
            </section>

            <section id="exportacao" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Dados da base</span>
              <h2><FileSpreadsheet size={22} /> Exportar e excluir</h2>
              <div className={styles.subtopico}>
                <h3>Exportar contatos</h3>
                <p>Use os filtros para escolher o público desejado e clique em <strong>Exportar contatos</strong>. O CRM considera os critérios aplicados, como busca, integração, origem, campanha, classificação, listas e outros filtros disponíveis para a exportação.</p>
                <p>Guarde o arquivo em local apropriado e compartilhe dados pessoais apenas com pessoas autorizadas.</p>
              </div>
              <div id="excluir" className={styles.subtopico}>
                <h3>Excluir contato ou registros em massa</h3>
                <p>As ações de exclusão possuem etapas de confirmação para evitar remoções acidentais. Confira o nome ou a quantidade de registros afetados, principalmente ao excluir conforme um filtro ou fazer operações com vários selecionados.</p>
                <p>Se deseja apenas organizar a base para uma campanha, prefira filtros e listas. Exclua somente os registros que realmente precisam ser retirados da operação.</p>
              </div>
              <div className={styles.nota}><AlertTriangle size={19} /><p>Verifique os filtros e a seleção antes de confirmar uma exclusão. A remoção pode afetar os registros disponíveis para operações futuras.</p></div>
            </section>

            <section id="duvidas" className={styles.artigoBloco}>
              <span className={styles.artigoEtiqueta}>Ajuda rápida</span>
              <h2>Perguntas frequentes</h2>
              <div className={styles.faq}>
                <details><summary>Posso cadastrar um contato que tem só e-mail?</summary><p>Sim. O cadastro requer pelo menos um telefone ou e-mail. Para campanhas WhatsApp, o destinatário precisará ter um número válido e elegível.</p></details>
                <details><summary>Por que opt-in e opt-out aparecem como —?</summary><p>Esses dados são consultados no contexto de uma integração. Selecione o número WhatsApp desejado para visualizá-los.</p></details>
                <details><summary>A planilha pode ter somente e-mails?</summary><p>Sim. O assistente aceita arquivo CSV/Excel com telefone, e-mail ou ambos.</p></details>
                <details><summary>Por que existem menos contatos importados do que linhas no arquivo?</summary><p>Algumas linhas podem ter sido classificadas como inválidas, duplicadas ou pendentes de revisão. Consulte a prévia antes de confirmar a importação.</p></details>
                <details><summary>Um e-mail encontrado na planilha pode atualizar um contato existente?</summary><p>Quando o sistema identifica uma correspondência de telefone válida e o contato ainda não possui e-mail, a função de recuperação permite preencher o endereço ausente sem substituir um e-mail já existente.</p></details>
                <details><summary>Como encontro os contatos de uma lista específica?</summary><p>Use os filtros Origem / Lista importação ou Listas personalizadas, conforme o tipo de lista que deseja consultar.</p></details>
                <details><summary>Um contato sem opt-in pode receber mensagens promocionais?</summary><p>Não presuma autorização pela ausência de registro. Confirme que há autorização adequada antes de enviar marketing e respeite todos os pedidos de opt-out.</p></details>
              </div>
            </section>

            <section id="videos" className={styles.videoArtigo} aria-label="Tutoriais em vídeo">
              <div>
                <span className={styles.artigoEtiqueta}>Aprenda na prática</span>
                <h2>Vídeos de Contatos</h2>
                <p>Assista aos tutoriais disponíveis sobre gestão de contatos e importação de listas. Novos vídeos poderão ser adicionados a esta biblioteca.</p>
              </div>
              <VideoTutoriais videos={obterVideosDoModulo("contatos")} tituloPendente="Como cadastrar e organizar contatos" />
            </section>
            <div className={styles.artigoFim}>
              <Link href="/central-de-conhecimento"><ArrowLeft size={17} /> Voltar à Central</Link>
              <Link href="/contatos">Ir para Contatos <ArrowRight size={17} /></Link>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
