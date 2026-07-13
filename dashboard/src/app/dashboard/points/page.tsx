'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import { useEffect, useState } from 'react';

type AiModel = {
  id: string;
  displayName: string;
  providerName?: string;
  modelName: string;
  modality: string;
  capability: string;
  enabled: boolean;
  customerEnabled: boolean;
  config: Record<string, any>;
};

type PointSettings = {
  pointsPerCny: number;
  models: AiModel[];
};

export default function PointsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PointSettings>({ pointsPerCny: 100, models: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setSettings(await apiRequest<PointSettings>('/api/admin/points/settings'));
  }

  function updateModelCost(modelId: string, pointCost: number) {
    setSettings((current) => ({
      ...current,
      models: current.models.map((model) => model.id === modelId
        ? { ...model, config: { ...model.config, pointCost } }
        : model)
    }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const result = await apiRequest<PointSettings>('/api/admin/points/settings', {
        method: 'PUT',
        body: JSON.stringify({
          pointsPerCny: settings.pointsPerCny,
          models: settings.models.map((model) => ({ id: model.id, pointCost: Number(model.config?.pointCost ?? model.config?.price ?? 0) }))
        })
      });
      setSettings(result);
      setMessage('积分规则已保存');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <PageContainer pageTitle='积分管理' pageDescription='统一配置充值兑换比例和每个 AI 模型的积分消耗' access={user?.role === 'admin'}>
      <div className='space-y-4'>
        {message && <div className='rounded-md border bg-muted p-3 text-sm'>{message}</div>}
        <Card>
          <CardHeader>
            <CardTitle>充值兑换比例</CardTitle>
            <CardDescription>管理员为客户充值人民币后，系统按此比例自动发放积分。</CardDescription>
          </CardHeader>
          <CardContent className='max-w-md space-y-3'>
            <Label>1 元人民币兑换积分</Label>
            <div className='flex items-center gap-3'>
              <span className='text-muted-foreground shrink-0'>¥1 =</span>
              <Input type='number' min='0.01' step='0.01' value={settings.pointsPerCny} onChange={(event) => setSettings({ ...settings, pointsPerCny: Number(event.target.value) || 0 })} />
              <span className='text-muted-foreground shrink-0'>积分</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI 消耗积分</CardTitle>
            <CardDescription>客户看不到具体模型；系统实际调用成功后，按命中的模型扣除对应积分。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader><TableRow><TableHead className='min-w-64'>模型</TableHead><TableHead>类型</TableHead><TableHead>客户状态</TableHead><TableHead className='w-52'>每次消耗</TableHead></TableRow></TableHeader>
                <TableBody>
                  {settings.models.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell><div className='font-medium'>{model.displayName}</div><div className='text-muted-foreground text-xs'>{model.providerName} / {model.modelName}</div></TableCell>
                      <TableCell>{model.modality === 'video' ? '视频' : model.modality === 'image' ? '图片' : model.modality}</TableCell>
                      <TableCell>{model.enabled && model.customerEnabled ? '参与客户调用' : '未分配'}</TableCell>
                      <TableCell><div className='flex items-center gap-2'><Input type='number' min='0' step='1' value={Number(model.config?.pointCost ?? model.config?.price ?? 0)} onChange={(event) => updateModelCost(model.id, Math.max(0, Number(event.target.value) || 0))} /><span className='text-muted-foreground shrink-0 text-sm'>积分/次</span></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <div className='flex justify-end'><Button onClick={save} disabled={saving || settings.pointsPerCny <= 0}>{saving ? '保存中...' : '保存积分规则'}</Button></div>
      </div>
    </PageContainer>
  );
}
