
export enum UserRole {
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN'
}

export interface UserPermissions {
  // Atividades (O.S.)
  orders: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Clientes
  customers: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Ativos (Equipamentos)
  equipments: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Técnicos
  technicians: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Orçamentos
  quotes: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Contratos / Manutenção Planejada
  contracts: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Estoque e Peças
  stock: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Processos e Formulários
  forms: { create: boolean; read: boolean; update: boolean; delete: boolean };
  // Configurações e Sistema
  settings: boolean;
  manageUsers: boolean;
  accessSuperAdmin: boolean;
  // Custos e Financeiro
  financial: { read: boolean; update: boolean };
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  orders: { create: true, read: true, update: true, delete: false },
  customers: { create: true, read: true, update: true, delete: false },
  equipments: { create: true, read: true, update: true, delete: false },
  technicians: { create: true, read: true, update: true, delete: false },
  quotes: { create: true, read: true, update: true, delete: false },
  contracts: { create: true, read: true, update: true, delete: false },
  stock: { create: true, read: true, update: true, delete: false },
  forms: { create: true, read: true, update: true, delete: false },
  settings: false,
  manageUsers: false,
  accessSuperAdmin: false,
  financial: { read: false, update: false }
};

export const ADMIN_PERMISSIONS: UserPermissions = {
  orders: { create: true, read: true, update: true, delete: true },
  customers: { create: true, read: true, update: true, delete: true },
  equipments: { create: true, read: true, update: true, delete: true },
  technicians: { create: true, read: true, update: true, delete: true },
  quotes: { create: true, read: true, update: true, delete: true },
  contracts: { create: true, read: true, update: true, delete: true },
  stock: { create: true, read: true, update: true, delete: true },
  forms: { create: true, read: true, update: true, delete: true },
  settings: true,
  manageUsers: true,
  accessSuperAdmin: false,
  financial: { read: true, update: true }
};

export interface UserGroup {
  id: string;
  tenantId?: string;
  name: string;
  description: string;
  permissions: UserPermissions;
  active: boolean;
  isSystem?: boolean; // Se true, o grupo não pode ser deletado ou alterado drasticamente
}


export enum OrderStatus {
  PENDING = 'PENDENTE',
  ASSIGNED = 'ATRIBUÍDO',
  TRAVELING = 'EM DESLOCAMENTO',
  ARRIVED = 'NO LOCAL',
  IN_PROGRESS = 'EM ANDAMENTO',
  PAUSED = 'PAUSADO',
  COMPLETED = 'CONCLUÍDO',
  CANCELED = 'CANCELADO',
  BLOCKED = 'IMPEDIDO'
}

export enum OrderPriority {
  LOW = 'BAIXA',
  MEDIUM = 'MÉDIA',
  HIGH = 'ALTA',
  CRITICAL = 'CRÍTICA'
}

export enum FormFieldType {
  TEXT = 'TEXT',
  LONG_TEXT = 'LONG_TEXT',
  SELECT = 'SELECT',
  PHOTO = 'PHOTO',
  SIGNATURE = 'SIGNATURE'
}

export interface FormFieldCondition {
  fieldId: string;
  value: string;
  operator?: 'equals' | 'not_equals';
}

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[];
  condition?: FormFieldCondition;
}

export interface FormTemplate {
  id: string;
  title: string;
  targetType?: string;
  targetFamily?: string;
  serviceTypes?: string[];
  fields: FormField[];
  active: boolean;
}


export interface Tenant {
  id: string;
  slug: string;
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'suspended';
  created_at?: string;
  updated_at?: string;
  userCount?: number;
  osCount?: number;
  activeTechs?: number;
  osPrefix?: string; // e.g., 'OS-2025-'
  osStartNumber?: number; // e.g., 1000
  enabled_modules?: Record<string, boolean>;
}

export interface User {
  id: string;
  tenantId?: string; // Multi-tenancy
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatar?: string;
  active?: boolean;
  groupId?: string; // Vínculo com o grupo de permissões
  groupName?: string; // Nome do grupo para exibição
  permissions?: UserPermissions;
}

export interface UserWithPassword extends User {
  password: string;
}

export interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  fromStock?: boolean;
  stockItemId?: string;
}

export interface ServiceOrder {
  id: string;
  displayId?: string; // ID amigável (ex: OS-1234)
  publicToken?: string; // Token único para compartilhamento público
  tenantId?: string; // Multi-tenancy
  title: string;
  description: string;
  customerName: string;
  customerAddress: string;
  status: OrderStatus;
  priority: OrderPriority;
  operationType?: string;
  assignedTo?: string;
  formId?: string; // Vínculo direto com o modelo de checklist
  equipmentName?: string;
  equipmentModel?: string;
  equipmentSerial?: string;
  createdAt: string;
  updatedAt: string;
  scheduledDate: string;
  scheduledTime?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  formData?: Record<string, any>;
  items?: OrderItem[];
  showValueToClient?: boolean;
  signature?: string; // Base64 da assinatura digital
  signatureName?: string; // Nome de quem assinou
  signatureDoc?: string; // CPF/Documento de quem assinou

  // Financeiro
  billingStatus?: 'PENDING' | 'PAID';
  paymentMethod?: string;
  paidAt?: string;
  billingNotes?: string;
  linkedQuotes?: string[];

  // 📍 Fluxo de Atendimento (Check-in / Check-out / SLA)
  timeline?: {
    assignedAt?: string;      // Quando foi atribuída ao técnico
    travelStartAt?: string;   // "Iniciar deslocamento" clicado
    arrivedAt?: string;       // "Cheguei no local" clicado
    serviceStartAt?: string;  // "Iniciar serviço" clicado
    pausedAt?: string;        // Última pausa
    resumedAt?: string;       // Último resume
    completedAt?: string;     // Conclusão
    totalPausedMs?: number;   // Tempo total pausado (ms)
  };

  // 📍 Geolocalização (LGPD: somente com consentimento)
  checkinLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
  };
  checkoutLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
    timestamp: string;
  };
  pauseReason?: string; // Motivo da pausa (ex: aguardando peça)
}


export interface Customer {
  id: string;
  tenantId?: string; // Multi-tenancy
  type: 'PF' | 'PJ';
  name: string;
  document: string;
  email: string;
  phone: string;
  whatsapp: string;
  zip: string;
  state: string;
  city: string;
  address: string;
  number: string;
  complement: string;
  active: boolean;
}

export interface EquipmentFamily {
  id: string;
  tenantId?: string; // Multi-tenancy
  name: string;
  description: string;
  active: boolean;
}

export interface Equipment {
  id: string;
  tenantId?: string; // Multi-tenancy
  serialNumber: string;
  model: string;
  familyId: string;
  familyName: string;
  description: string;
  customerId: string;
  customerName: string;
  active: boolean;
  createdAt: string;
}

export interface Contract {
  id: string;
  tenantId?: string;
  pmocCode: string;
  title: string;
  description: string;
  customerName: string;
  customerAddress: string;
  status: OrderStatus;
  priority: OrderPriority;
  operationType: string;
  scheduledDate: string;
  periodicity: string;
  maintenanceDay: number;
  equipmentIds: string[];
  logs: any[];
  alertSettings: {
    enabled: boolean;
    daysBefore: number;
    frequency: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  customerName: string;
  customerAddress: string;
  title: string;
  description: string;
  items: QuoteItem[];
  totalValue: number;
  status: 'ABERTO' | 'APROVADO' | 'REJEITADO' | 'CONVERTIDO' | 'PENDENTE';
  notes?: string;
  validUntil?: string;
  linkedOrderId?: string;
  createdAt: string;
  publicToken?: string;
  // Auditoria Digital
  approvedByName?: string;
  approvalDocument?: string;
  approvalBirthDate?: string;
  approvalSignature?: string;
  approvedAt?: string;
  approvalMetadata?: any;
  approvalLatitude?: number;
  approvalLongitude?: number;

  // Financeiro
  billingStatus?: 'PENDING' | 'PAID';
  paymentMethod?: string;
  paidAt?: string;
  billingNotes?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}


export interface StockItem {
  id: string;
  tenantId?: string;
  code: string;
  externalCode?: string; // Cód. Terceiros/Fabricante
  description: string;
  category?: string;
  location: string;
  quantity: number;
  minQuantity: number;
  costPrice: number; // Valor de compra
  sellPrice: number; // Valor de venda
  freightCost?: number; // Frete
  taxCost?: number; // Impostos
  unit?: 'UN' | 'CX' | 'PCT' | 'M' | 'CM' | 'KG' | 'G' | 'L' | 'ML' | 'M2' | 'M3' | 'PAR' | 'CJ'; // Unidade de Medida Expandida
  lastRestockDate?: string;
  active: boolean;
}

export interface Category {
  id: string;
  tenantId?: string;
  name: string;
  type: 'stock' | 'service'; // To distinguish if needed later
  active: boolean;
}

export interface CashFlowEntry {
  id: string;
  tenantId: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  description: string;
  referenceId?: string;
  referenceType?: 'ORDER' | 'QUOTE';
  paymentMethod?: string;
  entryDate: string;
  createdAt: string;
  createdBy: string;
}

export interface TechStockItem {
  id: string;
  tenantId: string;
  userId: string;
  stockItemId: string;
  quantity: number;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  itemId: string;
  userId?: string;
  type: 'TRANSFER' | 'CONSUMPTION' | 'RESTOCK' | 'ADJUSTMENT';
  quantity: number;
  source: 'GENERAL' | 'TECH' | string;
  destination: 'TECH' | 'ORDER' | string;
  referenceId?: string;
  createdAt: string;
  createdBy: string;
}
