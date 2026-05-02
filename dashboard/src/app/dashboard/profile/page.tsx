'use client';

import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-client';

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <PageContainer pageTitle='账户设置' pageDescription='当前登录账户信息'>
      <Card>
        <CardHeader><CardTitle>{user?.name}</CardTitle></CardHeader>
        <CardContent className='space-y-2 text-sm'>
          <p>邮箱：{user?.email}</p>
          <p>角色：{user?.role === 'admin' ? '管理员' : '客户'}</p>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
