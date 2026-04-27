# Prompt de Implementação: Feature Gestão de HP

**Contexto:** Estamos desenvolvendo o RPGBot em Angular 20.3.0.
**Tarefa:** Implemente o serviço de estado (Zustand) e o componente de interface para o GM gerenciar o HP das fichas.

**Requisitos Técnicos:**
1. Crie uma store Zustand chamada `useEntityStore` que gerencie um array de `Entity`.
2. Implemente a função `updateHp(entityId: string, amount: number)`.
3. Crie o componente standalone `EntityCardComponent`.
4. No componente, adicione um campo de input e dois botões: "Dano" e "Cura".
5. O botão "Dano" deve enviar um valor negativo para `updateHp`.
6. O botão "Cura" deve enviar um valor positivo.
7. Garanta que o componente não use `app.module.ts` e utilize a nova sintaxe de `@if` e `@for` do Angular.

**Código de Saída:** Forneça o código Typescript e o Template HTML seguindo os padrões de Clean Code e Imutabilidade do SessionState.