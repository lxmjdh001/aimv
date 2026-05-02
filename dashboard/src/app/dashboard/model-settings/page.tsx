'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import { useEffect, useMemo, useState } from 'react';

type Provider = {
  id: string;
  name: string;
  platform: string;
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  hasApiKey?: boolean;
  settings?: Record<string, any>;
};

type AiModel = {
  id: string;
  displayName: string;
  providerId: string;
  providerName?: string;
  modelName: string;
  modality: string;
  capability: string;
  enabled: boolean;
  customerEnabled: boolean;
  config: Record<string, any>;
  sortOrder: number;
};

const modalityLabel: Record<string, string> = {
  text: '文字',
  image: '图片',
  video: '视频',
  audio: '音频',
  other: '其他'
};

const capabilityLabel: Record<string, string> = {
  text_to_image: '文生图',
  image_to_image: '图生图/编辑',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  text_generation: '文本生成'
};

export default function ModelSettingsPage() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [currentId, setCurrentId] = useState('aliyun-wanx-image');
  const [apiKey, setApiKey] = useState('');
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingModelId, setSavingModelId] = useState('');
  const [message, setMessage] = useState('');
  const [editingModelId, setEditingModelId] = useState('');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialProviderId, setCredentialProviderId] = useState('');
  const [credentialApiKey, setCredentialApiKey] = useState('');
  const current = providers.find((provider) => provider.id === currentId);
  const editingModel = useMemo(() => models.find((model) => model.id === editingModelId), [models, editingModelId]);
  const credentialProvider = useMemo(() => providers.find((provider) => provider.id === credentialProviderId), [providers, credentialProviderId]);

  async function load() {
    const [providerList, modelList] = await Promise.all([
      apiRequest<Provider[]>('/api/providers'),
      apiRequest<AiModel[]>('/api/admin/models')
    ]);
    setProviders(providerList);
    setModels(modelList);
  }

  async function saveProvider() {
    if (!current) return;
    await saveProviderPayload(current, apiKey);
    setApiKey('');
  }

  async function saveProviderPayload(provider: Provider, nextApiKey: string) {
    setSavingProvider(true);
    setMessage('');
    try {
      const payload = { ...provider };
      if (nextApiKey.trim()) payload.apiKey = nextApiKey.trim();
      else delete payload.apiKey;
      await apiRequest(`/api/admin/providers/${provider.id}?admin=7c`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      setMessage('供应商凭证已保存');
      await load();
    } finally {
      setSavingProvider(false);
    }
  }

  async function saveModel(model: AiModel) {
    setSavingModelId(model.id);
    setMessage('');
    try {
      await apiRequest(`/api/admin/models/${model.id}`, {
        method: 'PUT',
        body: JSON.stringify(model)
      });
      setMessage('模型配置已保存');
      await load();
    } finally {
      setSavingModelId('');
    }
  }

  function updateProviderBaseUrl(value: string) {
    setProviders((items) => items.map((item) => item.id === currentId ? { ...item, baseUrl: value } : item));
  }

  function updateProviderBaseUrlById(providerId: string, value: string) {
    setProviders((items) => items.map((item) => item.id === providerId ? { ...item, baseUrl: value } : item));
  }

  function openCredentialDialog(providerId: string) {
    setCredentialProviderId(providerId);
    setCredentialApiKey('');
  }

  async function saveCredentialDialog() {
    if (!credentialProvider) return;
    await saveProviderPayload(credentialProvider, credentialApiKey);
    setCredentialProviderId('');
    setCredentialApiKey('');
  }

  function updateModel(modelId: string, patch: Partial<AiModel>) {
    setModels((items) => items.map((item) => item.id === modelId ? { ...item, ...patch } : item));
  }

  function isSameFallbackGroup(left: AiModel, right: AiModel) {
    return left.modality === right.modality && left.capability === right.capability;
  }

  function fallbackRank(model: AiModel) {
    if (!model.enabled || !model.customerEnabled) return 'disabled';
    const group = models
      .filter((item) => item.enabled && item.customerEnabled && isSameFallbackGroup(item, model))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName));
    const index = group.findIndex((item) => item.id === model.id);
    return String(Math.max(index, 0));
  }

  function setFallbackRank(model: AiModel, rank: number) {
    setModels((items) => {
      const group = items
        .filter((item) => item.enabled && item.customerEnabled && isSameFallbackGroup(item, model))
        .sort((left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName));
      const withoutCurrent = group.filter((item) => item.id !== model.id);
      withoutCurrent.splice(Math.min(rank, withoutCurrent.length), 0, model);
      const nextOrder = new Map(withoutCurrent.map((item, index) => [item.id, (index + 1) * 10]));
      return items.map((item) => nextOrder.has(item.id) ? { ...item, sortOrder: nextOrder.get(item.id) ?? item.sortOrder } : item);
    });
  }

  function generationTypeLabel(model: AiModel) {
    return model.modality === 'video' ? '视频' : '图片';
  }

  function fallbackLabel(model: AiModel, index: number) {
    const type = generationTypeLabel(model);
    if (index === 0) return `${type}优先`;
    return `${type}备用 ${index}`;
  }

  function openConfigDialog(model: AiModel) {
    setEditingModelId(model.id);
    setJsonDraft(JSON.stringify(model.config, null, 2));
    setJsonError('');
  }

  async function saveConfigDialog() {
    if (!editingModel) return;
    try {
      const parsed = jsonDraft.trim() ? JSON.parse(jsonDraft) : {};
      const nextModel = { ...editingModel, config: parsed };
      updateModel(editingModel.id, { config: parsed });
      await saveModel(nextModel);
      setEditingModelId('');
      setJsonDraft('');
      setJsonError('');
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'JSON 格式不正确');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <PageContainer pageTitle='模型中心' pageDescription='先统一配置供应商凭证和模型能力，后续客户前台只使用已分配模型' access={user?.role === 'admin'}>
      <div className='space-y-4'>
        {message && <div className='rounded-md border border-border bg-muted p-3 text-sm'>{message}</div>}

        <Collapsible open={credentialsOpen} onOpenChange={setCredentialsOpen}>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between gap-4'>
              <div>
                <CardTitle>供应商凭证</CardTitle>
                <CardDescription>API Key 按平台/地域保存；平时收起，新增或修改 Key 时展开。</CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant='outline'>{credentialsOpen ? '收起凭证' : '展开配置'}</Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className='grid gap-4 lg:grid-cols-2'>
                <div className='space-y-4'>
                  <div className='space-y-2'>
                    <Label>供应商</Label>
                    <Select value={currentId} onValueChange={setCurrentId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>Base URL</Label>
                    <Input value={current?.baseUrl ?? ''} onChange={(event) => updateProviderBaseUrl(event.target.value)} />
                  </div>
                  <div className='space-y-2'>
                    <Label>API Key {current?.hasApiKey ? '（已保存）' : '（未配置）'}</Label>
                    <Input
                      type='password'
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={current?.apiKey || '粘贴新的 API Key，留空则不修改'}
                    />
                    {current?.apiKey && (
                      <p className='text-muted-foreground text-sm'>当前已保存：<span className='font-mono'>{current.apiKey}</span></p>
                    )}
                  </div>
                  <Button onClick={saveProvider} disabled={savingProvider}>{savingProvider ? '保存中...' : '保存供应商配置'}</Button>
                </div>
                <pre className='bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs'>{JSON.stringify(current, null, 2)}</pre>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardHeader>
            <CardTitle>模型目录</CardTitle>
            <CardDescription>一行一个模型；按图片/视频分别设置优先和备用，客户生成时先用优先模型，失败后自动用备用模型。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-md border border-border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='min-w-64'>模型</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>能力</TableHead>
                    <TableHead>后台启用</TableHead>
                    <TableHead>客户分配</TableHead>
                    <TableHead>调用方式</TableHead>
                    <TableHead>凭证</TableHead>
                    <TableHead>参数</TableHead>
                    <TableHead className='text-right'>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((model) => {
                    const provider = providers.find((item) => item.id === model.providerId);
                    return (
                    <TableRow key={model.id}>
                      <TableCell>
                        <div className='font-medium'>{model.displayName}</div>
                        <div className='text-muted-foreground text-xs'>{model.providerName} / {model.modelName}</div>
                      </TableCell>
                      <TableCell>{modalityLabel[model.modality] ?? model.modality}</TableCell>
                      <TableCell>{capabilityLabel[model.capability] ?? model.capability}</TableCell>
                      <TableCell>
                        <Select value={model.enabled ? 'true' : 'false'} onValueChange={(value) => updateModel(model.id, { enabled: value === 'true' })}>
                          <SelectTrigger className='w-28'><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value='true'>启用</SelectItem>
                            <SelectItem value='false'>停用</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={model.customerEnabled ? 'true' : 'false'} onValueChange={(value) => updateModel(model.id, { customerEnabled: value === 'true' })}>
                          <SelectTrigger className='w-32'><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value='true'>客户可用</SelectItem>
                            <SelectItem value='false'>仅后台</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={fallbackRank(model)}
                          disabled={!model.enabled || !model.customerEnabled}
                          onValueChange={(value) => setFallbackRank(model, Number(value))}
                        >
                          <SelectTrigger className='w-44'><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value='disabled'>不参与调用</SelectItem>
                            {[0, 1, 2, 3, 4].map((index) => (
                              <SelectItem key={index} value={String(index)}>{fallbackLabel(model, index)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button variant='outline' size='sm' onClick={() => openCredentialDialog(model.providerId)}>
                          {provider?.hasApiKey ? '已配置' : '配置Key'}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button variant='outline' size='sm' onClick={() => openConfigDialog(model)}>查看/编辑</Button>
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button size='sm' onClick={() => saveModel(model)} disabled={savingModelId === model.id}>
                          {savingModelId === model.id ? '保存中...' : '保存'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(credentialProvider)} onOpenChange={(open) => { if (!open) setCredentialProviderId(''); }}>
          <DialogContent className='sm:max-w-2xl'>
            <DialogHeader>
              <DialogTitle>供应商凭证</DialogTitle>
              <DialogDescription>{credentialProvider?.name} / {credentialProvider?.platform}</DialogDescription>
            </DialogHeader>
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label>Base URL</Label>
                <Input
                  value={credentialProvider?.baseUrl ?? ''}
                  onChange={(event) => credentialProvider && updateProviderBaseUrlById(credentialProvider.id, event.target.value)}
                />
              </div>
              <div className='space-y-2'>
                <Label>API Key {credentialProvider?.hasApiKey ? '（已保存）' : '（未配置）'}</Label>
                <Input
                  type='password'
                  value={credentialApiKey}
                  onChange={(event) => setCredentialApiKey(event.target.value)}
                  placeholder={credentialProvider?.apiKey || '粘贴新的 API Key，留空则不修改'}
                />
                {credentialProvider?.apiKey && (
                  <p className='text-muted-foreground text-sm'>当前已保存：<span className='font-mono'>{credentialProvider.apiKey}</span></p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant='outline' onClick={() => setCredentialProviderId('')}>取消</Button>
              <Button onClick={saveCredentialDialog} disabled={savingProvider}>
                {savingProvider ? '保存中...' : '保存凭证'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(editingModel)} onOpenChange={(open) => { if (!open) setEditingModelId(''); }}>
          <DialogContent className='sm:max-w-3xl'>
            <DialogHeader>
              <DialogTitle>默认调用参数 JSON</DialogTitle>
              <DialogDescription>{editingModel?.displayName} / {editingModel?.modelName}</DialogDescription>
            </DialogHeader>
            <Textarea
              className='min-h-96 font-mono text-xs'
              value={jsonDraft}
              onChange={(event) => { setJsonDraft(event.target.value); setJsonError(''); }}
            />
            {jsonError && <div className='text-destructive text-sm'>{jsonError}</div>}
            <DialogFooter>
              <Button variant='outline' onClick={() => setEditingModelId('')}>取消</Button>
              <Button onClick={saveConfigDialog} disabled={savingModelId === editingModel?.id}>
                {savingModelId === editingModel?.id ? '保存中...' : '保存参数'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
