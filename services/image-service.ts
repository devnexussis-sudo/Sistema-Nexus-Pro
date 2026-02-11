
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

            // 1. Initial manipulation: Resize & Convert to WebP
            // WebP is highly efficient. 1024px width at 0.7 usually results in < 100KB for photos.
            let result = await ImageManipulator.manipulateAsync(
                uri,
                [{ resize: { width: MAX_WIDTH } }],
                { compress: INITIAL_QUALITY, format: ImageManipulator.SaveFormat.WEBP }
            );

            // 2. Check size
            let fileInfo = await FileSystem.getInfoAsync(result.uri);

            if (!fileInfo.exists) {
                throw new Error('Compressed file not found');
            }

            let size = fileInfo.size;
            let quality = INITIAL_QUALITY;
            let attempts = 0;

            // 3. Loop if necessary (Rarely hits more than once with WebP + Resize)
            while (size > MAX_SIZE_BYTES && attempts < 3) {
                logger.log(`Image size ${size} exceeds 250KB. Re-compressing...`, 'warn');

                // Reduce quality aggressively
                quality -= 0.2;
                if (quality < 0.1) quality = 0.1;

                result = await ImageManipulator.manipulateAsync(
                    result.uri,
                    [],
                    { compress: quality, format: ImageManipulator.SaveFormat.WEBP }
                );

                fileInfo = await FileSystem.getInfoAsync(result.uri);
                if (fileInfo.exists) {
                    size = fileInfo.size;
                }
                attempts++;
            }

            logger.log(`Image compressed successfully. Final size: ${(size / 1024).toFixed(2)}KB`, 'info');
            return result.uri;

        } catch (error) {
            logger.log(`Error compressing image: ${error}`, 'error');
            // Fallback: return original uri if compression fails (though likely won't work if size is critical)
            return uri;
        }
    }
}
