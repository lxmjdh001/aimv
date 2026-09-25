'use client';

import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { apiRequest } from '@/lib/api-client';
import type { CreativeProject } from '@/lib/creative-types';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const CreativeCanvas = dynamic(
  () => import('@/features/canvas/components/creative-canvas'),
  { ssr: false, loading: () => <CanvasLoading /> }
);

export default function CanvasProjectPage() {
  const { projectId: rawProjectId } = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(rawProjectId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const creatingRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (projectId !== 'new' || creatingRef.current) return;
    creatingRef.current = true;
    apiRequest<CreativeProject>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        title: searchParams.get('mode') === 'reels' ? 'Meta Reels 创意' : '未命名项目'
      })
    })
      .then((created) => {
        const query = new URLSearchParams(searchParams.toString());
        router.replace(`/dashboard/canvas/${created.id}${query.size ? `?${query}` : ''}`);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '创建项目失败'));
  }, [projectId, router, searchParams]);

  if (projectId === 'new') {
    return error ? (
      <PageContainer>
        <div className='flex min-h-[70vh] items-center justify-center text-red-300'>{error}</div>
      </PageContainer>
    ) : <CanvasLoading />;
  }

  return <CreativeCanvas projectId={projectId} />;
}

function CanvasLoading() {
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-[#08090b] text-zinc-400'>
      <Icons.spinner className='mr-3 size-5 animate-spin text-orange-400' /> 正在打开专业画布...
    </div>
  );
}
