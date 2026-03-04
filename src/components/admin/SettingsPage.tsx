
import React, { useState, useRef, useEffect } from 'react';
import { DataService } from '../../services/dataService';
import { NexusQueryClient, useTenant } from '../../hooks/nexusHooks';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Building2, Save, Mail, Phone, MapPin, Globe, Camera,
  ShieldCheck, Briefcase, Hash, CreditCard, Settings,
  Navigation, Smartphone, Lock, Unlock, ListOrdered,
  ShieldAlert, Terminal, X, UploadCloud, Languages,
  BellRing, Database, History, HardDrive, Loader2, Loader
} from 'lucide-react';

interface CompanyData {
  name: string;
  tradingName: string;
  cnpj: string;
  stateRegistration: string;
  email: string;
  phone: string;
  website: string;
  zip: string;
  city: string;
  state: string;
  address: string;
  number: string;
  complement: string;
  street: string;
  neighborhood: string;
  logoUrl?: string;
}

interface SystemParams {
  useGps: boolean;
  techAdvancedSettings: boolean;
  osPrefix: string;
  osInitialNumber: number;
  isSequenceLocked: boolean;
  language: 'pt-BR' | 'en-US' | 'es-ES';
  notifyClient: boolean;
  sessionTimeout: string;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
}

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'company' | 'system'>('company');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSuperUserUnlock, setShowSuperUserUnlock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados com Inicialização por LocalStorage (como fallback inicial)
  const [company, setCompany] = useState<CompanyData>({
    name: '',
    tradingName: '',
    cnpj: '',
    stateRegistration: 'ISENTO',
    email: '',
    phone: '',
    website: '',
    zip: '',
    city: '',
    state: '',
    address: '',
    number: '',
    complement: '',
    street: '',
    neighborhood: '',
    logoUrl: undefined
  });

  const [params, setParams] = useState<SystemParams>({
    useGps: true,
    techAdvancedSettings: false,
    osPrefix: 'OS-',
    osInitialNumber: 1001,
    isSequenceLocked: true,
    language: 'pt-BR',
    notifyClient: true,
    sessionTimeout: '2h',
    backupFrequency: 'daily'
  });

  const [dbInfo, setDbInfo] = useState<{ slug: string, id: string } | null>(null);

  // 📡 Nexus Resilient Hook (Big Tech standard)
  const { data: data, isLoading: tenantLoading, isError: tenantError, error: queryError, refetch: refetchTenant } = useTenant();

  // Sincroniza estado local com dados do banco quando carregados
  useEffect(() => {
    if (data) {
      console.log("[Settings] 📡 Nexus Sync: Sucesso!", data);

      setCompany({
        name: data.company_name || data.name || '',
        tradingName: data.trading_name || data.tradingName || data.name || '',
        cnpj: data.cnpj || data.document || '',
        stateRegistration: data.state_registration || data.ie || data.stateRegistration || 'ISENTO',
        email: data.admin_email || data.email || data.adminEmail || '',
        phone: data.phone || '',
        website: data.website || '',
        address: data.address || data.street || '',
        number: data.number || (data as any).metadata?.number || '',
        complement: data.complement || (data as any).metadata?.complement || '',
        street: data.street || (data as any).metadata?.street || '',
        neighborhood: data.neighborhood || (data as any).metadata?.neighborhood || '',
        city: data.city || (data as any).metadata?.city || '',
        state: data.state || (data as any).metadata?.state || '',
        zip: data.cep || (data as any).metadata?.cep || data.zip || '',
        logoUrl: data.logo_url || data.logoUrl || undefined
      });

      const osPref = data.os_prefix || data.osPrefix || 'OS-';
      const osStart = Number(data.os_start_number || data.osStartNumber || 1000);

      setParams(prev => ({
        ...prev,
        osPrefix: osPref,
        osInitialNumber: osStart
      }));

      setDbInfo({ slug: data.slug || '', id: data.id });
    } else if (!tenantLoading && !data) {
      console.warn("[Settings] ⚠️ Nexus Sync: Dados retornados nulos ou indefinidos.");
    }
  }, [data, tenantLoading]);

  const [isSearchingCep, setIsSearchingCep] = useState(false);

  const handleCepSearch = async (cep: string) => {
    const rawCep = cep.replace(/\D/g, '');
    if (rawCep.length === 8) {
      setIsSearchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
          setCompany(prev => ({ ...prev, address: fullAddress }));
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  // O useEffect vazio para loadSettingsData foi removido 
  // pois agora usamos o hook useTenant para carga automática e resiliente.

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const limitInBytes = 300 * 1024; // 300KB
    const targetSize = 400; // Máximo 400px (Altura ou Largura)
    const reader = new FileReader();

    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionamento inteligente via Canvas
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Mantém a proporção mas limita ao bounding box de 400x400
        if (width > height) {
          if (width > targetSize) {
            height *= targetSize / width;
            width = targetSize;
          }
        } else {
          if (height > targetSize) {
            width *= targetSize / height;
            height = targetSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Fundo transparente p/ PNG/WebP caso queira, ou limpa fundo p/ JPEG
        ctx?.clearRect(0, 0, width, height);
        ctx?.drawImage(img, 0, 0, width, height);

        // Escolhe o formato mais leve disponível (WebP é superior ao JPEG)
        // Se o navegador não suportar WebP ele cai p/ JPEG automaticamente
        const quality = 0.7; // 70% de qualidade é excelente para 400px
        let dataUrl = canvas.toDataURL('image/webp', quality);

        // Caso o arquivo WebP ainda fique maior que o original (em arquivos minúsculos)
        // ou se o original já for minúsculo e pequeno, usamos o que for menor
        if (file.size < dataUrl.length * 0.75 && file.size <= limitInBytes) {
          setCompany(prev => ({ ...prev, logoUrl: readerEvent.target?.result as string }));
        } else {
          console.log("Nexus Optimizer: Logo processada para", width + "x" + height, "px");
          setCompany(prev => ({ ...prev, logoUrl: dataUrl }));
        }
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setCompany(prev => ({ ...prev, logoUrl: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const tenantId = DataService.getCurrentTenantId();
      if (!tenantId) throw new Error("ID da empresa não identificado.");

      // SYNC WITH MASTER PANEL: Update the global record
      const payload = {
        id: tenantId,
        name: company.name,
        company_name: company.name,
        trading_name: company.tradingName,
        cnpj: company.cnpj,
        admin_email: company.email,
        phone: company.phone,
        website: company.website,
        state_registration: company.stateRegistration,
        logo_url: company.logoUrl || null,
        os_prefix: params.osPrefix,
        os_start_number: Number(params.osInitialNumber),
        // Colunas individuais solicitadas
        street: company.street || company.address,
        number: company.number,
        complement: company.complement,
        neighborhood: company.neighborhood,
        city: company.city,
        state: company.state,
        cep: company.zip
      };

      console.log("Saving Settings Payload:", payload);

      // 🛡️ Nexus Storage: Se tiver logo nova em Base64, faz upload primeiro
      if (company.logoUrl && company.logoUrl.startsWith('data:image')) {
        console.log("Detectado nova logo, iniciando upload...");
        const publicUrl = await DataService.uploadFile(company.logoUrl, `settings/logo_${tenantId}_${Date.now()}.webp`);
        payload.logo_url = publicUrl;
        console.log("Logo upload success:", publicUrl);
      } else {
        payload.logo_url = company.logoUrl || null;
      }

      const result = await DataService.updateTenant(payload);
      console.log("Save Success - DB Response:", result);

      if (result) {
        // Invalida cache global para atualizar logo no AdminLayout
        NexusQueryClient.invalidateTenant();

        // Atualiza o estado local com o que REALMENTE foi salvo no banco
        setCompany(prev => ({
          ...prev,
          logoUrl: result.logo_url || prev.logoUrl
        }));
        localStorage.setItem('nexus_settings_company', JSON.stringify({
          ...company,
          logoUrl: result.logo_url || company.logoUrl
        }));
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      alert("Erro ao sincronizar com Master: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  /* Mascaras identical to Master */
  const formatCNPJ = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 14) {
      return v
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .slice(0, 18);
    }
    return value.slice(0, 18);
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length > 10) {
      return numbers.replace(/^(\d\d)(\d{5})(\d{4}).*/, '($1) $2-$3');
    }
    return numbers.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  };

  const formatCEP = (value: string) => {
    return value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
  };

  if (tenantError || (!tenantLoading && !data)) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50/20 p-8">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl border border-red-50 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
            <ShieldAlert size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Erro de Sincronização</h2>
            <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
              Não conseguimos identificar os dados da sua organização. Isso pode ser uma falha momentânea de conexão ou permissão.
            </p>
            {queryError && (
              <p className="text-red-400 text-[9px] font-mono bg-red-50/50 p-2 rounded-lg mt-2">
                {queryError.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => refetchTenant()}
              className="w-full bg-[#1c2d4f] text-white rounded-2xl py-4 font-black uppercase tracking-widest text-[10px]"
            >
              Tentar Novamente
            </Button>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 underline"
            >
              Limpar Cache e Reiniciar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (tenantLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50/20">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="animate-spin text-primary-500" size={40} strokeWidth={1.5} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 italic">Sincronizando DUNO...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 flex flex-col h-full bg-slate-50/20 overflow-hidden animate-fade-in">
      {/* Toolbar */}
      <div className="mb-2 flex flex-col xl:flex-row gap-3 items-center">
        {/* Tabs */}
        <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'company' ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Building2 size={14} /> Organização
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'system' ? 'bg-primary-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Terminal size={14} /> Sistema
          </button>
        </div>

        {/* Middle Spacer / Status */}
        <div className="flex-1 w-full flex items-center justify-end md:justify-center gap-4">

          {saved && (
            <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100 font-black text-[9px] uppercase tracking-widest animate-bounce">
              Salvo!
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 w-full xl:w-auto justify-end">
          <Button
            form="settings-form"
            type="submit"
            isLoading={loading}
            className="rounded-xl px-6 h-[42px] font-black italic uppercase text-[10px] tracking-widest shadow-lg shadow-primary-600/20 text-white whitespace-nowrap bg-primary-600 hover:bg-primary-700"
          >
            <Save size={16} className="mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
          <form id="settings-form" onSubmit={handleSave} className="max-w-7xl mx-auto space-y-3">

            {activeTab === 'company' ? (
              <div className="space-y-3 animate-fade-in">
                {/* SEÇÃO PRINCIPAL - DENSIDADE BIG TECH */}
                <section className="bg-white p-3 rounded-xl border border-gray-100 shadow-xl space-y-3">
                  <div className="flex items-center gap-3 border-b border-gray-50 pb-2">
                    <div className="p-2 bg-primary-600 text-white rounded-lg shadow-lg shadow-primary-600/10">
                      <Building2 size={16} />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-gray-900 uppercase italic tracking-tighter leading-none">Dados Corporativos</h2>
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Identidade e registros da organização.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-3">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Razão Social</label>
                      <Input
                        value={company.name}
                        onChange={e => setCompany({ ...company, name: e.target.value })}
                        className="rounded-xl py-1.5 font-black text-sm border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">ID (Slug)</label>
                      <Input
                        disabled
                        value={dbInfo?.slug || ''}
                        icon={<Lock size={12} />}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 bg-gray-100 opacity-60 italic cursor-not-allowed"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Nome Fantasia</label>
                      <Input
                        value={company.tradingName}
                        onChange={e => setCompany({ ...company, tradingName: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">CNPJ</label>
                      <Input
                        icon={<CreditCard size={12} />}
                        value={company.cnpj}
                        onChange={e => setCompany({ ...company, cnpj: formatCNPJ(e.target.value) })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">I.E.</label>
                      <Input
                        icon={<Hash size={12} />}
                        value={company.stateRegistration}
                        onChange={e => setCompany({ ...company, stateRegistration: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">E-mail</label>
                      <Input
                        icon={<Mail size={12} />}
                        value={company.email}
                        onChange={e => setCompany({ ...company, email: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Telefone</label>
                      <Input
                        icon={<Phone size={12} />}
                        value={company.phone}
                        onChange={e => setCompany({ ...company, phone: formatPhone(e.target.value) })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Site</label>
                      <Input
                        icon={<Globe size={12} />}
                        value={company.website}
                        onChange={e => setCompany({ ...company, website: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">CEP</label>
                      <Input
                        value={company.zip || ''}
                        onChange={e => { const v = formatCEP(e.target.value); setCompany({ ...company, zip: v }); handleCepSearch(v); }}
                        icon={<MapPin size={12} />}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Logradouro</label>
                      <Input
                        value={company.street || company.address || ''}
                        onChange={e => setCompany({ ...company, street: e.target.value, address: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Número</label>
                      <Input
                        value={company.number || ''}
                        onChange={e => setCompany({ ...company, number: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Bairro</label>
                      <Input
                        value={company.neighborhood || ''}
                        onChange={e => setCompany({ ...company, neighborhood: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Cidade</label>
                      <Input
                        value={company.city || ''}
                        onChange={e => setCompany({ ...company, city: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Estado</label>
                      <Input
                        value={company.state || ''}
                        onChange={e => setCompany({ ...company, state: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block px-1">Complemento</label>
                      <Input
                        value={company.complement || ''}
                        onChange={e => setCompany({ ...company, complement: e.target.value })}
                        className="rounded-xl py-1.5 font-bold text-xs border-gray-100 focus:bg-white bg-gray-50/50 shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-50 flex items-center gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[9px] font-black text-gray-900 uppercase">Logo Oficial</h4>
                        <UploadCloud size={10} className="text-primary-500" />
                      </div>
                      <p className="text-[8px] font-bold text-gray-400 uppercase leading-tight italic">WebP/PNG (300kb)</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-12 h-12 rounded-lg border-2 border-dashed flex items-center justify-center transition-all relative overflow-hidden group shadow-inner cursor-pointer ${company.logoUrl ? 'border-primary-100 bg-primary-50/30' : 'border-gray-200 bg-gray-50'}`}
                      >
                        {company.logoUrl ? (
                          <>
                            <img src={company.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                            <div className="absolute inset-0 bg-primary-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Camera size={14} className="text-white" />
                            </div>
                          </>
                        ) : (
                          <UploadCloud size={16} className="text-gray-300 group-hover:text-primary-500" />
                        )}
                      </div>
                      {company.logoUrl && (
                        <button type="button" onClick={removeLogo} className="p-1.5 bg-red-50 text-red-500 rounded-md hover:bg-red-100">
                          <X size={12} />
                        </button>
                      )}
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                    </div>
                  </div>
                </section>

                {/* SEÇÃO DE OS */}
                <section className="bg-[#0f172a] p-3 rounded-xl border border-white/5 shadow-2xl space-y-3 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary-600/10 blur-[60px] -translate-y-1/2 translate-x-1/2"></div>
                  <div className="flex items-center gap-3 border-b border-white/5 pb-2 relative z-10">
                    <div className="p-2 bg-primary-500 text-white rounded-lg shadow-xl shadow-primary-500/10">
                      <ListOrdered size={16} />
                    </div>
                    <div>
                      <h2 className="text-base font-black uppercase italic tracking-tighter leading-none">Regras O.S.</h2>
                      <p className="text-[8px] font-black text-primary-400 uppercase tracking-widest mt-0.5">Identificação e sequencial.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 relative z-10">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1 flex items-center gap-2">Prefixo <Lock size={8} /></label>
                      <Input
                        value={params.osPrefix}
                        onChange={e => setParams({ ...params, osPrefix: e.target.value })}
                        className="rounded-xl py-1 font-black border-gray-100 bg-gray-50/10 text-gray-300 text-sm shadow-inner"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-gray-500 uppercase tracking-widest px-1 flex items-center gap-2">Próximo N° <Lock size={8} /></label>
                      <Input
                        type="number"
                        value={params.osInitialNumber}
                        onChange={e => setParams({ ...params, osInitialNumber: Number(e.target.value) })}
                        className="rounded-xl py-1 font-black border-gray-100 bg-gray-50/10 text-gray-300 text-sm shadow-inner"
                      />
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in">
                <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-xl space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                    <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                      <Languages size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight leading-none">Localização</h2>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Idioma e fuso horário.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="w-full">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Idioma</label>
                      <select
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-black text-gray-900 focus:ring-2 focus:ring-primary-100 appearance-none shadow-sm"
                        value={params.language}
                        onChange={e => setParams({ ...params, language: e.target.value as any })}
                      >
                        <option value="pt-BR">🇧🇷 Português (Brasil)</option>
                        <option value="en-US">🇺🇸 English (US)</option>
                        <option value="es-ES">🇪🇸 Español</option>
                      </select>
                    </div>
                    <div className="w-full">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Fuso Horário</label>
                      <select
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-black text-gray-900 focus:ring-2 focus:ring-primary-100 appearance-none shadow-sm"
                        defaultValue="UTC-3"
                      >
                        <option value="UTC-3">(UTC-03:00) Brasília</option>
                        <option value="UTC-5">(UTC-05:00) Eastern</option>
                        <option value="UTC+1">(UTC+01:00) Madrid</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-xl space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                    <div className="p-2.5 bg-primary-50 text-primary-600 rounded-xl">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight leading-none">Segurança e Automação</h2>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Conformidade e notificações inteligentes.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.useGps ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Navigation size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-tight">GPS em Tempo Real</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, useGps: !params.useGps })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.useGps ? 'bg-primary-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.useGps ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          Geolocalização exata no check-in/out.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.notifyClient ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <BellRing size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-black text-gray-900 uppercase tracking-tight">Notificar Clientes</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, notifyClient: !params.notifyClient })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.notifyClient ? 'bg-primary-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.notifyClient ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          WhatsApp automático ao iniciar deslocamento.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </form >
        </div >
      </div >
    </div >
  );
};
