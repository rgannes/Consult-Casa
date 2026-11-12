# VECTO Consultoria — Consult Casa

Ferramenta estática em português para planejamento financeiro imobiliário. HTML, CSS e JavaScript, sem dependências de execução. Os cenários de orçamento são hipóteses de planejamento de 150 m², **não cotações técnicas verificadas**. Nenhum dado real de cliente é incluído no código.

## Executar e verificar

Na pasta do projeto:

```sh
npm start
npm test
```

O servidor usa Python 3, porta 3000. Os testes usam apenas o test runner nativo do Node; não é necessário `npm install`. Também é possível abrir `index.html` diretamente em navegador que permita arquivos locais, mas servidor local é recomendado para comportamento consistente de armazenamento.

Para verificação adicional da interface, com Python Playwright e Chromium já instalados: `python tests/browser_smoke.py`. O teste é opcional, não instala pacotes e usa somente dados fictícios. `CHROMIUM_PATH` pode apontar para o executável instalado.

## Versão 2

- 11 grupos com metadados e subitens incluídos/adicionais.
- Métodos exclusivos de construção e contingência, sem somar a alternativa inativa.
- Patrimônio, ajuda familiar opcional, poupança, rendas líquida/brutas, despesas, reserva separada, referências de apartamentos e horizonte.
- Cenários de orçamento com confirmação antes da troca, salvamento e recuperação.
- JSON v2 com validação, backup local anterior, importação privada e migração v1 sem apagar gastos.
- Funções legadas em `finance.js` preservadas; novo motor mensal em `simulation.js`, adaptação em `planner.js` e interface em `simulation-ui.js`.

Leia o [manual de uso](docs/uso-v2.html) e a [estrutura, formatos e checklist de verificação](docs/estrutura-v2.md). Os materiais PDF/Word antigos são históricos da v1; seus exemplos não representam os novos cenários.

## Etapa 2: contrato e fluxo mensal

Cronograma completo SAC/Price até 600 parcelas (incluindo 420 meses), seguros e taxas, correção, extras para reduzir prazo/prestação, liberações e encargos de obra, limites bancário/familiar/caixa e fluxo até a última obrigação. CSV integral mesmo no resumo anual. O motor técnico original é preservado para compatibilidade. A experiência atual dos quatro caminhos usa as convenções simplificadas documentadas abaixo, sem se apresentar como proposta bancária.

Leia o [manual do motor](docs/uso-motor.html) e a [documentação técnica e roteiro de revisão](docs/etapa2-financeiro.md). A extensão `planning` mantém o formato de backup v2 e adapta arquivos antigos sem apagar orçamento, gastos ou cenários. Datas devem ser escolhidas antes de calcular. Não é CET oficial nem aprovação de crédito.

## Integração automática do orçamento

Os 11 grupos geram pagamentos únicos ou mensais, com edição manual/profissional e proteção de confirmados, pagos e fixados. Gastos vinculados substituem a previsão, inclusive em pagamentos parciais. Há reconciliação por grupo, migração de v2 e classificação explícita de pagamentos manuais antigos para evitar dupla contagem.

Leia o [manual da integração](docs/uso-orcamento-fluxo.html) e as [regras detalhadas](docs/orcamento-fluxo.md). Teste adicional no navegador: `python tests/budget_browser.py` (Playwright/Chromium já disponíveis).

## Cenários simplificados: quatro caminhos

A aba Cenários agora calcula apenas o caminho escolhido, com CET global hipotético, entrada/crédito automáticos editáveis e linhas do tempo familiares. Compras, vendas, quitação e obrigações simultâneas usam um único patrimônio. O prazo de construção inclui obra e amortização, sem acrescentar meses escondidos.

Veja o [guia curto](docs/cenarios-simples.html) e as [regras completas](docs/cenarios-simples.md). O orquestrador novo é `housing.js`; a interface é `housing-ui.js`. Os motores e dados técnicos anteriores permanecem preservados. Cronogramas antigos ficam no detalhe opcional de Orçamento. Teste adicional: `python tests/housing_browser.py`.

## Correção 1: dois caixas

`cash-ledgers.js` separa o caixa pessoal do caixa da obra e valida a conciliação mensal. Aportes próprios são finitos e limitados à disponibilidade pessoal; banco e fornecedores ficam na obra. Juros/prestações continuam pessoais. O detalhe da obra é expansível, sem novos campos técnicos ou regras de datas/financiabilidade.

Leia [dois-caixas.md](docs/dois-caixas.md). Verificação adicional: `python tests/ledgers_browser.py`.

## Privacidade

Dados ficam no `localStorage` do navegador. Exporte JSON para backup e transferência privada. Não há sincronização, analytics, API de dados ou envio automático. Não commitar nomes, configurações privadas, backups, capturas ou informações financeiras reais. O repositório e os arquivos estáticos publicados são públicos; dados escolhidos pelo usuário não devem ser colocados neles.

Esta alteração foi preparada em branch de trabalho. Não fazer merge ou publicar sem revisão.
