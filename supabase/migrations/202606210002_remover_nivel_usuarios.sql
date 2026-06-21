alter table if exists public.usuarios
  drop constraint if exists usuarios_nivel_check;

alter table if exists public.usuarios
  drop column if exists nivel;
