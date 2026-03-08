
export type OrderStatus = 'pending' | 'assigned' | 'traveling' | 'in_progress' | 'completed' | 'canceled' | 'blocked';

export type OrderPriorityType = 'BAIXA' | 'MÉDIA' | 'ALTA' | 'CRÍTICA';

export interface ServiceOrder {
    id: string;
    customer: string;
    address: string;
    status: OrderStatus;
    date: string; // Format: DD/MM/YYYY
    description: string;
    problemReason?: string;
    contactName?: string;
    contactPhone?: string;
    latitude?: number;
    longitude?: number;
    equipment?: string;
    serialNumber?: string;
    priority?: OrderPriorityType;
    displayId?: string; // Add displayId since it's used
}

export const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    'BAIXA': { label: 'Baixa', color: '#059669', bg: '#d1fae5' },
    'MÉDIA': { label: 'Média', color: '#d97706', bg: '#fef3c7' },
    'ALTA': { label: 'Alta', color: '#ea580c', bg: '#ffedd5' },
    'CRÍTICA': { label: 'Urgente', color: '#e11d48', bg: '#ffe4e6' },
};

const generateMockData = (): ServiceOrder[] => {
    const data: ServiceOrder[] = [];
    const statuses: OrderStatus[] = ['pending', 'assigned', 'traveling', 'in_progress', 'completed', 'canceled', 'blocked'];
    const equipments = ['Roteador Cisco 2901', 'Switch HP 1920', 'Servidor Dell PowerEdge', 'ONU Huawei', 'Nobreak SMS 3000VA'];

    for (let i = 1; i <= 35; i++) {
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const day = Math.floor(Math.random() * 28) + 1;
        const month = Math.floor(Math.random() * 2) + 1; // Jan or Feb
        const formattedDay = day < 10 ? `0${day}` : day;
        const formattedMonth = month < 10 ? `0${month}` : month;
        const equipment = equipments[i % equipments.length];

        data.push({
            id: `OS-${1000 + i}`,
            customer: `Cliente ${i} Ltda`,
            address: `Rua Exemplo, ${i * 10} - SP`,
            status: status,
            date: `${formattedDay}/${formattedMonth}/2026`,
            description: `Descrição do serviço ${i}`,
            problemReason: `O cliente relatou falha na conexão de internet no setor ${i}.`,
            equipment: equipment,
            serialNumber: `SN-${10000 + i}-${(Math.random() + 1).toString(36).substring(7).toUpperCase()}`,
        });
    }
    return data;
};

export const MOCK_ORDERS: ServiceOrder[] = generateMockData();

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
    pending: { label: 'Pendente', color: '#64748b' },
    assigned: { label: 'Atribuído', color: '#3b82f6' },
    traveling: { label: 'Em Deslocamento', color: '#6366f1' },
    in_progress: { label: 'Em Andamento', color: '#f59e0b' },
    completed: { label: 'Concluída', color: '#10b981' },
    canceled: { label: 'Cancelada', color: '#6b7280' },
    blocked: { label: 'Impedida', color: '#f43f5e' },
};
