'use client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar';
import { navGroups } from '@/config/nav-config';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useFilteredNavGroups } from '@/hooks/use-nav';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Icons } from '../icons';

type SidebarModel = {
  id: string;
  displayName: string;
  providerId: string;
  providerName?: string;
  modelName: string;
  modality: string;
  capability: string;
  sortOrder: number;
};

const modelCapabilityLabel: Record<string, string> = {
  text_to_image: '图片',
  image_to_image: '图片',
  text_to_video: '视频',
  image_to_video: '视频'
};

function getModelDescription(model: SidebarModel) {
  return `${model.providerName || model.providerId} · ${model.modelName}`;
}

function SidebarModelCard({
  href,
  title,
  description,
  badge,
  active,
  icon
}: {
  href: string;
  title: string;
  description: string;
  badge: string;
  active: boolean;
  icon: 'auto' | 'image' | 'video';
}) {
  const Icon = icon === 'video' ? Icons.video : icon === 'image' ? Icons.media : Icons.sparkles;
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        asChild
        isActive={active}
        className={`h-auto rounded-xl px-2 py-2 ${active ? 'border-l-2 border-cyan-400 bg-cyan-500/15 shadow-[0_0_18px_rgba(34,211,238,0.18)]' : 'hover:bg-sidebar-accent'}`}
      >
        <Link href={href} className='items-start gap-2'>
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-cyan-500/25 text-cyan-100' : 'bg-sidebar-accent text-sidebar-foreground'}`}>
            <Icon className='size-5' />
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex items-start justify-between gap-2'>
              <span className='truncate text-sm font-semibold'>{title}</span>
              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] ${badge === '视频' ? 'border-orange-500/50 text-orange-500' : badge === '图片' ? 'border-purple-500/50 text-purple-500' : 'border-amber-500/50 text-amber-500'}`}>
                {badge}
              </span>
            </div>
            <div className='text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-4'>{description}</div>
          </div>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function UserBadge() {
  const { user } = useAuth();
  const initial = user?.name?.[0] || user?.email?.[0] || 'U';
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <div className='bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase'>
        {initial}
      </div>
      <div className='grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
        <span className='truncate font-medium'>{user?.name || '用户'}</span>
        <span className='text-muted-foreground truncate text-xs'>{user?.role === 'admin' ? '管理员' : '客户'}</span>
      </div>
    </div>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOpen } = useMediaQuery();
  const { user, logout } = useAuth();
  const router = useRouter();
  const filteredGroups = useFilteredNavGroups(navGroups);
  const [models, setModels] = React.useState<SidebarModel[]>([]);

  const selectedModelId = searchParams.get('model') || searchParams.get('modelId') || 'auto';
  const selectedType = searchParams.get('type') || 'image';
  const imageModels = React.useMemo(() => models.filter((model) => model.modality === 'image').sort((a, b) => a.sortOrder - b.sortOrder), [models]);
  const videoModels = React.useMemo(() => models.filter((model) => model.modality === 'video').sort((a, b) => a.sortOrder - b.sortOrder), [models]);

  React.useEffect(() => {}, [isOpen]);

  React.useEffect(() => {
    apiRequest<SidebarModel[]>('/api/models')
      .then(setModels)
      .catch(() => setModels([]));
  }, []);

  async function handleLogout() {
    await logout();
    router.replace('/auth/sign-in');
  }

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='group-data-[collapsible=icon]:pt-4'>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size='lg'>
              <Link href='/dashboard/overview'>
                <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
                  <Icons.sparkles className='size-4' />
                </div>
                <div className='grid flex-1 text-left text-sm leading-tight'>
                  <span className='truncate font-semibold'>AI MV SaaS</span>
                  <span className='truncate text-xs'>广告素材生成平台</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className='overflow-x-hidden'>
        {filteredGroups.map((group) => (
          <SidebarGroup key={group.label || 'ungrouped'} className='py-0'>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon ? Icons[item.icon] : Icons.logo;
                if (item.url === '/dashboard/generate') {
                  return (
                    <Collapsible key={item.title} asChild defaultOpen={pathname === item.url} className='group/collapsible'>
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.title} isActive={pathname === item.url}>
                            <Icon />
                            <span>{item.title}</span>
                            <Icons.chevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub className='mx-0 gap-2 border-l-0 px-0 py-2'>
                            <SidebarModelCard
                              href='/dashboard/generate?type=image&model=auto'
                              title='图片智能分配'
                              description='系统按后台图片优先/备用顺序自动调用，失败后自动回退。'
                              badge='图片'
                              active={pathname === item.url && selectedModelId === 'auto' && selectedType !== 'video'}
                              icon='auto'
                            />
                            <SidebarModelCard
                              href='/dashboard/generate?type=video&model=auto'
                              title='视频智能分配'
                              description='系统按后台视频优先/备用顺序自动调用，支持文生视频和图生视频。'
                              badge='视频'
                              active={pathname === item.url && selectedModelId === 'auto' && selectedType === 'video'}
                              icon='auto'
                            />

                            {imageModels.length > 0 && <div className='text-muted-foreground px-2 pt-1 text-xs font-medium'>图片模型</div>}
                            {imageModels.map((model) => (
                              <SidebarModelCard
                                key={model.id}
                                href={`/dashboard/generate?type=image&model=${model.id}`}
                                title={model.displayName}
                                description={getModelDescription(model)}
                                badge={modelCapabilityLabel[model.capability] ?? '图片'}
                                active={pathname === item.url && selectedModelId === model.id}
                                icon='image'
                              />
                            ))}

                            {videoModels.length > 0 && <div className='text-muted-foreground px-2 pt-1 text-xs font-medium'>视频模型</div>}
                            {videoModels.map((model) => (
                              <SidebarModelCard
                                key={model.id}
                                href={`/dashboard/generate?type=video&model=${model.id}`}
                                title={model.displayName}
                                description={getModelDescription(model)}
                                badge={modelCapabilityLabel[model.capability] ?? '视频'}
                                active={pathname === item.url && selectedModelId === model.id}
                                icon='video'
                              />
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                return item?.items && item?.items?.length > 0 ? (
                  <Collapsible key={item.title} asChild defaultOpen={item.isActive} className='group/collapsible'>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.title} isActive={pathname === item.url}>
                          {item.icon && <Icon />}
                          <span>{item.title}</span>
                          <Icons.chevronRight className='ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items?.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                <Link href={subItem.url}>
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={pathname === item.url}>
                      <Link href={item.url}>
                        <Icon />
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size='lg' className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'>
                  <UserBadge />
                  <Icons.chevronsDown className='ml-auto size-4' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg' side='bottom' align='end' sideOffset={4}>
                <DropdownMenuLabel className='font-normal'>
                  <div className='flex flex-col space-y-1'>
                    <p className='text-sm leading-none font-medium'>{user?.name}</p>
                    <p className='text-muted-foreground text-xs leading-none'>{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                  <Icons.account className='mr-2 h-4 w-4' />
                  账户设置
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <Icons.logout className='mr-2 h-4 w-4' />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
