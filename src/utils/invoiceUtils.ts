/**
 * Utilitário de Formatação de Protocolos e Identificadores Soberanos de Fatura (FAT-XXXXXX)
 * Regra:
 * 1. Padrão numérico sequencial com 6 dígitos: FAT-000001 até FAT-999999.
 * 2. Ao exceder 999999, transiciona automaticamente para formato alfanumérico de 6 caracteres 
 *    com uma letra no meio (ex: FAT-00A001 ... FAT-99Z999).
 */

export const formatInvoiceSequence = (seq: number): string => {
    if (isNaN(seq) || seq <= 0) return '000001';
    
    if (seq <= 999999) {
        return String(seq).padStart(6, '0');
    }
    
    const offset = seq - 999999;
    const letterIndex = Math.floor((offset - 1) / 999999) % 26;
    const letterChar = String.fromCharCode(65 + letterIndex);
    const numPart = String(((offset - 1) % 999999) + 1).padStart(5, '0');
    
    // Insere a letra exatamente no meio (2 dígitos + Letra + 3 dígitos = 6 caracteres)
    return `${numPart.slice(0, 2)}${letterChar}${numPart.slice(2)}`;
};

export const formatInvoiceDisplayId = (val: any): string => {
    if (!val) return 'FAT-000001';
    
    const str = String(val).trim();
    
    // Se já contém o prefixo FAT-
    if (str.toUpperCase().startsWith('FAT-')) {
        const rawCode = str.substring(4).trim();
        // Se for estritamente numérico, aplica a re-formatação de 6 dígitos / alfanumérico
        if (/^\d+$/.test(rawCode)) {
            const num = parseInt(rawCode, 10);
            return `FAT-${formatInvoiceSequence(num)}`;
        }
        return `FAT-${rawCode.toUpperCase()}`;
    }

    // Se for um número puro ou string de digitos
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        return `FAT-${formatInvoiceSequence(num)}`;
    }

    // Se for UUID ou chave alfanumérica genérica
    const cleanId = str.replace(/-/g, '').toUpperCase();
    return `FAT-${cleanId.slice(0, 6)}`;
};
