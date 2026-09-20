"use client";

import React, { useState } from "react";
import { Play, Video, HelpCircle, Check, Smartphone, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PaymentTutorialVideoProps {
  videoUrl?: string | null;
}

export function PaymentTutorialVideo({ videoUrl }: PaymentTutorialVideoProps) {
  const [activeGuide, setActiveGuide] = useState<"bkash" | "nagad" | "rocket">("bkash");
  const [isOpen, setIsOpen] = useState<boolean>(true);

  // Parse embed URL from YouTube or generic video
  const getEmbedUrl = (url?: string | null): string => {
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }

      if (url.includes("youtube.com/watch")) {
        const v = parsed.searchParams.get("v");
        return v ? `https://www.youtube-nocookie.com/embed/${v}` : url;
      }
      if (url.includes("youtu.be/")) {
        const id = url.split("youtu.be/")[1]?.split("?")[0];
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : url;
      }
      if (url.includes("drive.google.com/file/d/")) {
        const parts = url.split("/file/d/")[1]?.split("/");
        return parts ? `https://drive.google.com/file/d/${parts[0]}/preview` : url;
      }
      return url;
    } catch {
      return "";
    }
  };

  const embedUrl = getEmbedUrl(videoUrl);

  return (
    <Card className="border-border bg-card/60 overflow-hidden shadow-lg">
      <CardHeader className="p-4 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            <Video className="h-4 w-4 text-indigo-400" />
            How to Pay Your Broadband Bill (Video Tutorial & Guide)
          </CardTitle>
          <CardDescription className="text-xs">
            Step-by-step instructions for paying via bKash App, Nagad, and Rocket MFS.
          </CardDescription>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs h-7 text-muted-foreground hover:text-foreground"
        >
          {isOpen ? (
            <span className="flex items-center gap-1">
              Hide Guide <ChevronUp className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="flex items-center gap-1">
              Show Guide <ChevronDown className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Video Player */}
            <div className="lg:col-span-7">
              <div className="relative w-full rounded-2xl overflow-hidden bg-black/80 aspect-video shadow-md border border-border">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title="Bill Payment Tutorial"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 bg-gradient-to-br from-slate-900 to-indigo-950">
                    <div className="h-12 w-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Play className="h-6 w-6 fill-indigo-400" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">Quick Video Guide</p>
                      <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                        Follow the 4 simple steps on the right to recharge your account in under 60 seconds.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step-by-Step Payment Instructions Tabs */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-1.5 border-b border-border/60 pb-2">
                {[
                  { id: "bkash", label: "bKash App" },
                  { id: "nagad", label: "Nagad App" },
                  { id: "rocket", label: "Rocket MFS" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveGuide(item.id as any)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      activeGuide === item.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {activeGuide === "bkash" && (
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-300 space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> Option 1: bKash Pay Bill
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                      <li>Open your <strong>bKash App</strong> and tap <strong>Pay Bill</strong>.</li>
                      <li>Select <strong>Internet</strong> and choose <strong>ShebaFi Network</strong>.</li>
                      <li>Enter your <strong>Customer ID</strong> (e.g. SB-1001) or PPPoE Username.</li>
                      <li>Verify your monthly bill amount and enter your bKash PIN to pay.</li>
                      <li>Your line will restore automatically within 10 seconds!</li>
                    </ol>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">
                    Tip: If paying to a personal bKash merchant number, copy the 10-character TrxID from SMS and use our "Verify SMS Payment" button above.
                  </p>
                </div>
              )}

              {activeGuide === "nagad" && (
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> Option 2: Nagad Bill Pay
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                      <li>Open the <strong>Nagad App</strong> and tap <strong>Bill Pay</strong>.</li>
                      <li>Select <strong>Internet</strong> and search for <strong>ShebaFi</strong>.</li>
                      <li>Input your subscriber customer number.</li>
                      <li>Enter your 4-digit Nagad PIN and hold to confirm payment.</li>
                    </ol>
                  </div>
                </div>
              )}

              {activeGuide === "rocket" && (
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5" /> Option 3: Rocket Dial Code (*322#)
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground leading-relaxed">
                      <li>Dial <strong>*322#</strong> from your mobile handset.</li>
                      <li>Select <strong>1. Bill Pay</strong> -&gt; <strong>2. Internet</strong>.</li>
                      <li>Enter our Biller ID and your <strong>Customer ID</strong>.</li>
                      <li>Confirm amount and enter your Rocket secret PIN.</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
