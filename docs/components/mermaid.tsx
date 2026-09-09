'use client';

import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from 'next-themes';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2, Copy, Check } from 'lucide-react';

interface MermaidProps {
  chart: string;
}

const MIN_ZOOM = 0.2; // 20%
const MAX_ZOOM = 10.0; // 1000%

export function Mermaid({ chart }: MermaidProps) {
  const rawId = useId();
  const id = 'mermaid_' + rawId.replace(/[^a-zA-Z0-9_]/g, '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let isMounted = true;

    async function renderChart() {
      try {
        setError(null);
        mermaid.initialize({
          startOnLoad: false,
          theme: resolvedTheme === 'dark' ? 'dark' : 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
        });

        // Normalize chart syntax:
        let normalized = chart.trim();
        normalized = normalized.replace(/^graph\s+TD\b/gm, 'flowchart TD');
        normalized = normalized.replace(/^graph\s+TB\b/gm, 'flowchart TB');
        normalized = normalized.replace(/^graph\s+LR\b/gm, 'flowchart LR');
        normalized = normalized.replace(/^graph\s+RL\b/gm, 'flowchart RL');

        const { svg: renderedSvg } = await mermaid.render(id, normalized);
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Mermaid render error:', err);
          setError(err?.message || 'Failed to parse Mermaid diagram');
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, resolvedTheme, id]);

  const getNextZoomIn = (current: number) => {
    if (current < 1.5) return current + 0.25;
    if (current < 3.0) return current + 0.5;
    if (current < 6.0) return current + 1.0;
    return current + 2.0;
  };

  const getNextZoomOut = (current: number) => {
    if (current <= 1.5) return current - 0.25;
    if (current <= 3.0) return current - 0.5;
    if (current <= 6.0) return current - 1.0;
    return current - 2.0;
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(Number(getNextZoomIn(prev).toFixed(2)), MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(Number(getNextZoomOut(prev).toFixed(2)), MIN_ZOOM));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Cycle through common zoom presets on badge click
  const handleCycleZoom = () => {
    const presets = [1, 2.5, 5, 10];
    const next = presets.find((p) => p > zoom) || presets[0];
    setZoom(next);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoom((prev) => {
        const next = Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM);
        return Number(next.toFixed(2));
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 && !isFullscreen) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chart);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Keyboard shortcut for Esc to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex items-center justify-between mb-2 text-muted-foreground">
          <span className="font-semibold text-xs uppercase tracking-wider">Architecture Diagram (Source)</span>
        </div>
        <pre className="p-3 rounded-lg bg-muted text-xs overflow-x-auto font-mono">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 h-48 rounded-xl border border-border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
        Rendering diagram...
      </div>
    );
  }

  const controls = (
    <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-1 shadow-sm">
      <button
        type="button"
        onClick={handleZoomOut}
        disabled={zoom <= MIN_ZOOM}
        title="Zoom Out"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={handleCycleZoom}
        title="Click to cycle zoom (100%, 250%, 500%, 1000%)"
        className="text-[11px] font-mono px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted font-medium select-none min-w-[52px] text-center transition-colors cursor-pointer"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={handleZoomIn}
        disabled={zoom >= MAX_ZOOM}
        title="Zoom In (Up to 1000%)"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <div className="w-[1px] h-3.5 bg-border mx-0.5" />
      <button
        type="button"
        onClick={handleResetZoom}
        title="Reset View (100%)"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setIsFullscreen(!isFullscreen);
          if (!isFullscreen) {
            setZoom(1.25);
            setPan({ x: 0, y: 0 });
          } else {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        }}
        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy Diagram Source"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );

  return (
    <>
      {/* Inline diagram container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="group relative my-6 w-full rounded-xl border border-border bg-card overflow-hidden shadow-sm transition-all"
      >
        {/* Floating toolbar */}
        <div className="absolute top-3 right-3 z-10 opacity-80 group-hover:opacity-100 transition-opacity">
          {controls}
        </div>

        {/* Diagram canvas */}
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleResetZoom}
          className={`w-full min-h-[220px] max-h-[640px] overflow-hidden p-6 flex justify-center items-center select-none ${
            zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
            className="flex justify-center items-center [&_svg]:max-w-none [&_svg]:h-auto transition-transform"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>

        {/* Zoom status / Pan hint footer */}
        {zoom > 1 && (
          <div className="absolute bottom-2 left-3 pointer-events-none text-[10px] font-mono text-muted-foreground/70 bg-background/80 px-2 py-0.5 rounded border border-border/50 backdrop-blur-xs">
            Drag to pan • Ctrl+Wheel to zoom (max 1000%) • Double-click to reset
          </div>
        )}
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
        <div
          onWheel={handleWheel}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Architecture Diagram
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                Press ESC to exit
              </span>
            </div>
            {controls}
          </div>

          <div
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleResetZoom}
            className={`flex-1 w-full overflow-hidden p-8 flex justify-center items-center select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
              className="flex justify-center items-center [&_svg]:max-w-none [&_svg]:h-auto transition-transform"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
}
