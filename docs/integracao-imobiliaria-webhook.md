# Webhook de entrada de imóveis

Este webhook recebe inclusões, atualizações e remoções de imóveis de uma
imobiliária parceira. O CRM não baixa nem armazena arquivos de mídia. As imagens
são recebidas e salvas apenas como URLs HTTPS/HTTP.

## Credenciais

No módulo **Meus imóveis > Recebimento por parceiros**, gere uma integração
para o parceiro. O CRM exibirá:

- uma URL exclusiva, no formato
  `https://dominio.example/api/webhooks/imoveis/{integracao_id}`;
- um segredo iniciado por `whsec_`, mostrado somente no momento da criação ou
  rotação.

Envie o segredo em uma destas formas:

```http
Authorization: Bearer whsec_SEGREDO
Content-Type: application/json
```

ou:

```http
X-Webhook-Token: whsec_SEGREDO
Content-Type: application/json
```

Não envie o segredo pela query string.

## Contrato recomendado

O limite por requisição é 1 MB. Cada requisição deve representar um evento e um
imóvel. `external_id` e `titulo` são obrigatórios para inclusão/atualização.
Para remoção, somente `external_id` é obrigatório.

```json
{
  "event_id": "evt_20260702_000123",
  "event_type": "property.updated",
  "occurred_at": "2026-07-02T14:30:00-03:00",
  "property": {
    "external_id": "IMO-98765",
    "codigo": "AP-1042",
    "titulo": "Apartamento com 3 quartos no Funcionários",
    "tipo": "apartamento",
    "finalidade": "venda",
    "status": "disponivel",
    "valor_venda": 850000,
    "valor_locacao": null,
    "valor_condominio": 920,
    "valor_iptu": 310,
    "endereco": {
      "cep": "30130-170",
      "logradouro": "Avenida Brasil",
      "numero": "1000",
      "complemento": "Apto 802",
      "bairro": "Funcionários",
      "cidade": "Belo Horizonte",
      "uf": "MG"
    },
    "quartos": 3,
    "suites": 1,
    "banheiros": 2,
    "vagas": 2,
    "areas": {
      "util": 112.5,
      "total": 145,
      "terreno": null
    },
    "localizacao": {
      "latitude": -19.9321,
      "longitude": -43.9378
    },
    "descricao": "Descrição completa do imóvel.",
    "caracteristicas": {
      "elevador": true,
      "portaria_24h": true,
      "mobiliado": false,
      "andar": 8
    },
    "imagens": [
      {
        "url": "https://cdn.imobiliaria.example/imoveis/98765/fachada.jpg"
      },
      {
        "url": "https://cdn.imobiliaria.example/imoveis/98765/sala.jpg"
      }
    ],
    "property_url": "https://imobiliaria.example/imovel/IMO-98765"
  }
}
```

Os tipos recomendados são:

- `property.created`;
- `property.updated`;
- `property.deleted`.

Para remover um imóvel:

```json
{
  "event_id": "evt_20260702_000124",
  "event_type": "property.deleted",
  "occurred_at": "2026-07-02T15:00:00-03:00",
  "property": {
    "external_id": "IMO-98765"
  }
}
```

## Compatibilidade de campos

O formato acima é o preferencial. O normalizador também reconhece nomes comuns
em português e inglês:

- objeto do imóvel: `property`, `imovel`, `listing`, `anuncio` ou `data`;
- identificador: `external_id`, `property_id`, `listing_id`, `id` ou `codigo`;
- título: `titulo`, `title`, `name` ou `headline`;
- finalidade: `finalidade`, `purpose`, `business_type`, `transaction_type` ou
  `operation`;
- endereço: campos diretos ou dentro de `address`/`endereco`;
- atributos: campos diretos ou dentro de `attributes`/`atributos`;
- imagens: `imagem_urls`, `image_urls`, `imagens`, `images`, `fotos`, `photos`,
  `galeria`, `gallery`, `midias` ou `media`;
- página pública: `external_url`, `property_url`, `listing_url`, `detail_url`,
  `public_url`, `link` ou `url`.

O JSON recebido é mantido no histórico do evento e no registro externo para
permitir novos mapeamentos. Conteúdo de arquivo em Base64, `data:` URI, buffers
e campos binários conhecidos é removido antes da persistência. URLs com
credenciais embutidas, `localhost` ou endereços de rede privada também são
descartadas.

## Visibilidade no CRM

Os imóveis recebidos pelo webhook:

- aparecem no catálogo global da página **Imóveis**;
- ficam visíveis para todos os usuários vinculados a empresas do nicho
  imobiliário;
- mostram como empresa de origem o nome informado na criação da integração;
- não podem ser adicionados, convertidos ou copiados para a carteira de uma
  empresa;
- não aparecem como imóveis próprios na página **Meus imóveis**.

O vínculo técnico com a empresa que criou a integração é mantido apenas para
procedência, credenciais e auditoria. Ele não restringe a visualização do
anúncio no catálogo.

## Idempotência e respostas

`event_id` deve ser único por integração. Se o mesmo evento for reenviado, o
CRM responde com sucesso e `duplicated: true`, sem duplicar o imóvel. Quando
`event_id` não é informado, o CRM gera um identificador pelo hash do JSON, mas
o parceiro deve preferir um ID próprio. Eventos que falharam são liberados para
reprocessamento; eventos que ficaram interrompidos durante o processamento
podem ser retomados após cinco minutos.

Respostas:

- `200`: processado, ignorado de forma segura ou evento duplicado;
- `401`: URL/segredo inválido ou integração inativa;
- `413`: corpo maior que 1 MB;
- `415`: `Content-Type` diferente de `application/json`;
- `422`: identificador, título ou estrutura obrigatória ausente;
- `500`: erro temporário; o parceiro pode tentar novamente.

Exemplo:

```json
{
  "ok": true,
  "duplicated": false,
  "action": "upserted",
  "event_id": "evt_20260702_000123",
  "external_id": "IMO-98765",
  "imovel_externo_id": "b2d7d660-7dda-4aca-8942-a2f9c80fa165",
  "images_received_as_urls": 2
}
```

## Homologação

Antes de ativar em produção, solicite ao parceiro:

1. documentação do payload;
2. um exemplo real de criação, atualização e remoção;
3. confirmação de que as imagens serão URLs públicas, sem Base64;
4. confirmação de que a página pública do imóvel será enviada;
5. política de retentativas e estabilidade do `event_id`/`external_id`.

Se o parceiro não puder usar o contrato recomendado, adapte o normalizador em
`src/lib/imoveis/webhook.ts` usando os payloads reais de homologação.
