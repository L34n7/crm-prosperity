create table if not exists public.email_marketing_integracoes (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  habilitado boolean not null default false,
  api_key_criptografada text,
  webhook_secret_criptografado text,
  dominio text,
  remetente_nome text,
  remetente_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_marketing_integracoes enable row level security;
revoke all on public.email_marketing_integracoes from anon, authenticated;
grant all on public.email_marketing_integracoes to service_role;
insert into public.email_marketing_integracoes
 (empresa_id, habilitado, dominio, remetente_nome, remetente_email)
values ('4fc69d8c-52e3-4756-aaa1-d86db217c376', true,
        'email.crmprosperity.com', 'CRM Prosperity',
        'marketing@email.crmprosperity.com')
on conflict (empresa_id) do nothing;
insert into public.permissoes (codigo, descricao) values
 ('email_marketing.visualizar', 'Acessar E-mail Marketing'),
 ('email_marketing.campanhas', 'Criar e enviar campanhas de E-mail Marketing'),
 ('email_marketing.templates', 'Gerenciar templates de E-mail Marketing'),
 ('email_marketing.remetentes', 'Gerenciar remetentes de E-mail Marketing')
on conflict (codigo) do update set descricao = excluded.descricao;