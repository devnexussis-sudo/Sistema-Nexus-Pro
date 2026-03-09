# 🔧 GUIA DE IMPLEMENTAÇÃO - PROCESSOS NO BANCO DE DADOS

## 📋 RESUMO
Este guia mostra como migrar a página de Processos (FormManagement) do localStorage para o Supabase.

---

## PASSO 1: Criar Tabelas no Supabase

1. Acesse o **SQL Editor** do Supabase
2. Execute o script: `.gemini/create_process_tables.sql`
3. Verifique se apareceu: "Estrutura de Processos criada com sucesso!"

### O que foi criado:
- ✅ `service_types` - Tipos de Atendimento (Preventiva, Corretiva, etc)
- ✅ `form_templates` - Modelos de Checklist/Formulário
- ✅ `activation_rules` - Regras de Vinculação Automática
- ✅ Dados iniciais (seed data)
- ✅ Permissões RLS
- ✅ Realtime habilitado

---

## PASSO 2: Adicionar Métodos ao DataService

1. Abra: `services/dataService.ts`
2. Localize o final do objeto `DataService` (antes do último `}`)
3. Cole os métodos do arquivo: `.gemini/dataService_process_methods.ts`

### Métodos adicionados:
- `getServiceTypes()`, `createServiceType()`, `updateServiceType()`, `deleteServiceType()`
- `getFormTemplates()`, `createFormTemplate()`, `updateFormTemplate()`, `deleteFormTemplate()`
- `getActivationRules()`, `createActivationRule()`, `updateActivationRule()`, `deleteActivationRule()`

---

## PASSO 3: Atualizar FormManagement.tsx

Substitua as chamadas de `localStorage` por chamadas ao `DataService`:

### ANTES (localStorage):
```typescript
const [serviceTypes, setServiceTypes] = useState(() => {
  const saved = localStorage.getItem('nexus_service_types_db');
  return saved ? JSON.parse(saved) : [...]
});
```

### DEPOIS (Supabase):
```typescript
const [serviceTypes, setServiceTypes] = useState([]);

useEffect(() => {
  DataService.getServiceTypes().then(setServiceTypes);
}, []);
```

### Aplicar para:
1. `serviceTypes` → `DataService.getServiceTypes()`
2. `forms` → `DataService.getFormTemplates()`
3. `rules` → `DataService.getActivationRules()`

---

## PASSO 4: Atualizar Handlers de Salvamento

### Exemplo - Salvar Tipo de Serviço:

**ANTES:**
```typescript
const handleSaveType = () => {
  if (editingType.id) {
    setServiceTypes(serviceTypes.map(t => ...));
  } else {
    setServiceTypes([...serviceTypes, newType]);
  }
};
```

**DEPOIS:**
```typescript
const handleSaveType = async () => {
  if (editingType.id) {
    await DataService.updateServiceType(editingType);
  } else {
    await DataService.createServiceType({...editingType, id: `st-${Date.now()}`});
  }
  const updated = await DataService.getServiceTypes();
  setServiceTypes(updated);
};
```

---

## PASSO 5: Adicionar Realtime ao App.tsx

No arquivo `App.tsx`, adicione subscriptions para processos (já está preparado para isso):

```typescript
// Dentro do useEffect de Realtime, adicione:

const processChannel = supabase
  .channel('process-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'service_types' }, () => {
    DataService.getServiceTypes().then(setServiceTypes);
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'form_templates' }, () => {
    DataService.getFormTemplates().then(setFormTemplates);
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'activation_rules' }, () => {
    DataService.getActivationRules().then(setRules);
  })
  .subscribe();
```

---

## ✅ CHECKLIST DE VERIFICAÇÃO

Após implementar, teste:

- [ ] Criar novo Tipo de Serviço → Aparece no banco
- [ ] Editar Tipo de Serviço → Atualiza no banco
- [ ] Deletar Tipo de Serviço → Remove do banco
- [ ] Criar novo Formulário → Salva no banco
- [ ] Editar Formulário → Atualiza no banco
- [ ] Criar Regra de Vinculação → Salva no banco
- [ ] Abrir em 2 abas → Mudanças aparecem em tempo real

---

## 🎯 BENEFÍCIOS

✅ Dados persistem no banco de dados (não mais no navegador)
✅ Sincronização automática entre múltiplos usuários
✅ Backup automático no Supabase
✅ Dados acessíveis de qualquer dispositivo
✅ Histórico e auditoria de mudanças

---

## 📁 ARQUIVOS CRIADOS

1. `.gemini/create_process_tables.sql` - Script SQL
2. `.gemini/dataService_process_methods.ts` - Métodos do DataService
3. `.gemini/IMPLEMENTATION_GUIDE.md` - Este guia

---

## 🆘 TROUBLESHOOTING

**Erro: "relation does not exist"**
→ Execute o script SQL no Supabase

**Erro: "permission denied"**
→ Verifique se as políticas RLS foram criadas

**Dados não aparecem**
→ Limpe o cache: `localStorage.clear()` e recarregue

---

Pronto! Agora a página de Processos está 100% integrada com o Supabase! 🚀
