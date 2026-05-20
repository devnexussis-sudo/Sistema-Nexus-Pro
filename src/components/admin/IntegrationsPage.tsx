import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../hooks/nexusHooks';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { 
  Key, Webhook, Plus, Copy, Trash2, Eye, EyeOff, 
  CheckCircle2, ShieldAlert, Code2, ArrowRight, X
} from 'lucide-react';
import { DataService } from '../../services/dataService';

export const IntegrationsPage: React.FC = () => {
  const { data: tenant } = useTenant();
  const [activeTab, setActiveTab] = useState<'api_keys' | 'webhooks'>('api_keys');
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<{plain: string, id: string} | null>(null);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(false);
  const [showNewHookModal, setShowNewHookModal] = useState(false);
  const [newHook, setNewHook] = useState({ name: '', url: '', events: ['os_created'] });

  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (tenant?.id) {
      fetchApiKeys();
      fetchWebhooks();
    }
  }, [tenant?.id]);

  const fetchApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });
      if (error && error.code !== '42P01') console.error('Erro ao buscar chaves:', error);
      if (data) setApiKeys(data);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchWebhooks = async () => {
    setLoadingHooks(true);
    try {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });
      if (error && error.code !== '42P01') console.error('Erro ao buscar webhooks:', error);
      if (data) setWebhooks(data);
    } finally {
      setLoadingHooks(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateApiKey = async () => {
    if (!newKeyName.trim() || !tenant?.id) return;
    
    // Gerar key segura no padrão BigTech
    const randomBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const plainKey = `nx_live_${token}`;
    
    // Para segurança (simulada aqui, idealmente backend/edge function), geramos um hash SHA-256
    const msgBuffer = new TextEncoder().encode(plainKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const prefix = plainKey.substring(0, 12) + '...' + plainKey.substring(plainKey.length - 4);

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .insert([{
          tenant_id: tenant.id,
          name: newKeyName,
          key_prefix: prefix,
          key_hash: hashHex,
          status: 'active'
        }])
        .select()
        .single();
        
      if (error) throw error;
      
      setGeneratedKey({ plain: plainKey, id: data.id });
      setShowNewKeyModal(false);
      setNewKeyName('');
      fetchApiKeys();
    } catch (err) {
      console.error(err);
      alert('Certifique-se de ter rodado a migration das tabelas de integração.');
    }
  };

  const revokeApiKey = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja revogar esta chave? Qualquer integração usando-a irá parar de funcionar imediatamente.')) return;
    
    await supabase.from('api_keys').update({ status: 'revoked' }).eq('id', id);
    fetchApiKeys();
  };

  const createWebhook = async () => {
    if (!newHook.name.trim() || !newHook.url.trim() || !tenant?.id) return;
    
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    const secret = 'whsec_' + Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');

    try {
      const { error } = await supabase
        .from('webhooks')
        .insert([{
          tenant_id: tenant.id,
          name: newHook.name,
          url: newHook.url,
          events: newHook.events,
          secret: secret,
          is_active: true
        }]);
        
      if (error) throw error;
      
      setShowNewHookModal(false);
      setNewHook({ name: '', url: '', events: ['os_created'] });
      fetchWebhooks();
    } catch (err) {
      console.error(err);
      alert('Erro ao criar webhook.');
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!window.confirm('Excluir este webhook permanentemente?')) return;
    await supabase.from('webhooks').delete().eq('id', id);
    fetchWebhooks();
  };

  return (
    <div className="p-4 md:p-8 flex flex-col h-full bg-slate-50/50 overflow-y-auto font-poppins">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800 tracking-tight flex items-center gap-2">
          <Code2 className="text-[#1c2d4f]" size={28} /> Integrações
        </h1>
        <p className="text-slate-500 text-sm mt-1">Conecte o Nexus OS a outros sistemas através de Chaves de API e Webhooks seguros.</p>
      </div>

      <div className="flex gap-4 border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('api_keys')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'api_keys' ? 'border-[#1c2d4f] text-[#1c2d4f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Key size={16} /> Chaves de API</div>
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'webhooks' ? 'border-[#1c2d4f] text-[#1c2d4f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Webhook size={16} /> Webhooks</div>
        </button>
      </div>

      {/* TABS CONTENT */}
      {activeTab === 'api_keys' && (
        <div className="space-y-6 animate-fade-in max-w-5xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-slate-600">Gerencie tokens de acesso para autenticação em consultas via API (Acesso Somente Leitura sugerido).</p>
            <div className="flex items-center gap-3">
              <Button 
                variant="secondary" 
                onClick={() => handleCopy(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api_v1`, 'api_url')}
                className="rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {copied === 'api_url' ? <CheckCircle2 size={16} className="mr-2 text-emerald-500"/> : <Copy size={16} className="mr-2 text-slate-400"/>}
                {copied === 'api_url' ? 'Copiado!' : 'Copiar URL da API'}
              </Button>
              <Button onClick={() => setShowNewKeyModal(true)} className="bg-[#1c2d4f] text-white rounded-lg shadow-sm">
                <Plus size={16} className="mr-2" /> Gerar Nova Chave
              </Button>
            </div>
          </div>

          {generatedKey && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 relative">
              <button onClick={() => setGeneratedKey(null)} className="absolute top-4 right-4 text-emerald-500 hover:text-emerald-700"><X size={20}/></button>
              <div className="flex items-start gap-4">
                <ShieldAlert className="text-emerald-600 mt-1" size={24} />
                <div className="space-y-2 flex-1">
                  <h3 className="text-emerald-900 font-semibold">Guarde sua nova Chave de API</h3>
                  <p className="text-emerald-700 text-sm">Esta chave não será exibida novamente. Copie e armazene-a em um local seguro.</p>
                  <div className="mt-4 flex items-center gap-2 bg-white border border-emerald-200 rounded-lg p-1 pr-2">
                    <code className="text-slate-800 text-sm px-3 py-2 flex-1 break-all">{generatedKey.plain}</code>
                    <Button variant="secondary" onClick={() => handleCopy(generatedKey.plain, 'new_key')} className="h-8">
                      {copied === 'new_key' ? <CheckCircle2 size={16} className="text-emerald-500"/> : <Copy size={16}/>}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {apiKeys.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Key className="mx-auto mb-3 opacity-20" size={48} />
                <p>Nenhuma chave de API gerada.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Nome</th>
                    <th className="px-6 py-4 font-medium">Chave (Prefixo)</th>
                    <th className="px-6 py-4 font-medium">Criada em</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apiKeys.map(key => (
                    <tr key={key.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-medium text-slate-800">{key.name}</td>
                      <td className="px-6 py-4 font-mono text-xs">{key.key_prefix}</td>
                      <td className="px-6 py-4">{new Date(key.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-6 py-4">
                        {key.status === 'active' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 uppercase tracking-widest">Ativo</span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 uppercase tracking-widest">Revogado</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {key.status === 'active' && (
                          <button onClick={() => revokeApiKey(key.id)} className="text-red-500 hover:text-red-700 font-medium text-xs">Revogar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'webhooks' && (
        <div className="space-y-6 animate-fade-in max-w-5xl">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Envie eventos em tempo real para sistemas externos via requisições HTTP (POST).</p>
            <Button onClick={() => setShowNewHookModal(true)} className="bg-[#1c2d4f] text-white rounded-lg shadow-sm">
              <Plus size={16} className="mr-2" /> Novo Webhook
            </Button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {webhooks.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Webhook className="mx-auto mb-3 opacity-20" size={48} />
                <p>Nenhum webhook configurado.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Nome</th>
                    <th className="px-6 py-4 font-medium">URL de Destino</th>
                    <th className="px-6 py-4 font-medium">Eventos</th>
                    <th className="px-6 py-4 font-medium">Assinatura (Secret)</th>
                    <th className="px-6 py-4 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {webhooks.map(hook => (
                    <tr key={hook.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-medium text-slate-800">{hook.name}</td>
                      <td className="px-6 py-4 font-mono text-xs truncate max-w-[200px]">{hook.url}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {hook.events.map((ev: string) => (
                            <span key={ev} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] uppercase font-semibold">{ev}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        <div className="flex items-center gap-2 group">
                           <span>{hook.secret.substring(0,10)}...</span>
                           <button onClick={() => handleCopy(hook.secret, hook.id)} className="text-slate-400 hover:text-[#1c2d4f] opacity-0 group-hover:opacity-100 transition-opacity">
                             {copied === hook.id ? <CheckCircle2 size={14}/> : <Copy size={14}/>}
                           </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => deleteWebhook(hook.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal Nova Chave */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Criar Chave de API</h3>
            <p className="text-xs text-slate-500 mb-6">Crie um token seguro de autenticação para acesso aos dados via API.</p>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-1.5 block">Nome da Integração</label>
                <Input 
                  placeholder="Ex: ERP ContaAzul, Integração PowerBI" 
                  value={newKeyName} 
                  onChange={e => setNewKeyName(e.target.value)} 
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowNewKeyModal(false)}>Cancelar</Button>
              <Button onClick={generateApiKey} disabled={!newKeyName.trim()} className="bg-[#1c2d4f]">Gerar Chave</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Novo Webhook */}
      {showNewHookModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-slate-800 mb-1">Adicionar Webhook</h3>
            <p className="text-xs text-slate-500 mb-6">Receba eventos do Nexus OS em sua própria aplicação.</p>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-1.5 block">Descrição</label>
                <Input placeholder="Ex: Notificador Slack" value={newHook.name} onChange={e => setNewHook({...newHook, name: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-1.5 block">Endpoint URL</label>
                <Input placeholder="https://sua-api.com/webhook" value={newHook.url} onChange={e => setNewHook({...newHook, url: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-2 block mt-4">Eventos Escutados</label>
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  {['os_created', 'os_updated', 'quote_approved', 'stock_updated'].map(ev => (
                    <label key={ev} className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={newHook.events.includes(ev)}
                        onChange={(e) => {
                          if (e.target.checked) setNewHook({...newHook, events: [...newHook.events, ev]});
                          else setNewHook({...newHook, events: newHook.events.filter(x => x !== ev)});
                        }}
                        className="rounded border-slate-300 text-[#1c2d4f] focus:ring-[#1c2d4f]"
                      />
                      <span className="text-sm font-mono text-slate-700">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowNewHookModal(false)}>Cancelar</Button>
              <Button onClick={createWebhook} disabled={!newHook.name.trim() || !newHook.url.trim() || newHook.events.length===0} className="bg-[#1c2d4f]">Criar Webhook</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
