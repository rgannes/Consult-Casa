# VECTO Consultoria — estrutura e verificação da versão 2

Implementação em branch de trabalho, sem merge ou publicação automática. HTML/CSS/JavaScript sem bibliotecas de execução. `finance.js` e seus testes originais não foram alterados.

## Uso e regras financeiras

Os valores de patrimônio, renda, despesas, ajuda, poupança, reserva e apartamentos começam em **zero**. Nenhuma informação real de cliente faz parte do projeto. Os valores dos cenários de obra são exclusivamente hipóteses fornecidas para planejamento; não são cotações técnicas verificadas.

- `cash`: patrimônio inicial disponível informado, sem venda presumida de imóveis.
- `familyHelp` / `includeFamilyHelp`: ajuda opcional, sempre condicionada à confirmação. A interface mostra também recursos sem ajuda.
- `monthlySavings`: aporte médio mensal já líquido das despesas. Não se soma novamente renda menos despesas.
- `income`: renda líquida familiar; `grossIncome1` e `grossIncome2`: rendas brutas comprováveis separadas, sem nomes. Não representam aprovação de crédito nem substituem análise bancária.
- `essential`: despesas familiares mensais. Há aviso quando a poupança supera renda líquida menos despesas.
- `preservedReserve` / `reserveAlreadyExcluded`: se a reserva já está fora do patrimônio, a dedução é **zero**. Caso contrário, desconta-se uma única vez, limitada pelo caixa; insuficiência da reserva gera aviso.
- `currentApartment` e `largerApartment`: referências patrimoniais. A diferença é exibida, mas não é receita de venda, valor líquido disponível ou orçamento de troca com impostos e corretagem.
- `horizonMonths`: horizonte da poupança (0–600 meses, inteiro). `delay` continua sendo o horizonte independente do estresse de custos.

Fórmulas:

```
dedução da reserva = reservaJáExcluída ? 0 : reservaPreservada
recursos hoje sem ajuda = máximo(0, patrimônio − dedução)
recursos hoje = recursos hoje sem ajuda + (incluirAjuda ? ajuda : 0)
poupança futura = poupançaMensal × horizonteEmMeses
recursos no horizonte = recursos hoje + poupança futura
```

A projeção não presume rentabilidade, inflação da renda, aquisição/venda dos apartamentos, pagamentos intermediários da obra ou poupança disponível antes de ser efetivamente acumulada. A reserva familiar não é um 12º custo da casa. Custos do crédito permanecem separados do orçamento técnico; não subtrair a reserva de novo nos resultados de financiamento.

## Os 11 grupos

Cada grupo possui `id` estável, `label`, `value` (valor-base), `description`, `source`, `referenceDate`, `status`, `notes` e `subitems`. `status` aceita `estimado`, `cotado`, `contratado` e `pago`; é metadado do orçamento e não cria automaticamente registros de gastos.

| Grupo | Econômico | Intermediário | Elevado |
|---|---:|---:|---:|
| Terreno | 250.000 | 300.000 | 350.000 |
| Documentação e impostos | 10.000 | 13.000 | 17.000 |
| Estudos preliminares | 6.000 | 9.000 | 14.000 |
| Projetos arquitetônicos e complementares | 30.000 | 52.000 | 85.000 |
| Regularizações e licenças | 6.000 | 12.000 | 20.000 |
| Preparação do terreno | 60.000 | 135.000 | 260.000 |
| Construção da residência | 600.000 | 750.000 | 900.000 |
| Áreas externas | 25.000 | 50.000 | 90.000 |
| Mobiliário e eletrodomésticos | 60.000 | 115.000 | 195.000 |
| Despesas de conclusão | 8.000 | 15.000 | 25.000 |
| Contingência da obra | 66.000 | 88.500 | 116.000 |
| **Total (R$)** | **1.121.000** | **1.539.500** | **2.072.000** |

Área de referência: **150 m²**. As três hipóteses iniciam em modo área, com R$ 4.000, R$ 5.000 ou R$ 6.000/m², e contingência **manual**, para reproduzir exatamente os valores fornecidos, sem inferir uma base percentual que não foi especificada. A hipótese inicial selecionada é intermediária.

### Inclusões, subitens e construção

O valor-base de um grupo é uma proposta/estimativa agregada. Subitens com `includedInGroup: true` apenas detalham esse valor e **não são somados**. Ao desmarcar a inclusão, o subitem passa a ser adicional. Subitens começam incluídos, com valor zero; classificar explicitamente antes de somar.

Na construção, apenas um método é ativo:

- `constructionMode: "area"`: `area × m2` substitui o valor-base da proposta global;
- `constructionMode: "global"`: usa `groups[6].value`, sem somar `area × m2`.

Subitens adicionais são somados à base ativa nos dois modos. O valor do método inativo é guardado para troca futura, mas não compõe o total. Custos em propostas de grupos diferentes ainda precisam de revisão humana: o aplicativo não identifica semanticamente duplicidades entre contratos. Use as observações para marcar exclusões.

### Contingência

- `contingencyMode: "manual"`: usa `groups[10].value`.
- `contingencyMode: "percent"`: usa `contingencyPercent / 100 × soma dos grupos em contingencyBaseIds`.

A seleção da base está visível; inicialmente inclui todos os grupos sem terreno e sem contingência. Grupos selecionados entram com seus adicionais. A própria contingência nunca pode ser selecionada, nem um grupo entrar duas vezes na base. Subitens adicionais da contingência são acrescidos ao resultado do método ativo e estão identificados na tela. O manual inativo não entra no total percentual. Para reproduzir literalmente uma contingência percentual, não adicione subitens extras a esse grupo.

## Cenários, personalização e gastos

Uma edição no orçamento marca o cenário como personalizado, sem reaplicar uma tabela de referência. Edições financeiras não substituem orçamento. Trocar para uma hipótese predefinida exige confirmação e salva o estado anterior com nome/data para recuperação; cancelamento mantém os dados. Até 30 cenários locais: ao atingir o limite, a troca é impedida até excluir ou exportar cenários; não se remove o mais antigo silenciosamente.

Recuperar um cenário restaura premissas e orçamento, **mantendo todos os gastos atuais**, inclusive registrados após o salvamento. Restaurar um **backup JSON completo** substitui também gastos e lista de cenários, após confirmação e backup local anterior. A troca de hipótese não altera gastos nem premissas financeiras.

## Persistência, backup e migração

`model.js` concentra regras, validação e funções de persistência testáveis. `app.js` lida com DOM, interação e arquivos escolhidos pelo usuário.

- Dados atuais: `consult-casa-v2`, no `localStorage` da origem do site.
- Backup anterior a operações destrutivas: `consult-casa-backup-v2`.
- Originais v1: `consult-casa-v1`, mantidos intactos após migração.
- Original corrompido recuperado com autorização explícita: `consult-casa-recovery-original-v2`, disponível em **Baixar dados locais originais**.

No primeiro carregamento, se não há v2 e existe v1, o aplicativo migra automaticamente e salva v2. Mantém total, taxa de contingência, custos, gastos (ID, categoria textual original, descrição, data, situação e valor) e premissas compatíveis. Acrescenta `groupId` aos gastos para agregação nova. Custos antigos adicionais viram subitens adicionais, com fonte de migração. Categorias desconhecidas são conservadas em despesas de conclusão para revisão, sem descarte.

A reserva v1 é convertida de `essential × emergencyMonths`, com `reserveAlreadyExcluded: false`, mantendo o significado financeiro antigo. Não é possível inferir se o usuário antigo já tinha retirado essa reserva: revisar a marcação após migrar. A classificação de engenharia/gestão e seguro vai para construção; aluguel e mudança para conclusão, com descrição original conservada. É uma classificação inicial, não validação tributária ou técnica.

A validação rejeita tipos incorretos, valores negativos/não finitos, ausência de campos críticos, grupos ausentes/reordenados, métodos/status inválidos, prazos inválidos, datas inválidas, base duplicada/recursiva e cenários aninhados. Zero é aceito em valores financeiros e de orçamento; prazos contratuais exigem ao menos um mês. Arquivos na interface têm limite de 10 MB, 30 cenários e 50 mil gastos. Campos opcionais ausentes na migração v1 e em configurações parciais recebem valores-padrão; backups v2 precisam do formato completo.

Arquivo inválido não substitui o estado existente. Se o armazenamento está cheio ou indisponível, a edição não é confirmada e a interface avisa; exporte antes de liberar espaço. Um v2 corrompido não é sobrescrito automaticamente. Para recuperar:

1. Use **Baixar dados locais originais** e guarde o bruto em local privado.
2. Importe um backup válido ou use **Restaurar backup local anterior**.
3. Confirme a restauração e, se solicitado, o arquivamento local do original inválido.

Se já houver um original corrompido arquivado, outra recuperação que o sobrescreveria é bloqueada: exporte o original e procure assistência antes de remover a chave arquivada. A chave v1 não é removida pelo aplicativo. Backups locais ficam na mesma origem e não sobrevivem necessariamente à limpeza do navegador; exporte arquivos regularmente. Não há backup externo ou criptografia própria.

## Formatos JSON

Backup completo (use o botão de exportação, em vez de montar o estado manualmente):

```json
{"type":"consult-casa-backup","version":2,"state":{"schemaVersion":2,"...":"todos os campos validados"}}
```

O trecho acima é ilustrativo, não um arquivo importável. Backups antigos `{ "version": 1, "state": ... }` continuam aceitos.

Configuração inicial privada parcial, exemplo **fictício** importável:

```json
{
  "type": "consult-casa-config",
  "version": 2,
  "config": {
    "cash": 0,
    "familyHelp": 0,
    "includeFamilyHelp": false,
    "monthlySavings": 0,
    "income": 0,
    "grossIncome1": 0,
    "grossIncome2": 0,
    "essential": 0,
    "preservedReserve": 0,
    "reserveAlreadyExcluded": true,
    "currentApartment": 0,
    "largerApartment": 0,
    "horizonMonths": 12
  }
}
```

Use **Baixar modelo de configuração privada** para um arquivo completo e edite somente em local privado. A configuração é mesclada com os padrões, não com os parâmetros antigos: campos omitidos retornam ao padrão. A importação inicial pela interface mantém gastos e cenários salvos atuais e avisa antes de substituir orçamento e premissas. Ela não aceita propriedades arbitrárias, nomes de clientes, `expenses`, `savedScenarios` ou troca de versão; para restaurar esses dados, use backup completo.

Não commitar configurações, backups, capturas ou arquivos com dados de clientes. `.gitignore` contém convenções para arquivos locais privados; isso não substitui a revisão de `git status` e não remove dados já versionados.

## Limites desta etapa

O motor de financiamento permanece inalterado. A adaptação apenas entrega a ele o novo orçamento sem terreno/contingência conforme o cenário. Continuam valendo as limitações de CET simplificado, medições bancárias, seguros fixos, indexação hipotética e lance de consórcio sem abatimento futuro. Não foram adicionadas regras bancárias de comprometimento da renda bruta ou modelo de venda/troca de apartamentos. As hipóteses de custos e classificações migradas exigem revisão profissional.

Os PDFs/Word antigos em `docs/` permanecem como material histórico da versão 1, com exemplo de 120 m²; não foram apresentados como documentação dos novos valores. O manual da versão 2 e este documento têm precedência para regras e operação atuais.

## Verificação

```sh
npm test
node --check app.js
node --check model.js
npm start
```

Com Python Playwright e Chromium **já disponíveis**, execute também `python tests/browser_smoke.py`; não é dependência do site nem de `npm test`. `CHROMIUM_PATH` permite informar um executável instalado. O teste inicia servidor temporário, usa dados fictícios em perfil temporário, não lê clientes e não publica nada.

Checklist manual:

1. Abra `index.html` via servidor local; confirme 11 grupos e total intermediário R$ 1.539.500.
2. Patrimônio 100.000 e reserva 20.000: com “já fora”, disponível 100.000; desmarcando, 80.000. Ajuda 10.000: só entra se marcada. Poupança 1.000 por 12 meses: acrescenta 12.000 uma única vez.
3. Construção por área: 200 m² × 5.000 = 1.000.000; troque para global: volta ao valor global guardado, sem somar os dois.
4. Crie subitem de 1.000 incluído: total não muda; desmarque a inclusão: acrescenta 1.000. Edite fonte/data/status e recarregue para conferir persistência.
5. Contingência percentual: marque apenas construção e preparação; confira a base explícita. Modo manual: mudar percentual não muda o total.
6. Modifique uma hipótese, tente outra e cancele: preserve o personalizado. Confirme a troca, depois recupere o cenário anterior.
7. Registre gasto, recarregue, recupere cenário e confira que o gasto continua. Exporte JSON, importe-o e teste restauração de backup anterior.
8. Importe configuração inicial privada com valores fictícios; confirme que os gastos continuam. Tente JSON inválido: nada deve mudar.
9. Importe backup v1 fictício e confira total, rubricas e gastos migrados; exporte de novo em v2.
10. Compare SAC e Price e exporte o cronograma CSV. Verifique em tela pequena e confirme que não há requisições externas com dados financeiros.

Não fazer merge, push para `main` ou publicação sem revisão do usuário.
