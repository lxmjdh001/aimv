'use client';

import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { IconBrandFacebook, IconBrandTiktok, IconExternalLink, IconFileUpload, IconRefresh, IconShieldCheck } from '@tabler/icons-react';
import NextImage from 'next/image';
import { useSearchParams } from 'next/navigation';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

type Platform = 'tiktok' | 'meta';
type MediaInfo = { name: string; kind: 'image' | 'video'; mimeType: string; sizeMb: number; width: number; height: number; duration?: number; previewUrl: string; file: File };
type Check = { level: 'pass' | 'warning' | 'risk'; title: string; detail: string };
type TikTokAdvertiser = { advertiserId: string; advertiserName: string };
type TikTokConnection = { configured: boolean; redirectUri: string; connected: boolean; selectedAdvertiserId: string; advertisers: TikTokAdvertiser[]; scopes: string[] };
type TikTokRun = {
  advertiserId: string;
  upload: null | { materialId: string; materialType: 'image' | 'video'; previewUrl: string; width: number | null; height: number | null; duration: number | null };
  preReview: { taskId: string; status: string };
  smartFix: null | { taskId: string; status: string; flawTypes: string[] };
  preview: null | { url: string; tips: Array<{ placement?: string; messages?: string[] }>; error?: string };
};
type TikTokReviewResponse = { data?: { task_status?: string; pre_review_result_list?: Array<{ pre_review_status: string; material_type: string; material_id: string; location_code?: string; reject_info_list?: Array<{ reason?: string; suggestion?: string }> }> } };
type TikTokFixResponse = { data?: { status?: string; error_msg?: string; videos?: Array<{ video_id: string; video_url: string }> } };
type MetaAccount = { id: string; name: string; status: number; disableReason: number; currency: string; timezone: string };
type MetaPage = { id: string; name: string; tasks: string[] };
type MetaConnection = {
  configured: boolean;
  connected: boolean;
  graphVersion: string;
  appId?: string;
  tokenType?: string;
  expiresAt?: number;
  scopes: string[];
  accounts: MetaAccount[];
  pages: MetaPage[];
  selectedAccountId?: string;
  selectedPageId?: string;
  error: string;
};
type MetaApiError = { message: string; code: number | null; subcode: number | null; title: string; userMessage: string; technicalMessage: string; traceId: string };
type MetaRun = {
  adAccount: MetaAccount;
  page: MetaPage;
  coverage: 'FULL_CREATIVE' | 'TEXT_LINK_ACCOUNT';
  warnings: string[];
  validation: { status: 'PASSED' | 'FAILED'; noAdCreated: boolean; error?: MetaApiError };
  preview: null | { status: string; format: string; url: string; error?: MetaApiError };
};

const emptyTikTokConnection: TikTokConnection = { configured: false, redirectUri: '', connected: false, selectedAdvertiserId: '', advertisers: [], scopes: [] };
const emptyMetaConnection: MetaConnection = { configured: false, connected: false, graphVersion: 'v25.0', accounts: [], pages: [], scopes: [], error: '' };

const riskyPatterns = [
  { pattern: /保证|百分之百|100%|绝对有效|稳赚|零风险/i, label: '绝对化或保证性表达' },
  { pattern: /前后对比|before\s*and\s*after|before\s*&\s*after/i, label: '效果前后对比表达' },
  { pattern: /治愈|治疗|减肥|药到病除|疾病/i, label: '医疗或健康功效声明' },
  { pattern: /你很胖|你有皱纹|你的债务|your\s+(age|weight|debt)/i, label: '可能涉及个人属性暗示' }
];

export default function PreflightPage() {
  const searchParams = useSearchParams();
  const [platform, setPlatform] = useState<Platform>(searchParams.get('platform') === 'meta' ? 'meta' : 'tiktok');
  const [copy, setCopy] = useState('');
  const [landingPage, setLandingPage] = useState('');
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [checked, setChecked] = useState(false);
  const [brandName, setBrandName] = useState('WzzAds');
  const [locationCode, setLocationCode] = useState('US');
  const [isEcommerce, setIsEcommerce] = useState(false);
  const [tikTokConnection, setTikTokConnection] = useState<TikTokConnection>(emptyTikTokConnection);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialError, setOfficialError] = useState('');
  const [tikTokRun, setTikTokRun] = useState<TikTokRun | null>(null);
  const [reviewResult, setReviewResult] = useState<TikTokReviewResponse | null>(null);
  const [fixResult, setFixResult] = useState<TikTokFixResponse | null>(null);
  const [metaConnection, setMetaConnection] = useState<MetaConnection>(emptyMetaConnection);
  const [metaConnectionLoading, setMetaConnectionLoading] = useState(true);
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaPageId, setMetaPageId] = useState('');
  const [metaAdFormat, setMetaAdFormat] = useState('MOBILE_FEED_STANDARD');
  const [metaRun, setMetaRun] = useState<MetaRun | null>(null);
  const fixedPreviewRequested = useRef('');

  useEffect(() => {
    const queryPlatform = searchParams.get('platform');
    if (queryPlatform === 'meta' || queryPlatform === 'tiktok') setPlatform(queryPlatform);
  }, [searchParams]);

  useEffect(() => () => { if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl); }, [media?.previewUrl]);

  useEffect(() => {
    loadTikTokConnection();
    loadMetaConnection();
  }, []);

  useEffect(() => {
    if (searchParams.get('oauth') === 'error') setOfficialError(searchParams.get('message') || 'TikTok 授权失败');
    if (searchParams.get('oauth') === 'success') loadTikTokConnection();
  }, [searchParams]);

  useEffect(() => {
    const taskId = tikTokRun?.preReview.taskId;
    if (!taskId) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await apiRequest<TikTokReviewResponse>(`/api/preflight/tiktok/pre-review/${encodeURIComponent(taskId)}`);
        if (stopped) return;
        setReviewResult(result);
        if (result.data?.task_status === 'PROCESSING') timeout = setTimeout(poll, 6000);
      } catch (error) {
        if (!stopped) setOfficialError(error instanceof Error ? error.message : '查询 TikTok 预审结果失败');
      }
    };
    timeout = setTimeout(poll, 3000);
    return () => { stopped = true; if (timeout) clearTimeout(timeout); };
  }, [tikTokRun?.preReview.taskId]);

  useEffect(() => {
    const taskId = tikTokRun?.smartFix?.taskId;
    if (!taskId) return;
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await apiRequest<TikTokFixResponse>(`/api/preflight/tiktok/smart-fix/${encodeURIComponent(taskId)}`);
        if (stopped) return;
        setFixResult(result);
        if (result.data?.status === 'PROCESSING') timeout = setTimeout(poll, 6000);
      } catch (error) {
        if (!stopped) setOfficialError(error instanceof Error ? error.message : '查询 TikTok 视频修复结果失败');
      }
    };
    timeout = setTimeout(poll, 3000);
    return () => { stopped = true; if (timeout) clearTimeout(timeout); };
  }, [tikTokRun?.smartFix?.taskId]);

  useEffect(() => {
    const fixedVideo = fixResult?.data?.status === 'SUCCESS' ? fixResult.data.videos?.[0] : null;
    if (!fixedVideo || !tikTokRun || tikTokRun.preview || !copy || fixedPreviewRequested.current === fixedVideo.video_id) return;
    fixedPreviewRequested.current = fixedVideo.video_id;
    apiRequest<{ data?: { preview_link?: string; tips?: Array<{ placement?: string; messages?: string[] }> }; request_id?: string }>('/api/preflight/tiktok/preview', {
      method: 'POST',
      body: JSON.stringify({ materialId: fixedVideo.video_id, mediaType: 'video', adText: copy, brandName, locationCode })
    }).then((response) => {
      setTikTokRun((current) => current ? { ...current, preview: { url: response.data?.preview_link || '', tips: response.data?.tips || [] } } : current);
    }).catch((error) => {
      setTikTokRun((current) => current ? { ...current, preview: { url: '', tips: [], error: error instanceof Error ? error.message : '修复后视频预览生成失败' } } : current);
    });
  }, [brandName, copy, fixResult, locationCode, tikTokRun]);

  async function loadTikTokConnection() {
    setConnectionLoading(true);
    try {
      setTikTokConnection(await apiRequest<TikTokConnection>('/api/integrations/tiktok/status'));
    } catch {
      setTikTokConnection(emptyTikTokConnection);
    } finally {
      setConnectionLoading(false);
    }
  }

  async function loadMetaConnection() {
    setMetaConnectionLoading(true);
    try {
      const status = await apiRequest<MetaConnection>('/api/integrations/meta/status');
      setMetaConnection(status);
      setMetaAccountId((current) => current || status.selectedAccountId || status.accounts[0]?.id || '');
      setMetaPageId((current) => current || status.selectedPageId || status.pages[0]?.id || '');
    } catch (error) {
      setMetaConnection({ ...emptyMetaConnection, error: error instanceof Error ? error.message : 'Meta 配置状态读取失败' });
    } finally {
      setMetaConnectionLoading(false);
    }
  }

  async function connectTikTok() {
    setOfficialError('');
    try {
      const result = await apiRequest<{ authorizationUrl: string }>('/api/integrations/tiktok/authorize');
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setOfficialError(error instanceof Error ? error.message : '无法发起 TikTok 授权');
    }
  }

  async function selectTikTokAdvertiser(advertiserId: string) {
    try {
      setTikTokConnection(await apiRequest<TikTokConnection>('/api/integrations/tiktok/account', { method: 'PUT', body: JSON.stringify({ advertiserId }) }));
    } catch (error) {
      setOfficialError(error instanceof Error ? error.message : '广告账户切换失败');
    }
  }

  async function refreshTikTokAdvertisers() {
    setConnectionLoading(true);
    try {
      setTikTokConnection(await apiRequest<TikTokConnection>('/api/integrations/tiktok/advertisers/refresh', { method: 'POST' }));
    } catch (error) {
      setOfficialError(error instanceof Error ? error.message : '广告账户刷新失败');
    } finally {
      setConnectionLoading(false);
    }
  }

  async function readMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const info = await inspectMedia(file, previewUrl, kind);
    setMedia(info);
    setChecked(false);
    setTikTokRun(null);
    setMetaRun(null);
    fixedPreviewRequested.current = '';
    setReviewResult(null);
    setFixResult(null);
  }

  async function runChecks() {
    setChecked(true);
    setOfficialError('');
    setTikTokRun(null);
    setMetaRun(null);
    fixedPreviewRequested.current = '';
    setReviewResult(null);
    setFixResult(null);
    const officialConnected = platform === 'tiktok' ? tikTokConnection.connected : metaConnection.connected;
    if (!officialConnected) return;
    setOfficialLoading(true);
    try {
      let mediaUrl = '';
      if (media) {
        if (media.sizeMb > 50) throw new Error('官方检测临时上传上限为 50MB，请先压缩视频');
        if (platform === 'tiktok' && media.kind === 'image' && !['image/jpeg', 'image/png'].includes(media.mimeType)) throw new Error('TikTok 官方图片上传仅支持 JPG/JPEG/PNG');
        if (platform === 'tiktok' && media.kind === 'video' && !['video/mp4', 'video/quicktime', 'video/mpeg'].includes(media.mimeType)) throw new Error('TikTok 官方视频上传仅支持 MP4、MOV、MPEG');
        const uploaded = await apiRequest<{ publicUrl: string }>('/api/uploads/media', {
          method: 'POST',
          body: JSON.stringify({ dataUrl: await fileToDataUrl(media.file), fileName: media.name })
        });
        mediaUrl = uploaded.publicUrl;
      }
      if (platform === 'tiktok') {
        const result = await apiRequest<TikTokRun>('/api/preflight/tiktok/run', {
          method: 'POST',
          body: JSON.stringify({ mediaUrl, mediaType: media?.kind, fileName: media?.name, adText: copy, landingPage, brandName, locationCode, isEcommerce })
        });
        setTikTokRun(result);
      } else {
        const result = await apiRequest<MetaRun>('/api/preflight/meta/run', {
          method: 'POST',
          body: JSON.stringify({ mediaUrl, mediaType: media?.kind, adText: copy, landingPage, headline: brandName, adAccountId: metaAccountId, pageId: metaPageId, adFormat: metaAdFormat })
        });
        setMetaRun(result);
      }
    } catch (error) {
      setOfficialError(error instanceof Error ? error.message : `${platform === 'tiktok' ? 'TikTok' : 'Meta'} 官方检测提交失败`);
    } finally {
      setOfficialLoading(false);
    }
  }

  const checks = useMemo<Check[]>(() => {
    const rows: Check[] = [];
    if (!media) {
      rows.push({ level: 'risk', title: '缺少广告素材', detail: '请上传 JPG、PNG、WEBP 或 MP4 文件。' });
    } else {
      rows.push({ level: 'pass', title: '文件可以读取', detail: `${media.name} · ${media.sizeMb.toFixed(1)}MB` });
      const ratio = media.width && media.height ? media.width / media.height : 0;
      const nearVertical = Math.abs(ratio - 9 / 16) < 0.04;
      if (media.kind === 'video') {
        rows.push(media.sizeMb <= 500
          ? { level: 'pass', title: '视频体积合理', detail: '文件不超过 500MB，适合进入广告上传流程。' }
          : { level: 'warning', title: '视频文件较大', detail: '建议压缩到 500MB 以内以提升上传稳定性。' });
        rows.push(media.duration && media.duration <= 60
          ? { level: 'pass', title: '短视频时长', detail: `${Math.round(media.duration)} 秒，适合 Reels / TikTok 信息流。` }
          : { level: 'warning', title: '建议缩短视频', detail: '建议将首版广告控制在 60 秒以内。' });
      }
      rows.push(nearVertical
        ? { level: 'pass', title: '竖屏比例 9:16', detail: `${media.width} × ${media.height}，适合移动端全屏展示。` }
        : { level: 'warning', title: '画面不是 9:16', detail: `${media.width} × ${media.height}；短视频投放建议另做 9:16 版本。` });
      rows.push(media.width >= 720 && media.height >= 720
        ? { level: 'pass', title: '清晰度达标', detail: '最短边不少于 720px。' }
        : { level: 'warning', title: '清晰度偏低', detail: '建议使用最短边至少 720px 的素材。' });
    }

    const matched = riskyPatterns.filter((item) => item.pattern.test(copy));
    rows.push(matched.length
      ? { level: 'risk', title: '文案存在政策风险词', detail: `发现：${matched.map((item) => item.label).join('、')}。请结合目标地区政策人工复核。` }
      : { level: 'pass', title: '未命中内置高风险词', detail: copy ? '基础文本规则未发现明显问题。' : '尚未填写文案，仅检查素材规格。' });

    if (landingPage) {
      rows.push(/^https:\/\//i.test(landingPage)
        ? { level: 'pass', title: '落地页使用 HTTPS', detail: '链接协议符合常规安全要求。' }
        : { level: 'warning', title: '落地页不是 HTTPS', detail: '建议使用有效的 HTTPS 落地页。' });
    }
    return rows;
  }, [copy, landingPage, media]);

  const riskCount = checks.filter((item) => item.level === 'risk').length;
  const warningCount = checks.filter((item) => item.level === 'warning').length;

  return (
    <PageContainer>
      <div className='mx-auto w-full max-w-[1450px]'>
        <div className='mb-8'>
          <div className='mb-3 inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300'><IconShieldCheck className='size-4' /> AI + 平台官方能力</div>
          <h1 className='text-3xl font-bold md:text-4xl'>投前检测</h1>
          <p className='mt-3 max-w-4xl text-muted-foreground'>上传广告文案、图片或视频，同时运行本地规则检查，以及 TikTok / Meta 官方账户上下文校验和广告预览。</p>
        </div>

        <div className='mb-6 grid gap-4 md:grid-cols-2'>
          <OfficialStatus icon={<IconBrandTiktok />} name='TikTok 官方投前检测' description={tikTokConnection.connected ? '已连接：创意预审、视频问题检测/自动修复与广告预览均由服务端调用。' : '等待 TikTok for Business 应用配置并授权广告账户。'} ready={tikTokConnection.connected} />
          <OfficialStatus icon={<IconBrandFacebook />} name='Meta Marketing API 校验' description={metaConnection.connected ? `Token 有效，已读取 ${metaConnection.accounts.length} 个广告账户和 ${metaConnection.pages.length} 个 Page。` : metaConnection.error || '等待配置 Meta App 与 Marketing API Token。'} ready={metaConnection.connected} />
        </div>

        {platform === 'tiktok' && (
          <Card className='mb-6 border-orange-500/20 bg-orange-500/[0.035]'>
            <CardContent className='flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2 font-semibold'>
                  <IconBrandTiktok className='size-5' /> TikTok Ads 授权
                  <Badge variant='outline' className={tikTokConnection.connected ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}>
                    {connectionLoading ? '读取中' : tikTokConnection.connected ? '已连接' : tikTokConnection.configured ? '待授权' : '待配置应用'}
                  </Badge>
                </div>
                <p className='mt-1.5 break-all text-sm text-muted-foreground'>回调地址：{tikTokConnection.redirectUri || '尚未配置 PUBLIC_BASE_URL / TIKTOK_REDIRECT_URI'}</p>
              </div>
              {tikTokConnection.connected ? (
                <div className='flex w-full flex-col gap-2 sm:flex-row lg:w-auto'>
                  <Select value={tikTokConnection.selectedAdvertiserId} onValueChange={selectTikTokAdvertiser}>
                    <SelectTrigger className='h-10 min-w-64'><SelectValue placeholder='选择广告账户' /></SelectTrigger>
                    <SelectContent>{tikTokConnection.advertisers.map((account) => <SelectItem key={account.advertiserId} value={account.advertiserId}>{account.advertiserName} · {account.advertiserId}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant='outline' onClick={refreshTikTokAdvertisers} disabled={connectionLoading}><IconRefresh className='size-4' /> 刷新账户</Button>
                  <Button variant='outline' onClick={connectTikTok}>重新授权</Button>
                </div>
              ) : (
                <Button className='bg-orange-500 hover:bg-orange-400' onClick={connectTikTok} disabled={!tikTokConnection.configured || connectionLoading}>连接 TikTok Ads</Button>
              )}
            </CardContent>
          </Card>
        )}

        {platform === 'meta' && (
          <Card className='mb-6 border-blue-500/20 bg-blue-500/[0.035]'>
            <CardContent className='space-y-4 p-5'>
              <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2 font-semibold'>
                    <IconBrandFacebook className='size-5' /> Meta Marketing API
                    <Badge variant='outline' className={metaConnection.connected ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}>
                      {metaConnectionLoading ? '读取中' : metaConnection.connected ? 'Token 有效' : metaConnection.configured ? 'Token 异常' : '待配置'}
                    </Badge>
                  </div>
                  <p className='mt-1.5 text-sm text-muted-foreground'>Graph API {metaConnection.graphVersion}{metaConnection.appId ? ` · App ${metaConnection.appId}` : ''} · validate_only 不会创建或发布广告</p>
                </div>
                <Button variant='outline' onClick={loadMetaConnection} disabled={metaConnectionLoading}><IconRefresh className='size-4' />刷新 Meta 状态</Button>
              </div>
              {metaConnection.error && <div className='rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300'>{metaConnection.error}</div>}
              {metaConnection.connected && (
                <div className='grid gap-3 lg:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>广告账户</Label>
                    <Select value={metaAccountId} onValueChange={setMetaAccountId}>
                      <SelectTrigger className='h-11'><SelectValue placeholder='选择广告账户' /></SelectTrigger>
                      <SelectContent>{metaConnection.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.id} · {account.status === 1 ? '启用' : '停用'}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>Facebook Page 身份</Label>
                    <Select value={metaPageId} onValueChange={setMetaPageId}>
                      <SelectTrigger className='h-11'><SelectValue placeholder='选择 Page' /></SelectTrigger>
                      <SelectContent>{metaConnection.pages.map((page) => <SelectItem key={page.id} value={page.id}>{page.name} · {page.id}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {!metaConnection.accounts.some((account) => account.status === 1) && <p className='text-sm text-amber-300 lg:col-span-2'>当前 Token 下的广告账户全部处于停用状态，官方校验会返回账户或应用状态问题；启用账户后无需改代码。</p>}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className='grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]'>
          <Card className='overflow-hidden border-border bg-card'>
            <CardContent className='space-y-5 p-6'>
              <div className='space-y-2'><Label>检测平台</Label><Select value={platform} onValueChange={(value) => { setPlatform(value as Platform); setChecked(false); }}><SelectTrigger className='h-11'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='tiktok'>TikTok Ads</SelectItem><SelectItem value='meta'>Meta / Facebook / Instagram</SelectItem></SelectContent></Select></div>
              <div className='space-y-2'>
                <Label>广告图片或视频</Label>
                <label className='flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-background/45 transition hover:border-orange-500/50 hover:bg-orange-500/5'>
                  <Input type='file' accept='image/jpeg,image/png,image/webp,video/mp4,video/webm' className='hidden' onChange={readMedia} />
                  {media ? (
                    <div className='flex h-full w-full items-center gap-4 p-4'>
                      {media.kind === 'video' ? <video src={media.previewUrl} muted className='h-36 w-32 rounded-xl bg-black object-contain' /> : <NextImage src={media.previewUrl} alt='待检测素材' width={128} height={144} unoptimized className='h-36 w-32 rounded-xl object-cover' />}
                      <div className='min-w-0 text-left'><div className='truncate font-semibold'>{media.name}</div><div className='mt-2 text-sm text-muted-foreground'>{media.width} × {media.height} · {media.sizeMb.toFixed(1)}MB</div><div className='mt-4 text-xs text-orange-300'>点击重新选择素材</div></div>
                    </div>
                  ) : <><span className='flex size-14 items-center justify-center rounded-full bg-white/5'><IconFileUpload className='size-6' /></span><span className='mt-4 font-semibold'>上传待检测素材</span><span className='mt-1 text-xs text-muted-foreground'>JPG / PNG / WEBP / MP4</span></>}
                </label>
              </div>
              <div className='space-y-2'><Label>广告文案</Label><Textarea value={copy} onChange={(event) => { setCopy(event.target.value); setChecked(false); }} rows={5} placeholder='粘贴标题、正文、字幕或口播文案...' /></div>
              <div className='space-y-2'><Label>落地页（可选）</Label><Input value={landingPage} onChange={(event) => { setLandingPage(event.target.value); setChecked(false); }} placeholder='https://example.com/product' /></div>
              {platform === 'tiktok' && (
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'><Label>品牌展示名</Label><Input value={brandName} maxLength={40} onChange={(event) => setBrandName(event.target.value)} placeholder='WzzAds' /></div>
                  <div className='space-y-2'><Label>目标地区</Label><Select value={locationCode} onValueChange={setLocationCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='US'>美国 US</SelectItem><SelectItem value='GB'>英国 GB</SelectItem><SelectItem value='CA'>加拿大 CA</SelectItem><SelectItem value='AU'>澳大利亚 AU</SelectItem><SelectItem value='DE'>德国 DE</SelectItem><SelectItem value='FR'>法国 FR</SelectItem><SelectItem value='JP'>日本 JP</SelectItem><SelectItem value='KR'>韩国 KR</SelectItem><SelectItem value='SG'>新加坡 SG</SelectItem><SelectItem value='MY'>马来西亚 MY</SelectItem><SelectItem value='TH'>泰国 TH</SelectItem><SelectItem value='VN'>越南 VN</SelectItem></SelectContent></Select></div>
                  <div className='flex items-center gap-2 text-sm sm:col-span-2'><Checkbox id='tiktok-ecommerce' checked={isEcommerce} onCheckedChange={(value) => setIsEcommerce(Boolean(value))} /><Label htmlFor='tiktok-ecommerce'>电商广告（含 GMV Max / Catalog Ads）</Label></div>
                  <p className='text-xs text-muted-foreground sm:col-span-2'>官方广告文案上限 100 字符；视频官方临时上传上限 50MB。连接后点击一次即可上传、预审、Smart Fix 并生成预览。</p>
                </div>
              )}
              {platform === 'meta' && (
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'><Label>广告标题</Label><Input value={brandName} maxLength={255} onChange={(event) => setBrandName(event.target.value)} placeholder='产品名称或广告标题' /></div>
                  <div className='space-y-2'><Label>预览版位</Label><Select value={metaAdFormat} onValueChange={setMetaAdFormat}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='MOBILE_FEED_STANDARD'>Facebook 移动信息流</SelectItem><SelectItem value='INSTAGRAM_STANDARD'>Instagram 信息流</SelectItem><SelectItem value='INSTAGRAM_STORY'>Instagram Story</SelectItem><SelectItem value='INSTAGRAM_REELS'>Instagram Reels</SelectItem><SelectItem value='FACEBOOK_REELS'>Facebook Reels</SelectItem></SelectContent></Select></div>
                  <p className='text-xs text-muted-foreground sm:col-span-2'>官方请求使用 validate_only，不创建广告。图片可连同官方校验；视频本次只校验文案、落地页、Page 和账户，不会擅自在 Meta 素材库创建视频。</p>
                </div>
              )}
              <Button className='h-11 w-full bg-orange-500 hover:bg-orange-400' onClick={runChecks} disabled={officialLoading}>
                <Icons.shieldCheck /> {officialLoading ? `正在提交 ${platform === 'tiktok' ? 'TikTok' : 'Meta'} 官方检测…` : platform === 'tiktok' && tikTokConnection.connected ? '本地 + TikTok 官方检测' : platform === 'meta' && metaConnection.connected ? '本地 + Meta 官方检测' : '开始本地检测'}
              </Button>
            </CardContent>
          </Card>

          <Card className='border-border bg-card'>
            <CardContent className='p-6'>
              <div className='flex items-start justify-between gap-4'>
                <div><h2 className='text-xl font-semibold'>检测结果</h2><p className='mt-1 text-sm text-muted-foreground'>{checked ? `已按 ${platform === 'tiktok' ? 'TikTok' : 'Meta'} 推荐规格和内置规则完成预检` : '填写左侧内容后开始检测'}</p></div>
                {checked && <Badge className={riskCount ? 'bg-red-500/15 text-red-300' : warningCount ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}>{riskCount ? `${riskCount} 项风险` : warningCount ? `${warningCount} 项建议` : '基础检查通过'}</Badge>}
              </div>
              <div className='mt-6 space-y-3'>
                {(checked ? checks : []).map((check) => (
                  <div key={check.title} className={`rounded-xl border p-4 ${check.level === 'risk' ? 'border-red-500/25 bg-red-500/5' : check.level === 'warning' ? 'border-amber-500/25 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                    <div className='flex items-center gap-2 font-semibold'><span className={check.level === 'risk' ? 'text-red-400' : check.level === 'warning' ? 'text-amber-400' : 'text-emerald-400'}>{check.level === 'pass' ? '✓' : check.level === 'warning' ? '!' : '×'}</span>{check.title}</div>
                    <p className='mt-1.5 text-sm leading-6 text-muted-foreground'>{check.detail}</p>
                  </div>
                ))}
                {!checked && <div className='flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center'><IconShieldCheck className='size-10 text-muted-foreground/40' /><div className='mt-4 font-semibold'>等待检测</div><div className='mt-1 max-w-xs text-sm text-muted-foreground'>当前先做本地规格和规则预检，不会把素材提交到广告平台。</div></div>}
              </div>
              {platform === 'tiktok' && (officialLoading || officialError || tikTokRun) && (
                <div className='mt-6 border-t border-border pt-6'>
                  <div className='mb-3 flex items-center gap-2'><IconBrandTiktok className='size-5' /><h3 className='font-semibold'>TikTok 官方结果</h3></div>
                  {officialLoading && <div className='rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-sm text-orange-200'>正在上传素材并创建官方任务，请稍候…</div>}
                  {officialError && <div className='rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300'>{officialError}</div>}
                  {tikTokRun && <TikTokOfficialResults run={tikTokRun} review={reviewResult} fix={fixResult} />}
                </div>
              )}
              {platform === 'meta' && (officialLoading || officialError || metaRun) && (
                <div className='mt-6 border-t border-border pt-6'>
                  <div className='mb-3 flex items-center gap-2'><IconBrandFacebook className='size-5' /><h3 className='font-semibold'>Meta 官方结果</h3></div>
                  {officialLoading && <div className='rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-200'>正在执行 Meta validate_only，请稍候…</div>}
                  {officialError && <div className='rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300'>{officialError}</div>}
                  {metaRun && <MetaOfficialResults run={metaRun} />}
                </div>
              )}
              {checked && <div className='mt-5 rounded-xl bg-background/60 p-4 text-xs leading-6 text-muted-foreground'>{platform === 'tiktok' ? '本地结果仅用于降低常见驳回风险；TikTok Creative Pre-review 是正式广告审核前的官方预审，也不等于最终投放审核通过。' : 'Meta validate_only 只验证当前广告账户、Page、素材结构与参数上下文，不代表广告政策终审通过，也不会创建或发布广告。'}</div>}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function OfficialStatus({ icon, name, description, ready }: { icon: React.ReactNode; name: string; description: string; ready: boolean }) {
  return <div className='flex gap-4 rounded-2xl border border-border bg-card p-5'><span className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-orange-300 [&>svg]:size-6'>{icon}</span><div><div className='flex flex-wrap items-center gap-2'><span className='font-semibold'>{name}</span><Badge variant='outline' className={ready ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}>{ready ? '已连接' : '待授权接入'}</Badge></div><p className='mt-1.5 text-sm leading-6 text-muted-foreground'>{description}</p></div></div>;
}

function TikTokOfficialResults({ run, review, fix }: { run: TikTokRun; review: TikTokReviewResponse | null; fix: TikTokFixResponse | null }) {
  const reviewStatus = review?.data?.task_status || run.preReview.status;
  const reviewRows = review?.data?.pre_review_result_list || [];
  const fixStatus = fix?.data?.status || run.smartFix?.status;
  return (
    <div className='space-y-3'>
      <div className='rounded-xl border border-border bg-background/40 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'><span className='font-semibold'>Creative Pre-review</span><OfficialResultBadge status={reviewStatus} /></div>
        <p className='mt-1 text-xs text-muted-foreground'>任务 ID：{run.preReview.taskId || '未返回'}</p>
        {reviewRows.map((item, index) => (
          <div key={`${item.material_type}-${index}`} className='mt-3 rounded-lg border border-border/70 p-3 text-sm'>
            <div className='flex flex-wrap items-center gap-2'><Badge variant='outline'>{item.material_type}</Badge><OfficialResultBadge status={item.pre_review_status} /><span className='text-xs text-muted-foreground'>{item.location_code}</span></div>
            {item.reject_info_list?.map((reason, reasonIndex) => <div key={reasonIndex} className='mt-2 text-red-300'><div>{reason.reason || '未通过官方预审'}</div>{reason.suggestion && <div className='mt-1 text-muted-foreground'>建议：{reason.suggestion}</div>}</div>)}
          </div>
        ))}
      </div>

      {run.smartFix && (
        <div className='rounded-xl border border-border bg-background/40 p-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'><span className='font-semibold'>Smart Fix 视频检测/修复</span><OfficialResultBadge status={fixStatus || 'UNAVAILABLE'} /></div>
          {run.smartFix.flawTypes.length > 0 && <p className='mt-2 text-sm text-amber-300'>检测到：{run.smartFix.flawTypes.join('、')}</p>}
          {fix?.data?.error_msg && <p className='mt-2 text-sm text-red-300'>{fix.data.error_msg}</p>}
          {fix?.data?.videos?.map((video) => <a key={video.video_id} href={video.video_url} target='_blank' rel='noreferrer' className='mt-3 flex items-center gap-2 text-sm text-orange-300 hover:underline'><IconExternalLink className='size-4' />查看已修复视频 · {video.video_id}</a>)}
          {fixStatus === 'NO_ISSUE' && <p className='mt-2 text-sm text-emerald-300'>未检测到需要自动修复的分辨率或画幅问题。</p>}
        </div>
      )}

      <div className='rounded-xl border border-border bg-background/40 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'><span className='font-semibold'>广告预览</span><OfficialResultBadge status={run.preview?.url ? 'SUCCESS' : run.preview?.error ? 'FAILED' : 'UNAVAILABLE'} /></div>
        {run.preview?.url && <a href={run.preview.url} target='_blank' rel='noreferrer' className='mt-3 inline-flex items-center gap-2 text-sm text-orange-300 hover:underline'><IconExternalLink className='size-4' />打开 TikTok 官方预览（24 小时有效）</a>}
        {run.preview?.tips?.flatMap((tip) => tip.messages || []).map((message, index) => <p key={index} className='mt-2 text-sm text-amber-300'>{message}</p>)}
        {run.preview?.error && <p className='mt-2 text-sm text-muted-foreground'>预览未生成：{run.preview.error}</p>}
        {!run.preview && <p className='mt-2 text-sm text-muted-foreground'>填写广告文案并上传素材后可生成官方预览。</p>}
      </div>
    </div>
  );
}

function MetaOfficialResults({ run }: { run: MetaRun }) {
  const error = run.validation.error;
  return (
    <div className='space-y-3'>
      <div className='rounded-xl border border-border bg-background/40 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'><span className='font-semibold'>广告创意 validate_only</span><OfficialResultBadge status={run.validation.status} /></div>
        <p className='mt-2 text-sm text-muted-foreground'>账户：{run.adAccount.name} · {run.adAccount.id}</p>
        <p className='mt-1 text-sm text-muted-foreground'>Page：{run.page.name} · {run.page.id}</p>
        <p className='mt-1 text-xs text-emerald-300'>未创建广告、广告组或广告系列</p>
        {error && (
          <div className='mt-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm'>
            <div className='font-semibold text-red-300'>{error.title || 'Meta 官方校验未通过'}</div>
            <p className='mt-1.5 leading-6 text-red-200'>{error.userMessage || error.message}</p>
            {(error.code || error.subcode) && <p className='mt-2 text-xs text-muted-foreground'>Meta 错误码：{error.code || '-'} / {error.subcode || '-'}</p>}
          </div>
        )}
      </div>
      {run.warnings.map((warning) => <div key={warning} className='rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-200'>{warning}</div>)}
      <div className='rounded-xl border border-border bg-background/40 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'><span className='font-semibold'>Meta 广告预览</span><OfficialResultBadge status={run.preview?.status || 'UNAVAILABLE'} /></div>
        {run.preview?.url && <a href={run.preview.url} target='_blank' rel='noreferrer' className='mt-3 inline-flex items-center gap-2 text-sm text-orange-300 hover:underline'><IconExternalLink className='size-4' />打开 Meta 官方预览</a>}
        {run.preview?.error && <p className='mt-2 text-sm text-muted-foreground'>预览未生成：{run.preview.error.userMessage || run.preview.error.message}</p>}
        {!run.preview && <p className='mt-2 text-sm text-muted-foreground'>validate_only 通过后才生成官方预览。</p>}
      </div>
    </div>
  );
}

function OfficialResultBadge({ status }: { status?: string }) {
  const normalized = String(status || 'PROCESSING').toUpperCase();
  const success = ['SUCCESS', 'APPROVED', 'NO_ISSUE', 'PASSED'].includes(normalized);
  const danger = ['FAILED', 'REJECTED'].includes(normalized);
  const label: Record<string, string> = { PROCESSING: '处理中', SUCCESS: '已完成', PASSED: '校验通过', APPROVED: '通过', REJECTED: '未通过', UNSURE: '无法确定', UNAVAILABLE: '不可用', FAILED: '失败', NO_ISSUE: '无需修复' };
  return <Badge variant='outline' className={success ? 'border-emerald-500/30 text-emerald-300' : danger ? 'border-red-500/30 text-red-300' : 'border-amber-500/30 text-amber-300'}>{label[normalized] || normalized}</Badge>;
}

function inspectMedia(file: File, previewUrl: string, kind: 'image' | 'video') {
  return new Promise<MediaInfo>((resolve) => {
    if (kind === 'image') {
      const image = new Image();
      image.onload = () => resolve({ name: file.name, kind, mimeType: file.type, sizeMb: file.size / 1024 / 1024, width: image.naturalWidth, height: image.naturalHeight, previewUrl, file });
      image.onerror = () => resolve({ name: file.name, kind, mimeType: file.type, sizeMb: file.size / 1024 / 1024, width: 0, height: 0, previewUrl, file });
      image.src = previewUrl;
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve({ name: file.name, kind, mimeType: file.type, sizeMb: file.size / 1024 / 1024, width: video.videoWidth, height: video.videoHeight, duration: video.duration, previewUrl, file });
    video.onerror = () => resolve({ name: file.name, kind, mimeType: file.type, sizeMb: file.size / 1024 / 1024, width: 0, height: 0, previewUrl, file });
    video.src = previewUrl;
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('素材读取失败'));
    reader.readAsDataURL(file);
  });
}
