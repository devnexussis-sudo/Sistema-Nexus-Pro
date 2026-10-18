import React, { useRef, useState, useCallback, useEffect } from 'react';
import { VolumeX, Volume2, RotateCcw, Play, ExternalLink } from 'lucide-react';

interface InlineVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}

export const InlineVideoPlayer: React.FC<InlineVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasLoadedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showPlayOverlay, setShowPlayOverlay] = useState(false);
  const [showError, setShowError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Tenta autoplay mudo quando o vídeo carrega (100% dos browsers permitem autoplay mudo)
  const handleCanPlay = useCallback(() => {
    hasLoadedRef.current = true;
    setShowError(false);

    if (autoPlay && videoRef.current?.paused) {
      videoRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setShowPlayOverlay(false);
        })
        .catch(() => {
          // Browser bloqueou autoplay — mostra botão de play
          setShowPlayOverlay(true);
        });
    }
  }, [autoPlay]);

  // Reset quando troca de vídeo
  useEffect(() => {
    hasLoadedRef.current = false;
    setShowError(false);
    setShowPlayOverlay(false);
    setIsPlaying(false);
    setIsMuted(true);
  }, [src]);

  // Tap para dar play (gesto do usuário — aceito por todos os browsers)
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
      .catch(() => {
        // Se nem com gesto funcionar, abre em nova aba
        window.open(src, '_blank');
      });
  }, [src]);

  // Toggle mute/unmute
  const handleToggleSound = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
    if (v.paused) v.play().catch(() => {});
  }, []);

  // Tratamento de erro REAL (ignora erros espúrios durante o carregamento inicial)
  const handleError = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const err = v.error;

    // Ignora se não temos um erro real do MediaElement
    if (!err) return;
    // Ignora MEDIA_ERR_ABORTED (1) — é causado por troca de src ou unmount
    if (err.code === 1) return;

    console.warn('[VideoPlayer] Erro real:', err.code, err.message, 'URL:', src);
    setShowError(true);
  }, [src]);

  return (
    <div
      className={`relative flex items-center justify-center bg-black overflow-hidden select-none rounded-2xl sm:rounded-3xl shadow-2xl ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 
        === ABORDAGEM DIRETA ===
        Sem manipulação de src via JS. Sem crossOrigin. Sem <source>.
        Apenas o <video> mais simples e robusto possível.
        O React define o src, o browser faz o resto.
      */}
      <video
        ref={videoRef}
        key={src}
        src={src}
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
        onError={handleError}
      />

      {/* ── Overlay Tap-to-Play (quando autoplay é bloqueado no mobile) ── */}
      {showPlayOverlay && !showError && (
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

      {/* ── Pílula: ativar som ── */}
      {isMuted && isPlaying && !showError && !showPlayOverlay && (
        <button
          onClick={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-black/80 hover:bg-black/95 active:scale-95 border border-white/20 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all animate-pulse pointer-events-auto cursor-pointer"
        >
          <VolumeX size={15} className="text-amber-400" />
          <span>Toque para ativar o som</span>
        </button>
      )}

      {/* ── Pílula: som ativado ── */}
      {!isMuted && isPlaying && !showError && (
        <button
          onClick={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 active:scale-95 border border-white/15 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all pointer-events-auto cursor-pointer"
        >
          <Volume2 size={15} className="text-emerald-400" />
          <span>Som ativado</span>
        </button>
      )}

      {/* ── Erro fatal — retry + abrir em nova aba ── */}
      {showError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
          <div className="bg-red-950/90 border border-red-500/50 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <p className="text-white text-sm font-semibold mb-1">Não foi possível reproduzir</p>
            <p className="text-red-200/80 text-xs mb-4">O navegador não suportou este formato inline.</p>
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
