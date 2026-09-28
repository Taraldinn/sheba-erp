"use client";

import * as React from "react";
import { Modal as HeroModal, Button } from "@heroui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "cn";

interface DialogRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  className?: string;
}

function Dialog({ open, defaultOpen, onOpenChange, children }: DialogRootProps) {
  return (
    <HeroModal
      data-slot="dialog"
      isOpen={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange as any}
    >
      {children}
    </HeroModal>
  );
}

function DialogTrigger({ children, ...props }: { children?: React.ReactNode; asChild?: boolean; className?: string }) {
  // Use a pass-through trigger component
  return (
    <HeroModal.Trigger data-slot="dialog-trigger" {...(props as any)}>
      {children}
    </HeroModal.Trigger>
  );
}

function DialogClose({ children, ...props }: { children?: React.ReactNode; asChild?: boolean; className?: string }) {
  return (
    <HeroModal.CloseTrigger data-slot="dialog-close" {...(props as any)}>
      {children}
    </HeroModal.CloseTrigger>
  );
}

interface DialogContentProps {
  className?: string;
  children?: React.ReactNode;
  showCloseButton?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
}

function DialogContent({ className, children, showCloseButton = true, size = "md" }: DialogContentProps) {
  return (
    <>
      <HeroModal.Backdrop
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=closed]:opacity-0 data-[state=open]:opacity-100 transition-opacity",
          className
        )}
      />
      <HeroModal.Container
        data-slot="dialog-container"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        <HeroModal.Dialog
          data-slot="dialog-content"
          className={cn(
            "relative flex flex-col gap-6 w-full max-w-md rounded-3xl bg-popover border border-border p-6 text-sm text-popover-foreground shadow-2xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            size === "sm" && "max-w-sm",
            size === "md" && "max-w-md",
            size === "lg" && "max-w-lg",
            size === "xl" && "max-w-xl",
            size === "2xl" && "max-w-2xl",
            size === "3xl" && "max-w-3xl",
            size === "4xl" && "max-w-4xl",
            size === "5xl" && "max-w-5xl",
            size === "full" && "max-w-[calc(100%-2rem)]",
            className
          )}
        >
          {children}
          {showCloseButton && (
            <HeroModal.CloseTrigger
              data-slot="dialog-close"
              className="absolute top-4 right-4 z-10 inline-flex size-7 items-center justify-center rounded-full bg-transparent hover:bg-default-200 text-default-500 hover:text-default-700 transition-colors outline-none"
              aria-label="Close"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
              <span className="sr-only">Close</span>
            </HeroModal.CloseTrigger>
          )}
        </HeroModal.Dialog>
      </HeroModal.Container>
    </>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

interface DialogFooterProps extends React.ComponentProps<"div"> {
  showCloseButton?: boolean;
}

function DialogFooter({ className, showCloseButton, children, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <Button variant="outline" onPress={() => {}}>
          Close
        </Button>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <HeroModal.Heading
      data-slot="dialog-title"
      className={cn(
        "text-base font-semibold leading-none tracking-tight text-foreground",
        className
      )}
      {...(props as any)}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
