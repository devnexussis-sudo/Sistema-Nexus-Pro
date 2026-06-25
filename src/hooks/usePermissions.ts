// ============================================================
// src/hooks/usePermissions.ts
// 🛡️ NEXUS — Centralized Permission Hook v2.0
//
// ARQUITETURA:
//  - Hook único para checar permissões em qualquer componente
//  - "isAdmin irrestrito" APENAS para grupo "Administradores" ou auditoria
//  - Usuários SEM grupo recebem DEFAULT_PERMISSIONS (restritivas)
//  - Usuários com groupIds SEMPRE respeitam as permissões do grupo
//  - Impersonation (auditoria) = acesso total
// ============================================================

import { useAuth } from '../contexts/AuthContext';
import SessionStorage from '../lib/sessionStorage';
import { UserPermissions } from '../types';

export type MenuKey = keyof NonNullable<UserPermissions['menuAccess']>;
export type ModuleKey = 'orders' | 'customers' | 'equipments' | 'technicians' | 'quotes' | 'contracts' | 'stock' | 'forms';
export type CrudAction = 'create' | 'read' | 'update' | 'delete' | 'invoice' | 'discounts';

const checkImpersonating = (): boolean => {
  return !!SessionStorage.get('is_impersonating');
};

// Defaults de menuAccess para usuários sem permissões configuradas
const MENU_ACCESS_DEFAULTS: NonNullable<UserPermissions['menuAccess']> = {
  dashboard: true,
  orders: true,
  calendar: true,
  map: true,
  financial: false,
  quotes: true,
  stock: true,
  contracts: true,
  customers: true,
  equipments: true,
  forms: true,
  technicians: true,
  users: false,
  settings: false,
  whatsapp: false,
  solicitacoes: false,
};

// Garante que menuAccess tenha todos os campos — retrocompatibilidade
const getMenuAccess = (perms: UserPermissions): NonNullable<UserPermissions['menuAccess']> => {
  if (!perms.menuAccess) return MENU_ACCESS_DEFAULTS;
  return { ...MENU_ACCESS_DEFAULTS, ...perms.menuAccess };
};

export interface PermissionUtils {
  /** Verifica se pode acessar um menu/página específica */
  canAccessMenu: (menu: MenuKey) => boolean;
  /** Verifica se pode realizar uma ação CRUD em um módulo */
  can: (module: ModuleKey | 'financial' | 'settings' | 'manageUsers' | 'manageGroups', action?: CrudAction) => boolean;
  /** Atalho: pode criar no módulo? */
  canCreate: (module: ModuleKey) => boolean;
  /** Atalho: pode editar no módulo? */
  canEdit: (module: ModuleKey) => boolean;
  /** Atalho: pode deletar no módulo? */
  canDelete: (module: ModuleKey) => boolean;
  /** True = admin irrestrito (grupo Administradores ou auditoria) */
  isAdmin: boolean;
  /** As permissões brutas do usuário */
  permissions: UserPermissions | null;
}

export const usePermissions = (): PermissionUtils => {
  const { auth } = useAuth();
  const user = auth.user;

  // Auditoria (impersonation) → sempre irrestrito
  const impersonating = checkImpersonating();

  // 🔑 REGRA CENTRAL:
  // Um usuário é "admin irrestrito" SOMENTE se:
  //   1. É modo auditoria (impersonation), OU
  //   2. É explicitamente do grupo Administradores
  //
  // Usuários SEM grupo vinculado NÃO recebem acesso total — usam DEFAULT_PERMISSIONS.
  // Isso fecha a brecha de segurança onde um user sem grupo tinha tudo liberado.
  const hasGroupAssigned = !!(
    (user?.groupIds && user.groupIds.length > 0) ||
    user?.groupId
  );

  const isMasterAdminGroup = user?.groupName?.toLowerCase() === 'administradores';

  // Admin irrestrito = em auditoria ou faz parte do grupo mestre "Administradores"
  const isAdmin = (user && isMasterAdminGroup) || impersonating;

  const permissions: UserPermissions | null = user?.permissions ?? null;

  const canAccessMenu = (menu: MenuKey): boolean => {
    if (isAdmin) return true;

    // Vínculo direto com os cards de Privilégios/Financeiro
    if (menu === 'financial') return can('financial', 'read');
    if (menu === 'settings') return can('settings');
    if (menu === 'users') return can('manageUsers') || can('manageGroups');

    // Tem grupo mas sem permissions salvas → usa defaults
    if (!permissions) return MENU_ACCESS_DEFAULTS[menu] ?? false;
    const access = getMenuAccess(permissions);
    return access[menu] === true;
  };

  const can = (module: string, action: string = 'read'): boolean => {
    if (isAdmin) return true;
    if (!permissions) return false; // Sem permissions = sem acesso (restritivo por padrão)
    const perms = permissions as any;

    // Boolean flags (settings, manageUsers)
    if (typeof perms[module] === 'boolean') return perms[module];

    // Object with CRUD actions (orders, customers, etc.)
    if (perms[module] && typeof perms[module] === 'object') {
      return perms[module][action] === true;
    }

    return false;
  };

  const canCreate = (module: ModuleKey) => can(module, 'create');
  const canEdit = (module: ModuleKey) => can(module, 'update');
  const canDelete = (module: ModuleKey) => can(module, 'delete');

  return { canAccessMenu, can, canCreate, canEdit, canDelete, isAdmin, permissions };
};
