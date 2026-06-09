import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase } from './supabase';

interface ProgressCallback {
    (status: string, percent: number): void;
}

export class BackupEngine {
    private tenantId: string;
    private onProgress: ProgressCallback;

    constructor(tenantId: string, onProgress: ProgressCallback) {
        this.tenantId = tenantId;
        this.onProgress = onProgress;
    }

    private formatCsv(data: any[]): string {
        if (!data || data.length === 0) return '';
        const headers = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
        const rows = data.map(obj => {
            return headers.map(header => {
                let val = obj[header];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') val = JSON.stringify(val);
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            }).join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }

    private async fetchTable(tableName: string): Promise<any[]> {
        let allData: any[] = [];
        let page = 0;
        const limit = 1000;
        
        while (true) {
            const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .eq('tenant_id', this.tenantId)
                .range(page * limit, (page + 1) * limit - 1);
                
            if (error) {
                console.warn(`[BackupEngine] Falha na tabela ${tableName}:`, error);
                break;
            }
            if (!data || data.length === 0) break;
            
            allData = [...allData, ...data];
            if (data.length < limit) break;
            page++;
        }
        return allData;
    }

    private findUrlsInObject(obj: any, urls: Set<string>) {
        if (!obj) return;
        if (typeof obj === 'string') {
            if (obj.startsWith('http') && !obj.includes('github.com')) {
                urls.add(obj);
            }
        } else if (Array.isArray(obj)) {
            obj.forEach(item => this.findUrlsInObject(item, urls));
        } else if (typeof obj === 'object') {
            Object.values(obj).forEach(val => this.findUrlsInObject(val, urls));
        }
    }

    private extractFileUrls(prefix: string, orders: any[], quotes: any[]): { name: string, url: string }[] {
        const fileUrls: { name: string, url: string }[] = [];
        const seenUrls = new Set<string>();
        
        orders.forEach(os => {
            const osNumber = os.os_number || os.display_id || os.displayId || String(os.id).substring(0, 5);
            const baseName = `${prefix}${osNumber}`;
            
            const osUrls = new Set<string>();
            this.findUrlsInObject(os, osUrls);

            let photoIdx = 1;
            let videoIdx = 1;
            let docIdx = 1;

            osUrls.forEach(url => {
                if (seenUrls.has(url)) return;
                seenUrls.add(url);

                const lowerUrl = url.toLowerCase();
                if (lowerUrl.includes('.mp4') || lowerUrl.includes('.mov') || lowerUrl.includes('video')) {
                    fileUrls.push({ name: `${baseName}_video_${videoIdx++}.mp4`, url });
                } else if (lowerUrl.includes('signature') || lowerUrl.includes('assinatura')) {
                    fileUrls.push({ name: `${baseName}_assinatura.png`, url });
                } else if (lowerUrl.includes('.pdf')) {
                    fileUrls.push({ name: `${baseName}_documento_${docIdx++}.pdf`, url });
                } else if (lowerUrl.includes('receipt') || lowerUrl.includes('comprovante')) {
                     fileUrls.push({ name: `${baseName}_comprovante.jpg`, url });
                } else {
                    fileUrls.push({ name: `${baseName}_foto_${photoIdx++}.jpg`, url });
                }
            });
        });

        quotes.forEach(quote => {
            const qNumber = quote.display_id || quote.displayId || String(quote.id).substring(0, 5);
            const baseName = `Orcamento_${qNumber}`;
            
            const quoteUrls = new Set<string>();
            this.findUrlsInObject(quote, quoteUrls);

            let idx = 1;
            quoteUrls.forEach(url => {
                 if (seenUrls.has(url)) return;
                 seenUrls.add(url);
                 
                 const lowerUrl = url.toLowerCase();
                 if (lowerUrl.includes('signature') || lowerUrl.includes('assinatura')) {
                     fileUrls.push({ name: `${baseName}_assinatura.png`, url });
                 } else if (lowerUrl.includes('receipt') || lowerUrl.includes('comprovante')) {
                     fileUrls.push({ name: `${baseName}_comprovante.jpg`, url });
                 } else {
                     fileUrls.push({ name: `${baseName}_anexo_${idx++}.jpg`, url });
                 }
            });
        });

        return fileUrls;
    }

    private generateOfflineViewerHtml(prefix: string, orders: any[]): string {
        const ordersJson = JSON.stringify(orders).replace(/</g, '\\u003c');
        
        return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nexus - Visualizador de O.S.</title>
    <style>
        :root { --primary: #0a0a0a; --accent: #4f46e5; --bg: #f8fafc; --surface: #ffffff; --text: #0f172a; --text-muted: #64748b; }
        * { box-sizing: border-box; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 0; }
        
        /* Navbar */
        .navbar { background: var(--primary); color: white; padding: 15px 30px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .navbar h1 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.5px; display: flex; align-items: center; gap: 10px; }
        .navbar .badge-system { background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        
        /* Main Container */
        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
        
        /* List View */
        .toolbar { display: flex; justify-content: space-between; margin-bottom: 20px; background: var(--surface); padding: 15px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .search-input { width: 100%; max-width: 400px; padding: 10px 16px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s; }
        .search-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
        
        .grid-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 15px; }
        .card { background: var(--surface); border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; }
        .card:hover { border-color: var(--accent); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); transform: translateY(-2px); }
        .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .os-number { font-size: 12px; font-weight: 700; color: var(--accent); background: #eef2ff; padding: 4px 8px; border-radius: 6px; }
        .card-title { margin: 0 0 5px 0; font-size: 15px; font-weight: 600; line-height: 1.4; }
        .card-meta { font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; }
        
        /* Detail View (A4 Paper Style) */
        .detail-wrapper { display: none; }
        .detail-actions { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .btn { padding: 10px 20px; border-radius: 8px; font-weight: 500; font-size: 14px; cursor: pointer; transition: all 0.2s; border: none; display: inline-flex; align-items: center; gap: 8px; }
        .btn-back { background: var(--surface); color: var(--text); border: 1px solid #e2e8f0; }
        .btn-back:hover { background: #f8fafc; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { background: #4338ca; }
        
        .paper { background: white; max-width: 900px; margin: 0 auto; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); padding: 50px; }
        
        /* Document Styles */
        .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 30px; }
        .doc-brand h2 { margin: 0; font-size: 24px; color: var(--primary); letter-spacing: -1px; }
        .doc-meta { text-align: right; }
        .doc-title { font-size: 28px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.2; }
        
        .section { margin-bottom: 30px; }
        .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 15px; font-weight: 700; }
        
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #f1f5f9; }
        .info-label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
        .info-value { font-size: 14px; font-weight: 500; }
        
        /* Tables */
        .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
        .table th { background: #f8fafc; font-weight: 600; color: var(--text-muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        
        /* Media */
        .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
        .media-item { border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; background: #f8fafc; }
        .media-item img { width: 100%; height: 200px; object-fit: cover; display: block; }
        .media-caption { padding: 8px; font-size: 12px; text-align: center; color: var(--text-muted); border-top: 1px solid #e2e8f0; }
        
        .signature-box { max-width: 300px; text-align: center; margin-top: 40px; }
        .signature-img { width: 100%; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 10px; }
        
        @media print {
            body { background: white; }
            .navbar, .detail-actions, .toolbar { display: none !important; }
            .container { margin: 0; padding: 0; max-width: 100%; }
            .paper { box-shadow: none; border-radius: 0; padding: 0; max-width: 100%; }
            .media-grid { page-break-before: always; }
        }
    </style>
</head>
<body>
    <div class="navbar no-print">
        <h1>NEXUS <span class="badge-system">Backup Viewer</span></h1>
        <div style="font-size: 13px; opacity: 0.8;">Modo Offline</div>
    </div>

    <div class="container">
        <!-- List View -->
        <div id="list-view">
            <div class="toolbar">
                <input type="text" id="search" class="search-input" placeholder="Buscar por número, cliente ou título..." onkeyup="renderList()">
            </div>
            <div id="grid" class="grid-list"></div>
        </div>
        
        <!-- Detail View -->
        <div id="detail-view" class="detail-wrapper">
            <div class="detail-actions no-print">
                <button class="btn btn-back" onclick="closeDetail()">← Voltar para lista</button>
                <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir OS</button>
            </div>
            
            <div class="paper" id="detail-content"></div>
        </div>
    </div>

    <script>
        const ORDERS = JSON.parse('${ordersJson}');
        const PREFIX = '${prefix}';
        
        function formatCurrency(val) {
            if(!val) return 'R$ 0,00';
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        }

        function renderList() {
            const search = document.getElementById('search').value.toLowerCase();
            const grid = document.getElementById('grid');
            grid.innerHTML = '';
            
            const filtered = ORDERS.filter(o => 
                (o.title || '').toLowerCase().includes(search) || 
                (o.customerName || o.customer_name || '').toLowerCase().includes(search) ||
                String(o.os_number || o.displayId || o.id).toLowerCase().includes(search)
            );
            
            filtered.forEach(o => {
                const div = document.createElement('div');
                div.className = 'card';
                div.onclick = () => openDetail(o.id);
                
                const osNum = o.os_number || o.displayId || String(o.id).substring(0,5);
                const status = o.status || 'Nova';
                
                div.innerHTML = \`
                    <div class="card-header">
                        <span class="os-number">\${PREFIX}\${osNum}</span>
                        <span style="font-size:11px; font-weight:600; padding:3px 8px; border-radius:12px; background:#f1f5f9; color:#475569">\${status}</span>
                    </div>
                    <h3 class="card-title">\${o.title || 'Sem título'}</h3>
                    <div class="card-meta">
                        <span>👤 \${o.customerName || o.customer_name || 'Cliente não vinculado'}</span>
                        <span>📅 \${new Date(o.createdAt || o.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                \`;
                grid.appendChild(div);
            });
        }
        
        function openDetail(id) {
            const o = ORDERS.find(x => x.id === id);
            if (!o) return;
            
            document.getElementById('list-view').style.display = 'none';
            document.getElementById('detail-view').style.display = 'block';
            window.scrollTo(0,0);
            
            const osNum = o.os_number || o.displayId || String(o.id).substring(0,5);
            const dateStr = new Date(o.createdAt || o.created_at).toLocaleString('pt-BR');
            
            // Items Table
            let itemsHtml = '';
            if (o.items && o.items.length > 0) {
                const rows = o.items.map(i => \`
                    <tr>
                        <td>\${i.description || '-'}</td>
                        <td>\${i.quantity || 1}</td>
                        <td>\${formatCurrency(i.unitPrice)}</td>
                        <td style="font-weight:600">\${formatCurrency(i.total)}</td>
                    </tr>
                \`).join('');
                
                itemsHtml = \`
                <div class="section">
                    <div class="section-title">Itens e Serviços</div>
                    <table class="table">
                        <thead><tr><th>Descrição</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th></tr></thead>
                        <tbody>\${rows}</tbody>
                    </table>
                </div>\`;
            }
            
            // Media Grid Deep Scan
            let mediaHtml = '';
            const allMedia = [];
            const seenMedia = new Set();
            
            function scanForMedia(obj) {
                if (!obj) return;
                if (typeof obj === 'string' && obj.startsWith('http') && !obj.includes('github.com')) {
                    const lower = obj.toLowerCase();
                    if (lower.includes('.mp4') || lower.includes('.mov') || lower.includes('video')) return; // Skip video in img grid
                    if (lower.includes('signature') || lower.includes('assinatura')) return; // Skip signature in img grid
                    
                    if (!seenMedia.has(obj)) {
                        seenMedia.add(obj);
                        allMedia.push({url: obj});
                    }
                } else if (Array.isArray(obj)) {
                    obj.forEach(scanForMedia);
                } else if (typeof obj === 'object') {
                    Object.values(obj).forEach(scanForMedia);
                }
            }
            
            scanForMedia(o.form_data);
            scanForMedia(o.formData);
            scanForMedia(o.timeline);
            scanForMedia(o.photos);
            scanForMedia(o.extra_photos);
            scanForMedia(o.receiptUrl);
            scanForMedia(o.receipt_url);
            
            if (allMedia.length > 0) {
                const grids = allMedia.map((m, i) => \`
                    <div class="media-item">
                        <img src="\${m.url}" />
                        <div class="media-caption">Anexo \${i+1}</div>
                    </div>
                \`).join('');
                mediaHtml = \`
                <div class="section">
                    <div class="section-title">Anexos e Evidências</div>
                    <div class="media-grid">\${grids}</div>
                </div>\`;
            }
            
            // Signature Deep Scan
            let sigHtml = '';
            let sigUrl = o.signature_url || o.client_signature_url || o.signature;
            if (!sigUrl && o.form_data) {
                 if (o.form_data.client_signature) sigUrl = o.form_data.client_signature;
            }
            
            if (sigUrl) {
                sigHtml = \`
                <div class="section">
                    <div class="signature-box">
                        <img src="\${sigUrl}" class="signature-img" />
                        <div style="font-size:12px; color:var(--text-muted)">Assinatura Digital - \${o.client_signature_name || o.signatureName || o.customerName || o.customer_name || 'Cliente'}</div>
                    </div>
                </div>\`;
            }
            
            // Videos
            let videoHtml = '';
            const videos = [];
            const seenVideos = new Set();
            function scanForVideo(obj) {
                if (!obj) return;
                if (typeof obj === 'string' && obj.startsWith('http') && (obj.toLowerCase().includes('.mp4') || obj.toLowerCase().includes('.mov') || obj.toLowerCase().includes('video'))) {
                    if (!seenVideos.has(obj)) {
                        seenVideos.add(obj);
                        videos.push(obj);
                    }
                } else if (Array.isArray(obj)) {
                    obj.forEach(scanForVideo);
                } else if (typeof obj === 'object') {
                    Object.values(obj).forEach(scanForVideo);
                }
            }
            scanForVideo(o);
            
            if (videos.length > 0) {
                const vidLinks = videos.map((v, i) => \`<a href="\${v}" target="_blank" style="display:inline-block; margin-right:10px; padding:8px 12px; background:#eef2ff; color:var(--accent); text-decoration:none; border-radius:6px; font-size:13px; font-weight:500;">🎥 Ver Vídeo \${i+1}</a>\`).join('');
                videoHtml = \`
                <div class="section">
                    <div class="section-title">Vídeos Anexados</div>
                    <div>\${vidLinks}</div>
                </div>\`;
            }
            
            document.getElementById('detail-content').innerHTML = \`
                <div class="doc-header">
                    <div class="doc-brand">
                        <h2>Relatório de Execução</h2>
                    </div>
                    <div class="doc-meta">
                        <div style="font-size:24px; font-weight:700; color:var(--accent)">\${PREFIX}\${osNum}</div>
                        <div style="color:var(--text-muted); font-size:13px">Emitido em \${dateStr}</div>
                    </div>
                </div>
                
                <h1 class="doc-title">\${o.title || 'Ordem de Serviço'}</h1>
                <div style="margin-bottom: 30px; font-size: 15px; color: #334155; line-height: 1.6;">
                    \${o.description || 'Nenhuma descrição detalhada fornecida.'}
                </div>
                
                <div class="section">
                    <div class="section-title">Informações Gerais</div>
                    <div class="info-grid">
                        <div class="info-box">
                            <div class="info-label">Cliente</div>
                            <div class="info-value">\${o.customerName || o.customer_name || '-'}</div>
                            <div style="font-size:12px; color:var(--text-muted); margin-top:4px">\${o.customerAddress || o.customer_address || ''}</div>
                        </div>
                        <div class="info-box">
                            <div class="info-label">Status e Prioridade</div>
                            <div class="info-value">\${o.status} &bull; \${o.priority || 'Normal'}</div>
                        </div>
                    </div>
                </div>
                
                \${itemsHtml}
                \${videoHtml}
                \${mediaHtml}
                \${sigHtml}
            \`;
        }
        
        function closeDetail() {
            document.getElementById('list-view').style.display = 'block';
            document.getElementById('detail-view').style.display = 'none';
        }
        
        renderList();
    </script>
</body>
</html>`;
    }

    // ─────────────────────────────────────────────────────────────
    // STRATEGY 1: File System Access API (Alta Velocidade / Sem limite de RAM)
    // ─────────────────────────────────────────────────────────────
    private async executeFileSystemBackup(directoryHandle: FileSystemDirectoryHandle, tables: string[], orders: any[], quotes: any[], prefix: string) {
        try {
            // 1. Criar estrutura de pastas
            const dbDir = await directoryHandle.getDirectoryHandle('1_BancoDeDados', { create: true });
            const mediaDir = await directoryHandle.getDirectoryHandle('2_Anexos', { create: true });
            
            // 2. Exportar tabelas
            for (let i = 0; i < tables.length; i++) {
                const table = tables[i];
                this.onProgress(`Gravando tabela: ${table}...`, 5 + (i / tables.length) * 20);
                
                let data = [];
                if (table === 'orders') data = orders;
                else if (table === 'quotes') data = quotes;
                else data = await this.fetchTable(table);

                if (data.length > 0) {
                    // Save CSV
                    const csvHandle = await dbDir.getFileHandle(`${table}.csv`, { create: true });
                    const csvWritable = await csvHandle.createWritable();
                    await csvWritable.write(this.formatCsv(data));
                    await csvWritable.close();
                    
                    // Save JSON
                    const jsonHandle = await dbDir.getFileHandle(`${table}.json`, { create: true });
                    const jsonWritable = await jsonHandle.createWritable();
                    await jsonWritable.write(JSON.stringify(data, null, 2));
                    await jsonWritable.close();
                }
            }

            // 3. Exportar Imagens em Paralelo com limite de concorrência
            const files = this.extractFileUrls(prefix, orders, quotes);
            const totalFiles = files.length;
            
            if (totalFiles > 0) {
                let downloaded = 0;
                const CONCURRENCY = 10;
                
                for (let i = 0; i < files.length; i += CONCURRENCY) {
                    const chunk = files.slice(i, i + CONCURRENCY);
                    
                    await Promise.all(chunk.map(async (file) => {
                        try {
                            const response = await fetch(file.url);
                            const blob = await response.blob();
                            
                            const fileHandle = await mediaDir.getFileHandle(file.name, { create: true });
                            const writable = await fileHandle.createWritable();
                            await writable.write(blob);
                            await writable.close();
                            
                            downloaded++;
                        } catch (e) {
                            console.warn(`Erro ao baixar anexo ${file.name}:`, e);
                        }
                    }));
                    
                    this.onProgress(`Baixando fotos diretamente para o disco... (${downloaded}/${totalFiles})`, 25 + (downloaded / totalFiles) * 70);
                }
            }

            // 4. Criar Visualizador Offline
            this.onProgress('Criando visualizador offline...', 98);
            const viewerHtml = this.generateOfflineViewerHtml(prefix, orders);
            const viewerHandle = await directoryHandle.getFileHandle('Visualizador_Ordens.html', { create: true });
            const viewerWritable = await viewerHandle.createWritable();
            await viewerWritable.write(viewerHtml);
            await viewerWritable.close();

            this.onProgress('Backup gravado com sucesso no seu disco!', 100);
            return true;

        } catch (e: any) {
            throw e;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // STRATEGY 2: JSZip Fallback (Navegadores legados ou se usuário cancelar o picker)
    // ─────────────────────────────────────────────────────────────
    private async executeJSZipBackup(tables: string[], orders: any[], quotes: any[], prefix: string) {
        const zip = new JSZip();
        const dbFolder = zip.folder("1_BancoDeDados");
        
        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            this.onProgress(`Compactando tabela: ${table}...`, 5 + (i / tables.length) * 20);
            
            let data = [];
            if (table === 'orders') data = orders;
            else if (table === 'quotes') data = quotes;
            else data = await this.fetchTable(table);

            if (data.length > 0) {
                dbFolder?.file(`${table}.csv`, this.formatCsv(data));
                dbFolder?.file(`${table}.json`, JSON.stringify(data, null, 2));
            }
        }
        
        const files = this.extractFileUrls(prefix, orders, quotes);
        const mediaFolder = zip.folder("2_Anexos");
        const totalFiles = files.length;
        
        if (mediaFolder && totalFiles > 0) {
            let downloaded = 0;
            // No JSZip não podemos abusar de paralelismo intenso senão a RAM estoura
            for (const file of files) {
                try {
                    const response = await fetch(file.url);
                    const blob = await response.blob();
                    mediaFolder.file(file.name, blob);
                    downloaded++;
                    
                    if (downloaded % 10 === 0 || downloaded === totalFiles) {
                        this.onProgress(`Baixando fotos para a memória... (${downloaded}/${totalFiles})`, 25 + (downloaded / totalFiles) * 60);
                    }
                } catch (e) {
                    console.warn(`Erro anexo:`, e);
                }
            }
        }
        
        this.onProgress('Criando visualizador offline...', 85);
        zip.file('Visualizador_Ordens.html', this.generateOfflineViewerHtml(prefix, orders));
        
        this.onProgress('Compactando arquivo final...', 90);
        const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, (meta) => {
            this.onProgress(`Compactando zip... (${meta.percent.toFixed(0)}%)`, 90 + (meta.percent * 0.1));
        });
        
        const dateStr = new Date().toISOString().split('T')[0];
        saveAs(content, `backup_empresa_${this.tenantId}_${dateStr}.zip`);
        
        this.onProgress('Download do ZIP concluído!', 100);
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    // ENTRY POINT
    // ─────────────────────────────────────────────────────────────
    public async executeBackup() {
        try {
            this.onProgress('Iniciando análise de dados...', 2);
            
            // Get tenant prefix
            const { data: tData } = await supabase.from('tenants').select('osPrefix, os_prefix').eq('id', this.tenantId).single();
            const prefix = tData?.osPrefix || tData?.os_prefix || 'Nex-';

            const tables = ['tenants', 'users', 'technicians', 'customers', 'equipments', 'inventory', 'orders', 'quotes'];
            const orders = await this.fetchTable('orders'); // Fetch early for HTML viewer
            const quotes = await this.fetchTable('quotes'); // Fetch early for attachments
            
            // Verifica suporte a API nativa
            if ('showDirectoryPicker' in window) {
                try {
                    this.onProgress('Aguardando você selecionar a pasta de destino...', 5);
                    const dirHandle = await (window as any).showDirectoryPicker({
                        mode: 'readwrite',
                        startIn: 'documents'
                    });
                    
                    // Usuário selecionou a pasta, rodar Strategy 1
                    await this.executeFileSystemBackup(dirHandle, tables, orders, quotes, prefix);
                    return true;
                } catch (e: any) {
                    // AbortError significa que o usuário cancelou a janela
                    if (e.name === 'AbortError') {
                        throw new Error("Seleção de pasta cancelada. O backup foi interrompido.");
                    }
                    console.warn('API de File System falhou, usando JSZip Fallback...', e);
                }
            }
            
            // Strategy 2 (Fallback)
            this.onProgress('Iniciando backup em modo ZIP (legado)...', 5);
            await this.executeJSZipBackup(tables, orders, quotes, prefix);
            return true;
            
        } catch (err: any) {
            console.error('[BackupEngine] Erro crítico no backup:', err);
            this.onProgress(`Erro na exportação: ${err.message}`, 0);
            throw err;
        }
    }
}
