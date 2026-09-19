"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Film, Tv, Gamepad2, Server, Play, ExternalLink, Sparkles } from "lucide-react";
import { PortalApiClient } from "@/lib/portal-api";

export interface FunBoxLink {
  name: string;
  url: string;
  category?: string;
  icon?: string;
}

interface FunBoxGridProps {
  links?: FunBoxLink[];
}

export function FunBoxGrid({ links: initialLinks }: FunBoxGridProps) {
  const [links, setLinks] = useState<FunBoxLink[]>(initialLinks || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialLinks && initialLinks.length > 0) {
      setLinks(initialLinks);
      return;
    }

    const loadFunbox = async () => {
      setLoading(true);
      try {
        const data = await PortalApiClient.getFunbox();
        if (Array.isArray(data) && data.length > 0) {
          setLinks(data);
        } else {
          // Default BDIX entertainment hub links
          setLinks([
            {
              name: "BDIX Movie Server (FTP-16)",
              url: "http://172.16.50.4",
              category: "BDIX FTP",
              icon: "server",
            },
            {
              name: "SamOnline Media Hub",
              url: "http://samonline.net.bd",
              category: "Streaming",
              icon: "film",
            },
            {
              name: "ShebaFi Live HD TV",
              url: "http://tv.shebafi.net",
              category: "Live TV",
              icon: "tv",
            },
            {
              name: "Circle FTP & Games",
              url: "http://circleftp.net",
              category: "Gaming",
              icon: "game",
            },
          ]);
        }
      } catch {
        // Fallback demo links
        setLinks([
          {
            name: "BDIX Movie Server (FTP-16)",
            url: "http://172.16.50.4",
            category: "BDIX FTP",
            icon: "server",
          },
          {
            name: "SamOnline Media Hub",
            url: "http://samonline.net.bd",
            category: "Streaming",
            icon: "film",
          },
          {
            name: "ShebaFi Live HD TV",
            url: "http://tv.shebafi.net",
            category: "Live TV",
            icon: "tv",
          },
          {
            name: "Circle FTP & Games",
            url: "http://circleftp.net",
            category: "Gaming",
            icon: "game",
          },
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadFunbox();
  }, [initialLinks]);

  const getIcon = (cat?: string, ic?: string) => {
    const key = (cat || ic || "").toLowerCase();
    if (key.includes("tv")) return <Tv className="w-6 h-6 text-emerald-500" />;
    if (key.includes("game")) return <Gamepad2 className="w-6 h-6 text-amber-500" />;
    if (key.includes("ftp") || key.includes("server")) return <Server className="w-6 h-6 text-blue-500" />;
    if (key.includes("film") || key.includes("movie")) return <Film className="w-6 h-6 text-purple-500" />;
    return <Play className="w-6 h-6 text-indigo-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Fun Box & BDIX Media Hub
          </h3>
          <p className="text-xs text-muted-foreground">
            Ultra high-speed bufferless streaming and downloads directly from local BDIX cache servers.
          </p>
        </div>
        <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 text-[11px]">
          100 Mbps BDIX Speed
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {links.map((link, idx) => (
          <a
            key={idx}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block transition-all duration-200 hover:-translate-y-1 focus:outline-none"
          >
            <Card className="h-full border border-border/80 bg-card/60 hover:bg-card hover:border-indigo-500/50 hover:shadow-lg transition-all rounded-2xl overflow-hidden p-5 flex flex-col justify-between">
              <CardContent className="p-0 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="p-2.5 rounded-xl bg-muted/60 border border-border group-hover:scale-110 transition-transform">
                    {getIcon(link.category, link.icon)}
                  </div>
                  {link.category && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                      {link.category}
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-sm text-foreground group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {link.name}
                  </h4>
                  <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5 opacity-80">
                    {link.url}
                  </p>
                </div>
              </CardContent>

              <div className="pt-3 mt-3 border-t border-border/40 flex items-center justify-between text-[11px] font-medium text-indigo-400">
                <span>Access Server</span>
                <ExternalLink className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
