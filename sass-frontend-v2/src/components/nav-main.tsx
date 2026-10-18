"use client"

import * as React from "react"
import Link from "next/link"
import type { ComponentType } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "cn"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export type NavLeaf = { title: string; url: string }

export type NavItem = {
  title: string
  url: string
  icon?: ComponentType<{ className?: string }>
  items?: NavLeaf[]
}

export type NavSection = { label: string; items: NavItem[] }

function isRouteActive(pathname: string, url: string, rootUrl: string, currentSearch = "") {
  const [urlPath, urlQuery] = url.split("?")
  if (url === rootUrl) return pathname === rootUrl && !currentSearch
  if (urlQuery) {
    return pathname === urlPath && currentSearch.includes(urlQuery)
  }
  return pathname === url || (url !== rootUrl && pathname.startsWith(urlPath + "/"))
}

/** Picks the single most specific matching sub-route so sibling prefixes don't both highlight. */
function activeLeaf(pathname: string, leaves: NavLeaf[], rootUrl: string, currentSearch = "") {
  return leaves
    .filter((l) => isRouteActive(pathname, l.url, rootUrl, currentSearch))
    .sort((a, b) => b.url.length - a.url.length)[0]?.url
}

export function NavMain({
  section,
  pathname,
  rootUrl,
  currentSearch = "",
}: {
  section: NavSection
  pathname: string
  rootUrl: string
  currentSearch?: string
}) {
  const { state, isMobile } = useSidebar()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isCollapsed = mounted && state === "collapsed" && !isMobile

  return (
    <SidebarGroup className="py-1 px-2">
      {section.label ? (
        <SidebarGroupLabel className="h-6 px-2 text-[10px] font-bold font-mono tracking-wider text-muted-foreground/60 uppercase select-none group-data-[collapsible=icon]:hidden">
          {section.label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarMenu className="gap-0.5">
        {section.items.map((item) => {
          const Icon = item.icon

          // 1. Single direct route (no sub-items)
          if (!item.items?.length) {
            const active = isRouteActive(pathname, item.url, rootUrl, currentSearch)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className={cn(
                    "relative flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-all group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center",
                    active
                      ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/20 shadow-2xs before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-primary group-data-[collapsible=icon]:before:hidden"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Link href={item.url as never}>
                    {Icon && (
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active ? "text-primary" : "text-sidebar-foreground/60 group-hover/menu-button:text-sidebar-foreground"
                        )}
                      />
                    )}
                    <span className="truncate">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          const current = activeLeaf(pathname, item.items, rootUrl, currentSearch)
          const groupActive = Boolean(current)

          // 2. Collapsed Icon Mode: Floating Dropdown Menu
          if (isCollapsed) {
            return (
              <SidebarMenuItem key={item.title}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      title={item.title}
                      isActive={groupActive}
                      className={cn(
                        "relative size-8 justify-center rounded-lg transition-colors cursor-pointer group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!",
                        groupActive
                          ? "bg-primary/10 text-primary font-semibold ring-1 ring-primary/20"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      {Icon && <Icon className={cn("size-4 shrink-0", groupActive ? "text-primary" : undefined)} />}
                      <span className="sr-only">{item.title}</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="start"
                    sideOffset={8}
                    className="min-w-56 rounded-xl border border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-md"
                  >
                    <DropdownMenuLabel className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-semibold text-foreground">
                      {Icon && <Icon className="size-4 text-primary" />}
                      <span>{item.title}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="my-1 bg-border/60" />
                    <DropdownMenuGroup className="space-y-0.5">
                      {item.items.map((sub) => {
                        const subActive = sub.url === current
                        return (
                          <DropdownMenuItem
                            key={sub.url}
                            asChild
                            className={cn(
                              "cursor-pointer rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                              subActive
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            )}
                          >
                            <Link href={sub.url as never} className="flex items-center justify-between w-full">
                              <span>{sub.title}</span>
                              {subActive && <span className="size-1.5 rounded-full bg-primary" />}
                            </Link>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )
          }

          // 3. Normal Expanded Mode: Modern Interactive Collapsible Accordion
          return (
            <Collapsible key={item.title} asChild defaultOpen={groupActive} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    className={cn(
                      "group/trigger relative flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-all select-none",
                      groupActive
                        ? "bg-sidebar-accent/50 text-sidebar-accent-foreground font-semibold"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          groupActive ? "text-primary" : "text-sidebar-foreground/60 group-hover/trigger:text-sidebar-foreground"
                        )}
                      />
                    )}
                    <span className="truncate flex-1 text-left">{item.title}</span>
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-hover/trigger:opacity-90",
                        groupActive && "text-primary opacity-80"
                      )}
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
                  <div className="relative ml-4 pl-3 my-1 border-l border-border/60 space-y-0.5">
                    {item.items.map((sub) => {
                      const isSubActive = sub.url === current
                      return (
                        <Link
                          key={sub.url}
                          href={sub.url as never}
                          className={cn(
                            "group/sub relative flex h-7 items-center gap-2 rounded-md px-2 text-[12px] transition-all",
                            isSubActive
                              ? "font-semibold text-primary bg-primary/10 shadow-2xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1 rounded-full transition-all shrink-0",
                              isSubActive
                                ? "bg-primary scale-125"
                                : "bg-muted-foreground/40 group-hover/sub:bg-foreground/60"
                            )}
                          />
                          <span className="truncate">{sub.title}</span>
                        </Link>
                      )
                    })}
                  </div>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

