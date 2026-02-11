
export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'canceled';

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
}

const generateMockData = (): ServiceOrder[] => {
    const data: ServiceOrder[] = [];
    const statuses: OrderStatus[] = ['pending', 'in_progress', 'completed', 'canceled'];
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
    pending: { label: 'Pendente', color: '#f59e0b' }, // Amber
    in_progress: { label: 'Em Andamento', color: '#3b82f6' }, // Blue
    completed: { label: 'Concluída', color: '#10b981' }, // Emerald
    canceled: { label: 'Cancelada', color: '#ef4444' }, // Red
};
