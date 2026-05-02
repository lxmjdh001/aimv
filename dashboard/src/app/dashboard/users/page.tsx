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

function money(value?: number) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
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

  async function load() {
    setUsers(await apiRequest<UserRow[]>('/api/admin/users'));
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

  useEffect(() => { load().catch(() => setUsers([])); }, []);

  return (
    <PageContainer pageTitle='用户管理' pageDescription='用户列表、启用状态、余额和充值预留' access={user?.role === 'admin'}>
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
                    <TableHead>现有金额</TableHead>
                    <TableHead>本月已用</TableHead>
                    <TableHead>历史充值金额</TableHead>
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
                      <TableCell>{money(item.balance)}</TableCell>
                      <TableCell>{money(item.monthlyUsed)}</TableCell>
                      <TableCell>{money(item.totalRecharged)}</TableCell>
                      <TableCell>{formatTime(item.lastLoginAt)}</TableCell>
                      <TableCell>{formatTime(item.createdAt)}</TableCell>
                      <TableCell className='space-x-2 text-right'>
                        <Button variant='outline' size='sm' disabled>充值</Button>
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
    </PageContainer>
  );
}
