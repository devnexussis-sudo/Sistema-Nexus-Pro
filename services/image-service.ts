
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from './logger';

const MAX_SIZE_BYTES = 250 * 1024; // 250KB
const MAX_WIDTH = 1024; // Reduce resolution to ensure size target easily
const INITIAL_QUALITY = 0.6;

export class ImageService {
    static async compressImage(uri: string): Promise<string> {
        try {
            logger.log(`Starting image compression for: ${uri}`, 'info');

            // 1. Initial manipulation: Resize to 900px & Convert to WebP (Very efficient)
            const MAX_SIZE_BYTES = 250 * 1024; // 250KB limit
            let width = 900;
            let quality = 0.7;

            let result = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width } }],
                { compress: quality, format: ImageManipulator.SaveFormat.WEBP }
            );

            // 2. Check size
            let fileInfo = await FileSystem.getInfoAsync(result.uri);
            if (!fileInfo.exists) throw new Error('Compressed file not found');

            let size = fileInfo.size;
            let attempts = 0;

            // 3. Adaptive loop: Reduce quality first, then size if needed
            while (size > MAX_SIZE_BYTES && attempts < 5) {
                logger.log(`Image size ${(size / 1024).toFixed(2)}KB exceeds 250KB. Re-compressing (attempt ${attempts + 1})...`, 'warn');

                attempts++;

                // Reduce quality aggressively
                quality -= 0.15;
                if (quality < 0.2) {
                    quality = 0.5; // Reset quality but shrink dimensions drastically
                    width = Math.floor(width * 0.7); // 30% smaller
                }

                result = await ImageManipulator.manipulateAsync(
                    // Use the result of previous step to avoid reloading original big file if possible? 
                    // No, manipulateAsync usually works better from source or intermediate uri. 
                    // Using intermediate result is fine.
                    result.uri,
                    [{ resize: { width } }],
                    { compress: quality, format: ImageManipulator.SaveFormat.WEBP }
                );

                fileInfo = await FileSystem.getInfoAsync(result.uri);
                if (fileInfo.exists) {
                    size = fileInfo.size;
                }
            }

            if (size > MAX_SIZE_BYTES) {
                logger.log(`Warning: Could not compress under 250KB after 5 attempts. Final: ${(size / 1024).toFixed(2)}KB`, 'warn');
            } else {
                logger.log(`Image compressed successfully. Final size: ${(size / 1024).toFixed(2)}KB`, 'info');
            }

            return result.uri;

        } catch (error) {
            logger.log(`Error compressing image: ${error}`, 'error');
            // Fallback: return as is if critical failure, though size will be wrong
            return uri;
        }
    }
}
