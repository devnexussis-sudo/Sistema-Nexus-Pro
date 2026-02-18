# Resumo das Alterações - Fluxo de Atendimento

## Funcionalidades Implementadas

1.  **Novos Status de Ordem**:
    -   `EM DESLOCAMENTO`: Quando o técnico sai para o atendimento.
    -   `NO LOCAL`: Quando o técnico chega ao destino (Check-in).
    -   `PAUSADO`: Quando o serviço é interrompido (com motivo obrigatório).

2.  **Timeline & SLA**:
    -   Registro automático de horários: `travelStartAt`, `arrivedAt`, `serviceStartAt`, `pausedAt`, `completedAt`.

3.  **Geolocalização (LGPD)**:
    -   Captura de coordenadas GPS (Latitude/Longitude) no início do deslocamento e na chegada.
    -   Requer consentimento do navegador/dispositivo.

4.  **Interface do Técnico (UI)**:
    -   **Action Bar Inteligente**: Botões grandes e contextuais no rodapé da OS.
    -   Feedback visual de carregamento e captura de GPS.
    -   Opção de "Pausar" com justificativa.
    -   Filtros de status atualizados no Dashboard.

## ⚠️ Ação Necessária: Banco de Dados

Para que o novo fluxo funcione, você precisa atualizar o banco de dados.

1.  Localize o arquivo de migração criado:
    `supabase/migrations/006_attendance_flow.sql`

2.  Execute este script no seu banco de dados Supabase (via SQL Editor no painel do Supabase ou CLI).
    -   Ele cria as colunas `timeline` e `location` (JSONB).
    -   Ele atualiza as regras de status permitidos.

**Sem essa atualização, o app pode dar erro ao tentar salvar as novas informações.**
