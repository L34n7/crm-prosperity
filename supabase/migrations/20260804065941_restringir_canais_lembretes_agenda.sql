alter table public.agenda_lembretes
  drop constraint if exists agenda_lembretes_canal_destinatario_check;

alter table public.agenda_lembretes
  add constraint agenda_lembretes_canal_destinatario_check
  check (
    (destinatario_tipo = 'responsavel' and canal in ('sistema', 'email'))
    or
    (destinatario_tipo in ('cliente', 'participantes') and canal in ('email', 'whatsapp'))
  );

comment on constraint agenda_lembretes_canal_destinatario_check
  on public.agenda_lembretes is
  'Responsáveis recebem lembretes internos ou por e-mail; clientes e participantes recebem por e-mail ou WhatsApp.';
