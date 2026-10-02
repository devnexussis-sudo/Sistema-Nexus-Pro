// src/utils/fileSearch.ts
/**
 * Browser-compatible file search utility used by Duno IA when a fallback scan is needed.
 * It uses Vite's import.meta.glob to read the raw source code of the project.
 * This allows the AI to perform a "System Scan" and learn how the system works in real-time.
 */

// Import raw source code of all ts/tsx files in the src directory
const files = import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });

/**
 * High‑level helper used by `analyzeAndDiscover` fallback. It scans all
 * project files for the query and returns a formatted string with the most
 * relevant snippets (up to `limit`).
 */
export async function searchProjectFiles(query: string, limit = 5): Promise<string> {
  const snippets: string[] = [];
  const lowerQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const terms = lowerQuery.split(/\s+/).filter(t => t.length > 2);

  if (terms.length === 0) return 'Nenhum termo de busca válido.';

  for (const path in files) {
    try {
      // Load the raw string content of the file
      const rawContent = await files[path]() as string;
      const lines = rawContent.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Se a linha contém pelo menos um dos termos principais da busca
        const matchCount = terms.filter(t => lineLower.includes(t)).length;
        
        // Para arquivos muito grandes, filtramos melhor (tem que casar múltiplos termos se houver)
        if (matchCount > 0 && matchCount >= Math.min(terms.length, 2)) {
          // Extrai o contexto (2 linhas antes, 3 depois)
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          
          // Formata o snippet
          const snippetLines = lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l.trim()}`);
          snippets.push(`--- Arquivo: ${path.replace('../../src/', '')} ---\n${snippetLines.join('\n')}`);
          
          // Pula algumas linhas para não pegar snippets sobrepostos
          i += 5;
          
          if (snippets.length >= limit) break;
        }
      }
    } catch (e) {
      console.error(`Erro ao ler o arquivo ${path}`, e);
    }
    
    if (snippets.length >= limit) break;
  }

  if (snippets.length === 0) {
    return 'Nenhum conteúdo relevante encontrado no código-fonte.';
  }

  return snippets.join('\n\n');
}

export default {
  searchProjectFiles
};
