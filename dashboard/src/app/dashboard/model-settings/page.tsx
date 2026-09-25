'use client';

import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-client';
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconCloud,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconKey,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconWorld
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

type Market = 'domestic' | 'overseas';

type RemoteModel = {
  id: string;
  name: string;
  ownedBy?: string;
  capabilities?: string[];
};

type ConnectionModelGroup = {
  id: string;
  name: string;
  description: string;
  models: string[];
};

type ModelConnection = {
  id: string;
  market: Market;
  name: string;
  shortName: string;
  description: string;
  keyHint: string;
  docsUrl: string;
  modelDocsUrl: string;
  configured: boolean;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  families: string[];
  featuredModels: string[];
  discoveredModels: RemoteModel[];
  discoveredAt?: string;
  modelCount: number;
  catalogUpdatedAt?: string;
  keyScopeNote?: string;
  modelGroups?: ConnectionModelGroup[];
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
  config: Record<string, unknown>;
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
  image_to_image: '图生图 / 编辑',
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  text_generation: '文本生成'
};

const remoteCapabilityLabel: Record<string, string> = {
  Reasoning: '深度思考',
  VU: '视觉理解',
  IG: '图片生成',
  VG: '视频生成',
  ASR: '语音识别',
  TTS: '语音合成',
  ME: '多模态向量',
  'Realtime-Omni': '实时全模态',
  'Multimodal-Omni': '全模态',
  'Realtime-Text-to-Speech': '实时语音合成',
  TG: '文本生成',
  TR: '文本向量',
  'Realtime-ASR': '实时语音识别',
  'Realtime-Audio-Translate': '实时语音翻译',
  '3D-generation': '3D 生成',
  'Realtime-Chatting': '实时语音对话'
};

const accentClass: Record<string, string> = {
  'aliyun-cn': 'from-orange-500 to-amber-500 text-white shadow-orange-500/20',
  'aliyun-intl': 'from-orange-500 to-rose-500 text-white shadow-orange-500/20',
  openai: 'from-emerald-500 to-teal-600 text-white shadow-emerald-500/20',
  anthropic: 'from-amber-600 to-orange-700 text-white shadow-amber-500/20',
  'google-gemini': 'from-blue-500 via-violet-500 to-fuchsia-500 text-white shadow-violet-500/20',
  xai: 'from-zinc-600 to-zinc-950 text-white shadow-black/30'
};

function formatCheckedAt(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
}

export default function ModelSettingsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [market, setMarket] = useState<Market>('domestic');
  const [query, setQuery] = useState('');
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState('');
  const [savingId, setSavingId] = useState('');
  const [testingId, setTestingId] = useState('');
  const [savingModelId, setSavingModelId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [editingModelId, setEditingModelId] = useState('');
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Record<string, string>>({});

  const editingModel = useMemo(
    () => models.find((item) => item.id === editingModelId),
    [models, editingModelId]
  );

  const filteredConnections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return connections.filter((connection) => {
      if (connection.market !== market) return false;
      if (!normalized) return true;
      return [
        connection.name,
        connection.shortName,
        connection.description,
        ...connection.families,
        ...connection.featuredModels,
        ...(connection.modelGroups || []).flatMap((group) => [group.name, group.description, ...group.models]),
        ...connection.discoveredModels.flatMap((model) => [model.id, model.name])
      ].some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [connections, market, query]);

  async function load() {
    try {
      const [connectionList, modelList] = await Promise.all([
        apiRequest<ModelConnection[]>('/api/admin/model-connections'),
        apiRequest<AiModel[]>('/api/admin/models')
      ]);
      setConnections(connectionList);
      setModels(modelList);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '模型配置加载失败' });
    }
  }

  function updateLocalConnection(connectionId: string, patch: Partial<ModelConnection>) {
    setConnections((items) => items.map((item) => item.id === connectionId ? { ...item, ...patch } : item));
  }

  async function persistConnection(connection: ModelConnection, patch: { apiKey?: string; enabled?: boolean } = {}) {
    const result = await apiRequest<{ connection: ModelConnection }>(`/api/admin/model-connections/${connection.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    updateLocalConnection(connection.id, result.connection);
    if (patch.apiKey) setKeyDrafts((items) => ({ ...items, [connection.id]: '' }));
    return result.connection;
  }

  async function saveConnection(connection: ModelConnection) {
    setSavingId(connection.id);
    setMessage(null);
    try {
      const draft = keyDrafts[connection.id]?.trim();
      await persistConnection(connection, { apiKey: draft || undefined, enabled: connection.enabled });
      setMessage({ type: 'success', text: `${connection.shortName} Key 已安全保存` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setSavingId('');
    }
  }

  async function testConnection(connection: ModelConnection) {
    setTestingId(connection.id);
    setMessage(null);
    try {
      const draft = keyDrafts[connection.id]?.trim();
      if (draft) await persistConnection(connection, { apiKey: draft, enabled: true });
      const result = await apiRequest<{ modelCount: number; models: RemoteModel[]; checkedAt: string }>(
        `/api/admin/model-connections/${connection.id}/test`,
        { method: 'POST' }
      );
      updateLocalConnection(connection.id, {
        configured: true,
        enabled: true,
        modelCount: result.modelCount,
        discoveredModels: result.models,
        discoveredAt: result.checkedAt
      });
      setExpandedId(connection.id);
      setMessage({ type: 'success', text: `${connection.shortName} 连接成功，读取到 ${result.modelCount} 个可用模型` });
    } catch (error) {
      setMessage({ type: 'error', text: `${connection.shortName}：${error instanceof Error ? error.message : '连接失败'}` });
    } finally {
      setTestingId('');
    }
  }

  async function toggleConnection(connection: ModelConnection, enabled: boolean) {
    updateLocalConnection(connection.id, { enabled });
    setSavingId(connection.id);
    setMessage(null);
    try {
      await persistConnection(connection, { enabled });
      setMessage({ type: 'success', text: `${connection.shortName} 已${enabled ? '启用' : '停用'}` });
    } catch (error) {
      updateLocalConnection(connection.id, { enabled: connection.enabled });
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '状态更新失败' });
    } finally {
      setSavingId('');
    }
  }

  function updateModel(modelId: string, patch: Partial<AiModel>) {
    setModels((items) => items.map((item) => item.id === modelId ? { ...item, ...patch } : item));
  }

  async function saveModel(model: AiModel) {
    setSavingModelId(model.id);
    setMessage(null);
    try {
      await apiRequest(`/api/admin/models/${model.id}`, {
        method: 'PUT',
        body: JSON.stringify(model)
      });
      setMessage({ type: 'success', text: `${model.displayName} 调用设置已保存` });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '模型保存失败' });
    } finally {
      setSavingModelId('');
    }
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

  useEffect(() => { void load(); }, []);

  const configuredCount = connections.filter((item) => item.configured).length;

  return (
    <PageContainer
      pageTitle='模型 Key'
      pageDescription='选择模型平台，粘贴 API Key 即可；系统会自动使用正确的官方接口地址。'
      access={user?.role === 'admin'}
    >
      <div className='space-y-5'>
        <div className='grid gap-3 sm:grid-cols-3'>
          <div className='rounded-xl border border-border/70 bg-card/60 p-4'>
            <div className='text-muted-foreground text-xs'>已接入平台</div>
            <div className='mt-1 text-2xl font-semibold'>{connections.length}</div>
          </div>
          <div className='rounded-xl border border-border/70 bg-card/60 p-4'>
            <div className='text-muted-foreground text-xs'>已配置 Key</div>
            <div className='mt-1 flex items-center gap-2 text-2xl font-semibold'>
              {configuredCount}
              {configuredCount > 0 && <IconCheck className='size-5 text-emerald-500' />}
            </div>
          </div>
          <div className='rounded-xl border border-orange-500/20 bg-orange-500/5 p-4'>
            <div className='text-xs text-orange-500'>配置方式</div>
            <div className='mt-1 flex items-center gap-2 text-sm font-medium'>
              <IconKey className='size-4 text-orange-500' />一平台一把 Key
            </div>
          </div>
        </div>

        {message && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${message.type === 'success'
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-destructive/25 bg-destructive/10 text-destructive'}`}
          >
            {message.type === 'success' ? <IconCheck className='size-4 shrink-0' /> : <IconBolt className='size-4 shrink-0' />}
            {message.text}
          </div>
        )}

        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <Tabs value={market} onValueChange={(value) => setMarket(value as Market)}>
            <TabsList className='h-11 rounded-xl p-1'>
              <TabsTrigger value='domestic' className='h-9 min-w-32 rounded-lg px-5'>
                <IconCloud className='size-4' />国内模型
              </TabsTrigger>
              <TabsTrigger value='overseas' className='h-9 min-w-32 rounded-lg px-5'>
                <IconWorld className='size-4' />海外模型
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className='relative w-full sm:max-w-sm'>
            <IconSearch className='text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2' />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='搜索平台或模型，例如 Wan、GPT、Claude'
              className='h-11 rounded-xl pl-9'
            />
          </div>
        </div>

        <div className='grid gap-4 xl:grid-cols-2'>
          {filteredConnections.map((connection) => {
            const modelsToShow: RemoteModel[] = connection.discoveredModels.length
              ? connection.discoveredModels
              : connection.featuredModels.map((id) => ({ id, name: id, capabilities: [] }));
            const isBusy = savingId === connection.id || testingId === connection.id;
            const modelGroups = connection.modelGroups || [];
            const selectedGroup = modelGroups.find((group) => group.id === selectedGroups[connection.id]) || modelGroups[0];
            return (
              <Card key={connection.id} className='overflow-hidden border-border/70 bg-card/70 shadow-sm'>
                <CardHeader className='pb-4'>
                  <div className='flex items-start justify-between gap-4'>
                    <div className='flex min-w-0 items-start gap-3'>
                      <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-black shadow-lg ${accentClass[connection.id] || 'from-zinc-500 to-zinc-800 text-white'}`}>
                        {connection.shortName.slice(0, 2)}
                      </div>
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <CardTitle className='text-base'>{connection.name}</CardTitle>
                          <Badge variant='outline' className={connection.configured
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'text-muted-foreground'}
                          >
                            <span className={`size-1.5 rounded-full ${connection.configured ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                            {connection.configured ? '已配置' : '未配置'}
                          </Badge>
                        </div>
                        <CardDescription className='mt-1.5 leading-5'>{connection.description}</CardDescription>
                      </div>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      <span className='text-muted-foreground text-xs'>{connection.enabled ? '启用' : '停用'}</span>
                      <Switch
                        checked={connection.enabled}
                        disabled={isBusy}
                        onCheckedChange={(checked) => void toggleConnection(connection, checked)}
                        aria-label={`${connection.name}启用状态`}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                      <Label htmlFor={`key-${connection.id}`}>API Key</Label>
                      <a href={connection.docsUrl} target='_blank' rel='noreferrer' className='text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs'>
                        获取 Key <IconExternalLink className='size-3' />
                      </a>
                    </div>
                    <div className='relative'>
                      <IconKey className='text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2' />
                      <Input
                        id={`key-${connection.id}`}
                        type={visibleKeys[connection.id] ? 'text' : 'password'}
                        value={keyDrafts[connection.id] || ''}
                        onChange={(event) => setKeyDrafts((items) => ({ ...items, [connection.id]: event.target.value }))}
                        placeholder={connection.apiKey || `粘贴 ${connection.keyHint}`}
                        autoComplete='new-password'
                        className='h-11 rounded-xl pl-9 pr-11 font-mono text-sm'
                      />
                      <button
                        type='button'
                        onClick={() => setVisibleKeys((items) => ({ ...items, [connection.id]: !items[connection.id] }))}
                        className='text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2'
                        aria-label={visibleKeys[connection.id] ? '隐藏 Key' : '显示 Key'}
                      >
                        {visibleKeys[connection.id] ? <IconEyeOff className='size-4' /> : <IconEye className='size-4' />}
                      </button>
                    </div>
                    <p className='text-muted-foreground text-[11px]'>Key 仅保存在服务端，页面只返回脱敏内容；留空保存不会覆盖原 Key。</p>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    <Button onClick={() => void saveConnection(connection)} disabled={isBusy} className='rounded-lg'>
                      {savingId === connection.id ? <IconRefresh className='size-4 animate-spin' /> : <IconKey className='size-4' />}
                      保存 Key
                    </Button>
                    <Button variant='outline' onClick={() => void testConnection(connection)} disabled={isBusy} className='rounded-lg'>
                      {testingId === connection.id ? <IconRefresh className='size-4 animate-spin' /> : <IconBolt className='size-4' />}
                      校验并读取模型
                    </Button>
                  </div>

                  {selectedGroup && (
                    <div className='rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-3 sm:p-4'>
                      <div className='flex flex-wrap items-start justify-between gap-2'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2 text-sm font-semibold'>
                            阿里模型能力地图
                            <Badge variant='outline' className='border-orange-500/25 text-orange-500'>{modelGroups.length} 类</Badge>
                          </div>
                          <p className='text-muted-foreground mt-1 text-xs leading-5'>{connection.keyScopeNote}</p>
                        </div>
                        {connection.catalogUpdatedAt && <span className='text-muted-foreground text-[11px]'>官网目录更新：{connection.catalogUpdatedAt}</span>}
                      </div>

                      <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-3 2xl:grid-cols-5'>
                        {modelGroups.map((group) => {
                          const selected = group.id === selectedGroup.id;
                          return (
                            <button
                              key={group.id}
                              type='button'
                              onClick={() => setSelectedGroups((items) => ({ ...items, [connection.id]: group.id }))}
                              className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${selected
                                ? 'border-orange-500/45 bg-orange-500/12 text-foreground'
                                : 'border-border/60 bg-background/45 text-muted-foreground hover:border-orange-500/25 hover:text-foreground'}`}
                            >
                              <span className='block truncate text-xs font-medium'>{group.name}</span>
                              <span className='mt-0.5 block text-[10px] opacity-65'>{group.models.length} 个代表模型</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className='mt-3 rounded-lg border border-border/60 bg-background/55 p-3'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>{selectedGroup.name}</span>
                          <Badge variant='secondary' className='font-normal'>{selectedGroup.models.length} 个</Badge>
                        </div>
                        <p className='text-muted-foreground mt-1 text-xs'>{selectedGroup.description}</p>
                        <div className='mt-3 flex flex-wrap gap-1.5'>
                          {selectedGroup.models.map((model) => (
                            <span key={model} className='rounded-md border border-border/60 bg-card px-2 py-1 font-mono text-[11px] text-foreground/85'>
                              {model}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className='border-border/60 border-t pt-4'>
                    {!modelGroups.length && (
                      <div className='mb-2 flex flex-wrap gap-1.5'>
                        {connection.families.map((family) => (
                          <Badge key={family} variant='secondary' className='bg-muted/70 font-normal'>{family}</Badge>
                        ))}
                      </div>
                    )}
                    <button
                      type='button'
                      onClick={() => setExpandedId(expandedId === connection.id ? '' : connection.id)}
                      className='text-muted-foreground hover:text-foreground flex w-full items-center justify-between py-1 text-xs'
                    >
                      <span>
                        {connection.modelCount > 0 ? `该账号实际可用模型 ${connection.modelCount} 个` : '校验 Key 后读取该账号实际可用模型'}
                        {connection.discoveredAt && ` · ${formatCheckedAt(connection.discoveredAt)}`}
                      </span>
                      <IconChevronDown className={`size-4 transition-transform ${expandedId === connection.id ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedId === connection.id && (
                      <div className='mt-3 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-muted/25 p-3'>
                        <div className='flex flex-wrap gap-1.5'>
                          {modelsToShow.map((model) => (
                            <div key={model.id} className='rounded-md border border-border/60 bg-background/70 px-2 py-1.5' title={model.name}>
                              <div className='font-mono text-[11px]'>{model.id}</div>
                              {!!model.capabilities?.length && (
                                <div className='mt-1 flex flex-wrap gap-1'>
                                  {model.capabilities.map((capability) => (
                                    <span key={capability} className='rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground'>
                                      {remoteCapabilityLabel[capability] || capability}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <a href={connection.modelDocsUrl} target='_blank' rel='noreferrer' className='text-muted-foreground hover:text-foreground mt-3 flex items-center gap-1 text-xs'>
                          查看官方模型说明 <IconExternalLink className='size-3' />
                        </a>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredConnections.length === 0 && (
          <div className='text-muted-foreground flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center'>
            <IconSearch className='mb-2 size-6' />
            没有找到匹配的平台或模型
          </div>
        )}

        <Collapsible open={routingOpen} onOpenChange={setRoutingOpen}>
          <Card className='border-border/70 bg-card/60'>
            <CardHeader className='flex flex-row items-center justify-between gap-4'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'><IconSettings className='size-4' />高级：生成模型路由</CardTitle>
                <CardDescription className='mt-1'>仅在需要调整客户可用模型、调用顺序或默认参数时使用。</CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant='outline' size='sm' className='rounded-lg'>{routingOpen ? '收起' : '展开'}</Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <div className='overflow-x-auto rounded-xl border border-border/70'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='min-w-64'>调用模型</TableHead>
                        <TableHead>类型 / 能力</TableHead>
                        <TableHead>后台</TableHead>
                        <TableHead>客户</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead className='text-right'>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {models.map((model) => (
                        <TableRow key={model.id}>
                          <TableCell>
                            <div className='font-medium'>{model.displayName}</div>
                            <div className='text-muted-foreground mt-1 font-mono text-xs'>{model.providerName} / {model.modelName}</div>
                          </TableCell>
                          <TableCell>
                            <div className='flex flex-wrap gap-1'>
                              <Badge variant='secondary'>{modalityLabel[model.modality] || model.modality}</Badge>
                              <Badge variant='outline'>{capabilityLabel[model.capability] || model.capability}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch checked={model.enabled} onCheckedChange={(checked) => updateModel(model.id, { enabled: checked })} />
                          </TableCell>
                          <TableCell>
                            <Switch checked={model.customerEnabled} onCheckedChange={(checked) => updateModel(model.id, { customerEnabled: checked })} />
                          </TableCell>
                          <TableCell>
                            <Select value={String(model.sortOrder)} onValueChange={(value) => updateModel(model.id, { sortOrder: Number(value) })}>
                              <SelectTrigger className='w-28'><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[10, 20, 30, 40, 50, 60, 80, 100].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='flex justify-end gap-2'>
                              <Button variant='outline' size='sm' onClick={() => openConfigDialog(model)}>参数</Button>
                              <Button size='sm' onClick={() => void saveModel(model)} disabled={savingModelId === model.id}>
                                {savingModelId === model.id ? '保存中' : '保存'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Dialog open={Boolean(editingModel)} onOpenChange={(open) => { if (!open) setEditingModelId(''); }}>
          <DialogContent className='sm:max-w-3xl'>
            <DialogHeader>
              <DialogTitle>默认调用参数</DialogTitle>
              <DialogDescription>{editingModel?.displayName} / {editingModel?.modelName}</DialogDescription>
            </DialogHeader>
            <Textarea
              className='min-h-80 font-mono text-xs'
              value={jsonDraft}
              onChange={(event) => { setJsonDraft(event.target.value); setJsonError(''); }}
            />
            {jsonError && <div className='text-destructive text-sm'>{jsonError}</div>}
            <DialogFooter>
              <Button variant='outline' onClick={() => setEditingModelId('')}>取消</Button>
              <Button onClick={() => void saveConfigDialog()} disabled={savingModelId === editingModel?.id}>
                {savingModelId === editingModel?.id ? '保存中...' : '保存参数'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  );
}
