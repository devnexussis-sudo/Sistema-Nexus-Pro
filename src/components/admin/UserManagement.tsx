import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
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




export const UserManagement: React.FC = () => {
  const { t } = useI18n();

  const isMasterMode = window.location.pathname === '/master';
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [activeSubView, setActiveSubView] = useState<'list' | 'permissions'>('list');
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<UserGroup | null>(null);

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

  const PermissionEditor = ({ perms = DEFAULT_PERMISSIONS, onUpdate, title, subtitle }: { perms: UserPermissions, onUpdate: (p: UserPermissions) => void, title: string, subtitle: string }) => {
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
            <button onClick={() => { setActiveSubView('list'); setSelectedUser(null); setSelectedGroup(null); }} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-400 hover:text-primary-600 transition-all shadow-sm">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900  italic tracking-tighter leading-none">{title}</h1>
              <p className="text-[10px] font-bold text-primary-500   mt-2 italic shadow-sm">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-10">
            {modules.map((mod) => (
              <div key={mod.id} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="p-8 border-b border-slate-200 bg-slate-50/30 flex items-center gap-4">
                  <div className="p-3 bg-primary-600 rounded-2xl text-white shadow-lg"><mod.icon size={20} /></div>
                  <h3 className="font-bold text-slate-900  italic tracking-tight text-sm">{mod.label}</h3>
                </div>
                <div className="p-8 grid grid-cols-2 gap-4">
                  {[
                    { key: 'read', label: 'Consultar' },
                    { key: 'create', label: 'Criar Novo' },
                    { key: 'update', label: 'Editar' },
                    { key: 'delete', label: 'Excluir' },
                  ].map((action) => {
                    const isChecked = (perms as any)[mod.id]?.[action.key] || false;
                    return (
                      <button
                        key={action.key}
                        onClick={() => {
                          const newPerms = { ...perms };
                          const modulePerms = (newPerms as any)[mod.id] || { create: false, read: false, update: false, delete: false };
                          (newPerms as any)[mod.id] = {
                            ...modulePerms,
                            [action.key]: !modulePerms[action.key]
                          };
                          onUpdate(newPerms);
                        }}
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${isChecked
                          ? 'bg-primary-50 border-primary-100 text-primary-700'
                          : 'bg-white border-slate-100 text-slate-400 opacity-60'
                          }`}
                      >
                        <span className="text-[10px] font-bold  italic ">{action.label}</span>
                        <div className={`w-8 h-4 rounded-full relative transition-all ${isChecked ? 'bg-primary-600' : 'bg-slate-200'}`}>
                          <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${isChecked ? 'left-5' : 'left-1'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 p-8 space-y-6 lg:col-span-2">
              <div className="flex items-center gap-4 border-b border-slate-200 pb-6 mb-2">
                <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-lg"><Building2 size={20} /></div>
                <h3 className="font-bold text-slate-900  italic tracking-tight text-sm">Financeiro e Custos</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { key: 'read', label: 'Visualizar Custos/Faturamento' },
                  { key: 'update', label: 'Alterar Tabelas de Preço' },
                ].map((action) => {
                  const isChecked = perms.financial?.[action.key as keyof typeof perms.financial] || false;
                  return (
                    <button
                      key={action.key}
                      onClick={() => {
                        const newPerms = { ...perms };
                        if (!newPerms.financial) newPerms.financial = { read: false, update: false };
                        newPerms.financial = { ...newPerms.financial, [action.key]: !newPerms.financial[action.key as keyof typeof perms.financial] };
                        onUpdate(newPerms);
                      }}
                      className={`flex items-center justify-between p-5 rounded-3xl border transition-all ${isChecked
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-100 text-slate-400 opacity-60'
                        }`}
                    >
                      <span className="text-[10px] font-bold  italic  leading-tight text-left">{action.label}</span>
                      <div className={`w-8 h-4 rounded-full relative transition-all ${isChecked ? 'bg-emerald-600' : 'bg-slate-200'}`}>
                        <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${isChecked ? 'left-5' : 'left-1'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/40 p-8 space-y-6 lg:col-span-2">
              <div className="flex items-center gap-4 border-b border-slate-200 pb-6 mb-2">
                <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg"><ShieldAlert size={20} /></div>
                <h3 className="font-bold text-slate-900  italic tracking-tight text-sm">Privilégios de Sistema e Governança</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { key: 'settings', label: 'Acesso a Configurações', icon: Settings },
                  { key: 'manageUsers', label: 'Gestão de Usuários', icon: ShieldCheck },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      const newPerms = { ...perms, [item.key]: !(perms as any)[item.key] };
                      onUpdate(newPerms);
                    }}
                    className={`flex items-center gap-4 p-6 rounded-3xl border transition-all ${(perms as any)[item.key]
                      ? 'bg-primary-50 border-primary-200 text-primary-700 ring-2 ring-primary-100'
                      : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}
                  >
                    <item.icon size={20} />
                    <span className="text-[10px] font-bold  italic tracking-tighter text-left leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (activeSubView === 'permissions') {
    if (selectedUser) {
      return (
        <PermissionEditor
          perms={selectedUser.permissions || DEFAULT_PERMISSIONS}
          onUpdate={(p) => handleUpdatePermissions(selectedUser.id, p)}
          title="Privilégios do Usuário"
          subtitle={`Ajustando Perfil: ${selectedUser.name}`}
        />
      );
    }
    if (selectedGroup) {
      return (
        <PermissionEditor
          perms={selectedGroup.permissions || DEFAULT_PERMISSIONS}
          onUpdate={async (p) => {
            const updated = { ...selectedGroup, permissions: p };
            await TenantService.updateUserGroup(updated);
            setSelectedGroup(updated);
            loadData();
          }}
          title="Permissões do Grupo"
          subtitle={`Configurando Grupo: ${selectedGroup.name}`}
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
            <table className="w-full border-separate border-spacing-y-1">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[10px] font-bold text-slate-400  tracking-[0.3em] text-center">
                  <th className="px-4 py-2">administrador / identidade</th>
                  <th className="px-4 py-2">grupo de acesso</th>
                  <th className="px-4 py-2 text-center">status</th>
                  <th className="px-4 py-2 text-right pr-6">ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.length > 0 ? paginatedUsers.map(user => (
                  <tr key={user.id} className={`bg-white hover:bg-primary-50/40 transition-all group shadow-sm hover:shadow-md ${!user.active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-1.5 rounded-l-[1.5rem] border border-slate-100 border-r-0">
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
                    <td className="px-4 py-1.5 border-y border-slate-100">
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {(user.groupIds && user.groupIds.length > 0
                          ? user.groupIds
                          : user.groupId ? [user.groupId] : []
                        ).slice(0, 2).map(gid => {
                          const grp = groups.find(g => g.id === gid);
                          return grp ? (
                            <span key={gid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary-50 text-primary-600 border border-primary-100">
                              <ShieldCheck size={9} className="shrink-0" />
                              <span className="truncate max-w-[80px]">{grp.name}</span>
                            </span>
                          ) : null;
                        })}
                        {((user.groupIds?.length || 0) > 2) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                            +{(user.groupIds?.length || 0) - 2}
                          </span>
                        )}
                        {(!user.groupIds || user.groupIds.length === 0) && !user.groupId && (
                          <span className="text-[10px] text-slate-300 font-medium">Sem grupo</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 border-y border-slate-100 text-center whitespace-nowrap">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold   border transition-all ${user.active ? 'bg-primary-50 text-primary-700 border-primary-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5 transition-all">
                        <button onClick={() => { setEditingUser(user); setFormData({ ...user, groupIds: user.groupIds || (user.groupId ? [user.groupId] : []) }); setGroupSearch(''); setIsModalOpen(true); }} className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90" title="Editar Usuário">
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-24 text-center">
                      <Users size={48} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-[10px] font-bold text-slate-300  italic tracking-[0.2em]">Nenhum usuário localizado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map(group => (
                <div key={group.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-8 hover:shadow-2xl hover:shadow-primary-500/10 transition-all group border-b-4 border-b-slate-50 hover:border-b-primary-500">
                  <div className="flex items-center justify-between mb-6">
                    <div className={`p-4 rounded-2xl ${group.isSystem ? 'bg-amber-100 text-amber-600' : 'bg-primary-100 text-primary-600'}`}>
                      <FolderTree size={24} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedGroup(group); setActiveSubView('permissions'); }} className="p-3 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90" title="Configurar Regras de Acesso">
                        <Settings size={18} />
                      </button>
                      {!group.isSystem && (
                        <button
                          onClick={() => setGroupToDelete(group)}
                          disabled={isSaving}
                          className="p-3 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-rose-100 transition-all active:scale-90"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-bold text-slate-900  italic tracking-tighter text-lg mb-2">{group.name}</h3>
                  <p className="text-[11px] text-slate-400 font-bold mb-6 line-clamp-2 h-8 leading-tight">{group.description}</p>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-6">
                    <span className="text-[9px] font-bold text-slate-300  ">
                      {group.isSystem ? 'Perfil Master Protegido' : 'Grupo Customizado'}
                    </span>
                    <div className="flex -space-x-2">
                      {users.filter(u => u.groupId === group.id).slice(0, 3).map(u => (
                        <div key={u.id} className="w-8 h-8 rounded-xl bg-slate-100 border-2 border-white text-slate-400 flex items-center justify-center shadow-sm">
                          <Users size={13} />
                        </div>
                      ))}
                      {users.filter(u => u.groupId === group.id).length > 3 && (
                        <div className="w-8 h-8 rounded-xl bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-400">
                          +{users.filter(u => u.groupId === group.id).length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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
            <div className="bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">

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
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"
                >
                  <X size={20} />
                </button>
              </div>

              {/* BODY — idêntico ao modal de OS */}
              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                <form onSubmit={handleSaveUser} className="space-y-8 max-w-4xl mx-auto" autoComplete="off">

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

                  {/* Ações */}
                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-xl px-8"
                      onClick={() => setIsModalOpen(false)}
                    >
                      {t.common.cancel}
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl px-12 bg-[#1c2d4f] hover:bg-[#1c2d4f]/90 shadow-md"
                    >
                      <Save size={16} className="mr-2" />
                      {editingUser ? 'Atualizar' : 'Salvar'}
                    </Button>
                  </div>

                </form>
              </div>
            </div>
          </div>
        )
      }

      {/* Modal de Grupo */}
      {
        isGroupModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl border border-slate-200 flex flex-col animate-scale-up max-h-[92vh]">
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
                <button onClick={() => setIsGroupModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                <form onSubmit={handleSaveGroup} className="space-y-8 max-w-xl mx-auto">
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

                  <div className="pt-4 flex justify-end gap-4">
                    <Button type="button" variant="secondary" className="rounded-xl px-8" onClick={() => setIsGroupModalOpen(false)}>Descartar</Button>
                    <Button type="submit" className="rounded-xl px-12 bg-[#1c2d4f] hover:bg-[#1c2d4f]/90 shadow-md">
                      <Check size={18} className="mr-2" /> {editingGroup ? 'Salvar' : 'Criar Grupo'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
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

