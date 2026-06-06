import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { KNOWLEDGE_BASE } from '../data/dunoKnowledge';

// Set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// CHUNKS MASSIVOS: Cada pedaço tem ~20.000 caracteres (~4.000 palavras)
// Isso garante que seções inteiras do manual fiquem juntas sem cortar contexto.
const CHUNK_SIZE = 20000;
const OVERLAP = 2000;

export interface KnowledgeDocument {
  id: string;
  source_name: string;
  source_type: string;
  created_at: string;
  metadata: any;
}

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Extrai TODAS as palavras relevantes do texto como keywords (até 2000)
// Quanto mais keywords, mais chances de match na busca da IA.
function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'de', 'do', 'da', 'em', 'para', 'com', 'um', 'uma', 'os', 'as', 'o', 'a',
    'que', 'se', 'na', 'no', 'eu', 'por', 'ou', 'e', 'ao', 'das', 'dos', 'nos',
    'nas', 'num', 'numa', 'pelo', 'pela', 'the', 'and', 'is', 'of', 'to', 'in'
  ]);
  
  // Preserva números e siglas — essenciais para manuais técnicos
  const words = removeAccents(text.toLowerCase())
    .replace(/[^\w\s\-\.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopwords.has(w));
    
  // Frequência das palavras
  const freqs: Record<string, number> = {};
  for (const w of words) freqs[w] = (freqs[w] || 0) + 1;
  
  // Retorna até 2000 palavras-chave únicas — TUDO que importa no manual
  return Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2000)
    .map(e => e[0]);
}

// Quebra o texto em chunks respeitando sobreposição
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + CHUNK_SIZE;
    if (end < text.length) {
      // Tenta quebrar em um espaço ou pontuação próximo ao final do chunk
      const slice = text.substring(i, end);
      const lastSpace = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('.'), slice.lastIndexOf('\n'));
      if (lastSpace > CHUNK_SIZE * 0.7) {
        end = i + lastSpace;
      }
    }
    chunks.push(text.substring(i, end).trim());
    i = end - OVERLAP;
  }
  return chunks;
}

export const aiKnowledgeService = {
  async extractTextFromPDF(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    let fullText = '';
    
    for (let i = 1; i <= numPages; i++) {
      if (onProgress) onProgress(i, numPages);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // ══════════════════════════════════════════════════════════
      // EXTRAÇÃO TOTAL: Captura TUDO — texto, símbolos, números,
      // caracteres especiais, tabelas e posição de imagens.
      // NADA é ignorado. Cada caractere conta.
      // ══════════════════════════════════════════════════════════
      
      // Pega TODOS os items — incluindo strings vazias que representam espaçamento
      const items = textContent.items
        .filter((item: any) => typeof item.str === 'string')
        .map((item: any) => ({
          text: item.str,  // Preserva TODOS os caracteres, incluindo símbolos ★●▲►◆
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          fontSize: Math.abs(Math.round(item.transform[0])),
          width: item.width || 0,
          hasEOL: item.hasEOL || false  // Quebra de linha explícita do PDF
        }));

      // Detectar imagens na página via operatorList
      let imageCount = 0;
      try {
        const ops = await page.getOperatorList();
        for (let opIdx = 0; opIdx < ops.fnArray.length; opIdx++) {
          // OPS.paintImageXObject = 85, OPS.paintInlineImageXObject = 86
          if (ops.fnArray[opIdx] === 85 || ops.fnArray[opIdx] === 86) {
            imageCount++;
          }
        }
      } catch (_e) { /* silencioso */ }

      let pageText = `\n══════════════════════════════════════\n══ PÁGINA ${i} de ${numPages} ══\n══════════════════════════════════════\n`;
      
      if (imageCount > 0) {
        pageText += `[📷 Esta página contém ${imageCount} imagem(ns)/diagrama(s)/símbolo(s) gráfico(s)]\n`;
      }

      if (items.length === 0) {
        pageText += `[⚠️ Página sem texto extraível — contém apenas imagens ou gráficos]\n`;
        fullText += pageText + '\n';
        continue;
      }

      // Ordena por Y descendente (topo → baixo) e X crescente (esq → dir)
      items.sort((a: any, b: any) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.x - b.x;
      });

      let lastY = items[0]?.y ?? 0;
      let lastX = 0;
      let lastFontSize = items[0]?.fontSize ?? 12;
      
      for (const item of items) {
        const yGap = Math.abs(lastY - item.y);
        
        if (yGap > 3) {
          // Nova linha
          pageText += '\n';
          
          // Gap vertical grande = novo parágrafo ou seção
          if (yGap > 15) {
            pageText += '\n';
          }
          
          // Fonte significativamente maior = provavelmente um TÍTULO ou cabeçalho
          if (item.fontSize > lastFontSize * 1.3 && item.text.trim().length > 0) {
            pageText += '### '; // Marca como título para a IA entender a hierarquia
          }
          
          lastX = 0;
        } else if (item.x - lastX > 40) {
          // Coluna de tabela
          pageText += '  |  ';
        } else if (item.x - lastX > 5 && item.text.trim().length > 0) {
          pageText += ' ';
        }

        // Adiciona o texto SEM filtrar nenhum caractere
        pageText += item.text;
        
        // Se o PDF marcou quebra de linha explícita
        if (item.hasEOL) {
          pageText += '\n';
        }
        
        lastY = item.y;
        lastX = item.x + (item.width || (item.text.length * (item.fontSize * 0.55)));
        lastFontSize = item.fontSize || lastFontSize;
      }

      // Extrair anotações da página (links, notas, etc)
      try {
        const annotations = await page.getAnnotations();
        if (annotations.length > 0) {
          pageText += '\n\n[Anotações/Links desta página:]\n';
          for (const ann of annotations) {
            if (ann.url) pageText += `- Link: ${ann.url}\n`;
            if (ann.contents) pageText += `- Nota: ${ann.contents}\n`;
            if (ann.title) pageText += `- Título: ${ann.title}\n`;
          }
        }
      } catch (_e) { /* silencioso */ }
      
      fullText += pageText + '\n\n';
    }
    
    // Adicionar metadados do PDF
    try {
      const metadata = await pdf.getMetadata();
      const info = metadata?.info as any;
      if (info) {
        fullText = `[METADADOS DO DOCUMENTO]\nTítulo: ${info.Title || 'N/A'}\nAutor: ${info.Author || 'N/A'}\nAssunto: ${info.Subject || 'N/A'}\nPalavras-chave: ${info.Keywords || 'N/A'}\nCriador: ${info.Creator || 'N/A'}\nTotal de Páginas: ${numPages}\n\n` + fullText;
      }
    } catch (_e) { /* silencioso */ }
    
    return fullText;
  },

  async ingestDocument(file: File, onProgress?: (status: string) => void): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('Tenant não identificado');

    // 1. Extrair texto
    if (onProgress) onProgress('Extraindo texto do PDF...');
    let text = '';
    if (file.type === 'application/pdf') {
      text = await this.extractTextFromPDF(file, (p, t) => {
        if (onProgress) onProgress(`Lendo página ${p} de ${t}...`);
      });
    } else {
      text = await file.text();
    }

    if (!text.trim()) throw new Error('O documento está vazio ou não possui texto legível.');

    // SANITIZAÇÃO MÍNIMA: Remove APENAS o byte nulo (\u0000) que o PostgreSQL rejeita.
    // Todos os outros caracteres, símbolos e caracteres especiais são PRESERVADOS.
    text = text.replace(/\u0000/g, '');

    // 2. Criar Chunks
    if (onProgress) onProgress('Processando conhecimento...');
    const chunks = chunkText(text);

    // 3. Preparar inserts — cada chunk leva o nome do arquivo embutido no conteúdo
    // para que a IA SEMPRE saiba de qual manual veio cada trecho.
    const fileNameClean = file.name.replace(/\.pdf$/i, '').replace(/[_-]/g, ' ');
    const fileNameKeywords = extractKeywords(fileNameClean);
    
    const inserts = chunks.map((chunk, idx) => {
      // Prefixar o conteúdo com o nome do arquivo para dar contexto à IA
      const enrichedContent = `[Fonte: ${fileNameClean}]\n${chunk}`;
      // Mesclar keywords do chunk com keywords do nome do arquivo
      const chunkKeywords = [...new Set([...extractKeywords(chunk), ...fileNameKeywords])];
      
      return {
        tenant_id: tenantId,
        source_name: file.name,
        source_type: file.type === 'application/pdf' ? 'pdf' : 'text',
        chunk_index: idx,
        content: enrichedContent,
        keywords: chunkKeywords,
        metadata: { totalChunks: chunks.length, originalSize: file.size }
      };
    });

    // 4. Inserir via RPC com SECURITY DEFINER (contorna políticas RLS)
    if (onProgress) onProgress('Salvando na base de dados da IA...');
    const BATCH_SIZE = 50;
    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const batch = inserts.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.rpc('ingest_ai_knowledge_batch', {
        chunks: batch
      });
      if (error) throw new Error(`Erro ao salvar no banco: ${error.message}`);
    }

    if (onProgress) onProgress('Concluído! Documento aprendido com sucesso.');
  },

  async listDocuments(): Promise<KnowledgeDocument[]> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from('ai_knowledge_base')
      .select('source_name, source_type, created_at, metadata')
      .eq('tenant_id', tenantId)
      .eq('chunk_index', 0) // pega só o primeiro chunk de cada arquivo pra listar
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar docs:', error);
      return [];
    }

    return (data || []).map(d => ({
      id: d.source_name, // source_name como id unico por enquanto
      source_name: d.source_name,
      source_type: d.source_type,
      created_at: d.created_at,
      metadata: d.metadata
    }));
  },

  async deleteDocument(sourceName: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;

    const { error } = await supabase
      .from('ai_knowledge_base')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('source_name', sourceName);

    if (error) throw new Error(`Erro ao excluir documento: ${error.message}`);
  },

  async searchKnowledge(query: string, tenantId: string, topK: number = 7): Promise<string | null> {
    console.log('[AI Search] Iniciando busca para query:', query);
    let queryKeywords = extractKeywords(query);

    // Se a extração remover todas as stopwords e não sobrar nada, 
    // pegamos palavras maiores que 3 letras direto da query
    if (queryKeywords.length === 0) {
      queryKeywords = removeAccents(query.toLowerCase())
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
    }
    
    // Se a pergunta for muito curta ou genérica, tentamos palavras com 2+ letras
    if (queryKeywords.length === 0) {
      queryKeywords = removeAccents(query.toLowerCase())
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
    }

    let data: any[] = [];

    // ⚡ TURBO: Executa AMBAS as buscas em PARALELO (economiza 2-5s)
    const rpcPromise = queryKeywords.length > 0
      ? supabase.rpc('search_ai_knowledge_global', { p_keywords: queryKeywords, p_limit: 100 })
      : Promise.resolve({ data: null, error: null });

    const directPromise = supabase
      .from('ai_knowledge_base')
      .select('content, source_name, keywords')
      .order('created_at', { ascending: false })
      .limit(100);

    const [rpcResult, directResult] = await Promise.all([rpcPromise, directPromise]);

    // 1️⃣ Resultados da RPC (busca por keywords)
    if (rpcResult.error) {
      console.error('[AI Search] Erro na RPC:', rpcResult.error);
    } else if (rpcResult.data && rpcResult.data.length > 0) {
      data = rpcResult.data;
      console.log(`[AI Search] RPC retornou ${data.length} chunks.`);
    }

    // 2️⃣ Merge com busca direta (garante que PDFs recentes não fiquem de fora)
    if (directResult.error) {
       console.error('[AI Search] Erro no fallback direto:', directResult.error);
    } else if (directResult.data && directResult.data.length > 0) {
       const existingContents = new Set(data.map((d: any) => d.content?.substring(0, 100)));
       let added = 0;
       for (const doc of directResult.data) {
         const key = doc.content?.substring(0, 100);
         if (!existingContents.has(key)) {
           data.push(doc);
           existingContents.add(key);
           added++;
         }
       }
       console.log(`[AI Search] Merge: +${added} chunks extras. Total: ${data.length}`);
    }

    // Se não tiver nenhum PDF no banco, não vamos mais abortar!
    // Queremos que a IA sempre consiga responder usando o "Manual do Sistema" injetado abaixo.
    if (data.length === 0) {
      console.log('[AI Search] Nenhum PDF encontrado no banco. Usando apenas o Manual do Sistema injetado.');
    }

    // 3️⃣ RERANKING INTELIGENTE (com Boost de Marca/Modelo e Frase Exata)
    const queryNorm = removeAccents(query.toLowerCase());
    const queryWordsRaw = queryNorm.split(/\s+/).filter(w => w.length > 2);
    
    // Detecta "nomes próprios" na pergunta (marcas, modelos, siglas)
    // São palavras que começam com maiúscula na pergunta original ou têm mais de 3 letras maiúsculas seguidas
    const brandWords = query
      .split(/\s+/)
      .filter(w => /^[A-Z]{2,}/.test(w) || /^[A-Z][a-záéíóúãõ]+/.test(w))
      .map(w => removeAccents(w.toLowerCase()));
    
    console.log('[AI Search] Marcas/modelos detectados na pergunta:', brandWords);

    const scored = data.map((doc: any) => {
      let score = 0;
      const contentNorm = removeAccents((doc.content || '').toLowerCase());
      const sourceNorm = removeAccents((doc.source_name || '').toLowerCase());
      
      // ═══ BOOST 1: Nome do arquivo (source_name) contém a marca da pergunta ═══
      // Se o usuário perguntou sobre "INTELBRAS" e o chunk vem de um PDF chamado
      // "Manual_Intelbras.pdf", esse chunk ganha +50 pontos de vantagem ABSURDA.
      for (const brand of brandWords) {
        if (sourceNorm.includes(brand)) {
          score += 50; // MEGA BOOST por fonte correta
        }
        // Se a marca aparece no conteúdo do chunk, boost forte também
        if (contentNorm.includes(brand)) {
          score += 20;
        }
      }
      
      // ═══ BOOST 2: Keywords indexadas no banco ═══
      for (const kw of queryKeywords) {
        if ((doc.keywords || []).includes(kw)) score += 5;
        if (contentNorm.includes(removeAccents(kw))) score += 3;
      }
      
      // ═══ BOOST 3: Palavras da pergunta no conteúdo ═══
      for (const w of queryWordsRaw) {
        if (contentNorm.includes(w)) score += 2;
      }
      
      // ═══ BOOST 4: Frase exata (2+ palavras consecutivas da pergunta) ═══
      // Se o usuário perguntou "acesso remoto", procuramos "acesso remoto" junto no texto.
      // Frases exatas são MUITO mais relevantes que palavras soltas.
      for (let len = Math.min(queryWordsRaw.length, 5); len >= 2; len--) {
        for (let start = 0; start <= queryWordsRaw.length - len; start++) {
          const phrase = queryWordsRaw.slice(start, start + len).join(' ');
          if (contentNorm.includes(phrase)) {
            score += len * 8; // Quanto mais longa a frase exata, mais pontos
          }
        }
      }
      
      return { ...doc, score };
    });

    // Ordena do maior pro menor score
    scored.sort((a: any, b: any) => b.score - a.score);
    
    console.log('[AI Search] Top 5 scores:', scored.slice(0, 5).map((s: any) => 
      `${s.source_name} → score: ${s.score}`
    ));
    
    // 3 chunks completos (60k chars) é o limite exato para que a IA do OpenRouter 
    // responda rápido (em ~5 a 10s) sem cortar informações importantes dos PDFs.
    const bestMatches = scored.slice(0, 3);
    
    // ══════════════════════════════════════════════════════════════
    // INJEÇÃO DO MANUAL DO SISTEMA (KNOWLEDGE_BASE)
    // Isso garante que a IA SEMPRE saiba como operar o painel (criar usuário, etc),
    // independentemente dos PDFs que os usuários enviaram.
    // ══════════════════════════════════════════════════════════════
    const systemManualText = KNOWLEDGE_BASE.map(k => k.response).join('\n\n');
    bestMatches.push({
      content: `[MANUAL OFICIAL DO SISTEMA DUNO]\n${systemManualText}`,
      source_name: 'Manual do Sistema Duno',
      keywords: ['manual', 'sistema', 'duno', 'instruções', 'painel'],
      score: 999 // Força prioridade máxima no entendimento da IA
    });

    try {
      let token = (await supabase.auth.getSession()).data.session?.access_token;
      
      // Se não tiver token do Supabase (ex: usuário logado via custom auth do app técnico), 
      // usa a ANON KEY como fallback para a Edge Function
      if (!token) {
         token = import.meta.env.VITE_SUPABASE_ANON_KEY;
         console.log('[AI Search] Sem sessão do Supabase Auth. Usando ANON_KEY como fallback.');
      }
      
      const functionUrl = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/duno-ai-generator';
      console.log('[AI Search] Chamando Edge Function em:', functionUrl);
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: query,
          // 100% ROBUSTEZ: Voltamos a enviar o chunk inteiro (20k chars).
          // Garantimos que a IA não perca nada. O processamento rápido será 
          // garantido pela mudança no backend (uso nativo do Gemini).
          chunks: bestMatches
        })
      });

      const json = await response.json();
      if (json.answer) {
         return json.answer;
      }
      
      if (json.error) {
        alert("⚠️ AVISO DO DEV: A Edge Function retornou erro: " + json.error);
        if (json.error.includes('API Key') || json.error.includes('Gemini') || json.error.includes('GEMINI_API_KEY')) {
           return `⚙️ **Atenção:** A chave de API do Gemini não está configurada no servidor Supabase.`;
        }
        throw new Error(json.error);
      }
      
      if (json.error && (json.error.includes('API Key') || json.error.includes('Gemini') || json.error.includes('GEMINI_API_KEY'))) {
         return `⚙️ **Atenção:** A chave de API do Gemini (GEMINI_API_KEY) não foi configurada no servidor Supabase. O RAG requer a chave para gerar a resposta inteligente. Configure-a no dashboard do Supabase (Edge Functions > Secrets).`;
      }

      throw new Error(json.error || 'Erro na geração');
    } catch (err: any) {
      console.error('Erro no Edge Function duno-ai-generator:', err);
      // Fallback: mostra texto bruto dos melhores chunks
      let fb = `📄 **Encontrei estas informações nos documentos:**\n\n`;
      bestMatches.forEach((m: any) => fb += `> "${m.content.substring(0, 400)}..."\n\n`);
      return fb;
    }
  }
};
