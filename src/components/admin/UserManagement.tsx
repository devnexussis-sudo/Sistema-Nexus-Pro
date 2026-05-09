import React, { useState, useEffect } from 'react';
import * as reactWindow from 'react-window';
const List = reactWindow.FixedSizeList || (reactWindow as any).default?.FixedSizeList || (reactWindow as any).FixedSizeList;
import { useGroupStore } from '../../store/groupStore';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Users, Search, ShieldCheck, Mail, Lock,
  UserPlus, X, Save, Edit3, Trash2, Key,
  LayoutDashboard, ClipboardList, FileText,
  UserCheck, Box, Building2, Settings, ShieldAlert,
  ArrowLeft, Filter, Calendar, FolderTree,
  ChevronDown, Check, Package, Workflow, CalendarClock, ChevronLeft
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { DataService } from '../../services/dataService';
import { AuthService } from '../../services/authService';
import { TenantService } from '../../services/tenantService';
import { useUsers, useUserGroups } from '../../hooks/nexusHooks';
import { User, UserRole, UserPermissions, UserGroup, DEFAULT_PERMISSIONS, ADMIN_PERMISSIONS } from '../../types';
import { useI18n } from '../../i18n/I18nContext';

const PermissionEditor = ({ perms = DEFAULT_PERMISSIONS, onUpdate, title, subtitle, onBack, disabled = false, linkedUsers }: { perms: UserPermissions, onUpdate: (p: UserPermissions) => void, title: string, subtitle: string, onBack: () => void, disabled?: boolean, linkedUsers?: User[] }) => {
  const [activeTab, setActiveTab] = React.useState<'permissions' | 'users'>('permissions');
  const modules = [
    { id: 'orders', label: 'Ordens de Serviço (O.S.)', icon: ClipboardList },
    { id: 'customers', label: 'Cadastro de Clientes', icon: Building2 },
    { id: 'equipments', label: 'Inventário de Ativos', icon: Box },
    { id: 'technicians', label: 'Equipe Técnica', icon: UserCheck },
    { id: 'quotes', label: 'Orçamentos e Vendas', icon: FileText },
    { id: 'contracts', label: 'Contratos e PMOC', icon: CalendarClock },
    { id: 'stock', label: 'Estoque de Peças', icon: Package },
    { id: 'forms', label: 'Processos e Checklists', icon: Workflow },
  ];

  return (
    <div className="p-8 space-y-8 animate-fade-in flex flex-col h-full bg-slate-50/30 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-[#1c2d4f] transition-all shadow-sm">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-medium text-slate-900 tracking-tight leading-none">{title}</h1>
            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {linkedUsers && (
            <div className="flex bg-white/60 p-1 rounded-xl border border-[#1c2d4f]/10 shadow-sm shrink-0">
              <button
                onClick={() => setActiveTab('permissions')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'permissions' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <ShieldCheck size={14} /> <span className="whitespace-nowrap">Permissões de Acesso</span>
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'users' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <Users size={14} /> <span className="whitespace-nowrap">Usuários Vinculados ({linkedUsers.length})</span>
              </button>
            </div>
          )}
          {disabled && (
            <div className="bg-amber-50 border border-amber-200 text-amber-600 px-4 py-2 rounded-xl flex items-center gap-2">
              <ShieldCheck size={16} />
              <span className="text-[10px] font-bold">Perfil Master Protegido</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar pr-2">
        {activeTab === 'permissions' ? (
          <>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-[9px] font-bold text-slate-400 tracking-[0.2em] uppercase text-center border-b border-slate-200">
                  <th className="px-6 py-4 text-left">Módulo do Sistema</th>
                  <th className="px-4 py-4 w-24">Consultar</th>
                  <th className="px-4 py-4 w-24">Criar Novo</th>
                  <th className="px-4 py-4 w-24">Editar</th>
                  <th className="px-4 py-4 w-24">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <tr key={mod.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0 group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-slate-100 rounded-xl text-slate-500 group-hover:bg-[#1c2d4f] group-hover:text-white transition-colors">
                          <mod.icon size={16} />
                        </div>
                        <span className="text-[12px] font-bold text-slate-700">{mod.label}</span>
                      </div>
                    </td>
                    {[
                      { key: 'read' },
                      { key: 'create' },
                      { key: 'update' },
                      { key: 'delete' },
                    ].map(action => {
                      const isChecked = (perms as any)[mod.id]?.[action.key] || false;
                      return (
                        <td key={action.key} className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              if (disabled) return;
                              const newPerms = { ...perms };
                              const modulePerms = (newPerms as any)[mod.id] || { create: false, read: false, update: false, delete: false };
                              (newPerms as any)[mod.id] = { ...modulePerms, [action.key]: !modulePerms[action.key] };
                              onUpdate(newPerms);
                            }}
                            className={`w-11 h-6 rounded-full relative transition-all mx-auto block focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#10b981] ${isChecked ? 'bg-[#10b981]' : 'bg-slate-200'} ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isChecked ? 'left-[26px]' : 'left-1'}`} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-emerald-50/50 flex items-center gap-4">
              <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600"><Building2 size={16} /></div>
              <h3 className="font-bold text-slate-800 text-[13px]">Financeiro e Custos</h3>
            </div>
            <div className="p-3">
              {[
                { key: 'read', label: 'Visualizar Custos e Faturamento' },
                { key: 'update', label: 'Alterar Tabelas de Preço' },
              ].map((action) => {
                const isChecked = perms.financial?.[action.key as keyof typeof perms.financial] || false;
                return (
                  <div key={action.key} className="flex items-center justify-between p-3 px-4 hover:bg-slate-50 rounded-2xl transition-colors">
                    <span className="text-[12px] font-bold text-slate-600">{action.label}</span>
                    <button
                      onClick={() => {
                        if (disabled) return;
                        const newPerms = { ...perms };
                        if (!newPerms.financial) newPerms.financial = { read: false, update: false };
                        newPerms.financial = { ...newPerms.financial, [action.key]: !newPerms.financial[action.key as keyof typeof perms.financial] };
                        onUpdate(newPerms);
                      }}
                      className={`w-11 h-6 rounded-full relative transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${isChecked ? 'bg-emerald-500' : 'bg-slate-200'} ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isChecked ? 'left-[26px]' : 'left-1'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-amber-50/50 flex items-center gap-4">
              <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600"><ShieldAlert size={16} /></div>
              <h3 className="font-bold text-slate-800 text-[13px]">Privilégios de Sistema</h3>
            </div>
            <div className="p-3">
              {[
                { key: 'settings', label: 'Acesso a Configurações Globais', icon: Settings },
                { key: 'manageUsers', label: 'Gestão de Usuários e Grupos', icon: ShieldCheck },
              ].map((item) => {
                const isChecked = (perms as any)[item.key] || false;
                return (
                  <div key={item.key} className="flex items-center justify-between p-3 px-4 hover:bg-slate-50 rounded-2xl transition-colors">
                    <div className="flex items-center gap-3">
                      <item.icon size={16} className="text-slate-400" />
                      <span className="text-[12px] font-bold text-slate-600">{item.label}</span>
                    </div>
                    <button
                      onClick={() => {
                        if (disabled) return;
                        const newPerms = { ...perms, [item.key]: !isChecked };
                        onUpdate(newPerms);
                      }}
                      className={`w-11 h-6 rounded-full relative transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500 ${isChecked ? 'bg-amber-500' : 'bg-slate-200'} ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${isChecked ? 'left-[26px]' : 'left-1'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden h-full">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-[9px] font-bold text-slate-400 tracking-[0.3em] uppercase text-center border-b border-slate-200">
                  <th className="px-6 py-4 text-left">Administrador / Identidade</th>
                  <th className="px-4 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {linkedUsers && linkedUsers.length > 0 ? linkedUsers.map(user => (
                  <tr key={user.id} className={`hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0 group ${!user.active ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="shrink-0">
                          <div className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex items-center justify-center transition-all group-hover:text-[#1c2d4f] group-hover:bg-white group-hover:border-[#1c2d4f]/20 group-hover:shadow-sm">
                            <Users size={18} />
                          </div>
                        </div>
                        <div className="truncate">
                          <p className="text-slate-900 tracking-tighter text-[13px] font-bold truncate max-w-[250px]">{user.name}</p>
                          <p className="text-[11px] font-bold text-slate-400 mt-0.5 truncate max-w-[250px]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold border transition-all ${user.active ? 'bg-primary-50 text-primary-700 border-primary-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={2} className="py-24 text-center">
                      <Users size={48} className="mx-auto text-slate-200 mb-4 opacity-50" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Nenhum usuário vinculado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export const UserManagement: React.FC = () => {
  const { t } = useI18n();

  const isMasterMode = window.location.pathname === '/master';
  const {
    users,
    groups,
    setUsers,
    setGroups,
    isGroupModalOpen,
    setIsGroupModalOpen,
    editingGroup,
    setEditingGroup,
    selectedGroup,
    setSelectedGroup,
    activeSubView,
    setActiveSubView,
    isSaving,
    setIsSaving,
    groupToDelete,
    setGroupToDelete,
    selectedUser,
    setSelectedUser,
  } = useGroupStore();
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    active: true,
    groupIds: [],
    permissions: { ...DEFAULT_PERMISSIONS }
  });
  const [groupSearch, setGroupSearch] = useState('');

  const [groupFormData, setGroupFormData] = useState<Partial<UserGroup>>({
    name: '',
    description: '',
    active: true,
    permissions: { ...DEFAULT_PERMISSIONS }
  });

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  // 🔄 Migração para React Query (Cache + Resiliência)
  const { data: usersData, isLoading: isUsersLoading, refetch: refetchUsers } = useUsers();
  const { data: groupsData, isLoading: isGroupsLoading, refetch: refetchGroups } = useUserGroups();

  useEffect(() => {
    if (usersData) {
      // Filtra para mostrar apenas ADMINS nesta tela por segurança, se necessário
      const admins = usersData.filter(u => u.role === UserRole.ADMIN || u.role === 'SUPER_ADMIN' as any);
      setUsers(admins.length > 0 ? admins : usersData);
    }
  }, [usersData]);

  useEffect(() => {
    if (groupsData) {
      setGroups(groupsData);
    }
  }, [groupsData]);

  // Função legado de refresh mantida para compatibilidade com botões de ação
  const loadData = async () => {
    await Promise.all([refetchUsers(), refetchGroups()]);
  };

  useEffect(() => {
    if (isModalOpen && !editingUser) {
      setFormData({
        name: '',
        email: '',
        active: true,
        groupIds: [],
        permissions: { ...DEFAULT_PERMISSIONS }
      });
    }
  }, [users, groups, searchTerm, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, activeTab]);

  const handleDeleteUser = async (id: string) => {
    try {
      await TenantService.deleteUser(id);
      await loadData();
      alert("✅ Administrador removido com sucesso!");
    } catch (error: any) {
      console.error("Failed to delete user:", error);
      alert("ERRO AO REMOVER USUÁRIO:\n" + error.message);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Mescla permissões de todos os grupos selecionados
      const selectedGroupIds = formData.groupIds || [];
      let userPermissions = formData.permissions || DEFAULT_PERMISSIONS;
      if (selectedGroupIds.length > 0) {
        const primaryGroup = groups.find(g => g.id === selectedGroupIds[0]);
        if (primaryGroup) userPermissions = primaryGroup.permissions;
      }

      const dataToSave = {
        ...formData,
        groupId: selectedGroupIds[0] || '', // legado: mantém o primeiro grupo
        groupIds: selectedGroupIds,
        permissions: userPermissions,
      };

      if (editingUser) {
        await TenantService.updateUser({ ...dataToSave, id: editingUser.id } as User);
      } else {
        const newUser = {
          ...dataToSave,
          role: UserRole.ADMIN,
          avatar: '',
          tenantId: DataService.getCurrentTenantId()
        } as any;
        await TenantService.createUser(newUser);
      }

      await loadData();
      setIsModalOpen(false);
      setEditingUser(null);
      alert("✅ Administrador processado com sucesso!");
    } catch (error: any) {
      console.error("Failed to save user:", error);
      alert("ERRO AO SALVAR USUÁRIO:\n" + error.message);
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        await TenantService.updateUserGroup({ ...groupFormData, id: editingGroup.id } as UserGroup);
      } else {
        await TenantService.createUserGroup({ ...groupFormData, tenantId: DataService.getCurrentTenantId() } as any);
      }
      await loadData();
      setIsGroupModalOpen(false);
      setEditingGroup(null);
      alert("✅ Grupo de acesso salvo!");
    } catch (error: any) {
      alert("Erro ao salvar grupo: " + error.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;

    try {
      setIsSaving(true);
      await TenantService.deleteUserGroup(groupToDelete.id);
      await loadData();
      setGroupToDelete(null);
      alert("✅ Grupo removido com sucesso!");
    } catch (error: any) {
      alert("Erro ao remover grupo: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePermissions = async (userId: string, newPerms: UserPermissions) => {
    try {
      const userToUpdate = users.find(u => u.id === userId);
      if (!userToUpdate) return;

      const updatedUser = { ...userToUpdate, permissions: newPerms };
      await TenantService.updateUser(updatedUser);

      await loadData();
      if (selectedUser?.id === userId) {
        setSelectedUser(updatedUser);
      }
    } catch (error: any) {
      console.error("Failed to update permissions:", error);
      alert("Erro ao atualizar permissões: " + error.message);
    }
  };



  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? u.active : !u.active);
    return matchesSearch && matchesStatus;
  });

  const paginatedUsers = users.length > 0 ? filteredUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE) : [];
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);



  if (activeSubView === 'permissions') {
    if (selectedUser) {
      return (
        <PermissionEditor
          perms={selectedUser.permissions || DEFAULT_PERMISSIONS}
          onUpdate={(p) => handleUpdatePermissions(selectedUser.id, p)}
          title="Privilégios do Usuário"
          subtitle={`Ajustando Perfil: ${selectedUser.name}`}
          onBack={() => { setActiveSubView('list'); setSelectedUser(null); setSelectedGroup(null); }}
        />
      );
    }
    if (selectedGroup) {
      const isMasterGroup = selectedGroup.name.toLowerCase() === 'administradores' || selectedGroup.isSystem;
      const groupUsers = users.filter(u => (u.groupIds || []).includes(selectedGroup.id) || u.groupId === selectedGroup.id);
      return (
        <PermissionEditor
          perms={isMasterGroup ? ADMIN_PERMISSIONS : (selectedGroup.permissions || DEFAULT_PERMISSIONS)}
          onUpdate={async (p) => {
            if (isMasterGroup) return; // Prevent saving if master
            const updated = { ...selectedGroup, permissions: p };
            setSelectedGroup(updated); // Optimistic UI update without triggering a remount because PermissionEditor is now external!
            await TenantService.updateUserGroup(updated);
            loadData();
          }}
          title="Permissões do Grupo"
          subtitle={`Configurando Grupo: ${selectedGroup.name}`}
          onBack={() => { setActiveSubView('list'); setSelectedUser(null); setSelectedGroup(null); }}
          disabled={isMasterGroup}
          linkedUsers={groupUsers}
        />
      );
    }
  }

  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
      {/* Toolbar */}
      <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
            
            <div className="flex items-center gap-1 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 hide-scrollbar">
                <div className="flex bg-white/60 p-1 rounded-xl border border-[#1c2d4f]/10 shadow-sm shrink-0">
                  <button
                    onClick={() => setActiveTab('users')}
                    className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'users' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
                  >
                    <Users size={14} /> <span className="whitespace-nowrap">{t.users.title}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('groups')}
                    className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'groups' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
                  >
                    <FolderTree size={14} /> <span className="whitespace-nowrap">{t.users.groups}</span>
                  </button>
                </div>
            </div>

            <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={activeTab === 'users' ? "Pesquisar usuário..." : "Buscar grupo..."}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
              />
            </div>

            <div className="flex items-center gap-2 w-full lg:w-auto justify-end shrink-0">
                <div className="hidden sm:flex items-center bg-white border border-[#1c2d4f]/20 rounded-xl pl-2 pr-1 h-10 shadow-sm max-w-[160px]">
                  <Filter size={12} className="text-slate-400 mr-2 shrink-0" />
                  <select
                    className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full cursor-pointer h-full"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">{t.common.all}</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="INACTIVE">Bloq.</option>
                  </select>
                </div>

                {activeTab === 'users' ? (
                    <button onClick={() => {
                        setEditingUser(null);
                        setFormData({ name: '', email: '', active: true, groupIds: [], permissions: { ...DEFAULT_PERMISSIONS } });
                        setGroupSearch('');
                        setIsModalOpen(true);
                        }}
                        className="h-10 px-4 bg-[#10b981] hover:bg-[#059669] border-[#10b981] text-white text-[11px] font-bold shadow-lg shadow-[#10b981]/20 flex items-center gap-1.5 whitespace-nowrap transition-all rounded-xl"
                    >
                        <UserPlus size={14} /> Novo Usuário
                    </button>
                ) : (
                    <button onClick={() => {
                        setEditingGroup(null);
                        setGroupFormData({ name: '', description: '', active: true, permissions: { ...DEFAULT_PERMISSIONS } });
                        setIsGroupModalOpen(true);
                        }}
                        className="h-10 px-4 bg-[#10b981] hover:bg-[#059669] border-[#10b981] text-white text-[11px] font-bold shadow-lg shadow-[#10b981]/20 flex items-center gap-1.5 whitespace-nowrap transition-all rounded-xl"
                    >
                        <UserPlus size={14} /> Novo Grupo
                    </button>
                )}
            </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          {activeTab === 'users' ? (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[10px] font-bold text-slate-400  tracking-[0.3em] text-center">
                  <th className="px-4 py-2">administrador / identidade</th>
                  <th className="px-4 py-2 text-center">status</th>
                  <th className="px-4 py-2 text-right pr-6">ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length > 0 ? paginatedUsers.map(user => (
                  <tr key={user.id} className={`bg-white hover:bg-slate-50 transition-all group ${!user.active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="shrink-0">
                          <div className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex items-center justify-center transition-all group-hover:text-[#1c2d4f] group-hover:bg-white group-hover:border-[#1c2d4f]/20 group-hover:shadow-sm">
                            <Users size={18} />
                          </div>
                        </div>
                        <div className="truncate">
                          <p className="text-slate-900 tracking-tighter text-[13px] font-medium truncate max-w-[150px]">{user.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 border-b border-slate-100 text-center whitespace-nowrap">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold   border transition-all ${user.active ? 'bg-primary-50 text-primary-700 border-primary-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-b border-slate-100 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5 transition-all">
                        <button onClick={() => { setEditingUser(user); setFormData({ ...user, groupIds: user.groupIds || (user.groupId ? [user.groupId] : []) }); setGroupSearch(''); setIsModalOpen(true); }} className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90" title="Editar Usuário">
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="py-24 text-center">
                      <Users size={48} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-[10px] font-bold text-slate-300  italic tracking-[0.2em]">Nenhum usuário localizado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="w-full flex flex-col h-full">
              <div className="flex sticky top-0 bg-white/80 backdrop-blur-md z-10 text-[10px] font-bold text-slate-400 tracking-[0.3em] px-4 py-2 border-b border-slate-200 uppercase">
                <div className="flex-1 text-left">grupo / descrição</div>
                <div className="w-48 text-center">tipo</div>
                <div className="w-32 text-right pr-6">ações</div>
              </div>
              <div className="flex-1">
                {(() => {
                  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()) || g.description?.toLowerCase().includes(searchTerm.toLowerCase()));
                  
                  return filteredGroups.length > 0 ? (
                    <List
                      height={500}
                      itemCount={filteredGroups.length}
                      itemSize={76}
                      width="100%"
                    >
                      {({ index, style }) => {
                        const group = filteredGroups[index];
                        return (
                          <div style={style} key={group.id} className="flex items-center px-4 py-3 bg-white hover:bg-slate-50 transition-all group border-b border-slate-100">
                            <div className="flex-1 flex items-center gap-4">
                              <div className="shrink-0">
                                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${group.isSystem ? 'bg-amber-50 border-amber-200 text-amber-500' : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:text-[#1c2d4f] group-hover:bg-white group-hover:border-[#1c2d4f]/20'}`}>
                                  {group.isSystem ? <ShieldCheck size={18} /> : <FolderTree size={18} />}
                                </div>
                              </div>
                              <div className="truncate">
                                <p className="text-slate-900 tracking-tighter text-[13px] font-medium truncate max-w-[250px]">{group.name}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[300px]">{group.description}</p>
                              </div>
                            </div>
                            <div className="w-48 text-center whitespace-nowrap">
                              <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold border transition-all ${group.isSystem ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                {group.isSystem ? 'Sistema Protegido' : 'Customizado'}
                              </span>
                            </div>
                            <div className="w-32 text-right pr-4">
                              <div className="flex items-center justify-end gap-1.5 transition-all">
                                <button onClick={() => { setSelectedGroup(group); setActiveSubView('permissions'); }} className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90" title="Configurar Regras de Acesso">
                                  <Settings size={16} />
                                </button>
                                {!group.isSystem && (
                                  <button
                                    onClick={() => setGroupToDelete(group)}
                                    disabled={isSaving}
                                    className="p-2.5 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-rose-100 transition-all active:scale-90"
                                    title="Excluir Grupo"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </List>
                  ) : (
                    <div className="py-24 text-center">
                      <FolderTree size={48} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-[10px] font-bold text-slate-300 italic tracking-[0.2em]">Nenhum grupo localizado</p>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
        {activeTab === 'users' && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredUsers.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* Modal de Usuário */}
      {
        isModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <form onSubmit={handleSaveUser} className="bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up" autoComplete="off">

              {/* HEADER — idêntico ao modal de OS */}
              <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    <Users size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      {editingUser ? 'Atualizar Identidade' : 'Registrar Novo Gestor'}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                      Nexus Operacional • acesso e privilégios corporativos
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    className="rounded-xl px-6 bg-[#1c2d4f] hover:bg-[#1c2d4f]/90 shadow-md py-2.5 h-auto text-xs font-bold"
                  >
                    <Save size={16} className="mr-2" />
                    {editingUser ? 'Atualizar' : 'Salvar'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* BODY — idêntico ao modal de OS */}
              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                <div className="space-y-8 max-w-4xl mx-auto">

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Coluna esquerda: dados + status */}
                    <div className="md:col-span-2 space-y-8">

                      {/* Dados Cadastrais */}
                      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 space-y-6">
                        <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3">dados cadastrais</h3>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 ml-1">Nome do Colaborador</label>
                          <Input
                            label=""
                            required
                            icon={<Users size={16} />}
                            className="rounded-xl border-slate-200 font-medium text-sm py-3"
                            value={formData.name || ''}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            autoComplete="new-name"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 ml-1">E-mail Corporativo</label>
                          <Input
                            label=""
                            type="email"
                            required
                            icon={<Mail size={16} />}
                            className="rounded-xl border-slate-200 font-medium text-sm py-3"
                            value={formData.email || ''}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            autoComplete="new-email"
                          />
                        </div>

                        {/* Aviso LGPD — sem campo de senha */}
                        <div className="flex items-start gap-4 p-5 rounded-xl bg-blue-50/60 border border-blue-100">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                            <Key size={16} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-blue-700 leading-snug">Criação de senha pelo próprio usuário</p>
                            <p className="text-[10px] text-blue-500 font-medium mt-1 leading-relaxed">
                              Por conformidade com a <span className="font-bold">LGPD</span>, senhas não são criadas pelo administrador.
                              No <span className="font-bold">primeiro acesso</span>, o responsável deve clicar em{' '}
                              <span className="font-bold text-blue-700">"Esqueci minha senha"</span> na tela de login
                              para definir sua própria senha de forma segura.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Status de Acesso */}
                      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 border-l-4 border-emerald-500 pl-3">status de acesso</h3>
                        <div
                          onClick={() => setFormData({ ...formData, active: !formData.active })}
                          className={`flex items-center gap-4 p-5 rounded-xl border transition-all cursor-pointer ${
                            formData.active ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className={`w-10 h-6 rounded-full relative transition-all ${formData.active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.active ? 'left-5' : 'left-1'}`} />
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${formData.active ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {formData.active ? 'Conta Ativa' : 'Conta Bloqueada'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {formData.active
                                ? 'O usuário pode acessar o sistema normalmente.'
                                : 'O acesso deste usuário está suspenso.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Coluna direita: seletor multi-grupo com busca */}
                    <div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 flex flex-col">

                        {/* Cabeçalho com contador */}
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-bold text-slate-900 border-l-4 border-amber-500 pl-3">grupos de acesso</h3>
                          {(formData.groupIds?.length || 0) > 0 && (
                            <span className="text-[9px] font-bold bg-[#1c2d4f] text-white px-2 py-0.5 rounded-full">
                              {formData.groupIds?.length} selecionado{(formData.groupIds?.length || 0) > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        {/* Busca compacta */}
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                          <input
                            type="text"
                            placeholder="Filtrar grupos..."
                            value={groupSearch}
                            onChange={e => setGroupSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[11px] font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-[#1c2d4f]/30 focus:border-[#1c2d4f] transition-all"
                          />
                        </div>

                        {/* Tags dos selecionados */}
                        {(formData.groupIds?.length || 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3 p-2 bg-slate-50/60 rounded-lg border border-slate-100">
                            {formData.groupIds?.map(gid => {
                              const grp = groups.find(g => g.id === gid);
                              return grp ? (
                                <span key={gid} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold bg-[#1c2d4f] text-white">
                                  {grp.name}
                                  <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, groupIds: (formData.groupIds || []).filter(id => id !== gid) })}
                                    className="ml-0.5 hover:text-red-300 transition-colors"
                                  >
                                    <X size={10} />
                                  </button>
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}

                        {/* Lista de grupos com scroll */}
                        <div className="space-y-1.5 overflow-y-auto custom-scrollbar max-h-[260px] pr-1">
                          {groups.length === 0 && (
                            <div className="py-10 text-center">
                              <ShieldCheck size={28} className="mx-auto text-slate-200 mb-2" />
                              <p className="text-[10px] font-bold text-slate-300">Nenhum grupo cadastrado</p>
                            </div>
                          )}
                          {groups
                            .filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
                            .map(g => {
                              const isSelected = (formData.groupIds || []).includes(g.id);
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => {
                                    const current = formData.groupIds || [];
                                    setFormData({
                                      ...formData,
                                      groupIds: isSelected
                                        ? current.filter(id => id !== g.id)
                                        : [...current, g.id]
                                    });
                                  }}
                                  className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                                    isSelected
                                      ? 'border-[#1c2d4f] bg-[#1c2d4f05] shadow-sm'
                                      : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-white'
                                  }`}
                                >
                                  {/* Checkbox visual */}
                                  <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                                    isSelected
                                      ? 'bg-[#1c2d4f] border-[#1c2d4f]'
                                      : 'bg-white border-slate-300'
                                  }`}>
                                    {isSelected && <Check size={10} className="text-white" />}
                                  </div>
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${
                                    isSelected
                                      ? 'bg-[#1c2d4f] border-[#1c2d4f] text-white'
                                      : g.isSystem
                                        ? 'bg-amber-50 border-amber-200 text-amber-500'
                                        : 'bg-white border-slate-200 text-slate-400'
                                  }`}>
                                    {g.isSystem ? <ShieldCheck size={13} /> : <FolderTree size={13} />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-slate-800 truncate">{g.name}</p>
                                    <p className="text-[9px] text-slate-400 font-medium truncate">
                                      {g.isSystem ? 'Perfil protegido' : (g.description || 'Personalizado')}
                                    </p>
                                  </div>
                                </button>
                              );
                          })}
                          {groups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && groupSearch && (
                            <p className="text-center text-[10px] text-slate-300 font-medium py-4">Nenhum grupo encontrado</p>
                          )}
                        </div>

                        {(formData.groupIds?.length || 0) === 0 && (
                          <p className="text-[9px] font-bold text-rose-400 mt-3 text-center">
                            Selecione ao menos um grupo
                          </p>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            </form>
          </div>
        )
      }

      {/* Modal de Grupo */}
      {
        isGroupModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <form onSubmit={handleSaveGroup} className="bg-white rounded-xl w-full max-w-2xl shadow-2xl border border-slate-200 flex flex-col animate-scale-up max-h-[92vh]">
              <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white rounded-t-xl shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    <FolderTree size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight leading-none">{editingGroup ? 'Editar Grupo' : 'Novo Grupo de Acesso'}</h2>
                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">Nexus Operacional • categorização de regras</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    className="rounded-xl px-6 bg-[#1c2d4f] hover:bg-[#1c2d4f]/90 shadow-md py-2.5 h-auto text-xs font-bold"
                  >
                    <Check size={16} className="mr-2" />
                    {editingGroup ? 'Salvar' : 'Criar Grupo'}
                  </Button>
                  <button type="button" onClick={() => setIsGroupModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"><X size={20} /></button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                <div className="space-y-8 max-w-xl mx-auto">
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 space-y-6">
                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3 mb-6">dados do grupo</h3>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 ml-1">Nome do Grupo (Ex: Supervisão de Campo)</label>
                      <Input label="" required icon={<Building2 size={16} />} className="rounded-xl border-slate-200 font-medium text-sm py-3" value={groupFormData.name || ''} onChange={e => setGroupFormData({ ...groupFormData, name: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 ml-1">Descrição e Objetivo</label>
                      <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all min-h-[100px]"
                        placeholder="Descreva quais responsabilidades este grupo possui..."
                        value={groupFormData.description || ''}
                        onChange={e => setGroupFormData({ ...groupFormData, description: e.target.value })}
                      />
                    </div>
                  </div>


                </div>
              </div>
            </form>
          </div>
        )
      }

      {/* 🚨 Modal de Confirmação de Exclusão de Grupo */}
      {
        groupToDelete && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-6">
            <div className="bg-white rounded-[3rem] w-full max-w-lg p-12 shadow-2xl border border-red-100 animate-scale-in">
              <div className="flex flex-col items-center text-center space-y-8">
                <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center text-red-500 animate-pulse ring-8 ring-red-50">
                  <ShieldAlert size={48} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-3xl font-bold italic  tracking-tighter text-slate-900 leading-none">Excluir Grupo</h3>
                  <p className="text-slate-500 font-medium px-4">
                    Confirmar a remoção do grupo <span className="text-slate-900 font-bold">"{groupToDelete.name}"</span>?
                  </p>
                  <div className="bg-amber-50 text-amber-700 text-[10px] font-bold  p-4 rounded-2xl border border-amber-100 flex items-start gap-4 text-left">
                    <ShieldAlert size={20} className="shrink-0" />
                    <span>Atenção: Usuários vinculados a este grupo perderão suas permissões de acesso até que um novo grupo seja atribuído.</span>
                  </div>
                </div>

                <div className="flex flex-col w-full gap-4">
                  <Button
                    variant="primary"
                    onClick={handleDeleteGroup}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-700 py-6 rounded-2xl font-bold   text-xs italic shadow-2xl shadow-red-600/30 active:scale-95 transition-all text-white"
                  >
                    {isSaving ? "Processando..." : "Sim, Confirmar Exclusão"}
                  </Button>
                  <button
                    onClick={() => setGroupToDelete(null)}
                    disabled={isSaving}
                    className="py-4 text-slate-400 hover:text-slate-900 font-bold  tracking-[0.3em] text-[9px] transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

