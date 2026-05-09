import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { User, UserGroup } from '../types';

export interface GroupState {
  // Data
  users: User[];
  groups: UserGroup[];
  // UI state
  isGroupModalOpen: boolean;
  editingGroup: UserGroup | null;
  groupToDelete: UserGroup | null;
  isSaving: boolean;
  // Selection
  selectedGroup: UserGroup | null;
  selectedUser: User | null;
  // View control
  activeSubView: 'list' | 'permissions' | 'users';
  // Setters
  setUsers: (users: User[]) => void;
  setGroups: (groups: UserGroup[]) => void;
  setIsGroupModalOpen: (open: boolean) => void;
  setEditingGroup: (group: UserGroup | null) => void;
  setGroupToDelete: (group: UserGroup | null) => void;
  setIsSaving: (saving: boolean) => void;
  setSelectedGroup: (group: UserGroup | null) => void;
  setSelectedUser: (user: User | null) => void;
  setActiveSubView: (view: 'list' | 'permissions' | 'users') => void;
}

export const useGroupStore = create<GroupState>()(
  immer((set) => ({
    users: [],
    groups: [],
    isGroupModalOpen: false,
    editingGroup: null,
    groupToDelete: null,
    isSaving: false,
    selectedGroup: null,
    selectedUser: null,
    activeSubView: 'list',
    // setters
    setUsers: (users) => set((s) => { s.users = users; }),
    setGroups: (groups) => set((s) => { s.groups = groups; }),
    setIsGroupModalOpen: (open) => set((s) => { s.isGroupModalOpen = open; }),
    setEditingGroup: (group) => set((s) => { s.editingGroup = group; }),
    setGroupToDelete: (group) => set((s) => { s.groupToDelete = group; }),
    setIsSaving: (saving) => set((s) => { s.isSaving = saving; }),
    setSelectedGroup: (group) => set((s) => { s.selectedGroup = group; }),
    setSelectedUser: (user) => set((s) => { s.selectedUser = user; }),
    setActiveSubView: (view) => set((s) => { s.activeSubView = view; }),
  }))
);
