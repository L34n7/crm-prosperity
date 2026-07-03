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
3. Confirme que o `NEXT_PUBLIC_META_CONFIG_ID` usa Embedded Signup v3.
4. Mantenha `APP_CRYPTO_SECRET` configurado. Novos tokens da Meta são
   armazenados criptografados.
5. Configure `WHATSAPP_API_VERSION` quando for necessário fixar uma versão.
   O fallback atual é `v25.0`.

## Fluxo do onboarding

1. O usuário escolhe Cloud API exclusiva ou WhatsApp Business + CRM.
2. No modo Coexistence, o frontend inicia o Embedded Signup com
   `featureType: "whatsapp_business_app_onboarding"`.
3. O backend só aceita
   `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` nesse modo.
4. O número é validado com `is_on_biz_app=true` e
   `platform_type=CLOUD_API`.
5. O endpoint de ativação inscreve o app na WABA e solicita, nesta ordem:
   - contatos (`smb_app_state_sync`);
   - histórico (`history`).
6. Os pedidos e o progresso ficam em `whatsapp_coex_sync_jobs`.

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

## Desconexão

Uma integração Coexistence deve ser desconectada primeiro no celular:

WhatsApp Business App > Configurações > Conta > Plataforma de negócios >
Prosperity > Desconectar.

Depois disso, a integração pode ser removida no perfil do WhatsApp no CRM.

