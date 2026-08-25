import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DataService } from '../../services/dataService';
import { NexusQueryClient, useTenant } from '../../hooks/nexusHooks';
import SessionStorage from '../../lib/sessionStorage';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Building2, Save, Mail, Phone, MapPin, Globe, Camera,
  ShieldCheck, Briefcase, Hash, CreditCard, Settings,
  Navigation, Smartphone, Lock, Unlock, ListOrdered,
  ShieldAlert, X, UploadCloud, Languages,
  BellRing, Database, History, HardDrive, Loader2, Loader, Share2, PlayCircle, PieChart, Target, ImagePlus,
  Monitor, MapPinned, MessageCircle, QrCode, Wifi, WifiOff, Clock, AlertTriangle, RefreshCw, Video
} from 'lucide-react';
import { useI18n, TIMEZONE_OPTIONS, type SupportedLocale, type SupportedTimezone } from '../../i18n';
import { usePermissions } from '../../hooks/usePermissions';
import { useDialog } from '../../contexts/DialogContext';

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
  requireLocationForExecution: boolean;
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
  enableGeofencing: boolean;
  // Check-in Automático
  autoCheckin: boolean;
}

export interface WhatsAppConnectionLog {
  id: string;
  timestamp: string;
  status: 'connected' | 'disconnected' | 'connecting';
  reason?: string;
  details?: string;
}

interface WhatsAppConfig {
  uazapi_url: string;
  uazapi_instance: string;
  uazapi_token: string;
  zapi_instance_id?: string;
  zapi_instance_token?: string;
  zapi_client_token?: string;
  bot_enabled: boolean;
  bot_name: string;
  bot_gender?: string;
  greeting_message: string;
  human_keyword: string;
  phone_number_display: string;
  business_days?: number[];
  business_start?: string;
  business_end?: string;
  out_of_office_msg?: string;
  company_info?: string;
  lastDisconnectReason?: string;
  connectionLogs?: WhatsAppConnectionLog[];
}

const translateDisconnectReason = (reason?: string): string => {
  if (!reason) return 'Nenhum motivo específico informado pela API.';
  const r = reason.toLowerCase();

  if (r.includes('logged out') || r.includes('logout') || r.includes('401') || r.includes('unauthorized')) {
    return '🔒 Sessão encerrada no celular. O aplicativo WhatsApp no aparelho desconectou a integração UAZAPI. É necessário gerar um novo QR Code.';
  }
  if (r.includes('multidevice_mismatch') || r.includes('mismatch') || r.includes('405')) {
    return '📱 Incompatibilidade de protocolo ou a sessão foi assumida por outro dispositivo.';
  }
  if (r.includes('connection_replaced') || r.includes('replaced')) {
    return '⚠️ A conexão foi substituída por outra instância ou novo acesso UAZAPI usando a mesma chave.';
  }
  if (r.includes('timed out') || r.includes('timeout') || r.includes('408')) {
    return '⏳ Tempo limite de comunicação excedido. O celular associado estava sem acesso à internet ou desligado.';
  }
  if (r.includes('connection closed') || r.includes('closed') || r.includes('500') || r.includes('503')) {
    return '🌐 Conexão de rede fechada temporariamente pelo servidor UAZAPI / WhatsApp Meta.';
  }
  if (r.includes('banned') || r.includes('blocked')) {
    return '🚫 Número temporariamente suspenso ou restrito pelas diretrizes de automação da Meta.';
  }
  if (r.includes('user_action_logout')) {
    return '👤 Desconexão manual efetuada pelo painel de configurações.';
  }
  return `ℹ️ Retorno direto da API UAIZAP/Meta: "${reason}"`;
};

export const SettingsPage: React.FC = () => {
  const { t, locale, timezone, setLocale, setTimezone } = useI18n();
  const { isAdmin, permissions } = usePermissions();
  const { showAlert, showConfirm } = useDialog();

  // 📡 Nexus Resilient Hook (Big Tech standard)
  const { data: data, isLoading: tenantLoading, isError: tenantError, error: queryError, refetch: refetchTenant } = useTenant();

  // Determina quais abas o usuário pode acessar
  const tenantModules = data?.enabled_modules || (data as any)?.enabledModules || {};

  const isImpersonating = SessionStorage.get('is_impersonating') === true;

  const tabAccess = {
    company: isImpersonating || ((isAdmin || permissions?.settingsTabs?.company === true) && tenantModules.settings_company !== false),
    system: isImpersonating || ((isAdmin || permissions?.settingsTabs?.system === true) && tenantModules.settings_system !== false),
    app: isImpersonating || ((isAdmin || permissions?.settingsTabs?.app === true) && tenantModules.settings_app !== false),
    dashboard: isImpersonating || ((isAdmin || permissions?.settingsTabs?.dashboard === true) && tenantModules.settings_dashboard !== false),
    whatsapp: isImpersonating || (isAdmin && tenantModules.settings_whatsapp !== false),
  };

  // Primeira aba acessível como default
  const firstAvailable = (['company', 'system', 'app', 'dashboard', 'whatsapp'] as const).find(k =>
    tabAccess[k as keyof typeof tabAccess]
  ) || 'company';

  const [activeTab, setActiveTab] = useState<'company' | 'system' | 'app' | 'dashboard' | 'whatsapp'>(firstAvailable as any);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSuperUserUnlock, setShowSuperUserUnlock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsAppConfig>({
    uazapi_url: '',
    uazapi_instance: '',
    uazapi_token: '',
    zapi_instance_id: '',
    zapi_instance_token: '',
    zapi_client_token: '',
    bot_enabled: false,
    bot_name: '',
    bot_gender: 'Feminino',
    greeting_message: '',
    human_keyword: 'ATENDENTE',
    phone_number_display: '',
    business_days: [1, 2, 3, 4, 5],
    business_start: '08:00',
    business_end: '18:00',
    out_of_office_msg: 'Nosso horário de atendimento com humanos é de Seg a Sex das 08h às 18h. Posso continuar te ajudando por aqui!',
    company_info: '',
  });
  const [wppTestStatus, setWppTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [wppQrCode, setWppQrCode] = useState<string | null>(null);
  const [wppConnected, setWppConnected] = useState(false);
  const [lastDisconnectReason, setLastDisconnectReason] = useState<string>('');
  const [connectionLogs, setConnectionLogs] = useState<WhatsAppConnectionLog[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isFetchingServerLogs, setIsFetchingServerLogs] = useState(false);

  const fetchServerLogs = async () => {
    if (!whatsapp.uazapi_url || !whatsapp.uazapi_token) return;
    setIsFetchingServerLogs(true);
    try {
      let baseUrl = whatsapp.uazapi_url.trim();
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
      const token = whatsapp.uazapi_token.trim();
      const headers = { 
        'apikey': token,
        'token': token,
        'Content-Type': 'application/json'
      };

      // 1. Fetch main status
      const statusRes = await fetch(`${baseUrl}/instance/status`, { headers }).catch(() => null);
      let statusJson: any = null;
      if (statusRes && statusRes.ok) {
        statusJson = await statusRes.json().catch(() => null);
      }

      // 2. Try fetching server logs / history if available on UAZAPI API
      let serverLogsJson: any = null;
      const logsRes = await fetch(`${baseUrl}/instance/logs`, { headers }).catch(() => null);
      if (logsRes && logsRes.ok) {
        serverLogsJson = await logsRes.json().catch(() => null);
      }

      const fetchedEvents: WhatsAppConnectionLog[] = [];

      // Parse statusJson
      if (statusJson) {
        const connected = statusJson?.connected === true || statusJson?.instance?.status === 'connected' || statusJson?.instance?.state === 'open' || statusJson?.state === 'open' || statusJson?.status === 'connected';
        const reason = statusJson?.lastDisconnectReason || statusJson?.instance?.lastDisconnectReason || statusJson?.reason;

        if (reason) {
          setLastDisconnectReason(reason);
        }

        fetchedEvents.push({
          id: 'status_check_' + Date.now(),
          timestamp: new Date().toLocaleString('pt-BR'),
          status: connected ? 'connected' : 'disconnected',
          reason: reason || (connected ? 'connected_ok' : 'disconnected'),
          details: connected 
            ? 'Sessão UAZAPI ativa no servidor.' 
            : translateDisconnectReason(reason || 'instância desconectada')
        });
      }

      // Parse serverLogsJson
      if (serverLogsJson) {
        const rawList = Array.isArray(serverLogsJson) 
          ? serverLogsJson 
          : (serverLogsJson?.logs || serverLogsJson?.events || serverLogsJson?.data || []);

        if (Array.isArray(rawList) && rawList.length > 0) {
          rawList.forEach((item: any, idx: number) => {
            const itemReason = item.reason || item.lastDisconnectReason || item.event || item.message || 'server_log';
            const itemStatus = (item.status === 'connected' || item.state === 'open' || item.type === 'connected') ? 'connected' : 'disconnected';
            const time = item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

            fetchedEvents.push({
              id: `server_${idx}_${Date.now()}`,
              timestamp: time,
              status: itemStatus,
              reason: itemReason,
              details: itemStatus === 'connected' ? 'Sessão iniciada no servidor UAZAPI' : translateDisconnectReason(itemReason)
            });
          });
        }
      }

      // Merge with current connectionLogs without duplicates
      if (fetchedEvents.length > 0) {
        setConnectionLogs(prev => {
          const combined = [...fetchedEvents, ...prev];
          const unique = combined.filter((v, i, a) => a.findIndex(t => (t.timestamp === v.timestamp && t.reason === v.reason)) === i);
          return unique.slice(0, 100);
        });
      }
    } catch (err) {
      console.error('[UAZAPI Server Logs] Error fetching logs:', err);
    } finally {
      setIsFetchingServerLogs(false);
    }
  };

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
    enableGeofencing: false,
    autoCheckin: false,
    requireLocationForExecution: false,
  });

  const [dbInfo, setDbInfo] = useState<{ slug: string, id: string } | null>(null);
  // Ref para evitar que o Realtime apague os dados recém-salvos
  const wppSyncedRef = React.useRef(false);

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
        enableGeofencing: data.metadata?.enableGeofencing ?? false,
        autoCheckin: data.metadata?.autoCheckin ?? false,
        requireLocationForExecution: data.metadata?.requireLocationForExecution ?? false,
      }));

      // Sync WhatsApp settings — só sincroniza do banco na primeira carga
      // para evitar que o React Query apague os dados que o usuário está digitando
      if (!wppSyncedRef.current) {
        const ws = data.whatsapp_settings as Record<string, any> | null;
        if (ws) {
          setWhatsapp({
            uazapi_url: ws.uazapi_url || '',
            uazapi_instance: ws.uazapi_instance || '',
            uazapi_token: ws.uazapi_token || '',
            zapi_instance_id: ws.zapi_instance_id || ws.mega_instance_key || '',
            zapi_instance_token: ws.zapi_instance_token || ws.mega_api_token || '',
            zapi_client_token: ws.zapi_client_token || '',
            bot_enabled: ws.bot_enabled ?? false,
            bot_name: ws.bot_name || '',
            bot_gender: ws.bot_gender || 'Feminino',
            greeting_message: ws.greeting_message || '',
            human_keyword: ws.human_keyword || 'ATENDENTE',
            phone_number_display: ws.phone_number_display || '',
            business_days: ws.business_days ?? [1, 2, 3, 4, 5],
            business_start: ws.business_start || '08:00',
            business_end: ws.business_end || '18:00',
            out_of_office_msg: ws.out_of_office_msg || 'Nosso horário de atendimento com humanos é de Seg a Sex das 08h às 18h. Posso continuar te ajudando por aqui!',
            company_info: ws.company_info || '',
          });
          setWppConnected(ws.connected ?? false);
          setLastDisconnectReason(ws.lastDisconnectReason || '');
          setConnectionLogs(ws.connectionLogs || []);
        }
        wppSyncedRef.current = true;
      }

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
        whatsapp_settings: {
          ...whatsapp,
          zapi_instance_id: whatsapp.uazapi_instance || whatsapp.zapi_instance_id,
          connected: wppConnected,
          lastDisconnectReason: lastDisconnectReason,
          connectionLogs: connectionLogs,
        },
        metadata: {
          ...data?.metadata,
          timezone: params.timezone,
          showItemPricesInApp: params.showItemPricesInApp,
          requireLocationForExecution: params.requireLocationForExecution,
          showItemPricesInPublicView: params.showItemPricesInPublicView,
          techAdvancedSettings: params.techAdvancedSettings,
          allowOsSharing: params.allowOsSharing,
          allowMultipleInProgress: params.allowMultipleInProgress,
          showClientContact: params.showClientContact,
          showStockHistory: params.showStockHistory,
          allowImpediment: params.allowImpediment,
          showVisitHistory: params.showVisitHistory,
          language: params.language,
          slaTargetPercentage: params.slaTargetPercentage,
          sla48hTargetPercentage: params.sla48hTargetPercentage,
          showVisitHistoryInPublicLink: params.showVisitHistoryInPublicLink,
          enableGeofencing: params.enableGeofencing,
          autoCheckin: params.autoCheckin,
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
          {tabAccess.whatsapp && (isImpersonating || data?.enabled_modules?.ai !== false) && (isImpersonating || (data as any)?.enabledModules?.ai !== false) && (
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-medium transition-all ${activeTab === 'whatsapp' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <MessageCircle size={14} /> WhatsApp Bot
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

                    {/* Toggle: Gestão de Regiões (Geofencing) */}
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl mt-4">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.enableGeofencing ? 'bg-[#1c2d4f] text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <MapPin size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">Gestão de Regiões (Geofencing)</h4>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, enableGeofencing: !params.enableGeofencing })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.enableGeofencing ? 'bg-[#1c2d4f]' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.enableGeofencing ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          Quando ativado, limita a abertura de ordens de serviço (OS) a técnicos associados à área demarcada do cliente no mapa. Se o cliente estiver em área livre, exibe todos os técnicos.
                        </p>
                      </div>
                    </div>

                    {/* Resolução de Vídeo do App (Read-Only) */}
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl mt-4">
                      <div className="p-3 rounded-xl shadow-inner bg-slate-800 text-white">
                        <Video size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">Qualidade de Vídeo (App dos Técnicos)</h4>
                          <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-[9px] font-bold uppercase tracking-widest">
                            {(data as any)?.metadata?.video_quality === 'basic' ? 'Básica (576p)' : 'Alta (HD 720p)'}
                          </span>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          Define a nitidez e o tamanho dos vídeos anexados pelos técnicos. 
                          <br/><span className="text-amber-500">* Esta configuração de plano é gerenciada exclusivamente pelo suporte/Master.</span>
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

                    {/* Toggle: Check-in Automático */}
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.autoCheckin ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <MapPinned size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">Check-in Automático</h4>
                            <span className="text-[8px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Novo</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setParams({ ...params, autoCheckin: !params.autoCheckin })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.autoCheckin ? 'bg-emerald-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.autoCheckin ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          Quando ativado, o app detecta automaticamente a chegada do técnico (raio de 50m) e inicia a OS sem intervenção manual.
                        </p>
                      </div>
                    </div>

                    {/* Restringir Execução por Localização */}
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${params.requireLocationForExecution ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <MapPin size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">Restringir Execução (300m)</h4>
                          <button
                            onClick={() => setParams({ ...params, requireLocationForExecution: !params.requireLocationForExecution })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${params.requireLocationForExecution ? 'bg-teal-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: params.requireLocationForExecution ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          O técnico só conseguirá executar a OS se estiver a menos de 300 metros do cliente (ignorado se o app estiver offline).
                        </p>
                      </div>
                    </div>

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

            {/* ═══ WHATSAPP BOT TAB ═══ */}
            {activeTab === 'whatsapp' && tabAccess.whatsapp && (isImpersonating || data?.enabled_modules?.ai !== false) && (isImpersonating || (data as any)?.enabledModules?.ai !== false) && (
              <div className="space-y-4 animate-fade-in py-2">
                <section className="bg-white p-4 rounded-xl border border-gray-100 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                    <div>
                      <h2 className="text-lg font-medium text-gray-900 uppercase tracking-tight leading-none flex items-center gap-2">
                        <MessageCircle size={18} className="text-emerald-500" /> WhatsApp Bot
                      </h2>
                      <p className="text-[9px] font-medium text-gray-400 uppercase tracking-widest mt-1">Automação de atendimento via WhatsApp</p>
                    </div>
                    
                    {/* Status Badge Transformado em Botão Clicável de Histórico */}
                    <button
                      type="button"
                      onClick={() => {
                        fetchServerLogs();
                        setIsHistoryModalOpen(true);
                      }}
                      title="Clique para abrir o Histórico de Conexões & Desconexões UAIZAP"
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                        wppConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                      }`}
                    >
                      {wppConnected ? <Wifi size={13} className="text-emerald-600 animate-pulse" /> : <WifiOff size={13} className="text-rose-600" />}
                      <span>{wppConnected ? 'Conectado' : 'Desconectado'}</span>
                      <History size={13} className="ml-1 opacity-70 text-slate-500" />
                    </button>
                  </div>

                  {/* UAZAPI Credentials */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">🔌 UAZAPI</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">URL Base da API</label>
                          <input
                            type="text"
                            value={whatsapp.uazapi_url}
                            onChange={e => setWhatsapp({ ...whatsapp, uazapi_url: e.target.value })}
                            placeholder="Ex: https://free.uazapi.com"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Nome da Instância</label>
                          <input
                            type="text"
                            value={whatsapp.uazapi_instance}
                            onChange={e => setWhatsapp({ ...whatsapp, uazapi_instance: e.target.value })}
                            placeholder="Ex: duno"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Token de Autenticação</label>
                        <input
                          type="password"
                          value={whatsapp.uazapi_token}
                          onChange={e => setWhatsapp({ ...whatsapp, uazapi_token: e.target.value })}
                          placeholder="Ex: SEU_TOKEN_AQUI"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Número exibido (ex: (35) 9999-8888)</label>
                        <input
                          type="text"
                          value={whatsapp.phone_number_display}
                          onChange={e => setWhatsapp({ ...whatsapp, phone_number_display: e.target.value })}
                          placeholder="(00) 00000-0000"
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none"
                        />
                      </div>
                    </div>

                    {/* Actions: Test + QR Code */}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!whatsapp.uazapi_url || !whatsapp.uazapi_token || !whatsapp.uazapi_instance) return;
                          setWppTestStatus('testing');
                          try {
                            let baseUrl = whatsapp.uazapi_url.trim();
                            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                            const token = whatsapp.uazapi_token.trim();
                            const instanceName = whatsapp.uazapi_instance.trim();
                            
                            const headers = { 
                              'apikey': token,
                              'token': token,
                              'Content-Type': 'application/json'
                            };
                            
                            // Na UazapiGO a rota de status é GET /instance/status
                            const res = await fetch(`${baseUrl}/instance/status`, { headers });
                            const json = await res.json();
                            const connected = json?.connected === true || json?.instance?.status === 'connected' || json?.instance?.state === 'open' || json?.state === 'open' || json?.status === 'connected';
                            
                            const rawReason = json?.lastDisconnectReason || json?.instance?.lastDisconnectReason || json?.reason || json?.error || (connected ? '' : 'instance_disconnected');

                            if (connected) {
                              setWppConnected(true);
                              setWppTestStatus('ok');
                              
                              const newLog: WhatsAppConnectionLog = {
                                id: Date.now().toString(),
                                timestamp: new Date().toLocaleString('pt-BR'),
                                status: 'connected',
                                reason: 'connected_ok',
                                details: 'Instância UAZAPI conectada e respondendo normalmente.'
                              };
                              setConnectionLogs(prev => {
                                if (prev.length > 0 && prev[0].status === 'connected') return prev;
                                return [newLog, ...prev.slice(0, 49)];
                              });
                            } else {
                              setWppConnected(false);
                              setWppTestStatus('connecting');
                              setLastDisconnectReason(rawReason);

                              const newLog: WhatsAppConnectionLog = {
                                id: Date.now().toString(),
                                timestamp: new Date().toLocaleString('pt-BR'),
                                status: 'disconnected',
                                reason: rawReason,
                                details: translateDisconnectReason(rawReason)
                              };
                              setConnectionLogs(prev => {
                                if (prev.length > 0 && prev[0].status === 'disconnected' && prev[0].reason === rawReason) return prev;
                                return [newLog, ...prev.slice(0, 49)];
                              });
                            }
                          } catch (e) {
                            console.error('Teste conexão erro:', e);
                            setWppTestStatus('error');
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide border transition-all ${
                          wppTestStatus === 'ok' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                          wppTestStatus === 'connecting' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                          wppTestStatus === 'error' ? 'bg-red-50 text-red-500 border-red-200' :
                          'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <Wifi size={14} />
                        {wppTestStatus === 'testing' ? 'Verificando...' :
                         wppTestStatus === 'ok' ? 'Conectado ✓' :
                         wppTestStatus === 'connecting' ? 'Aguard. QR Code ⚠' :
                         wppTestStatus === 'error' ? 'Falhou ✗' : 'Testar Conexão'}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!whatsapp.uazapi_url || !whatsapp.uazapi_token || !whatsapp.uazapi_instance) return;
                          setWppQrCode(null);
                          try {
                            let baseUrl = whatsapp.uazapi_url.trim();
                            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                            const token = whatsapp.uazapi_token.trim();
                            const instanceName = whatsapp.uazapi_instance.trim();
                            
                            const headers = { 
                              'apikey': token,
                              'token': token,
                              'Content-Type': 'application/json'
                            };

                            // Na UazapiGO a rota de connect é POST e não exige o nome da instância se o token já identifica
                            const reqUrl = `${baseUrl}/instance/connect`;
                            console.log('[QR Code] Chamando:', reqUrl);
                            const res = await fetch(reqUrl, { method: 'POST', headers });
                            console.log('[QR Code] Status HTTP:', res.status);
                            const json = await res.json();
                            console.log('[QR Code] Resposta completa:', JSON.stringify(json).substring(0, 200));

                            const qrBase64 = json?.instance?.qrcode || json?.qrcode?.base64 || json?.base64 || json?.qrcode || json?.value || null;
                            if (qrBase64 && typeof qrBase64 === 'string') {
                              const src = qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64.replace(/^data:image\/png;base64,/, '')}`;
                              setWppQrCode(src);
                            } else {
                              const msg = `QR Code não encontrado.\nResposta da API: ${JSON.stringify(json).substring(0, 300)}`;
                              console.error('[QR Code]', msg);
                              showAlert(msg, 'warning');
                            }
                          } catch (e: any) {
                            console.error('[QR Code] Erro fetch:', e);
                            showAlert(`Erro ao conectar: ${e?.message || 'Verifique sua conexão e o painel de erros'}`, 'error');
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-all"
                      >
                        <QrCode size={14} /> Gerar QR Code
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          fetchServerLogs();
                          setIsHistoryModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide border bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-all shadow-xs"
                      >
                        <History size={14} className="text-[#1c2d4f]" /> Ver Histórico de Conexões
                      </button>

                      <button
                        type="button"
                        disabled={!wppConnected}
                        onClick={() => {
                          if (!whatsapp.uazapi_url || !whatsapp.uazapi_token || !whatsapp.uazapi_instance) return;
                          
                          showConfirm(
                            "Tem certeza que deseja desconectar o WhatsApp atual da API? O número perderá a conexão imediatamente.",
                            async () => {
                              try {
                                let baseUrl = whatsapp.uazapi_url.trim();
                                if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                                const token = whatsapp.uazapi_token.trim();
                                const instanceName = whatsapp.uazapi_instance.trim();
                                
                                const headers = { 
                                  'apikey': token,
                                  'token': token,
                                  'Content-Type': 'application/json'
                                };

                                console.log('[Logout] Desconectando...');
                                const res = await fetch(`${baseUrl}/instance/logout`, {
                                  method: 'DELETE',
                                  headers,
                                });
                                
                                if (!res.ok) {
                                   const errData = await res.json().catch(() => null);
                                   throw new Error(`O servidor recusou a desconexão (Status ${res.status}). Detalhes: ${JSON.stringify(errData || 'Nenhum')}`);
                                }

                                showAlert("Sessão desconectada com sucesso!", "success");
                                setWppConnected(false);
                                setWppQrCode(null);
                                setLastDisconnectReason('user_action_logout');

                                const logoutLog: WhatsAppConnectionLog = {
                                  id: Date.now().toString(),
                                  timestamp: new Date().toLocaleString('pt-BR'),
                                  status: 'disconnected',
                                  reason: 'user_action_logout',
                                  details: 'Desconexão manual solicitada pelo painel.'
                                };
                                setConnectionLogs(prev => [logoutLog, ...prev.slice(0, 49)]);
                              } catch (e: any) {
                                console.error('[Logout] Erro:', e);
                                showAlert(`Erro ao desconectar: ${e?.message || 'Desconhecido'}`, "error");
                                setWppConnected(true);
                              }
                            },
                            "Desconectar WhatsApp",
                            "Desconectar",
                            true
                          );
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide border transition-all ${
                          wppConnected 
                            ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
                            : 'bg-gray-100 text-gray-400 border-gray-200 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <WifiOff size={14} /> Desconectar
                      </button>
                    </div>

                    {/* QR Code display */}
                    {wppQrCode && (
                      <div className="flex flex-col items-center gap-2 p-4 bg-white border border-emerald-100 rounded-2xl">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Escaneie no WhatsApp do número do cliente</p>
                        <img src={wppQrCode} alt="QR Code WhatsApp" className="w-48 h-48 rounded-xl" />
                        <p className="text-[9px] text-gray-400">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
                      </div>
                    )}
                  </div>

                  {/* Bot Config */}
                  <div className="space-y-3 border-t border-gray-50 pt-4">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">🤖 Configurações do Bot</h3>
                    
                    {/* Bot Enable Toggle */}
                    <div className="flex items-start gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-xl">
                      <div className={`p-3 rounded-xl shadow-inner transition-colors ${whatsapp.bot_enabled ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                        <MessageCircle size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="text-[11px] font-medium text-gray-900 uppercase tracking-tight">Bot Ativo</h4>
                          <button
                            type="button"
                            onClick={() => setWhatsapp({ ...whatsapp, bot_enabled: !whatsapp.bot_enabled })}
                            className={`w-10 h-5 rounded-full relative transition-colors ${whatsapp.bot_enabled ? 'bg-emerald-600' : 'bg-gray-300'}`}
                          >
                            <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all" style={{ left: whatsapp.bot_enabled ? '22px' : '2px' }}></div>
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold uppercase leading-relaxed">
                          Quando ativado, o bot responde automaticamente as mensagens recebidas no número configurado.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Nome do Bot (ex: Assistente TechCool)</label>
                        <input
                          type="text"
                          value={whatsapp.bot_name}
                          onChange={e => setWhatsapp({ ...whatsapp, bot_name: e.target.value })}
                          placeholder={`Assistente ${data?.trading_name || data?.company_name || 'da Empresa'}`}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Gênero da IA</label>
                        <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-200">
                          <button
                            type="button"
                            onClick={() => setWhatsapp({ ...whatsapp, bot_gender: 'Feminino' })}
                            className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${(!whatsapp.bot_gender || whatsapp.bot_gender === 'Feminino') ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                          >
                            Feminino
                          </button>
                          <button
                            type="button"
                            onClick={() => setWhatsapp({ ...whatsapp, bot_gender: 'Masculino' })}
                            className={`flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${(whatsapp.bot_gender === 'Masculino') ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                          >
                            Masculino
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Mensagem de boas-vindas customizada (opcional)</label>
                      <textarea
                        value={whatsapp.greeting_message}
                        onChange={e => setWhatsapp({ ...whatsapp, greeting_message: e.target.value })}
                        rows={3}
                        placeholder={`Olá! Sou o assistente virtual da ${data?.trading_name || 'sua empresa'}. Informe seu CNPJ ou número de série do equipamento para começar.`}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Informações da Empresa (O que faz, marcas, etc)</label>
                      <textarea
                        value={whatsapp.company_info || ''}
                        onChange={e => setWhatsapp({ ...whatsapp, company_info: e.target.value })}
                        rows={4}
                        placeholder="Ex: Somos uma assistência técnica especializada em refrigeração comercial e industrial. Atendemos marcas como Brastemp, Consul, Electrolux..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-emerald-100 outline-none resize-y"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">A assistente virtual consultará este texto para responder dúvidas sobre a empresa.</p>
                    </div>
                  </div>

                  {/* Configurações de Horário de Atendimento */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
                        <Clock size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">Horário de Atendimento (Humano)</h4>
                        <p className="text-xs text-gray-500">O bot continuará respondendo 24/7, mas usará essa configuração para fila de espera.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-2">Dias de Funcionamento</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { val: 0, label: 'Dom' }, { val: 1, label: 'Seg' }, { val: 2, label: 'Ter' },
                            { val: 3, label: 'Qua' }, { val: 4, label: 'Qui' }, { val: 5, label: 'Sex' },
                            { val: 6, label: 'Sáb' }
                          ].map(day => {
                            const isSelected = whatsapp.business_days?.includes(day.val);
                            return (
                              <button
                                key={day.val}
                                type="button"
                                onClick={() => {
                                  const current = whatsapp.business_days || [];
                                  const next = isSelected ? current.filter(d => d !== day.val) : [...current, day.val];
                                  setWhatsapp({ ...whatsapp, business_days: next.sort() });
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                  isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Abre às</label>
                          <input
                            type="time"
                            value={whatsapp.business_start}
                            onChange={e => setWhatsapp({ ...whatsapp, business_start: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-100 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Fecha às</label>
                          <input
                            type="time"
                            value={whatsapp.business_end}
                            onChange={e => setWhatsapp({ ...whatsapp, business_end: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:ring-2 focus:ring-indigo-100 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Save button for whatsapp */}
                  <div className="flex justify-end border-t border-gray-50 pt-3">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!dbInfo?.id) {
                          showAlert('❌ ID do tenant não encontrado. Recarregue a página.', 'error');
                          return;
                        }
                        setLoading(true);
                        try {
                          const { supabase } = await import('../../lib/supabase');

                          // Diagnóstico: verifica se consegue ler o próprio tenant
                          const { data: readCheck, error: readErr } = await supabase
                            .from('tenants')
                            .select('id')
                            .eq('id', dbInfo.id)
                            .single();

                          if (readErr || !readCheck) {
                            showAlert(`❌ Sem acesso ao tenant!\nID: ${dbInfo.id}\nErro: ${readErr?.message || 'não encontrado'}`, 'error');
                            return;
                          }

                          const { data: updated, error } = await supabase
                            .from('tenants')
                            .update({
                              whatsapp_settings: {
                                ...whatsapp,
                                connected: wppConnected,
                              }
                            })
                            .eq('id', dbInfo.id)
                            .select('id, whatsapp_settings');

                          if (error) {
                            console.error('[WhatsApp Save] Erro RLS:', error);
                            showAlert(`❌ Erro ao salvar: ${error.message}`, 'error');
                            return;
                          }

                          if (!updated || updated.length === 0) {
                            showAlert(`❌ Salvo bloqueado por RLS (0 linhas afetadas).\nVerifique a policy no Supabase.`, 'error');
                            return;
                          }

                          console.log('[WhatsApp Save] ✅ Salvo com sucesso:', updated[0]);
                          showAlert("WhatsApp salvo com sucesso!", 'success');
                          setSaved(true);
                          setTimeout(() => setSaved(false), 3000);
                        } catch (err: any) {
                          console.error('[WhatsApp Save] Erro inesperado:', err);
                          showAlert(`❌ Erro inesperado: ${err?.message || 'Verifique o console.'}`, 'error');
                        } finally { setLoading(false); }
                      }}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                    >
                      <Save size={14} /> Salvar WhatsApp
                    </button>
                  </div>
                </section>
              </div>
            )}
        </div>
      </div>

      {/* Modal Portal: Histórico de Conexões e Desconexões UAIZAP */}
      {isHistoryModalOpen && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-scale-up font-poppins">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shadow-sm">
                  <History size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight flex items-center gap-2">
                    Histórico de Conexões UAIZAP
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                      wppConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {wppConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                  </h3>
                  <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                    Instância: <span className="font-bold text-slate-700">{whatsapp.uazapi_instance || 'duno'}</span> | Servidor: <span className="font-mono text-slate-700">{whatsapp.uazapi_url || 'N/A'}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Bar Action & Diagnostics */}
            <div className="p-4 sm:px-6 bg-slate-100/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {lastDisconnectReason ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 shrink-0 max-w-full truncate">
                  <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                  <span className="truncate">Última Desconexão:</span>
                  <span className="font-mono font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded text-[10px]">{lastDisconnectReason}</span>
                </div>
              ) : (
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                  ✓ Sem quedas recentes registradas no servidor
                </span>
              )}

              <button
                type="button"
                disabled={isFetchingServerLogs}
                onClick={fetchServerLogs}
                className="px-3.5 py-1.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 ml-auto"
              >
                <RefreshCw size={13} className={isFetchingServerLogs ? 'animate-spin' : ''} />
                {isFetchingServerLogs ? 'Buscando do Servidor...' : 'Puxar Histórico da API'}
              </button>
            </div>

            {/* Scrollable History List */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 font-poppins">
              {connectionLogs.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <History size={40} className="mx-auto text-slate-300 stroke-1" />
                  <p className="text-xs font-medium text-slate-500 max-w-sm mx-auto">
                    Nenhum evento gravado localmente. Clique no botão <span className="font-bold text-slate-700">"Puxar Histórico da API"</span> para buscar os registros diretamente do servidor UAIZAP.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {connectionLogs.map((log, idx) => (
                    <div key={log.id || idx} className="p-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-2xl transition-all flex items-start gap-3 text-xs">
                      <div className="pt-0.5 shrink-0">
                        {log.status === 'connected' ? (
                          <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-sm shadow-emerald-300 ring-4 ring-emerald-100" title="Conectado" />
                        ) : (
                          <div className="w-3 h-3 bg-rose-500 rounded-full shadow-sm shadow-rose-300 ring-4 ring-rose-100" title="Desconectado" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              log.status === 'connected' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}>
                              {log.status === 'connected' ? 'Conectado' : 'Desconectado'}
                            </span>
                            {log.reason && (
                              <span className="text-[9px] font-mono text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md shadow-2xs">
                                {log.reason}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">{log.timestamp}</span>
                        </div>
                        {log.details && (
                          <p className="text-[11px] text-slate-700 font-medium mt-1.5 leading-relaxed bg-white/60 p-2.5 rounded-xl border border-slate-100">
                            {log.details}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] font-bold text-slate-400">
                Total de registros: {connectionLogs.length}
              </span>
              <div className="flex items-center gap-2">
                {connectionLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConnectionLogs([])}
                    className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    Limpar Lista
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
