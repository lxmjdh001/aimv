'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/api-client';
import { useEffect, useState } from 'react';

type Balance = {
  balance: number;
  monthlyUsed: number;
  totalRecharged: number;
};

function money(value?: number) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

export default function BillingPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setBalance(await apiRequest<Balance>('/api/account/balance'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  return (
    <PageContainer pageTitle='我的余额' pageDescription='查看账户余额、当月消耗和充值入口'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>当前余额</CardTitle>
            <CardDescription>账户可用金额</CardDescription>
          </CardHeader>
          <CardContent className='text-3xl font-semibold'>{loading ? '加载中...' : money(balance?.balance)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>本月已使用</CardTitle>
            <CardDescription>预留计费消耗统计</CardDescription>
          </CardHeader>
          <CardContent className='text-3xl font-semibold'>{loading ? '加载中...' : money(balance?.monthlyUsed)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>历史充值</CardTitle>
            <CardDescription>累计充值金额</CardDescription>
          </CardHeader>
          <CardContent className='text-3xl font-semibold'>{loading ? '加载中...' : money(balance?.totalRecharged)}</CardContent>
        </Card>
      </div>
      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>立即充值</CardTitle>
          <CardDescription>支付通道预留，后续可接 Stripe、支付宝或人工充值。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>立即充值（即将开放）</Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
