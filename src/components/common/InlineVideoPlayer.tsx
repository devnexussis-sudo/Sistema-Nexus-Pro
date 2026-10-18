import React, { useRef, useState, useCallback, useEffect } from 'react';
import { VolumeX, Volume2, RotateCcw, Play, ExternalLink, Loader2 } from 'lucide-react';

interface InlineVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}

/**
 * Detecta MIME type correto a partir da URL do vídeo.
 * Necessário porque o R2 pode retornar application/octet-stream.
 */
const getMimeFromUrl = (url: string): string => {
  const clean = url.toLowerCase().split('?')[0].split('#')[0];
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.mov')) return 'video/quicktime';
  if (clean.endsWith('.3gp')) return 'video/3gpp';
  if (clean.endsWith('.avi')) return 'video/x-msvideo';
  if (clean.endsWith('.mkv')) return 'video/x-matroska';
  // Padrão seguro — mp4/h264 é aceito em 100% dos browsers mobile
  return 'video/mp4';
};

/**
 * InlineVideoPlayer — Player de vídeo BigTech.
 * 
 * PROBLEMA RESOLVIDO: O R2 Cloudflare armazena vídeos com Content-Type 
 * "application/octet-stream" quando o upload não especifica contentType.
 * Navegadores mobile recusam reproduzir <video> com esse Content-Type.
 * 
 * SOLUÇÃO: Fetch → Blob com MIME correto → URL.createObjectURL.
 * Isso contorna completamente o Content-Type do servidor.
 */
export const InlineVideoPlayer: React.FC<InlineVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [showPlayOverlay, setShowPlayOverlay] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  // Cleanup blob URL ao desmontar ou trocar de vídeo
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Busca o vídeo via fetch e cria blob URL com MIME correto
  useEffect(() => {
    let cancelled = false;

    // Cleanup anterior
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setBlobSrc(null);
    setIsLoading(true);
    setLoadProgress(0);
    setShowError(false);
    setShowPlayOverlay(false);
    setIsPlaying(false);
    setIsMuted(true);
    setUseFallback(false);

    const fetchVideo = async () => {
      try {
        const response = await fetch(src);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        // Lê com progresso se possível
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        if (total > 0 && response.body) {
          // Stream com progresso
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) { reader.cancel(); return; }
            chunks.push(value);
            received += value.length;
            setLoadProgress(Math.round((received / total) * 100));
          }

          const fullArray = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) {
            fullArray.set(chunk, offset);
            offset += chunk.length;
          }

          if (cancelled) return;

          const mime = getMimeFromUrl(src);
          const blob = new Blob([fullArray], { type: mime });
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobSrc(url);
          setIsLoading(false);
        } else {
          // Fallback sem progresso
          const arrayBuffer = await response.arrayBuffer();
          if (cancelled) return;

          const mime = getMimeFromUrl(src);
          const blob = new Blob([arrayBuffer], { type: mime });
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobSrc(url);
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[VideoPlayer] Fetch falhou, usando src direto:', err);
        // Se o fetch falhar (CORS, etc), usa src direto como fallback
        setUseFallback(true);
        setIsLoading(false);
      }
    };

    fetchVideo();

    return () => { cancelled = true; };
  }, [src]);

  // Autoplay quando o blob está pronto
  const handleCanPlay = useCallback(() => {
    if (autoPlay && videoRef.current?.paused) {
      videoRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setShowPlayOverlay(false);
        })
        .catch(() => {
          setShowPlayOverlay(true);
        });
    }
  }, [autoPlay]);

  // Tap para dar play
  const handleTapPlay = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play()
      .then(() => {
        setIsPlaying(true);
        setShowPlayOverlay(false);
      })
      .catch(() => window.open(src, '_blank'));
  }, [src]);

  // Toggle som
  const handleToggleSound = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    if (v.paused) v.play().catch(() => {});
  }, []);

  // URL efetiva para o <video>
  const effectiveSrc = useFallback ? src : blobSrc;

  return (
    <div
      className={`relative flex items-center justify-center bg-black overflow-hidden select-none rounded-2xl sm:rounded-3xl shadow-2xl ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Loading overlay com progresso ── */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <Loader2 size={36} className="text-white animate-spin mb-3" />
          <span className="text-white text-sm font-semibold">
            Carregando vídeo...
          </span>
          {loadProgress > 0 && (
            <div className="mt-2 w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          )}
          {loadProgress > 0 && (
            <span className="text-white/60 text-xs mt-1">{loadProgress}%</span>
          )}
        </div>
      )}

      {/* ── Video Player ── */}
      {effectiveSrc && (
        <video
          ref={videoRef}
          key={effectiveSrc}
          src={effectiveSrc}
          poster={poster}
          controls
          playsInline
          autoPlay={autoPlay}
          muted
          preload="auto"
          className="max-w-full max-h-[75vh] sm:max-h-[82vh] w-auto h-auto object-contain bg-black block pointer-events-auto"
          onCanPlay={handleCanPlay}
          onPlay={() => {
            setIsPlaying(true);
            setShowPlayOverlay(false);
          }}
          onPause={() => setIsPlaying(false)}
          onVolumeChange={() => {
            if (videoRef.current) setIsMuted(videoRef.current.muted);
          }}
          onError={() => {
            const err = videoRef.current?.error;
            if (!err || err.code === 1) return; // Ignora ABORTED
            console.warn('[VideoPlayer] Erro:', err.code, err.message);
            setShowError(true);
          }}
        />
      )}

      {/* ── Play overlay (autoplay bloqueado) ── */}
      {showPlayOverlay && !showError && !isLoading && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm cursor-pointer"
          onClick={handleTapPlay}
          onTouchEnd={handleTapPlay}
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center shadow-2xl active:scale-90 transition-all">
            <Play size={32} className="text-white fill-white ml-1" />
          </div>
          <span className="mt-3 text-white text-sm font-semibold bg-black/50 px-4 py-1.5 rounded-full">
            Toque para reproduzir
          </span>
        </div>
      )}

      {/* ── Pílula ativar som ── */}
      {isMuted && isPlaying && !showError && !showPlayOverlay && (
        <button
          onClick={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-black/80 hover:bg-black/95 active:scale-95 border border-white/20 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all animate-pulse pointer-events-auto cursor-pointer"
        >
          <VolumeX size={15} className="text-amber-400" />
          <span>Toque para ativar o som</span>
        </button>
      )}

      {/* ── Som ativado ── */}
      {!isMuted && isPlaying && !showError && (
        <button
          onClick={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 active:scale-95 border border-white/15 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all pointer-events-auto cursor-pointer"
        >
          <Volume2 size={15} className="text-emerald-400" />
          <span>Som ativado</span>
        </button>
      )}

      {/* ── Erro com retry + nova aba ── */}
      {showError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
          <div className="bg-red-950/90 border border-red-500/50 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <p className="text-white text-sm font-semibold mb-1">Não foi possível reproduzir</p>
            <p className="text-red-200/80 text-xs mb-4">Tente recarregar ou abrir em nova aba.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowError(false);
                  setShowPlayOverlay(false);
                  const v = videoRef.current;
                  if (v) {
                    v.load();
                    v.play().catch(() => setShowPlayOverlay(true));
                  }
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
              >
                <RotateCcw size={14} />
                Tentar novamente
              </button>
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600/80 hover:bg-blue-600 rounded-xl text-white text-sm font-bold transition-all active:scale-95 no-underline"
              >
                <ExternalLink size={14} />
                Abrir vídeo em nova aba
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
