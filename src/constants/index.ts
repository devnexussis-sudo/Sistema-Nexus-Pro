import { OrderPriority, OrderStatus, ServiceOrder, User, UserRole } from '../types';

export const MOCK_USERS: User[] = [
  {
    id: 'admin-1',
    name: 'Paula Gerente',
    email: 'paula@nexus.pro',
    role: UserRole.ADMIN,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'
  },
  {
    id: 'tech-1',
    name: 'Roberto Refrigeração',
    email: 'roberto@nexus.pro',
    role: UserRole.TECHNICIAN,
    avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop'
  },
  {
    id: 'tech-2',
    name: 'Carlos Elétrica',
    email: 'carlos@nexus.pro',
    role: UserRole.TECHNICIAN,
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'
  }
];

const today = new Date().toISOString().split('T')[0];

export const MOCK_ORDERS: ServiceOrder[] = [
  {
    id: 'ord-1001',
    title: 'Manutenção Preventiva Trimestral',
    description: 'Realizar a limpeza dos filtros, verificação da pressão do gás e inspeção dos compressores do sistema central.',
    customerName: 'Supermercados Pão de Mel',
    customerAddress: 'Av. das Nações Unidas, 12901 - São Paulo',
    status: OrderStatus.PENDING,
    priority: OrderPriority.MEDIUM,
    operationType: 'Manutenção Preventiva',
    equipmentName: 'Chiller Carrier 30XA - Central',
    equipmentModel: '30XA Carrier Industrial',
    equipmentSerial: 'CAR-30XA-2024',
    scheduledDate: today,
    scheduledTime: '08:00',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    formId: 'f-chiller'
  },
  {
    id: 'ord-1002',
    title: 'Troca de Compressor B1',
    description: 'Compressor B1 do sistema de congelados apresentou travamento mecânico. Necessária substituição imediata.',
    customerName: 'Supermercados Pão de Mel',
    customerAddress: 'Av. das Nações Unidas, 12901 - São Paulo',
    status: OrderStatus.ASSIGNED,
    assignedTo: 'tech-1',
    priority: OrderPriority.CRITICAL,
    operationType: 'Manutenção Corretiva',
    equipmentName: 'Sistema de Congelados',
    equipmentModel: 'Bitzer Rack 4X',
    equipmentSerial: 'BITZ-4X-9988',
    scheduledDate: today,
    scheduledTime: '13:30',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 100000).toISOString(),
  }
];