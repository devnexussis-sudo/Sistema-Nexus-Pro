import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  const [isMuted, setIsMuted] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Inicialização robusta ao trocar de mídia
  useEffect(() => {
    setHasFatalError(false);
    setNeedsTapToPlay(false);
    setIsPlaying(false);
    setRetryCount(0);

    const video = videoRef.current;
    if (!video) return;

    // Reset completo do estado do vídeo
    video.muted = true;
    setIsMuted(true);
    video.removeAttribute('src');
    video.load(); // Limpa o buffer do player

    // Redefine src após reset limpo (evita cache corrompido no WebKit mobile)
    requestAnimationFrame(() => {
      if (!videoRef.current) return;
      videoRef.current.src = src;
      videoRef.current.load();

      if (autoPlay) {
        // Delay mínimo para o WebKit mobile processar o load
        setTimeout(() => {
          if (!videoRef.current) return;
          const playPromise = videoRef.current.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise
              .then(() => {
                setIsPlaying(true);
                setNeedsTapToPlay(false);
              })
              .catch(() => {
                // Autoplay bloqueado pelo browser mobile — mostra overlay de tap-to-play
                setNeedsTapToPlay(true);
                setIsPlaying(false);
              });
          }
        }, 150);
      } else {
        setNeedsTapToPlay(true);
      }
    });
  }, [src, autoPlay]);

  // Handler para tap-to-play (obrigatório para iOS Safari)
  const handleTapToPlay = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    setIsMuted(true);

    // iOS Safari precisa de load() antes de play() quando vindo de user gesture
    video.load();
    
    setTimeout(() => {
      if (!videoRef.current) return;
      const playPromise = videoRef.current.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setNeedsTapToPlay(false);
          })
          .catch(() => {
            setHasFatalError(true);
          });
      }
    }, 100);
  }, []);

  // Toggle som
  const handleToggleSound = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;

    if (video.muted) {
      video.muted = false;
      setIsMuted(false);
      if (video.paused) video.play().catch(() => {});
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  }, []);

  // Retry
  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setHasFatalError(false);
    setNeedsTapToPlay(false);
    setRetryCount(prev => prev + 1);

    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    setIsMuted(true);
    video.src = src;
    video.load();
    
    setTimeout(() => {
      if (!videoRef.current) return;
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setNeedsTapToPlay(true));
    }, 300);
  }, [src]);

  return (
    <div
      className={`relative flex items-center justify-center bg-black overflow-hidden select-none rounded-2xl sm:rounded-3xl shadow-2xl ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/*
        REGRAS CRÍTICAS PARA MOBILE:
        1. NÃO usar crossOrigin — R2 public bucket não retorna CORS headers nos arquivos
        2. NÃO usar <source> — usar src direto no <video> é mais confiável no WebKit mobile
        3. SEMPRE ter controls + playsInline
        4. preload="auto" para forçar download do conteúdo
      */}
      <video
        ref={videoRef}
        key={`v-${retryCount}`}
        poster={poster}
        controls
        playsInline
        {...({
          'webkit-playsinline': 'true',
          'x-webkit-airplay': 'allow',
          'x5-playsinline': 'true',
          'x5-video-player-type': 'h5-page',
        } as any)}
        muted={isMuted}
        preload="auto"
        className="max-w-full max-h-[75vh] sm:max-h-[82vh] w-auto h-auto object-contain bg-black block pointer-events-auto"
        style={{
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)',
        }}
        onPlay={() => {
          setIsPlaying(true);
          setNeedsTapToPlay(false);
        }}
        onPause={() => setIsPlaying(false)}
        onVolumeChange={() => {
          if (videoRef.current) setIsMuted(videoRef.current.muted);
        }}
        onLoadedData={() => {
          setHasFatalError(false);
        }}
        onCanPlay={() => {
          if (autoPlay && !isPlaying && videoRef.current?.paused) {
            videoRef.current.play()
              .then(() => {
                setIsPlaying(true);
                setNeedsTapToPlay(false);
              })
              .catch(() => setNeedsTapToPlay(true));
          }
        }}
        onError={(e) => {
          const err = e.currentTarget.error;
          console.warn('[InlineVideoPlayer] Error:', err?.code, err?.message, 'src:', src);
          if (err && (err.code === 3 || err.code === 4)) {
            setHasFatalError(true);
          } else if (err && err.code === 2 && retryCount < 1) {
            // Network error — retry 1x
            setRetryCount(prev => prev + 1);
            setTimeout(() => {
              const v = videoRef.current;
              if (!v) return;
              v.src = src;
              v.load();
              v.play().catch(() => setNeedsTapToPlay(true));
            }, 500);
          } else if (err) {
            setHasFatalError(true);
          }
        }}
      >
        Seu navegador não suporta reprodução de vídeo.
      </video>

      {/* Overlay tap-to-play para mobile */}
      {needsTapToPlay && !hasFatalError && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          onClick={handleTapToPlay}
          onTouchEnd={handleTapToPlay}
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center shadow-2xl hover:bg-white/30 active:scale-90 transition-all">
            <Play size={32} className="text-white fill-white ml-1" />
          </div>
          <span className="mt-3 text-white text-sm font-semibold tracking-wide bg-black/50 px-4 py-1.5 rounded-full">
            Toque para reproduzir
          </span>
        </div>
      )}

      {/* Pílula de ativar som */}
      {isMuted && isPlaying && !hasFatalError && !needsTapToPlay && (
        <button
          onClick={handleToggleSound}
          onTouchEnd={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-black/80 hover:bg-black/95 active:scale-95 border border-white/20 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all animate-pulse pointer-events-auto cursor-pointer"
        >
          <VolumeX size={15} className="text-amber-400" />
          <span>Toque para ativar o som</span>
        </button>
      )}

      {/* Som ativado */}
      {!isMuted && isPlaying && !hasFatalError && (
        <button
          onClick={handleToggleSound}
          onTouchEnd={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 active:scale-95 border border-white/15 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all pointer-events-auto cursor-pointer"
        >
          <Volume2 size={15} className="text-emerald-400" />
          <span>Som ativado</span>
        </button>
      )}

      {/* Erro fatal com retry + link direto */}
      {hasFatalError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
          <div className="bg-red-950/90 border border-red-500/50 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <p className="text-white text-sm font-semibold mb-1">Vídeo indisponível</p>
            <p className="text-red-200/80 text-xs mb-4">Formato não suportado ou erro de rede.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleRetry}
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
