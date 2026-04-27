# Projeto: RPGBot (GM-Centric VTT) - Manifesto de Visão

## Filosofia: "O Escudo do Mestre"
O RPGBot não é um simulador visual, mas um assistente cognitivo. O objetivo é reduzir a carga mental do GM.

## Stack Tecnológica Obrigatória
- **Frontend:** Angular 20.3.0 (Arquitetura Standalone, sem AppModule).
- **Gerenciamento de Estado:** Zustand (para controle leve de SessionState).
- **Comunicação:** WebSockets para sincronização Mestre -> Lobby.
- **Segurança:** Master Lore Guard (filtragem de dados sensíveis no backend).

## Regra de Ouro de Dados
1. **BaseState:** Dados imutáveis da ficha (ex: HP Máximo, Nome, Resistências).
2. **SessionState:** Dados mutáveis da sessão (ex: HP Atual, Condições Temporárias).
   - *Ação:* O combate altera apenas o SessionState.