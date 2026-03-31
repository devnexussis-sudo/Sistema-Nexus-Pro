
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
        let ordersToExport: ServiceOrder[] = [];
        if (selectedOrderIds.length > 0) {
            const localOrders = orders.filter(o => selectedOrderIds.includes(o.id));
            if (localOrders.length === selectedOrderIds.length) {
                ordersToExport = localOrders;
            } else {
                // Faltam algumas os -> Busca do servidor
                try {
                    const chunks = [];
                    for (let i = 0; i < selectedOrderIds.length; i += 100) {
                        chunks.push(selectedOrderIds.slice(i, i + 100));
                    }
                    let allFetched: any[] = [];
                    for (const chunk of chunks) {
                        const { data, error } = await supabase.from('orders').select('*').in('id', chunk);
                        if (error) {
                            console.error("Supabase Error:", error);
                            throw new Error(error.message);
                        }
                        if (data) allFetched = [...allFetched, ...data];
                    }
                    if (allFetched.length > 0) {
                        const { OrderService } = await import('../services/orderService');
                        ordersToExport = allFetched.map(dbOrder => OrderService._mapOrderFromDB(dbOrder));
                    } else {
                        ordersToExport = localOrders;
                    }
                } catch (e: any) {
                    console.error("Erro ao buscar demais ordens para exportar", e);
                    alert("Erro ao puxar dados de todas as páginas. Exportando apenas as visíveis. Erro: " + e.message);
                    ordersToExport = localOrders;
                }
            }
        } else {
            ordersToExport = filteredOrders;
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
            'Título',
            'Descrição',
            'Tipo de Atendimento',
            'Técnico',
            'Status',
            'Prioridade',
            'Valor Total',
            'Status Financeiro',
            'Data de Abertura',
            'Data de Conclusão'
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

            return [
                o.displayId || o.id,
                formatDate(o.scheduledDate),
                o.scheduledTime || 'N/A',
                o.customerName,
                o.title,
                o.description,
                o.operationType || 'Não informado',
                techName,
                o.status,
                o.priority,
                value,
                o.billingStatus || 'PENDENTE',
                formatDateTime(o.createdAt),
                formatDateTime(o.endDate)
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
            { wch: 30 }, // Titulo
            { wch: 40 }, // Descrição
            { wch: 20 }, // Tipo
            { wch: 20 }, // Tecnico
            { wch: 15 }, // Status
            { wch: 15 }, // Prioridade
            { wch: 15 }, // Valor
            { wch: 15 }, // Status Fin
            { wch: 20 }, // Abertura
            { wch: 20 }  // Conclusão
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
