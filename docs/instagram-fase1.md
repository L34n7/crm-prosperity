# Instagram — Fase 1 (CRM Prosperity)

Implementação nativa em Next.js / React / TypeScript / Supabase. Piloto disponível **somente** para a empresa operacional CRM Prosperity (`4fc69d8c-52e3-4756-aaa1-d86db217c376`). A empresa homônima de testes não recebe acesso.

## Banco de dados

- `integracoes_instagram`: contas profissionais autorizadas, token AES-256-GCM apenas no servidor, status e webhook.
- `instagram_contatos`: associa o Instagram-scoped sender ID ao contato interno.
- `contatos.instagram_user_id`: identidade única de origem Instagram; **não inventar telefone**.
- `conversas.integracao_instagram_id` + `conversas.canal = instagram`: conversa compartilhada com WhatsApp, setores, histórico e protocolo.
- `mensagens`: armazenamento unificado, `mensagem_externa_id` único para idempotência.
- `instagram_registrar_mensagem`: transação PostgreSQL atômica, serializada e restrita ao backend (service_role).

Migration: `supabase/migrations/202611280001_integracao_instagram_fase1.sql`.

## Meta / produção

1. No app Meta Developers, adicionar Instagram API with Instagram Login e solicitar `instagram_business_basic`, `instagram_business_manage_messages`.
2. Registrar a URL HTTPS de callback `https://SEU_DOMINIO/api/integracoes-instagram/callback` no produto Instagram.
3. Configurar o objeto de webhook **Instagram**, campo `messages`, callback `https://SEU_DOMINIO/api/webhooks/instagram` e verificar token. Aprovação de acesso avançado é necessária conforme o modo e público do app.
4. Definir **na Vercel (ambiente servidor)**:
   - `INSTAGRAM_APP_ID`: Instagram App ID (do produto de login);
   - `INSTAGRAM_APP_SECRET`: App Secret correspondente (assinatura e OAuth);
   - `INSTAGRAM_REDIRECT_URI`: callback HTTPS exatamente igual ao cadastrado na Meta;
   - `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`: segredo para o desafio GET do webhook;
   - `INSTAGRAM_TOKEN_ENCRYPTION_KEY`: chave aleatória de 32 bytes em base64 ou hex, mantida constante entre deploys.
5. Acessar `/instagram` como Administrador da empresa piloto, conectar uma conta profissional e enviar mensagem de outra conta IG.
6. Aguardar um Direct na caixa `/conversas?canal=instagram`; assumir e responder dentro da janela de 24h.

## Limites da Fase 1

- Suporta conexão, texto de Direct (anexos recebidos com links quando disponíveis), webhook assinado e atendimento manual; não executa IA nem fluxo por canal.
- Não executa disparos, templates WhatsApp, automações por comentários nem mensagem iniciada fora da janela.
- Mensagens enviadas fora do CRM, diretamente no app Instagram, não são importadas (webhook echo ignorado).
- Não há sincronização retroativa de Directs anteriores à integração.
- O webhook e token dependem de configuração/ativação real no app Meta; módulo instalado **não equivale** a autorização Meta concluída.
