
import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  label?: string;
}

interface Point {
  x: number;
  y: number;
  time: number;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({ onSave, label }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  const [points, setPoints] = useState<Point[]>([]);

  // 🎯 NASA-Grade Canvas Initialization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', {
      willReadFrequently: false,
      alpha: true
    });
    if (!ctx) return;

    // 🚀 High-DPI Support (Retina/4K displays)
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);

    // 🎨 Premium Rendering Settings
    ctx.strokeStyle = '#0f172a'; // Slate-900 for professional look
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Fill with white background for better contrast
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  // 🧮 Get precise coordinates with DPI scaling
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, time: Date.now() };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      time: Date.now()
    };
  };

  // 📏 Calculate dynamic line width based on velocity (simulates pressure)
  const calculateLineWidth = (point1: Point, point2: Point): number => {
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) +
      Math.pow(point2.y - point1.y, 2)
    );
    const timeDelta = point2.time - point1.time;
    const velocity = timeDelta > 0 ? distance / timeDelta : 0;

    // Faster strokes = thinner lines (natural pen behavior)
    const baseWidth = 2.5;
    const minWidth = 1.5;
    const maxWidth = 3.5;

    const width = baseWidth - (velocity * 0.5);
    return Math.max(minWidth, Math.min(maxWidth, width));
  };

  // 🎨 Smooth line drawing with Bezier curves
  const drawSmoothLine = (ctx: CanvasRenderingContext2D, points: Point[]) => {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const currentPoint = points[i];
      const nextPoint = points[i + 1];

      // Calculate control point for quadratic curve (smoothing)
      const controlX = (currentPoint.x + nextPoint.x) / 2;
      const controlY = (currentPoint.y + nextPoint.y) / 2;

      // Dynamic line width based on velocity
      if (i > 0) {
        ctx.lineWidth = calculateLineWidth(points[i - 1], currentPoint);
      }

      ctx.quadraticCurveTo(currentPoint.x, currentPoint.y, controlX, controlY);
    }

    // Draw the last segment
    const lastIdx = points.length - 1;
    if (lastIdx > 0) {
      ctx.lineTo(points[lastIdx].x, points[lastIdx].y);
    }

    ctx.stroke();
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch devices

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const point = getCoordinates(e);
    setLastPoint(point);
    setPoints([point]);
    setIsDrawing(true);

    // Draw initial point
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch devices

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const point = getCoordinates(e);
    const newPoints = [...points, point];
    setPoints(newPoints);

    // Redraw entire path with smoothing
    if (lastPoint) {
      drawSmoothLine(ctx, newPoints);
    }

    setLastPoint(point);
  };

  const endDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setPoints([]);
    setLastPoint(null);

    const canvas = canvasRef.current;
    if (canvas) {
      // Save with high quality
      onSave(canvas.toDataURL('image/png', 1.0));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    setPoints([]);
    setLastPoint(null);

    // Notify parent with empty canvas
    onSave(canvas.toDataURL('image/png', 1.0));
  };

  return (
    <div className="space-y-3">
      {label && <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">{label}</label>}
      <div className="bg-white border-2 border-dashed border-gray-200 rounded-[2rem] overflow-hidden relative">
        <canvas
          ref={canvasRef}
          className="w-full h-72 cursor-crosshair touch-none select-none"
          style={{
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none'
          }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
          onTouchCancel={endDrawing}
        />
        <button
          onClick={clear}
          className="absolute bottom-4 right-4 p-3 bg-gray-100 text-gray-400 hover:text-red-500 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
          type="button"
          aria-label="Limpar assinatura"
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider px-1 italic">
        ✨ Assinatura com tecnologia anti-aliasing e suavização de traços
      </p>
    </div>
  );
};