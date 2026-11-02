-- Imagens de campanhas enviadas por e-mail precisam de URLs estáveis e públicas.
-- Upload somente pela API do CRM com autenticação e permissão de templates.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-marketing', 'email-marketing', true, 3145728, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
