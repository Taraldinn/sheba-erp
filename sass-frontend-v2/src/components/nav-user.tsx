'use client';

import { useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  Settings,
  KeyRound,
  Sliders,
  Sun,
  Moon,
  Laptop,
  Loader2,
  Shield,
} from "lucide-react"
import { useAuth } from "@/lib/auth/auth-provider"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { UserSettingsDialog } from "@/components/user-settings-dialog"
import { toast } from "sonner"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const auth = useAuth()
  const { setTheme } = useTheme()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dialogTab, setDialogTab] = useState<'profile' | 'security' | 'preferences'>('profile')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const effectiveName = auth.user?.name || auth.user?.username || user.name || "User"
  const effectiveEmail = auth.user?.email || user.email || ""
  const roleDisplay = auth.role ? auth.role.replace(/_/g, ' ') : null

  const initials =
    effectiveName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U"

  async function handleLogout() {
    setIsLoggingOut(true)
    toast.info("Signing out of session…")
    try {
      await auth.logout()
    } catch {
      setIsLoggingOut(false)
      toast.error("Failed to sign out. Please try again.")
    }
  }

  function openSettings(tab: 'profile' | 'security' | 'preferences') {
    setDialogTab(tab)
    setSettingsOpen(true)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-md">
                  <AvatarImage src={user.avatar} alt={effectiveName} />
                  <AvatarFallback className="rounded-md bg-primary/15 font-mono text-xs font-semibold text-primary">{initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                  <span className="truncate font-medium">{effectiveName}</span>
                  <span className="truncate text-xs text-muted-foreground">{effectiveEmail || `@${auth.user?.username || 'user'}`}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 p-1.5"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2.5 px-2 py-2 text-left text-sm">
                  <Avatar className="size-9 rounded-md border border-border">
                    <AvatarImage src={user.avatar} alt={effectiveName} />
                    <AvatarFallback className="rounded-md bg-primary/15 font-mono text-xs font-semibold text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{effectiveName}</span>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">{effectiveEmail || `@${auth.user?.username || 'user'}`}</span>
                    {roleDisplay && (
                      <span className="mt-1 inline-flex w-fit items-center rounded-sm bg-muted px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                        {roleDisplay}
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => openSettings('profile')} className="cursor-pointer gap-2 py-2">
                  <Settings className="size-4 text-muted-foreground" />
                  <span>Account Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSettings('security')} className="cursor-pointer gap-2 py-2">
                  <KeyRound className="size-4 text-muted-foreground" />
                  <span>Change Password</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSettings('preferences')} className="cursor-pointer gap-2 py-2">
                  <Sliders className="size-4 text-muted-foreground" />
                  <span>Session & Preferences</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer gap-2 py-2">
                    <Sun className="size-4 text-muted-foreground dark:hidden" />
                    <Moon className="hidden size-4 text-muted-foreground dark:block" />
                    <span>Theme</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-36">
                    <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer gap-2">
                      <Sun className="size-3.5" /> Light
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer gap-2">
                      <Moon className="size-3.5" /> Dark
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer gap-2">
                      <Laptop className="size-3.5" /> System
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                disabled={isLoggingOut}
                onClick={handleLogout}
                className="cursor-pointer gap-2 py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                {isLoggingOut ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogOutIcon className="size-4" />
                )}
                <span>{isLoggingOut ? "Logging out…" : "Log out"}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <UserSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={dialogTab}
      />
    </>
  )
}

