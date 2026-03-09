
/**
 * ⚠️ DEPRECATION NOTICE ⚠️
 * This file is now a Facade for the new domain-specific services.
 * Please use the specific services directly in new code:
 * - AuthService
 * - OrderService
 * - TechnicianService
 * - CustomerService
 * - EquipmentService
 * - ContractService
 * - QuoteService
 * - StockService
 * - FinancialService
 * - FormService
 * - TenantService
 * - StorageService
 */

import { supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';

// Import Specific Services which are now the "Real" Services
import { AuthService } from './authService';
import { OrderService } from './orderService';
import { TechnicianService } from './technicianService';
import { CustomerService } from './customerService';
import { EquipmentService } from './equipmentService';
import { ContractService } from './contractService';
import { QuoteService } from './quoteService';
import { StockService } from './stockService';
import { FinancialService } from './financialService';
import { FormService } from './formService';
import { TenantService } from './tenantService';
import { StorageService as NexusStorageService } from './storageService'; // Renamed import to avoid conflict with var name
import { logger } from '../lib/logger';

// Legacy Storage Keys for backward compatibility
export const STORAGE_KEYS = {
  ORDERS: 'nexus_orders_db',
  USERS: 'nexus_users_db',
  TEMPLATES: 'nexus_templates_db',
  CUSTOMERS: 'nexus_customers_db',
  EQUIPMENTS: 'nexus_equipments_db',
  STOCK: 'nexus_stock_db',
  CATEGORIES: 'nexus_categories_db',
  USER_GROUPS: 'nexus_user_groups_db'
};

const getTenantKey = (key: string) => `tenant_${getCurrentTenantId() || 'default'}_${key}`;

// Helper methods that were in DataService
const getStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const data = localStorage.getItem(getTenantKey(key));
    if (!data) return defaultValue;
    return JSON.parse(data);
  } catch (e) {
    console.error("Erro ao ler storage:", e);
    return defaultValue;
  }
};

const setStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(getTenantKey(key), JSON.stringify(data));
  } catch (e) {
    console.error("Erro ao gravar storage:", e);
  }
};

export const DataService = {
  // Legacy Helpers
  STORAGE_KEYS,
  getStorage,
  setStorage,

  // 🛡️ Nexus Client Resolver (Legacy Accessor)
  // ⛔ adminSupabase REMOVIDO: impersonation não deve bypassar RLS.
  // O isolamento de tenant é garantido pelo RLS no banco.
  getServiceClient: () => {
    return supabase;
  },

  getCurrentTenantId: (): string | undefined => getCurrentTenantId(),

  forceGlobalRefresh: () => {
    console.log('🌪️ Forcing Global Refresh (Legacy)...');
    // Clear relevant legacy local keys if needed
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(getTenantKey(key)));
  },

  // Spread all specialized services
  ...AuthService,
  ...OrderService,
  ...TechnicianService,
  ...CustomerService,
  ...EquipmentService,
  ...ContractService,
  ...QuoteService,
  ...StockService,
  ...FinancialService,
  ...FormService,
  ...TenantService,
  ...NexusStorageService,
};
