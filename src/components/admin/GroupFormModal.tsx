import React, { useState, useEffect } from 'react';
import { X, Check, Building2 } from 'lucide-react';
import { useGroupStore } from '../../store/groupStore';
import TenantService from '../../services/tenantService';

export const GroupFormModal: React.FC = () => {
  const { isGroupModalOpen, setIsGroupModalOpen, editingGroup, setEditingGroup, users, setUsers, groups, setGroups } = useGroupStore(
    (state) => ({
      isGroupModalOpen: (state as any).isGroupModalOpen,
      setIsGroupModalOpen: (state as any).setIsGroupModalOpen,
      editingGroup: (state as any).editingGroup,
      setEditingGroup: (state as any).setEditingGroup,
      users: state.users,
      setUsers: state.setUsers,
      groups: state.groups,
      setGroups: state.setGroups,
    })
  );

  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    if (editingGroup) {
      setFormData({ name: editingGroup.name, description: editingGroup.description });
    } else {
      setFormData({ name: '', description: '' });
    }
  }, [editingGroup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingGroup) {
        await TenantService.updateUserGroup({ ...editingGroup, ...formData });
      } else {
        await TenantService.createUserGroup(formData as any);
      }
      // reload data (simplified)
      const [u, g] = await Promise.all([TenantService.getUsers(), TenantService.getUserGroups()]);
      setUsers(u);
      setGroups(g);
      setIsGroupModalOpen(false);
      setEditingGroup(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar grupo');
    }
  };

  if (!isGroupModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-6">
      <form
        className="bg-white rounded-[3rem] w-full max-w-lg p-12 shadow-2xl border border-slate-200"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-slate-900">{editingGroup ? 'Editar Grupo' : 'Novo Grupo'}</h2>
          <button type="button" onClick={() => setIsGroupModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition rounded-lg">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-bold text-slate-400">Nome</label>
          <input
            required
            className="w-full rounded-xl border-slate-200 py-2 px-3"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <label className="block text-sm font-bold text-slate-400">Descrição</label>
          <textarea
            className="w-full rounded-xl border-slate-200 py-2 px-3"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-4 mt-6">
          <button
            type="submit"
            className="rounded-xl px-6 bg-[#1c2d4f] hover:bg-[#1c2d4f]/90 shadow-md py-2.5 text-xs font-bold text-white flex items-center"
          >
            <Check size={16} className="mr-2" />
            {editingGroup ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </div>
  );
};
