// ============================================
// MÉTODOS PARA ADICIONAR AO dataService.ts
// Cole estes métodos dentro do objeto DataService, antes do fechamento }
// ============================================

// ========== TIPOS DE SERVIÇO ==========

getServiceTypes: async (): Promise<any[]> => {
    if (isCloudEnabled) {
        const { data } = await supabase.from('service_types').select('*').order('name');
        return (data || []);
    }
    return getStorage('nexus_service_types_db', [
        { id: 'st-prev', name: 'Manutenção Preventiva' },
        { id: 'st-corr', name: 'Manutenção Corretiva' },
        { id: 'st-inst', name: 'Instalação / Startup' },
        { id: 'st-orca', name: 'Orçamento Técnico' }
    ]);
},

    createServiceType: async (serviceType: any): Promise<any> => {
        if (isCloudEnabled) {
            const { data, error } = await supabase.from('service_types').insert([serviceType]).select();
            if (error) throw error;
            return (data && data.length > 0 ? data[0] : serviceType);
        }
        const currentList = getStorage('nexus_service_types_db', []);
        setStorage('nexus_service_types_db', [...currentList, serviceType]);
        return serviceType;
    },

        updateServiceType: async (serviceType: any): Promise<any> => {
            if (isCloudEnabled) {
                const { data, error } = await supabase.from('service_types').update(serviceType).eq('id', serviceType.id).select();
                if (error) throw error;
                return (data && data.length > 0 ? data[0] : serviceType);
            }
            const currentList = getStorage('nexus_service_types_db', []);
            const updatedList = currentList.map((st: any) => st.id === serviceType.id ? serviceType : st);
            setStorage('nexus_service_types_db', updatedList);
            return serviceType;
        },

            deleteServiceType: async (id: string): Promise<void> => {
                if (isCloudEnabled) {
                    const { error } = await supabase.from('service_types').delete().eq('id', id);
                    if (error) throw error;
                }
                const currentList = getStorage('nexus_service_types_db', []);
                setStorage('nexus_service_types_db', currentList.filter((st: any) => st.id !== id));
            },

                // ========== MODELOS DE FORMULÁRIO ==========

                getFormTemplates: async (): Promise<FormTemplate[]> => {
                    if (isCloudEnabled) {
                        const { data } = await supabase.from('form_templates').select('*').order('title');
                        return (data || []) as FormTemplate[];
                    }
                    return getStorage<FormTemplate[]>(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
                },

                    createFormTemplate: async (template: FormTemplate): Promise<FormTemplate> => {
                        if (isCloudEnabled) {
                            const { data, error } = await supabase.from('form_templates').insert([template]).select();
                            if (error) throw error;
                            return (data && data.length > 0 ? data[0] : template) as FormTemplate;
                        }
                        const currentList = getStorage<FormTemplate[]>(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
                        setStorage(STORAGE_KEYS.TEMPLATES, [...currentList, template]);
                        return template;
                    },

                        updateFormTemplate: async (template: FormTemplate): Promise<FormTemplate> => {
                            if (isCloudEnabled) {
                                const { data, error } = await supabase.from('form_templates').update(template).eq('id', template.id).select();
                                if (error) throw error;
                                return (data && data.length > 0 ? data[0] : template) as FormTemplate;
                            }
                            const currentList = getStorage<FormTemplate[]>(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
                            const updatedList = currentList.map(t => t.id === template.id ? template : t);
                            setStorage(STORAGE_KEYS.TEMPLATES, updatedList);
                            return template;
                        },

                            deleteFormTemplate: async (id: string): Promise<void> => {
                                if (isCloudEnabled) {
                                    const { error } = await supabase.from('form_templates').delete().eq('id', id);
                                    if (error) throw error;
                                }
                                const currentList = getStorage<FormTemplate[]>(STORAGE_KEYS.TEMPLATES, DEFAULT_TEMPLATES);
                                setStorage(STORAGE_KEYS.TEMPLATES, currentList.filter(t => t.id !== id));
                            },

                                // ========== REGRAS DE ATIVAÇÃO ==========

                                getActivationRules: async (): Promise<any[]> => {
                                    if (isCloudEnabled) {
                                        const { data } = await supabase.from('activation_rules').select('*');
                                        return (data || []);
                                    }
                                    return getStorage('nexus_rules_db', [
                                        { id: 'r-1', serviceTypeId: 'st-prev', equipmentFamily: 'Refrigeração Industrial', formId: 'f-chiller' }
                                    ]);
                                },

                                    createActivationRule: async (rule: any): Promise<any> => {
                                        if (isCloudEnabled) {
                                            const { data, error } = await supabase.from('activation_rules').insert([rule]).select();
                                            if (error) throw error;
                                            return (data && data.length > 0 ? data[0] : rule);
                                        }
                                        const currentList = getStorage('nexus_rules_db', []);
                                        setStorage('nexus_rules_db', [...currentList, rule]);
                                        return rule;
                                    },

                                        updateActivationRule: async (rule: any): Promise<any> => {
                                            if (isCloudEnabled) {
                                                const { data, error } = await supabase.from('activation_rules').update(rule).eq('id', rule.id).select();
                                                if (error) throw error;
                                                return (data && data.length > 0 ? data[0] : rule);
                                            }
                                            const currentList = getStorage('nexus_rules_db', []);
                                            const updatedList = currentList.map((r: any) => r.id === rule.id ? rule : r);
                                            setStorage('nexus_rules_db', updatedList);
                                            return rule;
                                        },

                                            deleteActivationRule: async (id: string): Promise<void> => {
                                                if (isCloudEnabled) {
                                                    const { error } = await supabase.from('activation_rules').delete().eq('id', id);
                                                    if (error) throw error;
                                                }
                                                const currentList = getStorage('nexus_rules_db', []);
                                                setStorage('nexus_rules_db', currentList.filter((r: any) => r.id !== id));
                                            },
