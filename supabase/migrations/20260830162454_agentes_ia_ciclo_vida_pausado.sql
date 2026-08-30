-- Alinha o ciclo de vida do Agente de IA com a gestão simplificada da interface.
-- Novos agentes começam pausados e o modelo é fixo no backend.

update public.agentes_ia
set status = 'inativo', updated_at = now()
where status = 'rascunho';

update public.agentes_ia
set modelo = 'gpt-5.4-mini', updated_at = now()
where modelo is distinct from 'gpt-5.4-mini';

alter table public.agentes_ia
  alter column status set default 'inativo',
  alter column modelo set default 'gpt-5.4-mini';
