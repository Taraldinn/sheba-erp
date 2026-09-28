"use client";

import { useState, useRef, useEffect } from "react";
import {
  Terminal,
  Play,
  RotateCcw,
  Copy,
  Trash2,
  Check,
  Radio,
  Server,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClient } from "@/lib/api";
import { OLT } from "@/types";

interface OLTTerminalModalProps {
  isOpen: boolean;
  onClose: () => void;
  olt: OLT | null;
}

interface CommandLogItem {
  id: string;
  command: string;
  timestamp: string;
  output: string;
  isError?: boolean;
}

export function OLTTerminalModal({ isOpen, onClose, olt }: OLTTerminalModalProps) {
  const [command, setCommand] = useState("show version");
  const [isExecuting, setIsExecuting] = useState(false);
  const [history, setHistory] = useState<CommandLogItem[]>([]);
  const [commandHistoryList, setCommandHistoryList] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, isExecuting]);

  // Reset or focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (history.length === 0 && olt) {
        setHistory([
          {
            id: "init",
            command: "SESSION_START",
            timestamp: new Date().toLocaleTimeString(),
            output: `Connected to OLT ${olt.name} (${olt.ip_address}) [${olt.brand}]\nType 'help' or select a preset diagnostic command below.`,
          },
        ]);
      }
    }
  }, [isOpen, olt]);

  if (!olt) return null;

  const isGpon = (olt.brand || "").toLowerCase().includes("gpon");

  const presetCommands = isGpon
    ? [
        "show version",
        "show gpon onu-information",
        "show gpon optical-transceiver-diagnosis",
        "show interface brief",
        "show mac address-table",
      ]
    : [
        "show version",
        "show epon onu-information",
        "show epon onu-ctc-optical-transceiver-diagnosis",
        "show interface brief",
        "show mac address-table",
      ];

  async function handleExecute(cmdToRun?: string) {
    const targetCmd = (cmdToRun || command).trim();
    if (!targetCmd || !olt) return;

    setIsExecuting(true);
    setErrorMessage(null);

    // Save to command recall history
    setCommandHistoryList((prev) => [targetCmd, ...prev.filter((c) => c !== targetCmd)]);
    setHistoryIndex(-1);

    try {
      const res = await ApiClient.runOLTCommand(olt.id, targetCmd);
      const outputText = res.output || "Command executed successfully (no output).";

      setHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          command: targetCmd,
          timestamp: new Date().toLocaleTimeString(),
          output: outputText,
        },
      ]);
      setCommand("");
    } catch (err: any) {
      const errText = err?.message || "Command execution failed.";
      setErrorMessage(errText);
      setHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          command: targetCmd,
          timestamp: new Date().toLocaleTimeString(),
          output: `ERROR: ${errText}`,
          isError: true,
        },
      ]);
    } finally {
      setIsExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistoryList.length > 0) {
        const nextIndex = Math.min(historyIndex + 1, commandHistoryList.length - 1);
        setHistoryIndex(nextIndex);
        setCommand(commandHistoryList[nextIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setCommand(commandHistoryList[nextIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  }

  function handleCopyAllOutput() {
    const fullLog = history
      .map((h) => `[${h.timestamp}] ${olt?.name}# ${h.command}\n${h.output}`)
      .join("\n\n");
    navigator.clipboard.writeText(fullLog);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClearTerminal() {
    setHistory([]);
    setErrorMessage(null);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-6 gap-3">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Terminal className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  OLT CLI Management Terminal
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Direct diagnostic terminal console communicating with OLT hardware
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs uppercase">
                {olt.brand}
              </Badge>
              <Badge
                variant={olt.status === "Online" ? "success" : "destructive"}
                className="text-xs"
              >
                {olt.status}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground border-t border-border/50">
            <Radio className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-foreground">{olt.name}</span>
            <span className="font-mono">({olt.ip_address})</span>
          </div>
        </DialogHeader>

        {/* Quick Presets Bar */}
        <div className="flex flex-wrap items-center gap-1.5 py-1 text-xs">
          <span className="text-muted-foreground font-medium flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-500" /> Presets:
          </span>
          {presetCommands.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setCommand(preset);
                handleExecute(preset);
              }}
              disabled={isExecuting}
              className="px-2 py-1 rounded font-mono text-[11px] bg-muted/50 border border-border hover:bg-muted text-foreground transition-colors disabled:opacity-50"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Terminal Window */}
        <div className="flex-1 min-h-[360px] max-h-[460px] bg-zinc-950 text-emerald-400 font-mono text-xs rounded-xl border border-zinc-800 p-4 overflow-y-auto shadow-inner flex flex-col justify-between">
          <div className="space-y-4">
            {history.map((item) => (
              <div key={item.id} className="space-y-1">
                {item.command !== "SESSION_START" && (
                  <div className="flex items-center gap-2 text-zinc-400 text-[11px] border-b border-zinc-900 pb-0.5">
                    <span className="text-zinc-500">[{item.timestamp}]</span>
                    <span className="text-amber-400 font-bold">{olt.name}#</span>
                    <span className="text-white font-semibold">{item.command}</span>
                  </div>
                )}
                <pre
                  className={`whitespace-pre-wrap leading-relaxed select-text font-mono text-[11.5px] ${
                    item.isError ? "text-rose-400" : "text-emerald-400"
                  }`}
                >
                  {item.output}
                </pre>
              </div>
            ))}

            {isExecuting && (
              <div className="flex items-center gap-2 text-amber-400 pt-2 text-xs">
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>Executing CLI command on {olt.name}...</span>
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>

        {/* Terminal Controls & Input */}
        <div className="space-y-2 pt-1">
          {errorMessage && (
            <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 font-mono font-bold text-xs text-muted-foreground select-none">
                #
              </span>
              <Input
                ref={inputRef}
                placeholder="Enter command (e.g. show version, show epon onu-information)..."
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isExecuting}
                className="pl-7 font-mono text-xs h-9 bg-background/80"
              />
            </div>

            <Button
              onClick={() => handleExecute()}
              disabled={isExecuting || !command.trim()}
              className="text-xs font-semibold gap-1.5 h-9 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isExecuting ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Execute
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAllOutput}
              disabled={history.length === 0}
              className="text-xs gap-1 h-9 shrink-0"
              title="Copy Terminal Output"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClearTerminal}
              disabled={history.length === 0}
              className="text-xs gap-1 h-9 shrink-0 text-muted-foreground hover:text-foreground"
              title="Clear Terminal Buffer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
