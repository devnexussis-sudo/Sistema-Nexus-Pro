/**
 * Utilitários para otimização de assinatura digital.
 */

/**
 * Corta os espaços vazios / transparentes ao redor de um canvas de assinatura.
 */
export function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return canvas;

    try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let found = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const alpha = data[idx + 3];

                // Considera pixel preenchido se não for transparente
                if (alpha > 15) {
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    // E não for branco puro de fundo
                    if (r < 245 || g < 245 || b < 245) {
                        found = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
        }

        if (!found) return canvas;

        const padding = 10;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(width, maxX + padding);
        maxY = Math.min(height, maxY + padding);

        const trimmedWidth = maxX - minX;
        const trimmedHeight = maxY - minY;

        if (trimmedWidth <= 0 || trimmedHeight <= 0) return canvas;

        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = trimmedWidth;
        trimmedCanvas.height = trimmedHeight;
        const trimmedCtx = trimmedCanvas.getContext('2d');
        if (!trimmedCtx) return canvas;

        trimmedCtx.drawImage(
            canvas,
            minX, minY, trimmedWidth, trimmedHeight,
            0, 0, trimmedWidth, trimmedHeight
        );

        return trimmedCanvas;
    } catch (e) {
        console.warn("Nexus: Falha ao trimar canvas:", e);
        return canvas;
    }
}

/**
 * Recorta as bordas transparentes/em branco de um canvas de assinatura e retorna DataURL PNG
 */
export function cropSignatureCanvas(canvas: HTMLCanvasElement): string {
    if (!canvas) return '';
    try {
        const trimmed = trimCanvas(canvas);
        return trimmed.toDataURL('image/png');
    } catch (e) {
        console.warn('Erro ao recortar canvas de assinatura:', e);
        return canvas.toDataURL ? canvas.toDataURL('image/png') : '';
    }
}
