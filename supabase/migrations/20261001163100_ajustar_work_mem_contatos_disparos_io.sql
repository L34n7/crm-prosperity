-- Reduz escrita temporária em disco nas consultas de contatos usadas pelo módulo de disparos.
-- O padrão do projeto é ~3.5 MB e essas funções derramavam ~13 MB para temp por chamada.
-- 12 MB foi validado em produção sem temp blocks no cenário de maior empresa.

alter function public.listar_contatos_operacionais_contexto(
  uuid, uuid, date, date, uuid, boolean
) set work_mem = '12MB';

alter function public.listar_contatos_operacionais_contexto_filtros_disparo(
  uuid, uuid, date, date, uuid, boolean, uuid, uuid, uuid
) set work_mem = '12MB';
