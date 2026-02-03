
import React, { useState, useRef, useEffect } from 'react';
import { DataService } from '../../services/dataService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Building2, Save, Mail, Phone, MapPin, Globe, Camera,
  ShieldCheck, Briefcase, Hash, CreditCard, Settings,
  Navigation, Smartphone, Lock, Unlock, ListOrdered,
  ShieldAlert, Terminal, X, UploadCloud, Languages,
  BellRing, Database, History, HardDrive, Loader2
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

  const loadSettingsData = async () => {
    const tenantId = DataService.getCurrentTenantId();
    console.log("SettingsPage Sync: Tenant ID identified as:", tenantId);

    if (!tenantId) {
      console.warn("SettingsPage Sync: No tenant ID found. Fields will remain default.");
      return;
    }

    try {
      setLoading(true);
      const data = await DataService.getTenantById(tenantId);
      console.log("SettingsPage Sync: Database Response for Tenant:", data);

      if (data) {
        // Robust mapping: Try every possible field name variation used in Master or Database
        setCompany({
          name: data.company_name || data.name || '',
          tradingName: data.trading_name || data.name || '',
          cnpj: data.cnpj || data.document || '',
          stateRegistration: data.state_registration || data.ie || 'ISENTO',
          email: data.admin_email || data.email || '',
          phone: data.phone || '',
          website: data.website || '',
          address: data.address || data.street || '',
          // Lógica de prioridade: Coluna Direta -> Metadata -> Fallback
          number: data.number || data.metadata?.number || '',
          complement: data.complement || data.metadata?.complement || '',
          street: data.street || data.metadata?.street || '',
          neighborhood: data.neighborhood || data.metadata?.neighborhood || '',
          city: data.city || data.metadata?.city || '',
          state: data.state || data.metadata?.state || '',
          zip: data.cep || data.metadata?.cep || data.zip || '',
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
      } else {
        console.error("SettingsPage Sync: Tenant found but returned no data object.");
      }
    } catch (e) {
      console.error("SettingsPage Sync: Critical error communicating with database.", e);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    loadSettingsData();
  }, []);

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
      const result = await DataService.updateTenant(payload);
      console.log("Save Success - DB Response:", result);

      if (result) {
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

  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden animate-fade-in">
      {/* Toolbar */}
      <div className="mb-2 flex flex-col xl:flex-row gap-3 items-center">
        {/* Tabs */}
        <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'company' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Building2 size={14} /> Organização
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'system' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Terminal size={14} /> Sistema
          </button>
        </div>

        {/* Middle Spacer / Status */}
        <div className="flex-1 w-full flex items-center justify-end md:justify-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-100 shadow-sm">
            <Lock size={12} className="text-amber-600" />
            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest hidden md:inline">Somente Leitura (Nexus Global)</span>
            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest md:hidden">Read-Only</span>
          </div>
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
            className="rounded-xl px-6 h-[42px] font-black italic uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 text-white whitespace-nowrap bg-indigo-600 hover:bg-indigo-700"
          >
            <Save size={16} className="mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <form id="settings-form" onSubmit={handleSave} className="max-w-6xl mx-auto space-y-10">

            {activeTab === 'company' ? (
              <div className="space-y-10 animate-fade-in">
                {/* SEÇÃO PRINCIPAL - IGUAL AO SUPER ADMIN */}
                <section className="bg-white p-10 rounded-[4rem] border border-gray-100 shadow-2xl shadow-gray-200/50 space-y-12">
                  <div className="flex items-center gap-6 border-b border-gray-50 pb-8">
                    <div className="p-5 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-600/20">
                      <Building2 size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tighter">Dados da Organização</h2>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Informações vinculadas ao provisionamento Master.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <div className="md:col-span-2">
                      <Input
                        label="Razão Social Completa"
                        disabled
                        value={company.name}
                        className="rounded-2xl py-5 font-black text-lg border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>
                    <Input
                      label="Nome Fantasia"
                      disabled
                      value={company.tradingName}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed"
                    />
                    <Input
                      label="Identificador do Sistema (Slug)"
                      disabled
                      value={dbInfo?.slug || ''}
                      icon={<Lock size={16} />}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-100 opacity-60 italic"
                    />
                    <Input
                      label="CNPJ"
                      disabled
                      icon={<CreditCard size={16} />}
                      value={company.cnpj}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed"
                    />
                    <Input
                      label="Inscrição Estadual"
                      disabled
                      icon={<Hash size={16} />}
                      value={company.stateRegistration}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed"
                    />

                    <Input
                      label="E-mail de Contato"
                      disabled
                      icon={<Mail size={16} />}
                      value={company.email}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                    />
                    <Input
                      label="Telefone Comercial"
                      disabled
                      icon={<Phone size={16} />}
                      value={company.phone}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                    />
                    <Input
                      label="Website"
                      disabled
                      icon={<Globe size={16} />}
                      value={company.website}
                      className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                    />

                    <div className="lg:col-span-1">
                      <Input
                        label="CEP"
                        disabled
                        value={company.zip || ''}
                        icon={<MapPin size={16} />}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <Input
                        label="Logradouro"
                        disabled
                        value={company.street || company.address || ''}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>

                    <div className="lg:col-span-1">
                      <Input
                        label="Número"
                        disabled
                        value={company.number || ''}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>

                    <div className="lg:col-span-1">
                      <Input
                        label="Bairro"
                        disabled
                        value={company.neighborhood || ''}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>

                    <div className="lg:col-span-1">
                      <Input
                        label="Cidade"
                        disabled
                        value={company.city || ''}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>

                    <div className="lg:col-span-1">
                      <Input
                        label="Estado (UF)"
                        disabled
                        value={company.state || ''}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>

                    <div className="lg:col-span-3">
                      <Input
                        label="Complemento"
                        disabled
                        value={company.complement || ''}
                        className="rounded-2xl py-5 font-bold border-gray-100 bg-gray-50/50 opacity-80 cursor-not-allowed shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="pt-8 border-t border-gray-50 flex flex-col md:flex-row items-center gap-10">
                    <div className="space-y-2 text-center md:text-left">
                      <div className="flex items-center gap-2 justify-center md:justify-start">
                        <h4 className="text-xs font-black text-gray-900 uppercase">Logotipo da Empresa</h4>
                        <UploadCloud size={12} className="text-indigo-500" />
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase leading-tight w-48 italic">
                        Clique na imagem para trocar a Logotipo oficial da sua instância.
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-32 h-32 rounded-[2.5rem] border-2 border-dashed flex items-center justify-center transition-all relative overflow-hidden group shadow-inner cursor-pointer ${company.logoUrl
                          ? 'border-indigo-100 bg-indigo-50/30'
                          : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-white'}`}
                      >
                        {company.logoUrl ? (
                          <>
                            <img src={company.logoUrl} alt="Company Logo" className="w-full h-full object-contain p-4" />
                            <div className="absolute inset-0 bg-indigo-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Camera size={28} className="text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-gray-400 group-hover:text-indigo-500">
                            <UploadCloud size={32} />
                            <span className="text-[9px] font-black uppercase">Subir Logo</span>
                          </div>
                        )}
                      </div>
                      {company.logoUrl && (
                        <button
                          type="button"
                          onClick={removeLogo}
                          className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                          title="Remover Logotipo"
                        >
                          <X size={18} />
                        </button>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleLogoUpload}
                      />
                    </div>
                  </div>
                </section>

                {/* SEÇÃO DE OS - IGUAL AO SUPER ADMIN */}
                <section className="bg-[#0f172a] p-10 rounded-[4rem] border border-white/5 shadow-2xl space-y-10 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/10 blur-[100px] -translate-y-1/2 translate-x-1/2"></div>

                  <div className="flex items-center gap-6 border-b border-white/5 pb-8 relative z-10">
                    <div className="p-5 bg-indigo-500 text-white rounded-[1.5rem] shadow-xl shadow-indigo-500/20">
                      <ListOrdered size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase italic tracking-tighter">Regras de Protocolos (O.S.)</h2>
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Configuração de numeração e identificação.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 flex items-center gap-2">
                        Prefixo do Código <Lock size={10} />
                      </label>
                      <Input
                        disabled
                        value={params.osPrefix}
                        className="rounded-2xl py-5 font-black border-gray-100 bg-gray-50/50 text-gray-500 cursor-not-allowed text-lg shadow-inner"
                      />
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 flex items-center gap-2">
                        Número Inicial <Lock size={10} />
                      </label>
                      <Input
                        disabled
                        type="number"
                        value={params.osInitialNumber}
                        className="rounded-2xl py-5 font-black border-gray-100 bg-gray-50/50 text-gray-500 cursor-not-allowed text-lg shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="p-8 bg-indigo-600/10 rounded-[2.5rem] border border-indigo-500/20 flex gap-6 items-center relative z-10">
                    <ShieldAlert className="text-indigo-400 flex-shrink-0" size={32} />
                    <p className="text-xs font-bold text-gray-300 leading-relaxed italic">
                      Nota Técnica: Estas regras definem como os novos protocolos serão gerados. Alterações impactam apenas futuras ordens de serviço.
                    </p>
                  </div>
                </section>
              </div>
            ) : (

              <div className="space-y-10 animate-fade-in">
                <section className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-2xl shadow-gray-200/50 space-y-8">
                  <div className="flex items-center gap-4 border-b border-gray-50 pb-6">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                      <Languages size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Localização e Regional</h2>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Idiomas e fuso horário da plataforma.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="w-full">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2 block">Idioma do Sistema</label>
                      <select
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-black text-gray-900 focus:ring-4 focus:ring-indigo-100 appearance-none shadow-sm"
                        value={params.language}
                        onChange={e => setParams({ ...params, language: e.target.value as any })}
                      >
                        <option value="pt-BR">🇧🇷 Português (Brasil)</option>
                        <option value="en-US">🇺🇸 English (United States)</option>
                        <option value="es-ES">🇪🇸 Español (España)</option>
                      </select>
                    </div>
                    <div className="w-full">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2 block">Fuso Horário Operacional</label>
                      <select
                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-sm font-black text-gray-900 focus:ring-4 focus:ring-indigo-100 appearance-none shadow-sm"
                        defaultValue="UTC-3"
                      >
                        <option value="UTC-3">(UTC-03:00) Brasília</option>
                        <option value="UTC-5">(UTC-05:00) Eastern Time</option>
                        <option value="UTC+1">(UTC+01:00) Madrid/Paris</option>
                      </select>
                    </div>
                  </div>
                </section>

                <section className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-2xl shadow-gray-200/50 space-y-10">
                  <div className="flex items-center gap-4 border-b border-gray-50 pb-6">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                      <Smartphone size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Operações e Segurança</h2>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Controles técnicos e de acesso.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="flex items-start gap-6 p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-4 rounded-2xl shadow-inner transition-colors ${params.useGps ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Navigation size={28} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">GPS em Tempo Real</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, useGps: !params.useGps })}
                            className={`w-14 h-7 rounded-full relative transition-colors ${params.useGps ? 'bg-indigo-600' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${params.useGps ? 'left-8' : 'left-1'}`}></div>
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase leading-relaxed">
                          Registrar geolocalização exata nos eventos de check-in/out.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-6 p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-4 rounded-2xl shadow-inner transition-colors ${params.notifyClient ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <BellRing size={28} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Notificar Clientes</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, notifyClient: !params.notifyClient })}
                            className={`w-14 h-7 rounded-full relative transition-colors ${params.notifyClient ? 'bg-indigo-600' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${params.notifyClient ? 'left-8' : 'left-1'}`}></div>
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase leading-relaxed">
                          Enviar WhatsApp automático ao iniciar o deslocamento técnico.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
