import React, { useState, useRef, useEffect } from 'react';
import { DataService } from '../../services/dataService';
import { NexusQueryClient, useTenant } from '../../hooks/nexusHooks';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Building2, Save, Mail, Phone, MapPin, Globe, Camera,
  ShieldCheck, Briefcase, Hash, CreditCard, Settings,
  Navigation, Smartphone, Lock, Unlock, ListOrdered,
  ShieldAlert, X, UploadCloud, Languages,
  BellRing, Database, History, HardDrive, Loader2, Loader, Share2, PlayCircle, PieChart, Target, ImagePlus,
  Monitor
} from 'lucide-react';
import { useI18n, TIMEZONE_OPTIONS, type SupportedLocale, type SupportedTimezone } from '../../i18n';
import { usePermissions } from '../../hooks/usePermissions';

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
  timezone: string;
  notifyClient: boolean;
  sessionTimeout: string;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  showItemPricesInApp: boolean;
  showItemPricesInPublicView: boolean;
  allowOsSharing: boolean;
  allowMultipleInProgress: boolean;
  // Novos controles do APP do Técnico
  showClientContact: boolean;
  showStockHistory: boolean;
  allowImpediment: boolean;
  showVisitHistory: boolean;
  slaTargetPercentage: number;
  sla48hTargetPercentage: number;
  // Controles do Link Público
  showVisitHistoryInPublicLink: boolean;
}

export const SettingsPage: React.FC = () => {
  const { t, locale, timezone, setLocale, setTimezone } = useI18n();
  const { isAdmin, permissions } = usePermissions();

  // Determina quais abas o usuário pode acessar
  const tabAccess = {
    company: isAdmin || permissions?.settingsTabs?.company === true,
    system: isAdmin || permissions?.settingsTabs?.system === true,
    app: isAdmin || permissions?.settingsTabs?.app === true,
    dashboard: isAdmin || permissions?.settingsTabs?.dashboard === true,
  };

  // Primeira aba acessível como default
  const firstAvailable = (['company', 'system', 'app', 'dashboard'] as const).find(k => tabAccess[k]) || 'company';

  const [activeTab, setActiveTab] = useState<'company' | 'system' | 'app' | 'dashboard'>(firstAvailable);
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
    language: locale as any,
    timezone: timezone,
    notifyClient: true,
    sessionTimeout: '2h',
    backupFrequency: 'daily',
    showItemPricesInApp: false,
    showItemPricesInPublicView: true,
    allowOsSharing: true,
    allowMultipleInProgress: false,
    showClientContact: true,
    showStockHistory: true,
    allowImpediment: true,
    showVisitHistory: true,
    slaTargetPercentage: 85,
    sla48hTargetPercentage: 90,
    showVisitHistoryInPublicLink: true,
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
        osInitialNumber: osStart,
        language: data.metadata?.language || prev.language,
        timezone: data.metadata?.timezone || prev.timezone,
        showItemPricesInApp: data.metadata?.showItemPricesInApp ?? false,
        showItemPricesInPublicView: data.metadata?.showItemPricesInPublicView ?? true,
        allowOsSharing: data.metadata?.allowOsSharing ?? true,
        allowMultipleInProgress: data.metadata?.allowMultipleInProgress ?? false,
        showClientContact: data.metadata?.showClientContact ?? true,
        showStockHistory: data.metadata?.showStockHistory ?? true,
        allowImpediment: data.metadata?.allowImpediment ?? true,
        showVisitHistory: data.metadata?.showVisitHistory ?? true,
        slaTargetPercentage: data.metadata?.slaTargetPercentage ?? 85,
        sla48hTargetPercentage: data.metadata?.sla48hTargetPercentage ?? 90,
        showVisitHistoryInPublicLink: data.metadata?.showVisitHistoryInPublicLink ?? true,
      }));

      // Sincronizar I18nContext com dados do banco
      if (data.metadata?.language) {
        setLocale(data.metadata.language as SupportedLocale);
      }
      if (data.metadata?.timezone) {
        setTimezone(data.metadata.timezone as SupportedTimezone);
      }

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
          setCompany(prev => ({
            ...prev,
            street: data.logradouro || '',
            address: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || ''
          }));
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
        cep: company.zip,
        metadata: {
          ...data?.metadata,
          showItemPricesInApp: params.showItemPricesInApp,
          showItemPricesInPublicView: params.showItemPricesInPublicView,
          techAdvancedSettings: params.techAdvancedSettings,
          allowOsSharing: params.allowOsSharing,
          allowMultipleInProgress: params.allowMultipleInProgress,
          showClientContact: params.showClientContact,
          showStockHistory: params.showStockHistory,
          allowImpediment: params.allowImpediment,
          showVisitHistory: params.showVisitHistory,
          language: params.language,
          timezone: params.timezone,
          slaTargetPercentage: params.slaTargetPercentage,
          sla48hTargetPercentage: params.sla48hTargetPercentage,
          showVisitHistoryInPublicLink: params.showVisitHistoryInPublicLink,
        }
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

      // Sincronizar idioma e timezone com I18nContext
      setLocale(params.language as SupportedLocale);
      setTimezone(params.timezone as SupportedTimezone);

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
            <h2 className="text-xl font-medium text-slate-800 uppercase tracking-tighter">Erro de Sincronização</h2>
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
              className="w-full bg-[#1c2d4f] text-white rounded-2xl py-4 font-medium uppercase tracking-widest text-[10px]"
            >
              Tentar Novamente
            </Button>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="text-[9px] font-medium text-slate-400 uppercase tracking-widest hover:text-slate-600 underline"
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
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400 italic">Sincronizando DUNO...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
      {/* Toolbar */}
      <div className="mb-2 flex flex-col xl:flex-row gap-3 items-center">
        {/* Tabs — só exibe abas que o grupo pode acessar */}
        <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-lg shadow-slate-200/50 flex-shrink-0">
          {tabAccess.company && (
            <button
              type="button"
              onClick={() => setActiveTab('company')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${activeTab === 'company' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Building2 size={14} /> {t.settings.tabs.company}
            </button>
          )}
          {tabAccess.system && (
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${activeTab === 'system' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Monitor size={14} /> {t.settings.tabs.system}
            </button>
          )}
          {tabAccess.app && (
            <button
              type="button"
              onClick={() => setActiveTab('app')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${activeTab === 'app' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Smartphone size={14} /> {t.settings.tabs.app}
            </button>
          )}
          {tabAccess.dashboard && (
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${activeTab === 'dashboard' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <PieChart size={14} /> {t.settings.tabs.dashboard}
            </button>
          )}
        </div>

        {/* Middle Spacer / Status */}
        <div className="flex-1 w-full flex items-center justify-end md:justify-center gap-4">

          {saved && (
            <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-100 font-medium text-[9px] uppercase tracking-widest animate-bounce">
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
            className="rounded-xl px-6 h-[42px] font-medium italic uppercase text-[10px] tracking-widest shadow-lg shadow-primary-600/20 text-white whitespace-nowrap bg-primary-600 hover:bg-primary-700"
          >
            <Save size={16} className="mr-2" /> {t.common.save}
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
          <form id="settings-form" onSubmit={handleSave} className="max-w-7xl mx-auto space-y-3">

            {!tabAccess.company && !tabAccess.system && !tabAccess.app && !tabAccess.dashboard && (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-4">
                <ShieldAlert size={48} className="text-slate-300" />
                <h3 className="text-lg font-medium text-slate-600">Acesso Restrito</h3>
                <p className="text-[11px] uppercase tracking-widest text-center max-w-sm">Você não tem permissão para visualizar ou editar as configurações do sistema.</p>
              </div>
            )}

            {activeTab === 'company' && tabAccess.company && (
              <div className="space-y-3 animate-fade-in">
                {/* SEÇÃO PRINCIPAL - DENSIDADE BIG TECH */}
                <section className="bg-white p-3 rounded-xl border border-gray-100 shadow-xl space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-[#1c2d4f]/10 text-[#1c2d4f] rounded-xl">
                        <Building2 size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 tracking-tight leading-none">{t.settings.company.title}</h2>
                        <p className="text-[10px] font-medium text-gray-400 mt-1">{t.settings.company.subtitle}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-gray-50/50 p-2.5 rounded-2xl border border-gray-100 shrink-0">
                      <div className="space-y-1 text-right pr-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <h4 className="text-[11px] font-semibold text-gray-900 uppercase tracking-tight">{t.settings.company.logo}</h4>
                          <UploadCloud size={14} className="text-primary-500" />
                        </div>
                        <p className="text-[9px] font-medium text-gray-400 uppercase leading-tight italic">{t.settings.company.logoFormat}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-20 h-20 rounded-[1.25rem] border border-slate-200 flex items-center justify-center transition-all relative overflow-hidden group shadow-sm cursor-pointer ${company.logoUrl ? 'bg-white' : 'bg-white hover:bg-slate-50'}`}
                        >
                          {company.logoUrl ? (
                            <>
                              <img src={company.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                              <div className="absolute inset-0 bg-[#1c2d4f]/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera size={24} className="text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-300 group-hover:text-[#1c2d4f] transition-colors">
                              <ImagePlus size={28} strokeWidth={1.5} />
                            </div>
                          )}
                        </div>
                        {company.logoUrl && (
                          <button type="button" onClick={removeLogo} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors shrink-0">
                            <X size={16} />
                          </button>
                        )}
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 flex items-start gap-3">
                    <ShieldAlert size={16} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                      <strong className="font-bold uppercase tracking-tight">{t.settings.company.lgpdTitle}</strong> {t.settings.company.lgpdNotice}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-3">
                      <label className="text-[11px] font-medium text-gray-400 mb-1 block px-1">{t.settings.company.businessName}</label>
                      <Input
                        disabled
                        value={company.name}
                        className="rounded-xl py-1.5 font-medium text-[13px] border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.slug}</label>
                      <Input
                        disabled
                        value={dbInfo?.slug || ''}
                        icon={<Lock size={12} />}
                        className="rounded-xl py-1.5 font-normal text-xs border-gray-100 bg-gray-50 opacity-80 italic cursor-not-allowed"
                      />
                    </div>

                    <div className="lg:col-span-2">
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.tradeName}</label>
                      <Input
                        disabled
                        value={company.tradingName}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.cnpj}</label>
                      <Input
                        disabled
                        icon={<CreditCard size={12} />}
                        value={company.cnpj}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.stateRegistration}</label>
                      <Input
                        disabled
                        icon={<Hash size={12} />}
                        value={company.stateRegistration}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.common.email}</label>
                      <Input
                        disabled
                        icon={<Mail size={12} />}
                        value={company.email}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.common.phone}</label>
                      <Input
                        disabled
                        icon={<Phone size={12} />}
                        value={company.phone}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.site}</label>
                      <Input
                        disabled
                        icon={<Globe size={12} />}
                        value={company.website}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.cep}</label>
                      <Input
                        disabled
                        value={company.zip || ''}
                        icon={<MapPin size={12} />}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.street}</label>
                      <Input
                        disabled
                        value={company.street || company.address || ''}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.number}</label>
                      <Input
                        disabled
                        value={company.number || ''}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.neighborhood}</label>
                      <Input
                        disabled
                        value={company.neighborhood || ''}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.city}</label>
                      <Input
                        disabled
                        value={company.city || ''}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.state}</label>
                      <Input
                        disabled
                        value={company.state || ''}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block px-1">{t.settings.company.complement}</label>
                      <Input
                        disabled
                        value={company.complement || ''}
                        className="rounded-xl py-1.5 font-normal text-xs text-gray-700 border-gray-100 bg-gray-50 opacity-80 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </section>


              </div>
            )}

            {activeTab === 'system' && tabAccess.system && (
              <div className="space-y-4 animate-fade-in">
                <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-xl space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                    <div className="p-2.5 bg-[#1c2d4f]/10 text-[#1c2d4f] rounded-xl">
                      <Languages size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 uppercase tracking-tight leading-none">{t.settings.system.title}</h2>
                      <p className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mt-1">{t.settings.system.subtitle}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="w-full">
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block">{t.settings.system.language}</label>
                      <select
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-primary-100 appearance-none shadow-sm"
                        value={params.language}
                        onChange={e => setParams({ ...params, language: e.target.value as any })}
                      >
                        <option value="pt-BR">🇧🇷 Português (Brasil)</option>
                        <option value="en-US">🇺🇸 English (US)</option>
                        <option value="es-ES">🇪🇸 Español</option>
                      </select>
                    </div>
                    <div className="w-full">
                      <label className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mb-1 block">{t.settings.system.timezone}</label>
                      <select
                        className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-primary-100 appearance-none shadow-sm"
                        value={params.timezone}
                        onChange={e => setParams({ ...params, timezone: e.target.value as any })}
                      >
                        {TIMEZONE_OPTIONS.map(tz => (
                          <option key={tz.value} value={tz.value}>({tz.offset}) {tz.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Toggle: Histórico de Visitas no Link Público */}
                  <div className="mt-2 pt-4 border-t border-gray-100">
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.showVisitHistoryInPublicLink ? 'bg-cyan-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <History size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">Histórico de Visitas no Link Público</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, showVisitHistoryInPublicLink: !params.showVisitHistoryInPublicLink })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.showVisitHistoryInPublicLink ? 'bg-cyan-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.showVisitHistoryInPublicLink ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          Quando ativado, o cliente visualiza todas as visitas realizadas na OS. Quando desativado, apenas a visita de conclusão é exibida no link público.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>


              </div>
            )}

            {activeTab === 'dashboard' && tabAccess.dashboard && (
              <div className="space-y-4 animate-fade-in">
                <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-xl space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                    <div className="p-2.5 bg-[#1c2d4f]/10 text-[#1c2d4f] rounded-xl">
                      <PieChart size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 uppercase tracking-tight leading-none">{t.settings.dashboard.title}</h2>
                      <p className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mt-1">{t.settings.dashboard.subtitle}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors bg-indigo-600 text-white`}>
                        <Target size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.dashboard.sla24h}</h4>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed mb-3">
                          {t.settings.dashboard.sla24hDescription}
                        </p>
                        <div className="flex items-center gap-2">
                           <Input
                             type="number"
                             min={0}
                             max={100}
                             value={params.slaTargetPercentage}
                             onChange={e => setParams({ ...params, slaTargetPercentage: Number(e.target.value) })}
                             className="rounded-xl py-1 font-medium border-gray-100 bg-white text-gray-900 text-sm shadow-inner w-24 text-center"
                           />
                           <span className="text-[10px] font-bold text-gray-500">%</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors bg-emerald-600 text-white`}>
                        <Target size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.dashboard.sla48h}</h4>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed mb-3">
                          {t.settings.dashboard.sla48hDescription}
                        </p>
                        <div className="flex items-center gap-2">
                           <Input
                             type="number"
                             min={0}
                             max={100}
                             value={params.sla48hTargetPercentage}
                             onChange={e => setParams({ ...params, sla48hTargetPercentage: Number(e.target.value) })}
                             className="rounded-xl py-1 font-medium border-gray-100 bg-white text-gray-900 text-sm shadow-inner w-24 text-center"
                           />
                           <span className="text-[10px] font-bold text-gray-500">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'app' && tabAccess.app && (
              <div className="space-y-4 animate-fade-in">
                <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-xl space-y-4">
                  <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
                    <div className="p-2.5 bg-[#1c2d4f]/10 text-[#1c2d4f] rounded-xl">
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 uppercase tracking-tight leading-none">{t.settings.app.title}</h2>
                      <p className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mt-1">{t.settings.app.subtitle}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.showItemPricesInApp ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <CreditCard size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.showPrices}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, showItemPricesInApp: !params.showItemPricesInApp })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.showItemPricesInApp ? 'bg-emerald-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.showItemPricesInApp ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.showPricesDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.allowOsSharing ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Share2 size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.sharing}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, allowOsSharing: !params.allowOsSharing })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.allowOsSharing ? 'bg-blue-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.allowOsSharing ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.sharingDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.showItemPricesInPublicView ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Globe size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.publicPrices}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, showItemPricesInPublicView: !params.showItemPricesInPublicView })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.showItemPricesInPublicView ? 'bg-indigo-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.showItemPricesInPublicView ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.publicPricesDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.allowMultipleInProgress ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <PlayCircle size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.simultaneousOs}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, allowMultipleInProgress: !params.allowMultipleInProgress })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.allowMultipleInProgress ? 'bg-amber-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.allowMultipleInProgress ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.simultaneousOsDescription}
                        </p>
                      </div>
                    </div>

                    {/* ──── NOVOS TOGGLES ──── */}

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.showClientContact ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Phone size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.clientContact}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, showClientContact: !params.showClientContact })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.showClientContact ? 'bg-green-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.showClientContact ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.clientContactDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.showStockHistory ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <Database size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.stockHistory}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, showStockHistory: !params.showStockHistory })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.showStockHistory ? 'bg-purple-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.showStockHistory ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.stockHistoryDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.allowImpediment ? 'bg-rose-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <ShieldAlert size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.impediment}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, allowImpediment: !params.allowImpediment })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.allowImpediment ? 'bg-rose-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.allowImpediment ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.impedimentDescription}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.showVisitHistory ? 'bg-cyan-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <History size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">{t.settings.app.visitHistory}</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, showVisitHistory: !params.showVisitHistory })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.showVisitHistory ? 'bg-cyan-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.showVisitHistory ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          {t.settings.app.visitHistoryDescription}
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
