import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { KNOWLEDGE_BASE } from '../data/dunoKnowledge';

// Set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// MICRO-CHUNKING: Cada pedaço tem no máximo ~1.500 caracteres
// Isso garante precisão máxima (o banco acha o trecho exato) e 
// evita estourar o limite de tokens da Groq Cloud.
const CHUNK_SIZE = 1500;
const OVERLAP = 300;

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
      
      // SANITIZAÇÃO PROFUNDA 2.0: o PostgreSQL jsonb rejeita duas coisas na vida:
      // 1. Caractere Nulo (\u0000)
      // 2. Surrogates órfãos do UTF-16 gerados na extração de PDFs (/\\u[dD][...]/)
      // Limpar ambos garante que a transação não dê o erro "Empty or invalid json"
      const cleanBatch = JSON.parse(JSON.stringify(batch).replace(/\\u0000|\\u[dD][0-9a-fA-F]{3}/g, ''));
      
      const { error } = await supabase.rpc('ingest_ai_knowledge_batch', {
        chunks: cleanBatch
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

    if (queryKeywords.length === 0) {
      queryKeywords = removeAccents(query.toLowerCase())
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
    }
    if (queryKeywords.length === 0) {
      queryKeywords = removeAccents(query.toLowerCase())
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
    }

    // ══════════════════════════════════════════════════════════════
    // BUSCA V3: O banco já ordena por relevância.
    // Pedimos os top 20 mais relevantes e fazemos re-rank local
    // com boost de marca/frase para precisão máxima.
    // ══════════════════════════════════════════════════════════════
    let data: any[] = [];
    if (queryKeywords.length > 0) {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('search_ai_knowledge_global', { p_keywords: queryKeywords, p_limit: 20 });

      if (rpcError) {
        console.error('[AI Search] Erro na RPC V3:', rpcError.message);
        // Fallback para busca direta
        const { data: fallbackData } = await supabase
          .from('ai_knowledge_base')
          .select('content, source_name, keywords')
          .limit(20);
        data = fallbackData || [];
      } else {
        data = rpcData || [];
        console.log(`[AI Search] RPC V3 retornou ${data.length} chunks já ordenados por relevância.`);
      }
    } else {
      // Pergunta sem palavras reconhecidas: busca os mais recentes
      const { data: fallbackData } = await supabase
        .from('ai_knowledge_base')
        .select('content, source_name, keywords')
        .order('created_at', { ascending: false })
        .limit(20);
      data = fallbackData || [];
    }

    if (data.length === 0) {
      console.log('[AI Search] Nenhum chunk encontrado. Usando apenas o Manual do Sistema.');
    }

    // ══════════════════════════════════════════════════════════════
    // RE-RANK LOCAL: Aplica boost de marca e frase exata por cima
    // do score de relevância que o banco já calculou.
    // ══════════════════════════════════════════════════════════════
    const queryNorm = removeAccents(query.toLowerCase());
    const queryWordsRaw = queryNorm.split(/\s+/).filter(w => w.length > 2);
    const brandWords = query
      .split(/\s+/)
      .filter(w => /^[A-Z]{2,}/.test(w) || /^[A-Z][a-záéíóúãõ]+/.test(w))
      .map(w => removeAccents(w.toLowerCase()));

    const scored = data.map((doc: any) => {
      // Base: score de relevância que o banco calculou (V3)
      let score = (doc.relevance_score || 0) * 3;
      const contentNorm = removeAccents((doc.content || '').toLowerCase());
      const sourceNorm = removeAccents((doc.source_name || '').toLowerCase());

      // Boost: marca/modelo no nome do arquivo
      for (const brand of brandWords) {
        if (sourceNorm.includes(brand)) score += 50;
        if (contentNorm.includes(brand)) score += 20;
      }

      // Boost: palavras da pergunta no conteúdo
      for (const w of queryWordsRaw) {
        if (contentNorm.includes(w)) score += 2;
      }

      // Mega-boost: frase exata
      for (let len = Math.min(queryWordsRaw.length, 5); len >= 2; len--) {
        for (let start = 0; start <= queryWordsRaw.length - len; start++) {
          const phrase = queryWordsRaw.slice(start, start + len).join(' ');
          if (contentNorm.includes(phrase)) score += len * 10;
        }
      }

      return { ...doc, score };
    });

    scored.sort((a: any, b: any) => b.score - a.score);
    console.log('[AI Search] Top 5 após re-rank:', scored.slice(0, 5).map((s: any) =>
      `"${s.source_name}" → score: ${s.score}`
    ));

    // ══════════════════════════════════════════════════════════════
    // ENVIO DIRETO (sem Mini-RAG!)
    // Com Micro-Chunks de 1500 chars cada, o banco já retorna
    // pedaços precisos. Enviamos os 4 melhores direto para a IA.
    // 4 × 1500 chars ≈ 2.000 tokens — longe do limite de 6k TPM!
    // ══════════════════════════════════════════════════════════════
    const bestMatches: any[] = scored.slice(0, 4);

    // Injeção cirúrgica do manual interno (apenas seções relevantes)
    const searchWords = [...brandWords, ...queryWordsRaw, ...queryKeywords];
    const relevantManualItems = KNOWLEDGE_BASE.filter(k => {
      const itemLower = removeAccents(k.response.toLowerCase());
      const itemKws = k.keywords ? k.keywords.map(kw => removeAccents(kw.toLowerCase())) : [];
      return searchWords.some(word =>
        word.length >= 3 && (itemKws.includes(word) || itemLower.includes(word))
      );
    });

    if (relevantManualItems.length > 0) {
      const systemManualText = relevantManualItems.slice(0, 2).map(k => k.response).join('\n\n');
      bestMatches.push({
        content: `[MANUAL OFICIAL DO SISTEMA DUNO]\n${systemManualText}`,
        source_name: 'Manual do Sistema Duno',
        keywords: ['manual', 'sistema'],
        score: 999
      });
    }

    try {
      let token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        token = import.meta.env.VITE_SUPABASE_ANON_KEY;
        console.log('[AI Search] Sem sessão Supabase. Usando ANON_KEY.');
      }
      
      const functionUrl = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/duno-ai-generator';
      console.log('[AI Search] Chamando Edge Function. Chunks:', bestMatches.length);

      // ✅ Micro-Chunks já são pequenos (≤1500 chars = ≤500 tokens cada).
      // 4 chunks + manual = ≤2500 tokens. Bem abaixo do limite de 6k da Groq!
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query,
          chunks: bestMatches.map((m: any) => ({
            content: m.content,
            source_name: m.source_name,
            keywords: m.keywords
          }))
        })
      });

      const json = await response.json();
      if (json.answer) return json.answer;

      if (json.error) {
        alert("⚠️ AVISO DO DEV: A Edge Function retornou erro: " + json.error);
        throw new Error(json.error);
      }

      throw new Error('Resposta vazia da Edge Function');
    } catch (err: any) {
      console.error('[AI Search] Erro no Edge Function:', err);
      let fb = `📄 **Encontrei estas informações nos documentos:**\n\n`;
      bestMatches.forEach((m: any) => fb += `> "${m.content.substring(0, 400)}..."\n\n`);
      return fb;
    }
  }
};
