"use client"

import Link from "next/link"
import type { ComponentType } from "react"
import { ChevronRightIcon } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export type NavLeaf = { title: string; url: string }

export type NavItem = {
  title: string
  url: string
  icon?: ComponentType<{ className?: string }>
  items?: NavLeaf[]
}

export type NavSection = { label: string; items: NavItem[] }

function isRouteActive(pathname: string, url: string, rootUrl: string) {
  if (url === rootUrl) return pathname === rootUrl
  return pathname === url || pathname.startsWith(url + "/")
}

/** Picks the single most specific matching sub-route so sibling prefixes don't both highlight. */
function activeLeaf(pathname: string, leaves: NavLeaf[], rootUrl: string) {
  return leaves
    .filter((l) => isRouteActive(pathname, l.url, rootUrl))
    .sort((a, b) => b.url.length - a.url.length)[0]?.url
}

export function NavMain({
  section,
  pathname,
  rootUrl,
}: {
  section: NavSection
  pathname: string
  rootUrl: string
}) {
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel className="eyebrow h-7 text-sidebar-foreground/50">{section.label}</SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {section.items.map((item) => {
          const Icon = item.icon

          if (!item.items?.length) {
            const active = isRouteActive(pathname, item.url, rootUrl)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className="relative h-8 data-[active=true]:font-medium data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:-left-2 data-[active=true]:before:w-0.5 data-[active=true]:before:rounded-full data-[active=true]:before:bg-sidebar-primary"
                >
                  <Link href={item.url as never}>
                    {Icon && <Icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          const current = activeLeaf(pathname, item.items, rootUrl)
          const groupActive = Boolean(current)

          return (
            <Collapsible key={item.title} asChild defaultOpen={groupActive} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    className={groupActive ? "h-8 font-medium text-sidebar-accent-foreground" : "h-8"}
                  >
                    {Icon && <Icon className={groupActive ? "text-sidebar-primary" : undefined} />}
                    <span>{item.title}</span>
                    <ChevronRightIcon className="ml-auto size-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub className="mr-0 border-sidebar-border pr-0">
                    {item.items.map((sub) => (
                      <SidebarMenuSubItem key={sub.url}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={sub.url === current}
                          className="h-7 data-[active=true]:font-medium data-[active=true]:text-sidebar-primary"
                        >
                          <Link href={sub.url as never}>
                            <span>{sub.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
