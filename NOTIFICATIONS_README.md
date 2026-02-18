# Sistema de Notificações e Correções de ID

Esta atualização implementa um sistema completo de notificações para o aplicativo técnico e corrige o problema crítico de IDs duplicados na criação de ordens de serviço.

## 1. Correção de ID Duplicado (CRÍTICO)

**Problema Original:** O sistema tentava criar OS com um número (ex: OS-1005) que já existia, gerando erro de "duplicate key".
**Solução:** A função interna do banco de dados foi corrigida para verificar corretamente a existência do ID antes de gerar um novo.

**Como Aplicar:**
Execute o script SQL: `supabase/migrations/007_fix_order_id_generation.sql`

## 2. Sistema de Notificações

O aplicativo técnico agora suporta notificações em tempo real e agendadas.

### Funcionalidades:
- **Novas Atribuições:** Técnico recebe alerta instantâneo quando uma nova OS é atribuída.
- **Mudança de Horário:** Alerta imediato se o agendamento for alterado.
- **Lembretes Automáticos:** O app agenda lembretes locais para 1 hora e 30 minutos antes do atendimento.

### Ação Necessária (Backend):
Execute o script SQL para criar as tabelas e triggers de notificação:
`supabase/migrations/008_notifications_system.sql`

### Configuração Mobile:
O aplicativo solicitará permissão de notificações ao abrir. Certifique-se de aceitar.
Para receber Push Notifications reais (com o app fechado), é necessário configurar as credenciais do Expo Push no painel do Expo, mas o sistema já funciona com **Lembretes Locais** e **Notificações em Tempo Real** (com app aberto) sem configuração extra.

## Resumo Técnico dos Arquivos Alterados

- `supabase/migrations/007_fix_order_id_generation.sql`: Correção da função `get_next_order_id`.
- `supabase/migrations/008_notifications_system.sql`: Tabelas `notifications`, `user_push_tokens` e triggers.
- `nexus-mobile/services/notification-service.ts`: Serviço de gerenciamento de Push e Lembretes.
- `nexus-mobile/app/_layout.tsx`: Inicialização do serviço de notificação e listener Realtime.
- `nexus-mobile/app/(tabs)/index.tsx`: Agendamento automático de lembretes ao carregar OS.
- `nexus-mobile/services/order-service.ts`: Mapeamento de campos de data/hora para agendamento.
