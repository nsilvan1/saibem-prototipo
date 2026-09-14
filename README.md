# Saibem

Marketplace de fotos de evento com busca por reconhecimento facial.
Você não procura sua foto — ela acha você.

> **Protótipo em avaliação.** Todos os dados, valores, nomes e métricas são fictícios.
> As fotos são ilustrativas, do Wikimedia Commons sob licença livre.

## O que é

Fotógrafo de evento tira milhares de fotos de desconhecidos e não consegue vendê-las:
não sabe quem é quem, negocia no direct, manda arquivo na mão e cobra na unha.
O Saibem automatiza esse funil — o fotógrafo publica o evento, a pessoa manda uma
selfie e recebe só as fotos em que aparece, paga no PIX e baixa na hora.

Modelo: marketplace self-serve e horizontal. Qualquer fotógrafo cria o próprio evento
(corrida, jiu-jítsu, formatura, festa) sem aprovação. Comissão de **10% fixo**, sem
mensalidade, sem taxa de upload, saque PIX no mesmo dia.

## O que tem aqui

| Caminho | O que é |
|---|---|
| `index.html` | **Site navegável** — SPA com rotas por hash, estado real e sacola persistente |
| `prototipo/index.html` | **Protótipo de telas** — as 12 telas lado a lado, para discutir uma de cada vez |
| `img/` | Fotos de exemplo (Wikimedia Commons, licença livre) |

Nenhuma dependência, nenhum build: HTML, CSS e JavaScript puro. Abre no navegador e roda.

### Rotas do site

```
#/                        início
#/eventos                 busca e filtros por modalidade e cidade
#/e/:slug                 página do evento (galeria + lightbox)
#/e/:slug/selfie          busca por rosto (com consentimento LGPD)
#/e/:slug/minhas          fotos encontradas
#/sacola                  carrinho com regra de pacote
#/pagamento               checkout PIX
#/pedido                  downloads
#/fotografos              landing de captação + calculadora de repasse
#/privacidade             política de dados biométricos
#/app/painel              área do fotógrafo — KPIs, gráfico, eventos
#/app/novo                criar evento
#/app/upload              upload e pipeline de processamento
#/app/kit                 kit de divulgação (QR, WhatsApp, story)
```

### O que já funciona de verdade

- Navegação por URL com histórico (voltar/avançar do navegador)
- Busca e filtros combinados, com contador e estado vazio
- Consentimento LGPD travando a busca por rosto até ser aceito
- Sacola persistente em `localStorage`, agrupada por evento
- **Regra de preço de pacote aplicada sozinha** quando compensa
- Lightbox com navegação por teclado
- Gráfico de vendas com tooltip e rótulo direto no pico
- Tema claro e escuro

## Design system

Construído sobre o **Synvia Design System v2**:
petróleo `#082423` na estrutura, primário `#0F5C4E`, verde `#21A84E`,
limão `#43E887` como primário sobre fundo escuro.
Raios 7 (campos) / 9 (botões) / 11 (ícones) / 14 (cards) / 16 (toasts) / 18 (modais).

## Arquitetura pretendida (produção)

```
Uploader  ──►  Cloudflare R2 (egress zero)
                    ├──► worker: preview 1200px + marca d'água
                    └──► worker: InsightFace → embedding 512d
                                     ↓
                        pgvector (HNSW), particionado por evento
                                     ↓
       selfie ──► embedding ──► k-NN ──► PIX com split ──► original assinado
```

Decisões que sustentam o custo: R2 pelo egress zero, InsightFace self-hosted em vez de
API por imagem, pgvector em vez de banco vetorial dedicado (a busca acontece dentro de
um único evento), e o original nunca servido antes do pagamento.

## Próximos passos

- [ ] Login e conta do fotógrafo
- [ ] KYC no primeiro saque (CPF/CNPJ e chave PIX do mesmo titular)
- [ ] Estados do evento: rascunho → processando → no ar → encerrado → arquivado
- [ ] Extrato financeiro e saque
- [ ] Perfil público do fotógrafo
- [ ] Busca por número do peito (OCR)
- [ ] Paginação real da galeria

## Licença e créditos

Código do protótipo: uso interno, em avaliação.
Fotos: Wikimedia Commons, licenças livres — serão substituídas por material próprio.
