alter table public.conversas
  add column if not exists aguardando_atendente boolean not null default false;

comment on column public.conversas.aguardando_atendente is
  'Distingue a fila inicial, elegivel para automacao, da conversa entregue ao atendimento humano.';

update public.conversas
set aguardando_atendente = true
where bot_ativo is not true
  and (
    status in ('em_atendimento', 'aguardando_cliente')
    or (
      status = 'fila'
      and (
        origem_atendimento in ('bot', 'manual')
        or setor_id is not null
      )
    )
    or (
      status = 'aberta'
      and responsavel_id is not null
    )
  );
