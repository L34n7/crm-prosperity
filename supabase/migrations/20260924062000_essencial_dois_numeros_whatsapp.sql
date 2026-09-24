-- Plano Essencial passa a incluir 2 números oficiais de WhatsApp.
-- Preserva overrides manuais acima de 2 e empresas que herdam o limite do plano.

update public.planos
set
  limite_integracoes_whatsapp = 2,
  recursos_json = jsonb_set(
    jsonb_set(
      coalesce(recursos_json, '{}'::jsonb),
      '{numeros_whatsapp}',
      to_jsonb(2),
      true
    ),
    '{recursos}',
    (
      select coalesce(
        jsonb_agg(
          case
            when item.value = to_jsonb('1 número de WhatsApp oficial'::text)
              then to_jsonb('2 números de WhatsApp oficiais'::text)
            else item.value
          end
          order by item.ordinality
        ),
        '[]'::jsonb
      )
      from jsonb_array_elements(
        coalesce(recursos_json->'recursos', '[]'::jsonb)
      ) with ordinality as item(value, ordinality)
    ),
    true
  ),
  updated_at = now()
where slug = 'essencial';

-- Corrige somente overrides antigos que ainda fixavam o Essencial em 1 número.
-- Null continua herdando o limite do plano; limites customizados maiores são preservados.
update public.empresas e
set
  limite_integracoes_whatsapp = 2,
  updated_at = now()
from public.planos p
where e.plano_id = p.id
  and p.slug = 'essencial'
  and e.limite_integracoes_whatsapp = 1;
