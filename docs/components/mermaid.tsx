'use client';

import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from 'next-themes';

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const rawId = useId();
  const id = 'mermaid_' + rawId.replace(/[^a-zA-Z0-9_]/g, '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
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
        // 1. Replace legacy 'graph TD' with modern 'flowchart TD'
        // 2. Replace legacy 'graph TB' with modern 'flowchart TB'
        // 3. Replace legacy 'graph LR' with modern 'flowchart LR'
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

  return (
    <div
      className="my-6 w-full overflow-x-auto rounded-xl border border-border bg-card p-4 flex justify-center items-center [&_svg]:max-w-full [&_svg]:h-auto shadow-sm"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
