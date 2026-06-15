alter table public.usuarios
  add column if not exists assinatura_whatsapp text;

alter table public.usuarios
  drop constraint if exists usuarios_assinatura_whatsapp_tamanho_check,
  add constraint usuarios_assinatura_whatsapp_tamanho_check
  check (
    assinatura_whatsapp is null
    or (
      char_length(assinatura_whatsapp) <= 80
      and assinatura_whatsapp !~ '[\r\n]'
    )
  );

comment on column public.usuarios.assinatura_whatsapp is
  'Nome opcional exibido em negrito no inicio das mensagens manuais enviadas pelo WhatsApp.';
