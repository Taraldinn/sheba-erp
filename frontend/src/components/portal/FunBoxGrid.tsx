"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Film, Tv, Gamepad2, Server, Play, ExternalLink, Sparkles } from "lucide-react";

export interface FunBoxLink {
  name: string;
  url: string;
  category?: string;
  icon?: string;
}

interface FunBoxGridProps {
  links: FunBoxLink[];
}

export function FunBoxGrid({ links }: FunBoxGridProps) {
  const getIcon = (cat?: string, ic?: string) => {
    const key = (cat || ic || "").toLowerCase();
    if (key.includes("tv")) return <Tv className="w-6 h-6 text-emerald-500" />;
    if (key.includes("game")) return <Gamepad2 className="w-6 h-6 text-amber-500" />;
    if (key.includes("ftp") || key.includes("server")) return <Server className="w-6 h-6 text-blue-500" />;
    if (key.includes("film") || key.includes("movie")) return <Film className="w-6 h-6 text-purple-500" />;
    return <Play className="w-6 h-6 text-primary" />;
  };

  if (!links || links.length === 0) {
    return (
      <Card className="border border-dashed border-border/80 bg-background/50 rounded-2xl p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-3">
          <Gamepad2 className="w-6 h-6 opacity-60" />
        </div>
        <h4 className="text-base font-semibold text-foreground">No Fun Box Links Available</h4>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          Your ISP has not configured local entertainment or BDIX FTP servers yet. Check back soon!
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Sparkles className="w-5 h-5 text-amber-400" />
            Fun Box & Entertainment Hub
          </h3>
          <p className="text-xs text-muted-foreground">
            Fast, zero-buffer local network media, BDIX live TV, and high-speed FTP servers.
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 rounded-lg">
          {links.length} Services Online
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {links.map((link, idx) => (
          <a
            key={`${link.name}-${idx}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block text-decoration-none"
          >
            <Card className="h-full border border-border/70 hover:border-primary/50 bg-card/60 hover:bg-card/90 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 rounded-2xl overflow-hidden">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    {getIcon(link.category, link.icon)}
                  </div>
                  {link.category && (
                    <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider">
                      {link.category}
                    </Badge>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                    <span>{link.name}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h4>
                  <p className="text-xs text-muted-foreground truncate mt-1 font-mono">
                    {link.url}
                  </p>
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
