import React from 'react';
import { Users, Settings, Trash2, ShieldCheck, FolderTree } from 'lucide-react';
import { useGroupStore } from '../../store/groupStore';
import { UserGroup } from '../../types';

export const GroupList: React.FC = () => {
  const {
    groups,
    users,
    setSelectedGroup,
    setActiveSubView,
    setGroupToDelete,
    isSaving,
  } = useGroupStore((state) => ({
    groups: state.groups,
    users: state.users,
    setSelectedGroup: state.setSelectedGroup,
    setActiveSubView: state.setActiveSubView,
    setGroupToDelete: (g: UserGroup | null) => {
      // placeholder, will be handled in parent via modal
    },
    isSaving: false, // placeholder, real saving flag can be added later
  }));

  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
        <tr className="text-[10px] font-bold text-slate-400 tracking-[0.3em] text-left">
          <th className="px-4 py-2 text-left">grupo / descrição</th>
          <th className="px-4 py-2 text-center">tipo</th>
          <th className="px-4 py-2 text-right pr-6">ações</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const groupUsers = users.filter((u) => (u.groupIds || []).includes(group.id) || (u as any).groupId === group.id);
          return (
            <tr key={group.id} className="bg-white hover:bg-slate-50 transition-all group">
              <td className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
                        group.isSystem
                          ? 'bg-amber-50 border-amber-200 text-amber-500'
                          : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:text-[#1c2d4f] group-hover:bg-white group-hover:border-[#1c2d4f]/20'
                      }`}
                    >
                      {group.isSystem ? <ShieldCheck size={18} /> : <FolderTree size={18} />}
                    </div>
                  </div>
                  <div className="truncate">
                    <p className="text-slate-900 tracking-tighter text-[13px] font-medium truncate max-w-[250px]">
                      {group.name}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[300px]">{group.description}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-100 text-center whitespace-nowrap">
                <span
                  className={`px-4 py-1.5 rounded-full text-[9px] font-bold border transition-all ${
                    group.isSystem ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  {group.isSystem ? 'Sistema Protegido' : 'Customizado'}
                </span>
              </td>
              <td className="px-4 py-3 border-b border-slate-100 text-right pr-4">
                <div className="flex items-center justify-end gap-1.5 transition-all">
                  <button
                    onClick={() => {
                      setSelectedGroup(group);
                      setActiveSubView('permissions');
                    }}
                    className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90"
                    title="Configurar Regras de Acesso"
                  >
                    <Settings size={16} />
                  </button>
                  {/* Delete button could be added here */}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
