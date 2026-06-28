
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from './logger';

const MAX_SIZE_BYTES = 300 * 1024; // 300KB — margem para quality upgrade
const MAX_WIDTH = 1280; // Full HD landscape width (preserva detalhes de equipamentos)
const INITIAL_QUALITY = 0.65;

export class ImageService {
    static async compressAvatar(uri: string): Promise<string> {
        try {
            logger.log(`[ImageService] Compressing avatar: ${uri}`, 'info');
            const MAX_AVATAR_SIZE = 120 * 1024; // 120KB limit
            let width = 480; // Avatares em 480px (nítido em telas retina)
            let quality = 0.75;

            let result = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width } }],
                { compress: quality, format: ImageManipulator.SaveFormat.WEBP }
            );

            let fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (!fileInfo.exists) throw new Error('Compressed file not found');
            let size = fileInfo.size;
            let attempts = 0;

            while (size > MAX_AVATAR_SIZE && attempts < 3) {
                attempts++;
                quality -= 0.2;
                if (quality < 0.2) {
                    quality = 0.5;
                    width = Math.floor(width * 0.7);
                }
                result = await ImageManipulator.manipulateAsync(
                    result.uri,
                    [{ resize: { width } }],
                    { compress: quality, format: ImageManipulator.SaveFormat.WEBP }
                );
                fileInfo = await FileSystem.getInfoAsync(result.uri);
                if (fileInfo.exists) size = fileInfo.size;
            }

            logger.log(`[ImageService] Avatar final size: ${(size / 1024).toFixed(2)}KB`, 'info');
            return result.uri;
        } catch (error) {
            logger.log(`Error compressing avatar: ${error}`, 'error');
            return uri;
        }
    }

    static async compressImage(uri: string): Promise<string> {
        try {
            // v6: Quality upgrade — 1280px + WebP 0.55 = ~160-220KB (mais nitidez para laudos)
            const MAX_SIZE_BYTES = 280 * 1024;
            
            let result = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: 1280 } }],
                { compress: 0.55, format: ImageManipulator.SaveFormat.WEBP }
            );

            let fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (!fileInfo.exists) throw new Error('Compressed file not found');
            let size = fileInfo.size;

            // Fallback se ultrapassou (raro com WebP 1280px)
            if (size > MAX_SIZE_BYTES) {
                result = await ImageManipulator.manipulateAsync(
                    result.uri,
                    [{ resize: { width: 960 } }],
                    { compress: 0.45, format: ImageManipulator.SaveFormat.WEBP }
                );
            }

            return result.uri;
        } catch (error) {
            logger.log(`Error compressing image: ${error}`, 'error');
            return uri;
        }
    }
}
