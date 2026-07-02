# Webhook de entrada de imóveis

Este webhook recebe inclusões, atualizações e remoções de imóveis de uma imobiliária parceira.

O CRM não baixa nem armazena arquivos de mídia. As imagens são recebidas e salvas apenas como URLs públicas HTTP/HTTPS.

## Credenciais

No módulo **Meus imóveis > Recebimento por parceiros**, gere uma integração para o parceiro.

O CRM exibirá:

* uma URL exclusiva, no formato:

```text
https://dominio.example/api/webhooks/imoveis/{integracao_id}
```

* um segredo iniciado por `whsec_`, mostrado somente no momento da criação ou rotação.

O segredo deve ser enviado no header da requisição em uma destas formas:

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

Exemplo incorreto:

```text
https://dominio.example/api/webhooks/imoveis/{integracao_id}?secret=whsec_SEGREDO
```

O segredo deve ser tratado como uma credencial privada. Em caso de vazamento, gere um novo segredo no CRM usando a opção de rotação/troca de segredo. O segredo anterior deixará de funcionar.

---

## Contrato recomendado

O limite por requisição é de **1 MB**.

Cada requisição deve representar **um único evento relacionado a um único imóvel**.

O campo `external_id` identifica o imóvel no sistema do parceiro e deve permanecer estável ao longo do tempo.

O campo `event_id` identifica o evento enviado e deve ser único por integração.

Regras importantes:

```text
Mesmo imóvel = mesmo external_id
Novo evento = novo event_id
Reenvio do mesmo evento = mesmo event_id
```

Para inclusão e atualização, `external_id` e `titulo` são obrigatórios.

Para remoção, somente `external_id` é obrigatório.

Exemplo de inclusão ou atualização:

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

---

## Tipos de eventos

Os tipos recomendados são:

```text
property.created
property.updated
property.deleted
```

### `property.created`

Usado quando um imóvel novo é cadastrado no sistema do parceiro.

O CRM usará o `external_id` para identificar esse imóvel na integração.

### `property.updated`

Usado quando um imóvel já enviado anteriormente sofre alteração.

Recomendamos que o parceiro envie o cadastro completo atualizado do imóvel. Isso evita perda de informações caso algum campo deixe de ser enviado.

Caso o parceiro envie apenas campos alterados, o CRM poderá atualizar somente os campos presentes, conforme suporte do normalizador.

### `property.deleted`

Usado quando um imóvel deve ser removido, desativado ou marcado como indisponível no CRM.

Eventos `property.deleted` não precisam apagar fisicamente o registro do banco. O CRM poderá marcar o imóvel como removido, inativo ou indisponível, preservando histórico, auditoria e vínculos técnicos.

Exemplo de remoção:

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

---

## Imagens e mídias

O CRM não aceita upload de arquivos, imagens em Base64, buffers ou conteúdo binário.

As imagens devem ser enviadas somente como URLs públicas HTTP/HTTPS.

As URLs devem ser:

* públicas;
* acessíveis sem autenticação;
* acessíveis sem cookies;
* preferencialmente sem expiração curta;
* válidas para acesso pelo servidor do CRM.

A ordem das imagens será preservada. Quando aplicável, a primeira imagem enviada poderá ser considerada a imagem principal do imóvel.

Exemplo aceito:

```json
"imagens": [
  {
    "url": "https://cdn.imobiliaria.example/imoveis/98765/fachada.jpg"
  },
  {
    "url": "https://cdn.imobiliaria.example/imoveis/98765/sala.jpg"
  }
]
```

Também podem ser enviados arrays simples de URLs, se o parceiro não utilizar objetos:

```json
"imagens": [
  "https://cdn.imobiliaria.example/imoveis/98765/fachada.jpg",
  "https://cdn.imobiliaria.example/imoveis/98765/sala.jpg"
]
```

Não serão aceitos:

```text
data:image/jpeg;base64,...
```

```text
localhost
```

```text
127.0.0.1
```

```text
URLs de rede privada
```

```text
URLs com usuário e senha embutidos
```

---

## Compatibilidade de campos

O formato recomendado é o objeto `property`, mas o normalizador também reconhece nomes comuns em português e inglês.

### Objeto do imóvel

Aceitos:

```text
property
imovel
listing
anuncio
data
```

### Identificador do imóvel

Aceitos:

```text
external_id
property_id
listing_id
id
codigo
```

### Título

Aceitos:

```text
titulo
title
name
headline
```

### Finalidade

Aceitos:

```text
finalidade
purpose
business_type
transaction_type
operation
```

Exemplos de finalidade:

```text
venda
locacao
temporada
```

### Endereço

Pode ser enviado em campos diretos ou dentro de:

```text
address
endereco
```

Campos recomendados:

```text
cep
logradouro
numero
complemento
bairro
cidade
uf
```

### Atributos

Podem ser enviados em campos diretos ou dentro de:

```text
attributes
atributos
caracteristicas
```

Exemplos:

```text
quartos
suites
banheiros
vagas
area_util
area_total
mobiliado
andar
elevador
portaria_24h
```

### Imagens

Aceitos:

```text
imagem_urls
image_urls
imagens
images
fotos
photos
galeria
gallery
midias
media
```

### Página pública do imóvel

Aceitos:

```text
external_url
property_url
listing_url
detail_url
public_url
link
url
```

O campo de página pública é importante para que o CRM consiga exibir o botão **Ver anúncio**, direcionando o usuário para o site da imobiliária parceira.

---

## Tratamento do JSON recebido

O JSON recebido é mantido no histórico do evento e no registro externo para permitir auditoria e novos mapeamentos futuros.

Por segurança, o CRM remove ou descarta antes da persistência:

* conteúdo de arquivo em Base64;
* `data:` URI;
* buffers;
* campos binários conhecidos;
* URLs com credenciais embutidas;
* URLs apontando para `localhost`;
* URLs apontando para endereços de rede privada.

---

## Visibilidade no CRM

Os imóveis recebidos pelo webhook:

* aparecem no catálogo global da página **Imóveis**;
* podem ser visualizados por usuários de empresas do nicho imobiliário, conforme regras comerciais da plataforma;
* mostram como empresa de origem o nome informado na criação da integração;
* não são tratados como imóveis próprios da empresa;
* não aparecem na carteira **Meus imóveis**;
* não são considerados imóveis cadastrados manualmente pelo usuário.

O vínculo técnico com a empresa que criou a integração é mantido apenas para procedência, credenciais e auditoria. Ele não restringe necessariamente a visualização do anúncio no catálogo, conforme a regra comercial configurada na plataforma.

---

## Idempotência

`event_id` deve ser único por integração.

Se o mesmo evento for reenviado com o mesmo `event_id`, o CRM responde com sucesso e `duplicated: true`, sem duplicar o imóvel nem repetir o processamento.

O `external_id` deve ser estável e identifica o mesmo imóvel ao longo de inclusões, atualizações e remoções.

Quando `event_id` não é informado, o CRM gera um identificador pelo hash do JSON recebido. Porém, o parceiro deve preferir enviar um `event_id` próprio e estável para cada evento.

Exemplo correto:

```text
Criação do imóvel IMO-98765:
event_id: evt_001
external_id: IMO-98765

Atualização do mesmo imóvel IMO-98765:
event_id: evt_002
external_id: IMO-98765

Reenvio da mesma atualização:
event_id: evt_002
external_id: IMO-98765
```

---

## Retentativas

Caso o CRM retorne erro temporário `500`, o parceiro pode tentar reenviar o mesmo evento.

Para retentativas do mesmo evento, o parceiro deve manter o mesmo `event_id`.

Eventos que falharam são liberados para reprocessamento.

Eventos que ficaram interrompidos durante o processamento podem ser retomados após cinco minutos.

Recomendação de política de retentativa:

```text
1ª tentativa: envio imediato
2ª tentativa: após 1 minuto
3ª tentativa: após 5 minutos
4ª tentativa: após 15 minutos
5ª tentativa: após 1 hora
```

O parceiro pode adotar outra política, desde que mantenha o mesmo `event_id` para o mesmo evento reenviado.

---

## Respostas HTTP

### `200`

Evento processado, ignorado de forma segura ou identificado como duplicado.

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

Exemplo de evento duplicado:

```json
{
  "ok": true,
  "duplicated": true,
  "action": "ignored",
  "event_id": "evt_20260702_000123",
  "external_id": "IMO-98765"
}
```

### `401`

Autenticação inválida, segredo ausente/incorreto ou integração sem permissão para receber eventos.

### `413`

Corpo da requisição maior que 1 MB.

### `415`

`Content-Type` ausente ou incompatível com `application/json`.

O CRM deve aceitar variações comuns, como:

```http
Content-Type: application/json; charset=utf-8
```

### `422`

Identificador, título ou estrutura obrigatória ausente.

Exemplos:

* ausência de `external_id`;
* ausência de `titulo` em criação/atualização;
* `property` ausente;
* evento inválido;
* JSON malformado.

### `500`

Erro temporário no CRM.

O parceiro pode tentar novamente mantendo o mesmo `event_id`.

---

## Exemplo de teste com cURL

```bash
curl -X POST "https://dominio.example/api/webhooks/imoveis/INTEGRACAO_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer whsec_SEGREDO" \
  -d '{
    "event_id": "evt_teste_001",
    "event_type": "property.created",
    "occurred_at": "2026-07-02T14:30:00-03:00",
    "property": {
      "external_id": "IMO-98765",
      "codigo": "AP-1042",
      "titulo": "Apartamento com 3 quartos no Funcionários",
      "tipo": "apartamento",
      "finalidade": "venda",
      "status": "disponivel",
      "valor_venda": 850000,
      "endereco": {
        "bairro": "Funcionários",
        "cidade": "Belo Horizonte",
        "uf": "MG"
      },
      "quartos": 3,
      "suites": 1,
      "banheiros": 2,
      "vagas": 2,
      "imagens": [
        {
          "url": "https://cdn.imobiliaria.example/imoveis/98765/fachada.jpg"
        }
      ],
      "property_url": "https://imobiliaria.example/imovel/IMO-98765"
    }
  }'
```

---

## Homologação

Antes de ativar em produção, solicite ao parceiro:

1. documentação do payload produzido pelo sistema deles;
2. um exemplo real de criação;
3. um exemplo real de atualização;
4. um exemplo real de remoção;
5. confirmação de que as imagens serão enviadas como URLs públicas, sem Base64;
6. confirmação de que a página pública do imóvel será enviada;
7. confirmação de que cada imóvel possui um identificador único e estável;
8. confirmação de que cada evento possui um `event_id` único;
9. política de retentativas em caso de erro;
10. confirmação de que o header de autenticação será enviado corretamente.

Fluxo recomendado para homologação:

1. Enviar um imóvel novo com `property.created`.
2. Enviar uma atualização do mesmo imóvel com `property.updated`.
3. Enviar a remoção do mesmo imóvel com `property.deleted`.
4. Reenviar o mesmo evento anterior para testar duplicidade.
5. Validar se o CRM respondeu `duplicated: true` no reenvio.
6. Conferir se o imóvel aparece corretamente na página **Imóveis**.
7. Conferir se a empresa de origem está correta.
8. Conferir se as imagens carregam pela URL.
9. Conferir se o botão **Ver anúncio** abre a página pública da imobiliária.
10. Conferir se o imóvel não aparece como imóvel próprio em **Meus imóveis**.

---

## Adaptação do normalizador

Se o parceiro não puder usar o contrato recomendado, adapte o normalizador em:

```text
src/lib/imoveis/webhook.ts
```

Use os payloads reais de homologação para mapear os campos enviados pelo parceiro para o formato interno do CRM.

Sempre que possível, prefira adaptar o normalizador em vez de exigir mudanças complexas do parceiro, desde que os dados essenciais estejam presentes:

```text
external_id
titulo
event_type
property_url
imagens como URLs públicas
```
