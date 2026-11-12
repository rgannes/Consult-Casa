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

Cronograma completo SAC/Price até 600 parcelas (incluindo 420 meses), seguros e taxas, correção, extras para reduzir prazo/prestação, liberações e encargos de obra, limites bancário/familiar/caixa e fluxo até a última obrigação. CSV integral mesmo no resumo anual. Os quatro caminhos imobiliários são apresentados como **comparações em preparação**, sem resultados completos ainda validados.

Leia o [manual do motor](docs/uso-motor.html) e a [documentação técnica e roteiro de revisão](docs/etapa2-financeiro.md). A extensão `planning` mantém o formato de backup v2 e adapta arquivos antigos sem apagar orçamento, gastos ou cenários. Datas devem ser escolhidas antes de calcular. Não é CET oficial nem aprovação de crédito.

## Privacidade

Dados ficam no `localStorage` do navegador. Exporte JSON para backup e transferência privada. Não há sincronização, analytics, API de dados ou envio automático. Não commitar nomes, configurações privadas, backups, capturas ou informações financeiras reais. O repositório e os arquivos estáticos publicados são públicos; dados escolhidos pelo usuário não devem ser colocados neles.

Esta alteração foi preparada em branch de trabalho. Não fazer merge ou publicar sem revisão.
