import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, RotateCcw, Loader2 } from 'lucide-react';

interface InlineVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  initialMuted?: boolean;
  onEnded?: () => void;
}

export const InlineVideoPlayer: React.FC<InlineVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = true,
  loop = true,
  initialMuted = true,
  onEnded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [unmutedBadgeVisible, setUnmutedBadgeVisible] = useState(initialMuted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [centerAction, setCenterAction] = useState<'play' | 'pause' | null>(null);

  // Formata segundos em MM:SS
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Garante que o autoplay mudo inicie instantaneamente em qualquer navegador mobile
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setHasError(false);
    setIsBuffering(true);
    video.muted = isMuted;

    if (autoPlay) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
          })
          .catch((err) => {
            console.warn('[InlineVideoPlayer] Autoplay prevenido pelo navegador, aguardando toque:', err);
            setIsPlaying(false);
            setIsBuffering(false);
          });
      }
    }
  }, [src, autoPlay]);

  // Temporizador para esconder os controles automaticamente quando o vídeo estiver tocando
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  // Alterna som (Desbloqueio de áudio via gesto do usuário - Padrão BigTech)
  const handleToggleMute = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.muted = false;
      video.volume = 1;
      setIsMuted(false);
      setUnmutedBadgeVisible(false);
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      video.muted = true;
      setIsMuted(true);
    }
    resetControlsTimeout();
  };

  // Alterna Play/Pause
  const handleTogglePlay = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    // Se ainda estiver no primeiro toque com badge de mudo aberto, ativa o som também
    if (isMuted && unmutedBadgeVisible) {
      video.muted = false;
      video.volume = 1;
      setIsMuted(false);
      setUnmutedBadgeVisible(false);
    }

    if (video.paused || video.ended) {
      video.play().then(() => {
        setIsPlaying(true);
        triggerCenterFeedback('play');
      }).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
      triggerCenterFeedback('pause');
    }
    resetControlsTimeout();
  };

  const triggerCenterFeedback = (action: 'play' | 'pause') => {
    setCenterAction(action);
    setTimeout(() => {
      setCenterAction(null);
    }, 600);
  };

  // Progresso do vídeo (Scrubbing / seek)
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !duration) return;

    const targetTime = (parseFloat(e.target.value) / 100) * duration;
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
    resetControlsTimeout();
  };

  // Tela Cheia In-Browser
  const handleToggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          // Fallback iOS Safari para vídeo
          if ((video as any).webkitEnterFullscreen) {
            (video as any).webkitEnterFullscreen();
          }
        });
      } else if ((video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
    resetControlsTimeout();
  };

  // Sincroniza listener de fullscreen
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center bg-black overflow-hidden select-none group touch-manipulation ${className}`}
      onClick={() => {
        resetControlsTimeout();
        handleTogglePlay();
      }}
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
    >
      {/* Elemento de Vídeo com suporte nativo inline mobile (WebKit e Blink) */}
      <video
        ref={videoRef}
        key={src}
        src={src}
        poster={poster}
        playsInline
        {...({
          'webkit-playsinline': 'true',
          'x5-playsinline': 'true',
          'x5-video-player-type': 'h5-page'
        } as any)}
        loop={loop}
        preload="auto"
        className="max-w-full max-h-[75vh] sm:max-h-[82vh] w-auto h-auto object-contain pointer-events-auto block"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setIsBuffering(false);
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onEnded={() => {
          setIsPlaying(false);
          if (onEnded) onEnded();
        }}
        onError={() => {
          setHasError(true);
          setIsBuffering(false);
        }}
      >
        <source src={src} type="video/mp4" />
        Seu navegador não suporta este vídeo inline.
      </video>

      {/* Spinner de Carregamento */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/30 backdrop-blur-xs">
          <Loader2 className="w-10 h-10 text-white animate-spin drop-shadow-md" />
        </div>
      )}

      {/* Erro de reprodução com fallback */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center z-30">
          <p className="text-white text-sm mb-3 font-medium">Não foi possível reproduzir este vídeo inline.</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setHasError(false);
              setIsBuffering(true);
              if (videoRef.current) {
                videoRef.current.load();
                videoRef.current.play().catch(() => {});
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold backdrop-blur-md transition-all active:scale-95"
          >
            <RotateCcw size={14} />
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Efeito Central de Play / Pause ao tocar */}
      {centerAction && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 animate-scale-in">
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white shadow-xl transition-all">
            {centerAction === 'play' ? <Play size={28} className="fill-white ml-1" /> : <Pause size={28} className="fill-white" />}
          </div>
        </div>
      )}

      {/* Pílula Flutuante BigTech: "Toque para ativar o som" (Padrão Instagram / Reels) */}
      {isMuted && unmutedBadgeVisible && !hasError && (
        <button
          onClick={handleToggleMute}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-black/75 hover:bg-black/90 active:scale-95 border border-white/20 rounded-full text-white text-xs font-medium backdrop-blur-md shadow-lg transition-all animate-pulse"
        >
          <VolumeX size={15} className="text-amber-400" />
          <span>Toque para ativar o som</span>
        </button>
      )}

      {/* ── OVERLAY DE CONTROLES IN-BROWSER ── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 sm:p-4 pt-8 flex flex-col gap-2 transition-opacity duration-300 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Progresso / Scrubbing deslizável */}
        <div className="flex items-center gap-2 w-full">
          <div className="relative flex-1 flex items-center group/scrubber cursor-pointer">
            <div className="w-full h-1 sm:h-1.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-[width] duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progressPercent}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-[11px] sm:text-xs font-medium text-white/90 tabular-nums shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Linha de Ações: Play/Pause, Mute/Unmute, Tela Cheia */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-3">
            {/* Botão Play / Pause */}
            <button
              onClick={handleTogglePlay}
              className="p-1.5 text-white hover:text-blue-400 active:scale-90 transition-all focus:outline-none"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current" />}
            </button>

            {/* Botão de Som Mute / Unmute */}
            <button
              onClick={handleToggleMute}
              className="p-1.5 text-white hover:text-blue-400 active:scale-90 transition-all focus:outline-none flex items-center gap-1.5"
              title={isMuted ? 'Ativar som' : 'Silenciar'}
            >
              {isMuted ? <VolumeX size={19} className="text-amber-400" /> : <Volume2 size={19} />}
              <span className="text-[10px] sm:text-xs font-medium text-white/80 hidden xs:inline">
                {isMuted ? 'Mudo' : 'Som ligado'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Tela Cheia In-Browser */}
            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 text-white hover:text-blue-400 active:scale-90 transition-all focus:outline-none"
              title="Tela cheia no navegador"
            >
              {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
