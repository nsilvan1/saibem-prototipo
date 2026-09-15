# Saibem — plano do projeto completo

Este documento descreve o produto de verdade: o que existe hoje (protótipo em
`mock/`), o que precisa ser construído, em que ordem e por quê.

> O protótipo em `mock/` **não evolui para produção**. Ele é a especificação viva —
> serve para decidir telas, fluxos e textos. O código de produção nasce limpo, em
> outro repositório, usando o mock como referência visual e de comportamento.

---

## 1. O que já está decidido

| Decisão | Escolha | Motivo |
|---|---|---|
| Modelo | Marketplace self-serve, horizontal | Fotógrafo publica sozinho, sem venda B2B para escalar |
| Comissão | 10% fixo, sem mensalidade nem taxa de upload | Simples de comunicar, bate o incumbente de frente |
| Pagamento | Só PIX no lançamento | Aprovação instantânea, taxa ~1%, sem chargeback nem antifraude |
| Repasse | Split no PSP, direto para a subconta do fotógrafo | Mantém a operação fora do perímetro de instituição de pagamento |
| KYC | Só no primeiro saque | Não travar ativação; o risco fica no dinheiro, não no cadastro |
| Marca d'água | Visível no preview + invisível no arquivo vendido | Preview inútil para roubo; arquivo vendido rastreável |
| Taxa repassada ao comprador | Não permitir | Polui o preço e tira nosso controle da conversão |

Pendente de decisão: retenção antifraude para conta nova e prazo de arquivamento
de evento (sugerido: teto de saque diário no primeiro mês; 12 meses para arquivar).

---

## 2. Arquitetura

```
                     ┌──────────────── Cloudflare ────────────────┐
  Navegador ───────► │  Pages (web)          R2 (originais+preview)│
  PWA / app          │  Workers (borda: auth de URL, watermark CDN)│
                     └───────────────┬─────────────────────────────┘
                                     │
                        API (FastAPI, Python 3.12)
                                     │
        ┌────────────────┬───────────┴───────────┬──────────────────┐
        │                │                       │                  │
   Postgres          Redis + RQ              GPU worker          PSP (Asaas
   + pgvector        (filas)                 (InsightFace)        ou Mercado Pago)
```

**Por que cada peça**

- **Cloudflare R2** — egress zero. Um evento popular serve dezenas de GB; em S3 isso
  sozinho inviabiliza a margem de 10%.
- **Postgres + pgvector** — a busca por rosto acontece *dentro de um evento*
  (dezenas de milhares de vetores), não numa base global. Índice HNSW resolve em
  milissegundos. Banco vetorial dedicado seria custo e peça a mais sem ganho.
- **InsightFace (buffalo_l) self-hosted** — ~R$0 por foto contra ~US$1/1000 de API.
  Em 20 mil fotos por evento, a diferença é o lucro.
- **GPU sob demanda** — ligada só enquanto há fila. Fora do evento, custo zero.
- **FastAPI** — a stack de visão computacional é Python; evita uma ponte entre
  serviços logo no começo.

---

## 3. Modelo de dados (núcleo)

```sql
photographer   id, nome, email, cpf_cnpj, chave_pix, psp_subconta_id,
               slug, verificado_em, criado_em
event          id, photographer_id, slug, titulo, data, local, cidade,
               categoria, preco_foto, preco_pacote, estado, busca_facial,
               busca_numero, watermark_cfg, arquivar_em
photo          id, event_id, storage_key, preview_key, largura, altura,
               tirada_em, numero_peito, status, hash_arquivo
face           id, photo_id, bbox, qualidade, embedding vector(512)
lead           id, event_id, telefone, embedding vector(512), avisado_em
order          id, event_id, buyer_email, buyer_phone, total, comissao,
               psp_payment_id, status, codigo_marca, criado_em
order_item     order_id, photo_id, preco
download_token order_id, photo_id, expira_em, usado_em
ledger         photographer_id, tipo, valor, taxa, order_id, status, criado_em
takedown       photo_id, motivo, solicitante, resolvido_em
```

Índices que importam:
```sql
CREATE INDEX ON face USING hnsw (embedding vector_cosine_ops);
-- toda query de rosto filtra por evento antes do k-NN
CREATE INDEX ON face (photo_id);
CREATE INDEX ON photo (event_id, tirada_em);
```

---

## 4. Pipeline de ingestão

```
upload (presigned PUT, direto para o R2)
   │
   ├─► fila: derivar       → preview 1200px + marca visível + thumb 420px
   ├─► fila: detectar      → InsightFace: bboxes + embeddings 512d
   ├─► fila: OCR do peito  → PaddleOCR / Tesseract na região do torso
   └─► fila: publicar      → photo.status = no_ar, dispara avisos de lead
```

Regras firmes:
- O original **nunca** é servido antes do pagamento. Preview sempre pela borda.
- Publicação **incremental**: a foto entra no ar quando o rosto dela é indexado,
  não quando o lote termina.
- Upload **resumível** e idempotente por hash (reenvio do mesmo arquivo é ignorado).
- Meta de throughput: **5.000 fotos no ar em menos de 20 minutos**.

---

## 5. Proteção de imagem em produção

O que o mock faz no navegador tem de migrar para o servidor:

1. **Marca visível queimada no worker**, nunca no cliente. Hoje o canvas recebe a
   foto limpa — em produção, a versão limpa jamais deixa o bucket.
2. **URL assinada** com expiração curta, por sessão, sem padrão adivinhável.
3. **Marca invisível** no arquivo vendido, com o código do pedido.
   Usar `invisible-watermark` ou TrustMark em Python — não reimplementar.
   *(O mock já provou o conceito: JPEG 50 lê a 98%; a armadilha é o índice do bit,
   que deve vir da posição do bloco na grade, nunca da contagem de blocos aceitos.)*
4. **Rate limit** por IP e sessão, com detecção de varredura de álbum.
5. **Registro** ligando código → pedido → comprador. Sem isto a marca não vale nada.

---

## 6. Etapas de entrega

### Etapa 0 — Validação (1 semana, sem código)
Dez conversas com fotógrafos do nicho. **Três comprometidos** em publicar o próximo
evento. Sem isso, não comece.

### Etapa 1 — Núcleo vendável (5 semanas)
O caminho mínimo do dinheiro: cadastro → evento → upload → busca por rosto →
PIX → download.

- Auth, conta de fotógrafo, criar evento
- Upload presigned + pipeline de derivadas e embeddings
- Página pública do evento, busca por selfie, sacola
- Checkout PIX com split, entrega por URL assinada
- Extrato e saque com KYC

**Pronto quando:** um fotógrafo real vende uma foto real sem falar com a gente.

### Etapa 2 — O diferencial (3 semanas)
- Captura de lead por QR no evento + **aviso automático no WhatsApp**
- Kit de divulgação gerado (QR em PDF, texto, story)
- Marca invisível e tela forense
- Painel com conversão por evento

**Pronto quando:** a conversão de um evento com aviso for o dobro de um sem.

### Etapa 3 — Escala (4 semanas)
- Busca por número do peito (OCR)
- Perfil público do fotógrafo e contratação
- App (PWA já pronto; avaliar wrapper nativo para `FLAG_SECURE` no Android)
- Moderação automática, denúncia, takedown
- Observabilidade: custo por evento, taxa de acerto do matching

### Etapa 4 — Produto maduro
Vídeo curto vertical da passagem, pacotes por assinatura para organizador,
white-label para fotógrafo grande, cartão de crédito.

---

## 7. Métricas que mandam

| Métrica | Meta | Por quê |
|---|---|---|
| Conversão (visitante → compra) | > 8% | Mercado fica em ~3%; é nossa tese |
| Recall do matching facial | > 95% | Foto não encontrada é venda perdida e invisível |
| Tempo até a primeira foto no ar | < 5 min | As primeiras horas concentram a venda |
| Custo de infra por 1.000 fotos | < R$ 2 | Sustenta a comissão de 10% |
| Prazo de saque | mesmo dia | É a promessa que nos diferencia |

---

## 8. Riscos

| Risco | Mitigação |
|---|---|
| **LGPD / biometria** (art. 5º II, dado sensível) | Consentimento específico na tela, embedding da selfie descartado após a busca, exclusão sob demanda, DPIA antes do lançamento |
| Conteúdo impróprio em plataforma aberta | Varredura automática no upload, denúncia com 1 clique, takedown em 24 h |
| Fraude no saque | KYC com titularidade da chave, teto diário para conta nova |
| Custo de GPU estourar | Fila com autoscaling, GPU sob demanda, teto por evento |
| Concentração em um fotógrafo | Acompanhar % do GMV; se um passa de 40%, é cliente, não negócio |
| Matching ruim em foto difícil | Medir recall por evento; fallback por número e por horário |

---

## 9. Custo estimado (primeiros meses)

| Item | Mensal |
|---|---|
| R2 (1 TB + egress zero) | ~US$ 15 |
| VPS API + Postgres | ~US$ 20 |
| GPU sob demanda | ~US$ 0,30/h, só durante o processamento |
| WhatsApp API, domínio, e-mail | ~US$ 30 |

Operável por **menos de R$ 400/mês** até ter volume. Não usar Rekognition nem banco
vetorial gerenciado no começo — é o que estoura a conta antes da receita existir.

---

## 10. Estrutura do repositório de produção

```
saibem/
├── api/            FastAPI: rotas, domínio, PSP, auth
├── worker/         filas: derivadas, faces, OCR, watermark
├── web/            Next.js: site público + área do fotógrafo
├── infra/          docker-compose, migrações, IaC
└── docs/           este plano, ADRs, contrato da API
```

O mock deste repositório é a referência de tela e de texto — **copie as decisões de
interface, não o código**.
