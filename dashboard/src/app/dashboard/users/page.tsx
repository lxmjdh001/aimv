'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import { useEffect, useState } from 'react';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'customer';
  enabled: boolean;
  balance: number;
  monthlyUsed: number;
  totalRecharged: number;
  lastLoginAt?: string | null;
  createdAt: string;
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

function formatTime(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [savingUserId, setSavingUserId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'customer' });
  const [rechargeUser, setRechargeUser] = useState<UserRow | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeNote, setRechargeNote] = useState('');
  const [recharging, setRecharging] = useState(false);
  const [transactionUser, setTransactionUser] = useState<UserRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pointsPerCny, setPointsPerCny] = useState(100);

  async function load() {
    const [userList, pointSettings] = await Promise.all([
      apiRequest<UserRow[]>('/api/admin/users'),
      apiRequest<{ pointsPerCny: number }>('/api/admin/points/settings')
    ]);
    setUsers(userList);
    setPointsPerCny(pointSettings.pointsPerCny);
  }

  async function create() {
    setCreating(true);
    try {
      await apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', name: '', password: '', role: 'customer' });
      setCreateOpen(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(target: UserRow) {
    setSavingUserId(target.id);
    try {
      await apiRequest(`/api/admin/users/${target.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !target.enabled })
      });
      await load();
    } finally {
      setSavingUserId('');
    }
  }

  async function submitRecharge() {
    if (!rechargeUser) return;
    setRecharging(true);
    try {
      await apiRequest(`/api/admin/users/${rechargeUser.id}/recharge`, {
        method: 'POST',
        body: JSON.stringify({ paymentAmount: Number(rechargeAmount), note: rechargeNote })
      });
      setRechargeUser(null);
      setRechargeAmount('');
      setRechargeNote('');
      await load();
    } finally {
      setRecharging(false);
    }
  }

  async function openTransactions(target: UserRow) {
    setTransactionUser(target);
    setTransactions(await apiRequest<WalletTransaction[]>(`/api/admin/users/${target.id}/transactions`));
  }

  useEffect(() => { load().catch(() => setUsers([])); }, []);

  return (
    <PageContainer pageTitle='用户管理' pageDescription='用户列表、启用状态、积分充值和消费记录' access={user?.role === 'admin'}>
      <div className='space-y-4'>
        <div className='flex justify-end'>
          <Button onClick={() => setCreateOpen(true)}>创建用户</Button>
        </div>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-3'>
            <CardTitle>用户列表</CardTitle>
            <Button variant='outline' size='sm' onClick={load}>刷新</Button>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-md border border-border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='min-w-56'>用户</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>现有积分</TableHead>
                    <TableHead>本月消耗</TableHead>
                    <TableHead>历史充值积分</TableHead>
                    <TableHead className='min-w-36'>最后登录</TableHead>
                    <TableHead className='min-w-36'>注册时间</TableHead>
                    <TableHead className='text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className='font-medium'>{item.email}</div>
                        <div className='text-muted-foreground text-xs'>{item.name || '-'}</div>
                      </TableCell>
                      <TableCell>{item.role === 'admin' ? '管理员' : '客户'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${item.enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}>
                          {item.enabled ? '启用' : '禁用'}
                        </span>
                      </TableCell>
                      <TableCell>{points(item.balance)}</TableCell>
                      <TableCell>{points(item.monthlyUsed)}</TableCell>
                      <TableCell>{points(item.totalRecharged)}</TableCell>
                      <TableCell>{formatTime(item.lastLoginAt)}</TableCell>
                      <TableCell>{formatTime(item.createdAt)}</TableCell>
                      <TableCell className='space-x-2 text-right'>
                        <Button variant='outline' size='sm' onClick={() => setRechargeUser(item)}>充值</Button>
                        <Button variant='outline' size='sm' onClick={() => openTransactions(item)}>流水</Button>
                        <Button variant={item.enabled ? 'destructive' : 'outline'} size='sm' onClick={() => toggleEnabled(item)} disabled={savingUserId === item.id}>
                          {savingUserId === item.id ? '保存中...' : item.enabled ? '禁用' : '启用'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!users.length && (
                    <TableRow>
                      <TableCell colSpan={9} className='text-muted-foreground h-32 text-center'>暂无用户</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>创建用户</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'><Label>邮箱</Label><Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
            <div className='space-y-2'><Label>姓名</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
            <div className='space-y-2'><Label>密码</Label><Input type='password' value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
            <div className='space-y-2'>
              <Label>角色</Label>
              <Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='customer'>客户</SelectItem>
                  <SelectItem value='admin'>管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={create} disabled={creating}>{creating ? '创建中...' : '创建用户'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rechargeUser)} onOpenChange={(open) => { if (!open) setRechargeUser(null); }}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader><DialogTitle>充值积分</DialogTitle></DialogHeader>
          <div className='space-y-4'>
            <div className='text-muted-foreground text-sm'>{rechargeUser?.email}，当前 {points(rechargeUser?.balance)}</div>
            <div className='space-y-2'><Label>客户支付金额（人民币）</Label><Input type='number' min='0.01' step='0.01' value={rechargeAmount} onChange={(event) => setRechargeAmount(event.target.value)} placeholder='例如 100' /></div>
            <div className='rounded-md bg-muted p-3 text-sm'>当前比例：¥1 = {pointsPerCny} 积分，预计到账 <span className='font-semibold'>{points(Number(rechargeAmount || 0) * pointsPerCny)}</span></div>
            <div className='space-y-2'><Label>备注</Label><Input value={rechargeNote} onChange={(event) => setRechargeNote(event.target.value)} placeholder='线下转账、活动赠送等' /></div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setRechargeUser(null)}>取消</Button>
            <Button onClick={submitRecharge} disabled={recharging || Number(rechargeAmount) <= 0}>{recharging ? '充值中...' : '确认发放积分'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transactionUser)} onOpenChange={(open) => { if (!open) setTransactionUser(null); }}>
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader><DialogTitle>积分流水 · {transactionUser?.email}</DialogTitle></DialogHeader>
          <div className='max-h-[60vh] overflow-y-auto rounded-md border'>
            <Table>
              <TableHeader><TableRow><TableHead>时间</TableHead><TableHead>类型</TableHead><TableHead>支付金额</TableHead><TableHead>积分变动</TableHead><TableHead>剩余积分</TableHead><TableHead>备注</TableHead></TableRow></TableHeader>
              <TableBody>
                {transactions.map((item) => <TableRow key={item.id}><TableCell>{formatTime(item.createdAt)}</TableCell><TableCell>{item.type === 'recharge' ? '充值' : item.type === 'consume' ? 'AI 消耗' : '调整'}</TableCell><TableCell>{item.paymentAmount == null ? '-' : `¥${item.paymentAmount.toFixed(2)}`}</TableCell><TableCell className={item.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}>{item.amount >= 0 ? '+' : ''}{points(item.amount)}</TableCell><TableCell>{points(item.balanceAfter)}</TableCell><TableCell>{item.note || '-'}</TableCell></TableRow>)}
                {!transactions.length && <TableRow><TableCell colSpan={6} className='text-muted-foreground h-24 text-center'>暂无流水</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
