'use client';

import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/api-client';
import { CreativeJob, CreativeProject, jobToAssets } from '@/lib/creative-types';
import { IconFolder, IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export default function CanvasPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<CreativeProject | null>(null);
  const [title, setTitle] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [projectRows, jobRows] = await Promise.all([
        apiRequest<CreativeProject[]>('/api/projects'),
        apiRequest<CreativeJob[]>('/api/jobs?limit=200')
      ]);
      setProjects(projectRows);
      setJobs(jobRows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const covers = useMemo(() => {
    const result = new Map<string, string>();
    for (const job of jobs) {
      const projectId = String(job.input?.projectId || '');
      const asset = jobToAssets(job)[0];
      if (projectId && asset && !result.has(projectId)) result.set(projectId, asset.url);
    }
    return result;
  }, [jobs]);

  async function createProject() {
    if (creating) return;
    setCreating(true);
    try {
      const project = await apiRequest<CreativeProject>('/api/projects', { method: 'POST', body: JSON.stringify({ title: '未命名项目' }) });
      router.push(`/dashboard/canvas/${project.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function saveRename() {
    if (!renaming) return;
    await apiRequest(`/api/projects/${renaming.id}`, { method: 'PUT', body: JSON.stringify({ title }) });
    setRenaming(null);
    await load();
  }

  async function removeProject(project: CreativeProject) {
    if (!window.confirm(`删除项目“${project.title}”？已生成的素材仍会保留在素材库。`)) return;
    await apiRequest(`/api/projects/${project.id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <PageContainer>
      <div className='mx-auto w-full max-w-[1500px]'>
        <div className='mb-8 flex items-end justify-between gap-4'>
          <div><h1 className='text-3xl font-bold md:text-4xl'>灵感画布</h1><p className='mt-2 text-muted-foreground'>每个项目都是一段创作对话，可持续生成图片和视频素材。</p></div>
          <Button onClick={createProject} disabled={creating} className='bg-orange-500 hover:bg-orange-400'><IconPlus /> 新建项目</Button>
        </div>

        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'>
          <button onClick={createProject} disabled={creating} className='group flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 transition hover:border-orange-500/60 hover:bg-orange-500/5'>
            <span className='flex size-14 items-center justify-center rounded-full bg-white/5 transition group-hover:bg-orange-500 group-hover:text-white'><IconPlus className='size-7' /></span>
            <span className='mt-4 font-semibold'>{creating ? '创建中...' : '创建新对话'}</span>
          </button>

          {projects.map((project, index) => {
            const cover = project.coverUrl || covers.get(project.id);
            return (
              <div key={project.id} className='group overflow-hidden rounded-2xl border border-border bg-card transition hover:-translate-y-1 hover:border-orange-500/45'>
                <button onClick={() => router.push(`/dashboard/canvas/${project.id}`)} className='block aspect-[4/3] w-full overflow-hidden text-left'>
                  {cover ? <img src={cover} alt={project.title} className='h-full w-full object-cover transition duration-500 group-hover:scale-105' /> : (
                    <div className={`flex h-full items-center justify-center bg-gradient-to-br ${index % 2 ? 'from-cyan-950 to-card' : 'from-orange-950/60 to-card'}`}><IconFolder className='size-14 text-white/25' /></div>
                  )}
                </button>
                <div className='flex items-start justify-between gap-2 p-4'>
                  <button onClick={() => router.push(`/dashboard/canvas/${project.id}`)} className='min-w-0 flex-1 text-left'>
                    <div className='truncate font-semibold'>{project.title}</div>
                    <div className='mt-1 text-xs text-muted-foreground'>最后编辑于 {new Date(project.updatedAt).toLocaleDateString('zh-CN')}</div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant='ghost' size='icon' className='size-8'><Icons.ellipsis /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem onClick={() => { setRenaming(project); setTitle(project.title); }}><Icons.edit /> 重命名</DropdownMenuItem>
                      <DropdownMenuItem className='text-destructive' onClick={() => removeProject(project)}><Icons.trash /> 删除项目</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        {!loading && projects.length === 0 && <div className='mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground'>还没有创作项目，点击“创建新对话”开始第一条广告素材。</div>}
      </div>

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>重命名项目</DialogTitle></DialogHeader>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} onKeyDown={(event) => event.key === 'Enter' && saveRename()} />
          <DialogFooter><Button variant='outline' onClick={() => setRenaming(null)}>取消</Button><Button onClick={saveRename}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
