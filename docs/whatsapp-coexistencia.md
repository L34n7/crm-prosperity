# WhatsApp Business App + CRM (Coexistence)

O Prosperity suporta dois modos na mesma tabela `integracoes_whatsapp`:

- `cloud_api`: fluxo exclusivo da Cloud API, já existente.
- `coexistence`: o mesmo número funciona no WhatsApp Business App e na
  Cloud API.

Integrações anteriores à migração
`202607030002_whatsapp_coexistencia.sql` permanecem em `cloud_api`.

## Configuração obrigatória na Meta

Antes de liberar o modo em produção:

1. Confirme que o app do Prosperity está publicado como Tech Provider ou
   Solution Partner e possui acesso avançado a
   `whatsapp_business_management` e `whatsapp_business_messaging`.
2. Em App Dashboard > WhatsApp > Configuration, mantenha `messages` e
   assine também:
   - `history`
   - `smb_app_state_sync`
   - `smb_message_echoes`
   - `account_update`
3. Confirme que o `NEXT_PUBLIC_META_CONFIG_ID` aponta para uma configuração do Facebook Login for Business criada como **WhatsApp Embedded Signup v4**. No v4, produtos, ativos e permissões ficam na configuração da Meta; o launcher do CRM não envia `version`, `sessionInfoVersion` nem `scope`.
4. Mantenha `APP_CRYPTO_SECRET` configurado. Novos tokens da Meta são
   armazenados criptografados.
5. Configure `WHATSAPP_API_VERSION` quando for necessário fixar uma versão.
   O fallback atual é `v25.0`.

## Embedded Signup v4

A partir desta migração, o CRM usa o modelo **configuration-driven** do Embedded Signup v4:

- `NEXT_PUBLIC_META_CONFIG_ID` deve ser o ID da configuração v4 criada em **Facebook Login for Business > Configurations** com a variação WhatsApp Embedded Signup;
- a configuração da Meta deve conceder `whatsapp_business_management` e `whatsapp_business_messaging` e compartilhar as contas/números necessários;
- o JavaScript não força mais `version: "v3"`, `sessionInfoVersion: "3"` nem solicita permissões por `scope`;
- Coexistence continua usando `featureType: "whatsapp_business_app_onboarding"`;
- o callback tolera o `phone_number_id` ausente no evento e recupera os ativos no backend quando necessário;
- o frontend aguarda o evento de sessão mesmo depois de receber o code OAuth, porque os dois retornos podem chegar fora de ordem.
- o backend aceita os eventos finais `FINISH`, `FINISH_ONLY_WABA` e `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. A elegibilidade real de Coexistence continua sendo validada depois pela Graph API através de `is_on_biz_app=true` e `platform_type=CLOUD_API`, evitando depender do nome legado do evento de conclusão.

## Fluxo do onboarding

1. O usuário escolhe Cloud API exclusiva ou WhatsApp Business + CRM.
2. O frontend inicia o Embedded Signup v4 de forma orientada pela configuração. No modo Coexistence, mantém apenas o seletor de fluxo `featureType: "whatsapp_business_app_onboarding"`; no modo Cloud API, envia somente `setup: {}`.
3. O compartilhamento do histórico é autorizado ou recusado pelo usuário
   dentro do fluxo da Meta/WhatsApp Business App (incluindo o QR code). O
   Prosperity não apresenta uma segunda opção de consentimento.
4. O backend só aceita
   `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` nesse modo.
5. O número é validado com `is_on_biz_app=true` e
   `platform_type=CLOUD_API`.
6. O endpoint de ativação inscreve o app na WABA e solicita, nesta ordem:
   - contatos (`smb_app_state_sync`);
   - histórico (`history`).
7. Os pedidos e o progresso ficam em `whatsapp_coex_sync_jobs`.

Não execute `/{phone_number_id}/register` para Coexistence.

## Regras de processamento

- `messages`: evento ao vivo recebido do cliente; segue o fluxo normal e
  pode acionar automações.
- `smb_message_echoes`: mensagem enviada pelo Business App; é salva como
  saída e pausa o bot da conversa.
- `history`: backfill, nunca aciona automações, opt-out ou atribuição de
  campanha. Conversas criadas apenas pelo histórico começam encerradas.
- `smb_app_state_sync`: remoção no celular gera tombstone na tabela de
  sincronização, mas nunca exclui o contato do CRM.
- `PARTNER_REMOVED`: desconecta e bloqueia operacionalmente a integração.

O histórico é idempotente pelo `mensagem_externa_id`. A recusa de
compartilhamento (`2593109`) é registrada como `recusado_usuario`, não como
falha da conexão.

## Processamento do histórico

O webhook `history` não grava todas as mensagens diretamente:

1. o payload original é salvo em `whatsapp_webhook_eventos`;
2. cada mensagem é normalizada em `whatsapp_coex_historico_itens`;
3. o worker `/api/worker/whatsapp-coex-history` reserva itens com
   `FOR UPDATE SKIP LOCKED`;
4. contatos, conversas, protocolos e mensagens existentes são buscados em
   grupo;
5. as mensagens são inseridas em lotes e o payload da fila é compactado;
6. o cron `/api/cron/whatsapp_coex_history` retoma lotes sem QStash.

O progresso da Meta (`progresso`) e o progresso real do banco
(`processamento_progresso`) são independentes. O job só fica `concluido`
quando a Meta terminou de enviar os chunks e todos os itens foram persistidos.

Configuração opcional:

- `WHATSAPP_COEX_HISTORY_BATCH_SIZE` (padrão `50`);
- `WHATSAPP_COEX_HISTORY_MAX_ATTEMPTS` (padrão `5`);
- `WHATSAPP_COEX_HISTORY_LOCK_TIMEOUT_MINUTES` (padrão `5`);
- `WHATSAPP_COEX_HISTORY_QSTASH_RATE` (padrão `2` lotes/minuto);
- `WHATSAPP_COEX_HISTORY_QSTASH_RETRIES` (padrão `5`);
- `QSTASH_WHATSAPP_COEX_HISTORY_WORKER_URL` (fallback para a URL pública do
  Prosperity).

Para reenviar contatos e histórico após corrigir uma assinatura de webhook,
chame `POST /api/integracoes-whatsapp/coexistence/activate` com:

```json
{
  "integracao_id": "<ID>",
  "reprocessar_sync": true
}
```

Esse parâmetro não altera o consentimento dado no WhatsApp Business App. Ele
apenas repete a solicitação técnica à Meta; mensagens já importadas continuam
idempotentes.

## Desconexão

Uma integração Coexistence deve ser desconectada primeiro no celular:

WhatsApp Business App > Configurações > Conta > Plataforma de negócios >
Prosperity > Desconectar.

Depois disso, a integração pode ser removida no perfil do WhatsApp no CRM.
