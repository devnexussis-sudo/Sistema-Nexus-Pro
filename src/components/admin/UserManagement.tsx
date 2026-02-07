import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Users, Search, ShieldCheck, Mail, Lock,
  UserPlus, X, Save, Edit3, Trash2, Key,
  LayoutDashboard, ClipboardList, FileText,
  UserCheck, Box, Building2, Settings, ShieldAlert,
  ArrowLeft, Filter, Calendar, RefreshCw, FolderTree,
  ChevronDown, Check, Package, Workflow, CalendarClock
} from 'lucide-react';
import { DataService } from '../../services/dataService';
import { User, UserRole, UserPermissions, UserGroup, DEFAULT_PERMISSIONS, ADMIN_PERMISSIONS } from '../../types';




export const UserManagement: React.FC = () => {
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
  const [isSaving, setIsSaving] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<UserGroup | null>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    password: '',
    active: true,
    groupId: '',
    permissions: { ...DEFAULT_PERMISSIONS }
  });

  const [groupFormData, setGroupFormData] = useState<Partial<UserGroup>>({
    name: '',
    description: '',
    active: true,
    permissions: { ...DEFAULT_PERMISSIONS }
  });

  const loadData = async () => {
    const [usersList, groupsList] = await Promise.all([
      DataService.getAllUsers(),
      DataService.getUserGroups()
    ]);

    // Se não houver grupos, garantir o grupo Admin
    if (groupsList.length === 0) {
      const adminGroup = await DataService.createUserGroup({
        name: 'Administrador',
        description: 'Acesso total ao sistema. Nível máximo de gestão.',
        permissions: ADMIN_PERMISSIONS,
        active: true,
        isSystem: true
      });
      setGroups([adminGroup]);
    } else {
      setGroups(groupsList);
    }

    setUsers(usersList.filter(u => u.role === UserRole.ADMIN));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (isModalOpen && !editingUser) {
      setFormData({
        name: '',
        email: '',
        password: '',
        active: true,
        groupId: '',
        permissions: { ...DEFAULT_PERMISSIONS }
      });
    }
  }, [isModalOpen, editingUser]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Se um grupo foi selecionado, herdar as permissões dele
      let userPermissions = formData.permissions || DEFAULT_PERMISSIONS;
      if (formData.groupId) {
        const group = groups.find(g => g.id === formData.groupId);
        if (group) userPermissions = group.permissions;
      }

      if (editingUser) {
        await DataService.updateUser({ ...formData, permissions: userPermissions, id: editingUser.id } as User);
      } else {
        const newUser = {
          ...formData,
          role: UserRole.ADMIN,
          permissions: userPermissions,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(formData.name)}&backgroundColor=4f46e5`
        } as Omit<User, 'id'>;
        await DataService.createUser(newUser);
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
        await DataService.updateUserGroup({ ...groupFormData, id: editingGroup.id } as UserGroup);
      } else {
        await DataService.createUserGroup(groupFormData as Omit<UserGroup, 'id'>);
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
      await DataService.deleteUserGroup(groupToDelete.id);
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
      await DataService.updateUser(updatedUser);

      await loadData();
      if (selectedUser?.id === userId) {
        setSelectedUser(updatedUser);
      }
    } catch (error: any) {
      console.error("Failed to update permissions:", error);
      alert("Erro ao atualizar permissões: " + error.message);
    }
  };

  const handleRandomizeAvatar = async (user: User) => {
    try {
      const styles = ['avataaars', 'lorelei', 'personas', 'bottts-neutral', 'fun-emoji'];
      const randomStyle = styles[Math.floor(Math.random() * styles.length)];
      const randomSeed = `${user.name}-${Date.now()}`;
      const newAvatar = `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${encodeURIComponent(randomSeed)}&backgroundColor=4f46e5`;
      await DataService.updateUser({ ...user, avatar: newAvatar });
      await loadData();
    } catch (error) {
      console.error("Erro ao randomizar avatar:", error);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? u.active : !u.active);
    return matchesSearch && matchesStatus;
  });

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
            <button onClick={() => { setActiveSubView('list'); setSelectedUser(null); setSelectedGroup(null); }} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 transition-all shadow-sm">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{title}</h1>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-2 italic shadow-sm">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-10">
            {modules.map((mod) => (
              <div key={mod.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg"><mod.icon size={20} /></div>
                  <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-sm">{mod.label}</h3>
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
                          ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                          : 'bg-white border-slate-100 text-slate-400 opacity-60'
                          }`}
                      >
                        <span className="text-[10px] font-black uppercase italic tracking-widest">{action.label}</span>
                        <div className={`w-8 h-4 rounded-full relative transition-all ${isChecked ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                          <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${isChecked ? 'left-5' : 'left-1'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-8 space-y-6 lg:col-span-2">
              <div className="flex items-center gap-4 border-b border-slate-50 pb-6 mb-2">
                <div className="p-3 bg-emerald-500 rounded-2xl text-white shadow-lg"><Building2 size={20} /></div>
                <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-sm">Financeiro e Custos</h3>
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
                      <span className="text-[10px] font-black uppercase italic tracking-widest leading-tight text-left">{action.label}</span>
                      <div className={`w-8 h-4 rounded-full relative transition-all ${isChecked ? 'bg-emerald-600' : 'bg-slate-200'}`}>
                        <div className={`absolute top-1 w-2 h-2 rounded-full bg-white transition-all ${isChecked ? 'left-5' : 'left-1'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-8 space-y-6 lg:col-span-2">
              <div className="flex items-center gap-4 border-b border-slate-50 pb-6 mb-2">
                <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg"><ShieldAlert size={20} /></div>
                <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-sm">Privilégios de Sistema e Governança</h3>
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
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-100'
                      : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}
                  >
                    <item.icon size={20} />
                    <span className="text-[10px] font-black uppercase italic tracking-tighter text-left leading-tight">{item.label}</span>
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
            await DataService.updateUserGroup(updated);
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
    <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">
      {/* Toolbar */}
      <div className="mb-2 flex flex-col xl:flex-row gap-3 items-center">
        {/* Tabs */}
        <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm flex-shrink-0">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === 'users' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users size={14} /> Usuários
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeTab === 'groups' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FolderTree size={14} /> Grupos
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={activeTab === 'users' ? "Pesquisar usuário..." : "Buscar grupo..."}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-6 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
          />
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 w-full xl:w-auto justify-end">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-[42px]">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select
              className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Bloq.</option>
            </select>
          </div>

          {activeTab === 'users' ? (
            <Button onClick={() => {
              setEditingUser(null);
              setFormData({ name: '', email: '', password: '', active: true, groupId: '', permissions: { ...DEFAULT_PERMISSIONS } });
              setIsModalOpen(true);
            }}
              className="rounded-xl px-6 h-[42px] font-bold uppercase text-[10px] tracking-widest shadow-sm shadow-[#1c2d4f]/10 text-white whitespace-nowrap bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]"
            >
              <UserPlus size={16} className="mr-2" /> Novo Usuário
            </Button>
          ) : (
            <Button onClick={() => {
              setEditingGroup(null);
              setGroupFormData({ name: '', description: '', active: true, permissions: { ...DEFAULT_PERMISSIONS } });
              setIsGroupModalOpen(true);
            }}
              className="rounded-xl px-6 h-[42px] font-bold uppercase text-[10px] tracking-widest shadow-sm shadow-[#1c2d4f]/10 text-white whitespace-nowrap bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]"
            >
              <UserPlus size={16} className="mr-2" /> Novo Grupo
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/50 flex-1 min-h-0">
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          {activeTab === 'users' ? (
            <table className="w-full border-separate border-spacing-y-3">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                  <th className="px-8 py-2">Administrador / Identidade</th>
                  <th className="px-8 py-2">Grupo de Acesso</th>
                  <th className="px-8 py-2 text-center">Status</th>
                  <th className="px-8 py-2 text-right pr-12">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? filteredUsers.map(user => (
                  <tr key={user.id} className={`bg-white hover:bg-indigo-50/20 transition-all group shadow-sm ${!user.active ? 'opacity-60' : ''}`}>
                    <td className="px-8 py-6 rounded-l-[2rem] border border-slate-100 border-r-0">
                      <div className="flex items-center gap-5">
                        <div className="relative group/avatar">
                          <img src={user.avatar} className="w-14 h-14 rounded-3xl border-2 border-white shadow-xl bg-slate-50 grayscale group-hover:grayscale-0 transition-all group-hover/avatar:scale-105" alt="" />
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRandomizeAvatar(user); }}
                            className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 text-white rounded-lg shadow-lg opacity-0 group-hover/avatar:opacity-100 transition-all hover:bg-indigo-700 scale-75 group-hover/avatar:scale-100"
                          >
                            <RefreshCw size={12} />
                          </button>
                        </div>
                        <div>
                          <p className="font-black text-slate-900 uppercase italic tracking-tighter text-sm">{user.name}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 italic">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 border-y border-slate-100">
                      <span className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase italic">
                        <ShieldCheck size={14} />
                        {groups.find(g => g.id === user.groupId)?.name || 'Sem Grupo (Padrão)'}
                      </span>
                    </td>
                    <td className="px-8 py-6 border-y border-slate-100 text-center">
                      <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${user.active ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-8 py-6 rounded-r-[2rem] border border-slate-100 border-l-0 text-right pr-8">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditingUser(user); setFormData(user); setIsModalOpen(true); }} className="p-3.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-2xl shadow-sm border border-transparent hover:border-indigo-100 transition-all" title="Editar Usuário">
                          <Edit3 size={20} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-24 text-center">
                      <Users size={48} className="mx-auto text-slate-200 mb-4" />
                      <p className="text-[10px] font-black text-slate-300 uppercase italic tracking-[0.2em]">Nenhum usuário localizado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map(group => (
                <div key={group.id} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all group border-b-4 border-b-slate-50 hover:border-b-indigo-500">
                  <div className="flex items-center justify-between mb-6">
                    <div className={`p-4 rounded-2xl ${group.isSystem ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                      <FolderTree size={24} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedGroup(group); setActiveSubView('permissions'); }} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl transition-all" title="Configurar Regras de Acesso">
                        <Settings size={18} />
                      </button>
                      {!group.isSystem && (
                        <button
                          onClick={() => setGroupToDelete(group)}
                          disabled={isSaving}
                          className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-all disabled:opacity-50"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-black text-slate-900 uppercase italic tracking-tighter text-lg mb-2">{group.name}</h3>
                  <p className="text-[11px] text-slate-400 font-bold mb-6 line-clamp-2 h-8 leading-tight">{group.description}</p>
                  <div className="flex items-center justify-between border-t border-slate-50 pt-6">
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                      {group.isSystem ? 'Perfil Master Protegido' : 'Grupo Customizado'}
                    </span>
                    <div className="flex -space-x-3">
                      {users.filter(u => u.groupId === group.id).slice(0, 3).map(u => (
                        <img key={u.id} src={u.avatar} className="w-8 h-8 rounded-xl border-2 border-white shadow-sm" alt="" />
                      ))}
                      {users.filter(u => u.groupId === group.id).length > 3 && (
                        <div className="w-8 h-8 rounded-xl bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-black text-slate-400">
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
      </div>

      {/* Modal de Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl border border-white/20 animate-fade-in-up">
            <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-t-[3rem]">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-[#1c2d4f] rounded-[1.5rem] text-white shadow-xl"><UserPlus size={32} /></div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">{editingUser ? 'Atualizar Identidade' : 'Registrar Novo Gestor'}</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">Acesso e Privilégios Corporativos</p>
                </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-300 hover:text-slate-900 transition-all shadow-sm"><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveUser} className="p-12 space-y-8" autoComplete="off">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Input label="Nome do Colaborador" required icon={<Users size={18} />} className="rounded-2xl py-4 font-bold" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} autoComplete="new-name" />
                <Input label="E-mail Corporativo" type="email" required icon={<Mail size={18} />} className="rounded-2xl py-4 font-bold" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} autoComplete="new-email" />
                <Input label="Senha Temporária" type="password" required={!editingUser} icon={<Lock size={18} />} className="rounded-2xl py-4 font-bold" value={formData.password || ''} onChange={e => setFormData({ ...formData, password: e.target.value })} autoComplete="new-password" />

                <div className="relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-3 block italic flex items-center gap-2">
                    Grupo de Permissões
                    {editingUser && groups.find(g => g.id === editingUser.groupId)?.isSystem && (
                      <span className="text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full ring-1 ring-amber-200 animate-pulse">Protegido</span>
                    )}
                  </label>
                  <select
                    className={`w-full border rounded-2xl px-6 py-4 text-xs font-bold outline-none appearance-none focus:ring-4 focus:ring-indigo-100 transition-all ${editingUser && groups.find(g => g.id === editingUser.groupId)?.isSystem && !isMasterMode
                      ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-200 text-slate-700 cursor-pointer'}`}
                    value={formData.groupId || ''}
                    onChange={e => setFormData({ ...formData, groupId: e.target.value })}
                    required
                    disabled={editingUser && groups.find(g => g.id === editingUser.groupId)?.isSystem && !isMasterMode}
                  >
                    <option value="">Selecione um Grupo...</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-6 top-[42px] text-slate-400 pointer-events-none" size={16} />
                </div>

                <div
                  onClick={() => setFormData({ ...formData, active: !formData.active })}
                  className={`flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${formData.active ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className={`w-10 h-6 rounded-full relative transition-all ${formData.active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${formData.active ? 'left-5' : 'left-1'}`} />
                  </div>
                  <span className={`text-[10px] font-black uppercase italic ${formData.active ? 'text-emerald-700' : 'text-slate-500'}`}>Status: {formData.active ? 'Ativo' : 'Bloqueado'}</span>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-4">
                <Button variant="secondary" className="rounded-2xl px-10" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" className="rounded-2xl px-16 shadow-xl shadow-indigo-600/30">
                  <Save size={20} className="mr-3" /> {editingUser ? 'Atualizar' : 'Salvar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Grupo */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-6">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl border border-white/20 animate-fade-in-up">
            <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-t-[3rem]">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-[#1c2d4f] rounded-[1.5rem] text-white shadow-xl"><FolderTree size={32} /></div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">{editingGroup ? 'Editar Grupo' : 'Novo Grupo de Acesso'}</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">Categorização de Regras de Negócio</p>
                </div>
              </div>
              <button onClick={() => setIsGroupModalOpen(false)} className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-300 hover:text-slate-900 transition-all shadow-sm"><X size={28} /></button>
            </div>
            <form onSubmit={handleSaveGroup} className="p-10 space-y-6">
              <Input label="Nome do Grupo (Ex: Supervisão de Campo)" required icon={<Building2 size={18} />} className="rounded-2xl py-4 font-bold" value={groupFormData.name || ''} onChange={e => setGroupFormData({ ...groupFormData, name: e.target.value })} />
              <div className="flex flex-col">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-3 block italic">Descrição e Objetivo</label>
                <textarea
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all min-h-[100px]"
                  placeholder="Descreva quais responsabilidades este grupo possui..."
                  value={groupFormData.description || ''}
                  onChange={e => setGroupFormData({ ...groupFormData, description: e.target.value })}
                />
              </div>
              <div className="pt-6 flex justify-end gap-4">
                <Button variant="secondary" className="rounded-2xl px-12" onClick={() => setIsGroupModalOpen(false)}>Descartar</Button>
                <Button type="submit" className="rounded-2xl px-20 shadow-xl shadow-indigo-600/30">
                  <Check size={20} className="mr-3" /> {editingGroup ? 'Salvar' : 'Criar Grupo'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🚨 Modal de Confirmação de Exclusão de Grupo */}
      {groupToDelete && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-6">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-12 shadow-2xl border border-red-100 animate-scale-in">
            <div className="flex flex-col items-center text-center space-y-8">
              <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center text-red-500 animate-pulse ring-8 ring-red-50">
                <ShieldAlert size={48} />
              </div>

              <div className="space-y-4">
                <h3 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 leading-none">Excluir Grupo</h3>
                <p className="text-slate-500 font-medium px-4">
                  Confirmar a remoção do grupo <span className="text-slate-900 font-black">"{groupToDelete.name}"</span>?
                </p>
                <div className="bg-amber-50 text-amber-700 text-[10px] font-black uppercase p-4 rounded-2xl border border-amber-100 flex items-start gap-4 text-left">
                  <ShieldAlert size={20} className="shrink-0" />
                  <span>Atenção: Usuários vinculados a este grupo perderão suas permissões de acesso até que um novo grupo seja atribuído.</span>
                </div>
              </div>

              <div className="flex flex-col w-full gap-4">
                <Button
                  variant="primary"
                  onClick={handleDeleteGroup}
                  disabled={isSaving}
                  className="bg-red-600 hover:bg-red-700 py-6 rounded-2xl font-black uppercase tracking-widest text-xs italic shadow-2xl shadow-red-600/30 active:scale-95 transition-all text-white"
                >
                  {isSaving ? "Processando..." : "Sim, Confirmar Exclusão"}
                </Button>
                <button
                  onClick={() => setGroupToDelete(null)}
                  disabled={isSaving}
                  className="py-4 text-slate-400 hover:text-slate-900 font-black uppercase tracking-[0.3em] text-[9px] transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

