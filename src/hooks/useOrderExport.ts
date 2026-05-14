
import { ServiceOrder, User } from '../types';
import { DataService } from '../services/dataService';
import XLSX from 'xlsx-js-style';

interface UseOrderExportProps {
    orders: ServiceOrder[];
    filteredOrders: ServiceOrder[];
    selectedOrderIds: string[];
    techs: User[];
}
import { supabase } from '../lib/supabase';

export const useOrderExport = () => {
    const handleExportExcel = async ({ orders, filteredOrders, selectedOrderIds, techs }: UseOrderExportProps) => {
        // Se tiver seleção, precisa garantir que busca também as IDs de outras páginas.
        if (selectedOrderIds.length === 0) return;

        let ordersToExport: (ServiceOrder & { _raw?: any })[] = [];
        if (selectedOrderIds.length > 0) {
            try {
                const chunks = [];
                for (let i = 0; i < selectedOrderIds.length; i += 100) {
                    chunks.push(selectedOrderIds.slice(i, i + 100));
                }
                let allFetched: any[] = [];
                for (const chunk of chunks) {
                    const { data, error } = await supabase
                        .from('orders')
                        .select('*, customers(*), service_visits(*), service_order_equipments(*)')
                        .in('id', chunk);
                    if (error) {
                        console.error("Supabase Error:", error);
                        throw new Error(error.message);
                    }
                    if (data) allFetched = [...allFetched, ...data];
                }
                
                const { OrderService } = await import('../services/orderService');
                ordersToExport = allFetched.map(dbOrder => {
                    const mapped = OrderService._mapOrderFromDB(dbOrder);
                    return { ...mapped, _raw: dbOrder };
                });
            } catch (e: any) {
                console.error("Erro ao buscar dados completos para exportar", e);
                alert("Erro ao puxar dados do servidor. Exportando apenas dados básicos em memória. Erro: " + e.message);
                const localOrders = orders.filter(o => selectedOrderIds.includes(o.id));
                ordersToExport = localOrders.map(o => ({ ...o, _raw: {} }));
            }
        }

        if (ordersToExport.length === 0) {
            alert("Nenhuma ordem encontrada para exportar.");
            return;
        }

        // 🔄 Buscar técnicos frescos para garantir que os nomes estejam disponíveis
        let techList = techs;
        try {
            const freshTechs = await DataService.getAllTechnicians();
            if (freshTechs && freshTechs.length > 0) {
                techList = freshTechs;
            }
        } catch (e) {
            console.warn("⚠️ Falha ao buscar técnicos atualizados, usando dados em memória.");
        }

        // Criar mapa de ID → Nome para lookup rápido
        const techNameMap = new Map<string, string>();
        techList.forEach(t => {
            if (t.id && t.name) techNameMap.set(t.id, t.name);
        });

        // Função para formatar Date string como SP local
        const formatDateTime = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            } catch {
                return dateStr;
            }
        };

        const formatDate = (dateStr?: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            try {
                const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
                if (isNaN(d.getTime())) return dateStr;
                return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
            } catch {
                return dateStr;
            }
        };

        // 1. Definir colunas do cabeçalho
        const headers = [
            'ID O.S.',
            'Data Agendada',
            'Hora Agendada',
            'Cliente',
            'CNPJ/Documento',
            'Telefone',
            'WhatsApp',
            'Email',
            'CEP',
            'Estado',
            'Cidade',
            'Bairro',
            'Endereço',
            'Número',
            'Complemento',
            'Latitude',
            'Longitude',
            'Título',
            'Descrição',
            'Tipo de Atendimento',
            'Técnico',
            'Status',
            'Prioridade',
            'Valor Total',
            'Status Financeiro',
            'Abertura',
            'Check-in OS',
            'Conclusão OS',
            'Observações Internas',
            'Resumo Geral',
            'Distância Total Percorrida (km)',
            'Tempo Total Deslocamento (min)',
            'Ativos / Equipamentos',
            'Histórico de Visitas (JSON)',
            'Formulários e Evidências (JSON)',
            'Link Público'
        ];

        // 2. Estilo do cabeçalho
        const headerStyle = {
            font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '1C2D4F' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                top: { style: 'thin', color: { rgb: 'FFFFFF' } },
                bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
                left: { style: 'thin', color: { rgb: 'FFFFFF' } },
                right: { style: 'thin', color: { rgb: 'FFFFFF' } }
            }
        };

        // 3. Preparar os dados
        const rows = ordersToExport.map(o => {
            const itemsValue = o.items?.reduce((acc, i) => acc + i.total, 0) || 0;
            const value = itemsValue || (o.formData as any)?.totalValue || (o.formData as any)?.price || 0;
            const techName = techNameMap.get(o.assignedTo || '') || 'N/A';

            const raw = o._raw || {};
            const customer = raw.customers || {};
            
            let visitHistory = '[]';
            let totalDisplacementDist = 0;
            let totalDisplacementTime = 0;
            
            if (raw.service_visits && Array.isArray(raw.service_visits) && raw.service_visits.length > 0) {
                const visits = [...raw.service_visits].sort((a, b) => a.visit_number - b.visit_number);
                visitHistory = JSON.stringify(visits.map(v => {
                    if (v.displacement_distance) totalDisplacementDist += Number(v.displacement_distance) || 0;
                    if (v.displacement_time) totalDisplacementTime += Number(v.displacement_time) || 0;
                    
                    return {
                        visita: v.visit_number,
                        status: v.status,
                        agendado_data: v.scheduled_date,
                        agendado_hora: v.scheduled_time,
                        checkin: v.arrival_time,
                        conclusao: v.departure_time,
                        distancia_km: v.displacement_distance || 0,
                        tempo_deslocamento_min: v.displacement_time || 0,
                        obs_tecnico: v.tech_report || ''
                    };
                }));
            }
            
            let equipments = '[]';
            if (raw.service_order_equipments && Array.isArray(raw.service_order_equipments) && raw.service_order_equipments.length > 0) {
                equipments = JSON.stringify(raw.service_order_equipments.map((e: any) => ({
                    nome: e.equipment_name,
                    modelo: e.equipment_model,
                    serial: e.equipment_serial,
                    familia: e.equipment_family
                })));
            } else if (o.equipmentName) {
                equipments = JSON.stringify([{ nome: o.equipmentName, modelo: o.equipmentModel, serial: o.equipmentSerial }]);
            }

            const publicUrl = `${window.location.origin}/#/order/view/${o.publicToken || o.id}`;
            const formDataSafe = JSON.stringify(o.formData || {});

            return [
                o.displayId || o.id,
                formatDate(o.scheduledDate),
                o.scheduledTime || 'N/A',
                o.customerName,
                customer.document || 'N/A',
                customer.phone || 'N/A',
                customer.whatsapp || 'N/A',
                customer.email || 'N/A',
                customer.zip_code || customer.zip || 'N/A',
                customer.state || 'N/A',
                customer.city || 'N/A',
                customer.neighborhood || 'N/A',
                customer.address || 'N/A',
                customer.address_number || customer.number || 'N/A',
                customer.complement || 'N/A',
                customer.latitude || 'N/A',
                customer.longitude || 'N/A',
                o.title,
                o.description,
                o.operationType || 'Não informado',
                techName,
                o.status,
                o.priority,
                value,
                o.billingStatus || 'PENDENTE',
                formatDateTime(o.createdAt),
                formatDateTime(o.startDate),
                formatDateTime(o.endDate),
                o.notes || 'N/A', // Internal Notes
                o.technicalReport || 'N/A', // Resumo Geral (Conclusão)
                totalDisplacementDist.toFixed(2),
                totalDisplacementTime.toFixed(2),
                equipments,
                visitHistory,
                formDataSafe,
                publicUrl
            ];
        });

        // 4. Montar Worksheet
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 5. Aplicar largura das colunas
        const colWidths = [
            { wch: 15 }, // ID
            { wch: 15 }, // Data
            { wch: 15 }, // Hora
            { wch: 30 }, // Cliente
            { wch: 20 }, // CNPJ
            { wch: 15 }, // Tel
            { wch: 15 }, // Wpp
            { wch: 25 }, // Email
            { wch: 15 }, // CEP
            { wch: 15 }, // Estado
            { wch: 20 }, // Cidade
            { wch: 20 }, // Bairro
            { wch: 35 }, // Endereço
            { wch: 10 }, // Numero
            { wch: 15 }, // Compl
            { wch: 15 }, // Lat
            { wch: 15 }, // Lng
            { wch: 30 }, // Titulo
            { wch: 40 }, // Descrição
            { wch: 20 }, // Tipo
            { wch: 20 }, // Tecnico
            { wch: 15 }, // Status
            { wch: 15 }, // Prioridade
            { wch: 15 }, // Valor
            { wch: 15 }, // Status Fin
            { wch: 20 }, // Abertura
            { wch: 20 }, // Check-in OS
            { wch: 20 }, // Conclusão OS
            { wch: 40 }, // Obs Internas
            { wch: 40 }, // Resumo Técnico
            { wch: 15 }, // Dist
            { wch: 15 }, // Tempo
            { wch: 40 }, // Ativos
            { wch: 50 }, // Histórico
            { wch: 50 }, // Form Data
            { wch: 60 }  // Link Público
        ];
        ws['!cols'] = colWidths;

        // 6. Aplicar estilos
        const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (!ws[address]) continue;
            ws[address].s = headerStyle;
        }

        // 7. Gerar Arquivo
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Relatório Geral");
        XLSX.writeFile(wb, `Nexus_Relatorio_Geral_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return { handleExportExcel };
};
