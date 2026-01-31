// ============================================
// SERVIÇO DE UPLOAD DE ARQUIVOS
// Arquivo: services/storageService.ts
// ============================================

import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'order-attachments';

export interface UploadedFile {
    id: string;
    url: string;
    fieldId: string;
    uploadedAt: string;
    uploadedBy?: string;
    signerName?: string;
}

export const StorageService = {
    /**
     * Faz upload de uma foto para uma ordem de serviço
     */
    uploadPhoto: async (
        orderId: string,
        fieldId: string,
        file: File,
        uploadedBy?: string
    ): Promise<UploadedFile> => {
        const fileExt = file.name.split('.').pop();
        const fileName = `photo-${Date.now()}.${fileExt}`;
        const filePath = `orders/${orderId}/photos/${fileName}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        return {
            id: `photo-${Date.now()}`,
            url: publicUrl,
            fieldId,
            uploadedAt: new Date().toISOString(),
            uploadedBy
        };
    },

    /**
     * Faz upload de uma assinatura (base64 ou blob)
     */
    uploadSignature: async (
        orderId: string,
        fieldId: string,
        signatureData: string | Blob,
        signerName?: string
    ): Promise<UploadedFile> => {
        const fileName = `signature-${Date.now()}.png`;
        const filePath = `orders/${orderId}/signatures/${fileName}`;

        let fileToUpload: Blob;

        // Converter base64 para Blob se necessário
        if (typeof signatureData === 'string') {
            const base64Data = signatureData.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            fileToUpload = new Blob([byteArray], { type: 'image/png' });
        } else {
            fileToUpload = signatureData;
        }

        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, fileToUpload, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        return {
            id: `signature-${Date.now()}`,
            url: publicUrl,
            fieldId,
            uploadedAt: new Date().toISOString(),
            signerName
        };
    },

    /**
     * Deleta um arquivo do storage
     */
    deleteFile: async (filePath: string): Promise<void> => {
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([filePath]);

        if (error) throw error;
    },

    /**
     * Lista todos os arquivos de uma ordem
     */
    listOrderFiles: async (orderId: string): Promise<any[]> => {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(`orders/${orderId}`, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) throw error;
        return data || [];
    },

    /**
     * Extrai o caminho do arquivo de uma URL pública
     */
    getFilePathFromUrl: (url: string): string => {
        const match = url.match(/\/object\/public\/order-attachments\/(.+)$/);
        return match ? match[1] : '';
    },

    /**
     * Salva metadados dos anexos na ordem
     */
    saveAttachmentsToOrder: async (
        orderId: string,
        photos: UploadedFile[],
        signatures: UploadedFile[]
    ): Promise<void> => {
        const attachments = { photos, signatures };

        const { error } = await supabase
            .from('orders')
            .update({ attachments })
            .eq('id', orderId);

        if (error) throw error;
    },

    /**
     * Busca os anexos de uma ordem
     */
    getOrderAttachments: async (orderId: string): Promise<{ photos: UploadedFile[], signatures: UploadedFile[] }> => {
        const { data, error } = await supabase
            .from('orders')
            .select('attachments')
            .eq('id', orderId)
            .single();

        if (error) throw error;

        return data?.attachments || { photos: [], signatures: [] };
    }
};
