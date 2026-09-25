import KBar from '@/components/kbar';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AuthGate } from '@/lib/auth-client';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI MV 创意工作台',
  description: '广告图片、视频与投前检测工作台',
  robots: {
    index: false,
    follow: false
  }
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <KBar>
        <SidebarProvider
          defaultOpen
          className='creative-shell dark'
          style={{ '--sidebar-width': '17.5rem' } as React.CSSProperties}
        >
          <AppSidebar />
          <SidebarInset>
            <Header />
            {children}
          </SidebarInset>
        </SidebarProvider>
      </KBar>
    </AuthGate>
  );
}
