'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import { IconEye, IconEyeOff, IconPencil } from '@tabler/icons-react';
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
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ email: '', name: '', password: '', role: 'customer' as 'admin' | 'customer', enabled: true });
  const [editing, setEditing] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
    setMessage(null);
    try {
      await apiRequest('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', name: '', password: '', role: 'customer' });
      setCreateOpen(false);
      await load();
      setMessage({ type: 'success', text: '用户创建成功' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '用户创建失败' });
    } finally {
      setCreating(false);
    }
  }

  function openEdit(target: UserRow) {
    setEditUser(target);
    setEditForm({
      email: target.email,
      name: target.name,
      password: '',
      role: target.role,
      enabled: target.enabled
    });
    setShowEditPassword(false);
    setMessage(null);
  }

  async function submitEdit() {
    if (!editUser) return;
    if (editForm.password && editForm.password.length < 8) {
      setMessage({ type: 'error', text: '新密码至少 8 位' });
      return;
    }
    setEditing(true);
    setMessage(null);
    try {
      await apiRequest(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });
      const changedOwnPassword = editUser.id === user?.id && Boolean(editForm.password);
      setEditUser(null);
      setEditForm({ email: '', name: '', password: '', role: 'customer', enabled: true });
      setMessage({ type: 'success', text: changedOwnPassword ? '密码已更新，请重新登录' : '用户资料已更新' });
      if (changedOwnPassword) {
        window.location.assign('/auth/sign-in');
        return;
      }
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '用户资料更新失败' });
    } finally {
      setEditing(false);
    }
  }

  async function toggleEnabled(target: UserRow) {
    setSavingUserId(target.id);
    setMessage(null);
    try {
      await apiRequest(`/api/admin/users/${target.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !target.enabled })
      });
      await load();
      setMessage({ type: 'success', text: `${target.name || target.email} 已${target.enabled ? '禁用' : '启用'}` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '账号状态更新失败' });
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
    <PageContainer
      pageTitle='用户管理'
      pageDescription='用户列表、启用状态、积分充值和消费记录'
      access={user?.role === 'admin'}
      pageHeaderAction={<Button onClick={() => setCreateOpen(true)}>创建用户</Button>}
    >
      <div className='min-w-0 max-w-full space-y-4'>
        {message && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${message.type === 'success'
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive'}`}
          >
            {message.text}
          </div>
        )}
        <Card className='min-w-0 max-w-full overflow-hidden'>
          <CardHeader className='flex flex-row items-center justify-between gap-3'>
            <CardTitle>用户列表</CardTitle>
            <Button variant='outline' size='sm' onClick={load}>刷新</Button>
          </CardHeader>
          <CardContent className='min-w-0 px-3 sm:px-6'>
            <div className='max-w-full overflow-x-auto rounded-md border border-border'>
              <Table className='min-w-[1240px]'>
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
                    <TableHead className='bg-card/95 sticky right-0 z-20 min-w-64 border-l px-3 text-right backdrop-blur'>操作</TableHead>
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
                      <TableCell className='bg-card/95 sticky right-0 z-10 border-l px-3 text-right backdrop-blur'>
                        <div className='flex flex-nowrap justify-end gap-2'>
                          <Button variant='outline' size='sm' onClick={() => openEdit(item)}><IconPencil className='size-4' />编辑</Button>
                          <Button variant='outline' size='sm' onClick={() => setRechargeUser(item)}>充值</Button>
                          <Button variant='outline' size='sm' onClick={() => openTransactions(item)}>流水</Button>
                          <Button variant={item.enabled ? 'destructive' : 'outline'} size='sm' onClick={() => toggleEnabled(item)} disabled={savingUserId === item.id}>
                            {savingUserId === item.id ? '保存中...' : item.enabled ? '禁用' : '启用'}
                          </Button>
                        </div>
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
            <DialogDescription>填写登录信息并设置用户角色。</DialogDescription>
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

      <Dialog open={Boolean(editUser)} onOpenChange={(open) => { if (!open && !editing) setEditUser(null); }}>
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>修改登录信息、角色或账号状态；密码留空则保持不变。</DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='edit-email'>登录邮箱</Label>
              <Input id='edit-email' type='email' value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='edit-name'>姓名 / 昵称</Label>
              <Input id='edit-name' value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='edit-password'>重置密码</Label>
              <div className='relative'>
                <Input
                  id='edit-password'
                  type={showEditPassword ? 'text' : 'password'}
                  value={editForm.password}
                  onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
                  placeholder='留空则不修改，至少 8 位'
                  autoComplete='new-password'
                  className='pr-10'
                />
                <button
                  type='button'
                  onClick={() => setShowEditPassword((value) => !value)}
                  className='text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2'
                  aria-label={showEditPassword ? '隐藏密码' : '显示密码'}
                >
                  {showEditPassword ? <IconEyeOff className='size-4' /> : <IconEye className='size-4' />}
                </button>
              </div>
              <p className='text-muted-foreground text-xs'>修改密码后，该用户已登录的设备会自动退出。</p>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>角色</Label>
                <Select value={editForm.role} onValueChange={(role: 'admin' | 'customer') => setEditForm({ ...editForm, role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='customer'>客户</SelectItem>
                    <SelectItem value='admin'>管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label>账号状态</Label>
                <Select value={editForm.enabled ? 'enabled' : 'disabled'} onValueChange={(value) => setEditForm({ ...editForm, enabled: value === 'enabled' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value='enabled'>启用</SelectItem>
                    <SelectItem value='disabled'>禁用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editUser?.id === user?.id && (
              <div className='rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300'>
                当前登录账号不能禁用或取消管理员角色；重置自己的密码后需要重新登录。
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditUser(null)} disabled={editing}>取消</Button>
            <Button onClick={submitEdit} disabled={editing || !editForm.email.trim() || !editForm.name.trim()}>{editing ? '保存中...' : '保存修改'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rechargeUser)} onOpenChange={(open) => { if (!open) setRechargeUser(null); }}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>充值积分</DialogTitle>
            <DialogDescription>为该用户增加积分并记录对应的收款金额。</DialogDescription>
          </DialogHeader>
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
          <DialogHeader>
            <DialogTitle>积分流水 · {transactionUser?.email}</DialogTitle>
            <DialogDescription>查看该用户的充值和消费记录。</DialogDescription>
          </DialogHeader>
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
