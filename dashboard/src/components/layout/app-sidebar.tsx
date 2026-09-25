'use client';

import { Icons } from '@/components/icons';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { navGroups } from '@/config/nav-config';
import { useFilteredNavGroups } from '@/hooks/use-nav';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function isRouteActive(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

export default function AppSidebar() {
  const pathname = usePathname();
  const filteredGroups = useFilteredNavGroups(navGroups);

  return (
    <Sidebar collapsible='icon' className='border-r border-sidebar-border/80'>
      <SidebarHeader className='px-4 pb-5 pt-6 group-data-[collapsible=icon]:px-2'>
        <Link href='/dashboard/home' className='flex items-center gap-3 overflow-hidden rounded-2xl px-2 py-2'>
          <div className='flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 text-xl font-black italic text-white shadow-lg shadow-orange-950/40'>
            A
          </div>
          <div className='min-w-0 group-data-[collapsible=icon]:hidden'>
            <div className='truncate text-xl font-black italic tracking-tight'>AI Creative</div>
            <div className='mt-0.5 truncate text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground/45'>Growth Studio</div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className='overflow-x-hidden px-3'>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label || 'primary'} className='px-0 py-2'>
            {group.label && <SidebarGroupLabel className='px-3 text-[11px] uppercase tracking-[0.18em]'>{group.label}</SidebarGroupLabel>}
            <SidebarMenu className={group.label ? 'gap-1' : 'gap-3'}>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                const active = isRouteActive(pathname, item.url);
                const primaryItem = !group.label;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={active}
                      className={primaryItem
                        ? `h-13 rounded-xl px-4 text-[15px] font-semibold transition-all ${active ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/25 hover:bg-orange-500 hover:text-white' : 'text-sidebar-foreground/86 hover:bg-sidebar-accent hover:text-white'}`
                        : 'h-10 rounded-lg px-3 text-sm'}
                    >
                      <Link href={item.url}>
                        <Icon className={primaryItem ? 'size-5' : 'size-4'} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className='border-t border-sidebar-border/70 p-4 group-data-[collapsible=icon]:p-2'>
        <div className='rounded-xl border border-orange-500/15 bg-orange-500/5 p-3 group-data-[collapsible=icon]:hidden'>
          <div className='flex items-center gap-2 text-sm font-semibold'>
            <Icons.sparkles className='size-4 text-orange-400' />
            AI 广告创意工作台
          </div>
          <p className='mt-1.5 text-xs leading-5 text-sidebar-foreground/50'>从灵感、生成到投放前检查的一站式流程。</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
