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
| `mock/index.html` | **Site navegável** — SPA com rotas por hash, estado real e sacola persistente |
| `mock/prototipo/index.html` | **Protótipo de telas** — as 12 telas lado a lado, para discutir uma de cada vez |
| `mock/img/` | Fotos de exemplo (Wikimedia Commons, licença livre) |
| `docs/PLANO.md` | **Plano do projeto de produção** — arquitetura, etapas, métricas, riscos |

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
#/entrar                  login do fotógrafo
#/criar-conta             cadastro sem documento
#/app/painel              área do fotógrafo — KPIs, gráfico, eventos
#/app/eventos             meus eventos e transições de estado
#/app/extrato             lançamentos, saldo e exportação CSV
#/app/saque               KYC no primeiro saque, depois saque direto
#/app/novo                criar evento
#/app/upload              upload e pipeline de processamento
#/app/kit                 kit de divulgação (QR, WhatsApp, story)
#/app/forense             marca invisível: marcar arquivo e rastrear vazamento
```

Tudo sob `#/app/` exige sessão: sem conta, a rota cai na tela de entrar e volta
para onde você queria ir depois do login.

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

Estrutura herdada do **Synvia Design System v2**, com a paleta trocada para azul:
navy `#07182E` na estrutura (gradiente até `#12325A`), primário `#1A5FC4`,
marca `#2B7FE8` e ciano `#4DD0FF` como primário sobre fundo escuro.
Raios 7 (campos) / 9 (botões) / 11 (ícones) / 14 (cards) / 16 (toasts) / 18 (modais).

**Verde continua existindo, mas só como semântica.** `--ok` marca sucesso — evento
no ar, pacote aplicado, venda no extrato. Cor de marca e cor de estado são coisas
diferentes, e misturar as duas é o que faz um painel perder a leitura rápida.

## Proteção de imagem

Duas camadas, com papéis diferentes.

**Marca visível (preview).** A foto do preview não é um `<img>`: é um `<canvas>` com a
marca queimada em mosaico diagonal, sob um escudo transparente que recebe o clique
direito e o arrastar. Três intensidades alternáveis na galeria. Nenhum `<img>` com a
foto existe no DOM.

**Marca invisível (arquivo vendido).** Em cada bloco 8×8 da luminância, a relação entre
dois coeficientes DCT de média frequência carrega um bit. A mensagem — 5 símbolos mais
5 bits de verificação — se repete por toda a imagem e é lida por votação majoritária.

O índice de cada bit vem da **posição do bloco na grade**, nunca da contagem de blocos
aceitos pelo filtro de variância: a recompressão faz blocos cruzarem o limiar, e um
índice sequencial desalinharia a mensagem inteira. Essa foi a diferença entre não
funcionar e funcionar.

Robustez medida (900 px, δ=28, PSNR 42 dB):

| Ataque | Resultado |
|---|---|
| JPEG qualidade 70 | código lido, 99% |
| JPEG qualidade 50 | código lido, 98% |
| Redução a 70% + JPEG | código lido, 90% (detector reancora a escala) |
| Redução a 50% + JPEG | não legível, e o detector diz isso |

Nenhuma marca invisível é inquebrável — regeneração por difusão apaga qualquer uma.
Ela existe para o caso real: o cliente que comprou e repassou o arquivo.

**O que falta para produção:** marcar no servidor (hoje o canvas recebe a foto limpa),
URL assinada com expiração, e rate limit. Em produção isto roda em Python
(`invisible-watermark`, `blind-watermark` ou TrustMark), não em JavaScript.

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

## Estado do protótipo

O mock está **completo** para o que se propõe:

- [x] Login e conta do fotógrafo
- [x] KYC no primeiro saque (CPF/CNPJ e chave PIX do mesmo titular)
- [x] Estados do evento: rascunho → processando → no ar → encerrado → arquivado
- [x] Extrato financeiro e saque
- [x] Proteção de imagem: marca visível em canvas e marca invisível rastreável
- [x] Perfil público do fotógrafo
- [x] Busca por número do peito
- [x] Paginação real da galeria (96 fotos, 24 por página)

## E agora?

O protótipo cumpriu o papel: decidiu telas, fluxos, textos, paleta e regras de
negócio. **Ele não evolui para produção** — o código de produção nasce limpo, em
outro repositório, usando este mock como referência de interface e comportamento.

O caminho está em **[`docs/PLANO.md`](docs/PLANO.md)**: arquitetura, modelo de dados,
pipeline de ingestão, etapas de entrega, métricas, riscos e custo estimado.

## Licença e créditos

Código do protótipo: uso interno, em avaliação.
Fotos: Wikimedia Commons, licenças livres — serão substituídas por material próprio.
