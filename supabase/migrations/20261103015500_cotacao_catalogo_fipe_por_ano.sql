-- Cache FIPE por veículo/ano/empresa, sem permitir acesso direto pelo cliente.
CREATE TABLE IF NOT EXISTS public.cotacao_veicular_catalogo_fipe (
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo_fipe text NOT NULL CHECK (tipo_fipe IN ('cars','motorcycles','trucks')),
  codigo_fipe text NOT NULL CHECK (length(trim(codigo_fipe)) BETWEEN 3 AND 40),
  codigo_ano_fipe text NOT NULL CHECK (length(trim(codigo_ano_fipe)) BETWEEN 2 AND 40),
  marca text NOT NULL,
  modelo text NOT NULL,
  ano_modelo integer NOT NULL CHECK (ano_modelo BETWEEN 1950 AND 32000),
  combustivel text NOT NULL DEFAULT '',
  valor_fipe_centavos bigint NOT NULL CHECK (valor_fipe_centavos > 0),
  referencia_fipe text NOT NULL,
  categoria text CHECK (categoria IS NULL OR categoria IN
    ('motocicleta','auto_leves','app_taxi','especiais','van_utilitario','caminhao_leve','caminhao_pesado','agregado')),
  consultado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id,tipo_fipe,codigo_fipe,codigo_ano_fipe)
);
CREATE INDEX IF NOT EXISTS cotacao_veicular_catalogo_fipe_busca_idx
 ON public.cotacao_veicular_catalogo_fipe (empresa_id,categoria,modelo);
ALTER TABLE public.cotacao_veicular_catalogo_fipe ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cotacao_veicular_catalogo_fipe FROM public,anon,authenticated;
