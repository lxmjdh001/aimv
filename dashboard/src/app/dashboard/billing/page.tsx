'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/api-client';
import { useEffect, useState } from 'react';

type Balance = {
  balance: number;
  monthlyUsed: number;
  totalRecharged: number;
};

type WalletTransaction = {
  id: string;
  type: string;
  amount: number;
  paymentAmount?: number | null;
  balanceAfter: number;
  note?: string;
  createdAt: string;
};

function points(value?: number) {
  return `${Number(value ?? 0).toFixed(2)} 积分`;
}

export default function BillingPage() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [balanceData, transactionData] = await Promise.all([
        apiRequest<Balance>('/api/account/balance'),
        apiRequest<WalletTransaction[]>('/api/account/transactions?limit=50')
      ]);
      setBalance(balanceData);
      setTransactions(transactionData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  return (
    <PageContainer pageTitle='我的积分' pageDescription='查看可用积分、当月消耗和充值记录'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>可用积分</CardTitle>
            <CardDescription>AI 生成可用积分</CardDescription>
          </CardHeader>
          <CardContent className='text-3xl font-semibold'>{loading ? '加载中...' : points(balance?.balance)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>本月已使用</CardTitle>
            <CardDescription>本月成功生成的消费</CardDescription>
          </CardHeader>
          <CardContent className='text-3xl font-semibold'>{loading ? '加载中...' : points(balance?.monthlyUsed)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>累计充值积分</CardTitle>
            <CardDescription>历史到账积分</CardDescription>
          </CardHeader>
          <CardContent className='text-3xl font-semibold'>{loading ? '加载中...' : points(balance?.totalRecharged)}</CardContent>
        </Card>
      </div>
      <Card className='mt-4'>
        <CardHeader>
          <CardTitle>充值积分</CardTitle>
          <CardDescription>当前由管理员人工充值积分，在线支付后续接入。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>请联系管理员充值积分</Button>
        </CardContent>
      </Card>
      <Card className='mt-4'>
        <CardHeader><CardTitle>积分明细</CardTitle><CardDescription>积分充值和 AI 消耗记录</CardDescription></CardHeader>
        <CardContent>
          <div className='overflow-x-auto rounded-md border'>
            <Table>
              <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>类型</TableHead><TableHead>支付金额</TableHead><TableHead>积分变动</TableHead><TableHead>剩余积分</TableHead><TableHead>备注</TableHead></TableRow></TableHeader>
              <TableBody>
                {transactions.map((item) => <TableRow key={item.id}><TableCell>{new Date(item.createdAt).toLocaleString('zh-CN')}</TableCell><TableCell>{item.type === 'recharge' ? '充值积分' : item.type === 'consume' ? 'AI 消耗' : '积分调整'}</TableCell><TableCell>{item.paymentAmount == null ? '-' : `¥${item.paymentAmount.toFixed(2)}`}</TableCell><TableCell className={item.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}>{item.amount >= 0 ? '+' : ''}{points(item.amount)}</TableCell><TableCell>{points(item.balanceAfter)}</TableCell><TableCell>{item.note || '-'}</TableCell></TableRow>)}
                {!transactions.length && <TableRow><TableCell colSpan={6} className='text-muted-foreground h-24 text-center'>暂无积分记录</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
