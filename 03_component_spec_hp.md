### Arquivo 3: `03_component_spec_hp.md`
Especificação detalhada da funcionalidade solicitada: Adicionar/Remover vida.

```markdown
# Especificação de Componente: HP Controller (GM View)

## Funcionalidade
O GM deve ser capaz de manipular o HP das entidades de forma rápida através de um input numérico e botões de ação.

## Comportamento Esperado
1. **Input de Valor:** Um campo numérico para definir a quantidade de HP.
2. **Botão "Cura" (+):** Soma o valor do input ao `currentHp` do `sessionState`. 
   - *Validação:* Não ultrapassar `baseState.maxHp`.
3. **Botão "Dano" (-):** Subtrai o valor do input do `currentHp`.
   - *Assistência:* O sistema deve destacar se a entidade possui "Resistência" ou "Fraqueza" ao tipo de dano selecionado antes da aplicação.

## Implementação Angular 20 (Standalone)
- Criar um componente `HpManagerComponent`.
- Utilizar `signals` para reatividade local.
- Integrar com a Store do Zustand para persistir a mudança no `SessionState`.

## UI/UX (Tailwind Sugestão)
- Botão de Dano: `bg-red-600`
- Botão de Cura: `bg-green-600`
- Feedback visual imediato no valor do HP.