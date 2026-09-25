'use client';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    apiRequest<{ balance: number }>('/api/account/balance')
      .then((account) => setBalance(account.balance))
      .catch(() => setBalance(0));
  }, []);

  async function handleLogout() {
    await logout();
    router.replace('/auth/sign-in');
  }

  const initial = user?.name?.[0] || user?.email?.[0] || 'U';

  return (
    <header className='sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl md:px-7'>
      <div className='flex min-w-0 items-center gap-3'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='h-5' />
        <Breadcrumbs />
      </div>

      <div className='flex items-center gap-3'>
        <Button
          variant='outline'
          className='h-10 rounded-full border-border bg-gradient-to-r from-card to-amber-500/10 px-4 hover:border-orange-500/50'
          onClick={() => router.push('/dashboard/billing')}
        >
          <span className='text-orange-400'>⚡</span>
          <span className='font-bold'>{balance.toFixed(0)}</span>
          <span className='hidden text-muted-foreground sm:inline'>积分</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className='flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-violet-600 font-bold text-white shadow-lg shadow-orange-950/30'>
              {initial.toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-56'>
            <DropdownMenuLabel>
              <div className='truncate'>{user?.name}</div>
              <div className='mt-1 truncate text-xs font-normal text-muted-foreground'>{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/billing')}>
              <Icons.creditCard /> 我的积分
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
              <Icons.account /> 账户设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <Icons.logout /> 退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
