'use client';

import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { IconBrandFacebook, IconFileText, IconMovie, IconShieldCheck } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

const metaTools = [
  { title: 'Reels 素材检测', desc: '检查 Meta Reels 图片、视频、文案和落地页的基础投放风险。', icon: IconShieldCheck, gradient: 'from-blue-600 via-indigo-700 to-slate-950', href: '/dashboard/preflight?platform=meta', tag: '可使用' },
  { title: 'Reels 脚本生成', desc: '围绕前三秒钩子、产品卖点与行动号召生成竖屏短视频创意。', icon: IconFileText, gradient: 'from-violet-600 via-fuchsia-700 to-slate-950', href: '/dashboard/canvas/new?tool=video&mode=reels', tag: '可使用' },
  { title: 'Reels 创意工作台', desc: '从图片或文字开始生成 Reels 素材，并在同一项目中持续迭代。', icon: IconMovie, gradient: 'from-orange-500 via-rose-600 to-purple-950', href: '/dashboard/canvas/new?tool=video&mode=reels', tag: '可使用' }
];

export default function MetaToolsPage() {
  const router = useRouter();
  return (
    <PageContainer>
      <div className='mx-auto w-full max-w-[1450px]'>
        <div className='mb-9'>
          <div className='mb-3 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300'><IconBrandFacebook className='size-4' /> Meta creative suite</div>
          <h1 className='text-3xl font-bold md:text-4xl'>Meta 工具</h1>
          <p className='mt-3 text-muted-foreground'>为 Facebook 和 Instagram Reels 准备的创意生成、检查与版本迭代入口。</p>
        </div>
        <div className='grid gap-6 md:grid-cols-2 xl:grid-cols-3'>
          {metaTools.map((tool) => {
            const Icon = tool.icon;
            return <button key={tool.title} onClick={() => router.push(tool.href)} className='group overflow-hidden rounded-3xl border border-border bg-card text-left transition hover:-translate-y-1 hover:border-blue-500/50'>
              <div className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br ${tool.gradient}`}><div className='absolute inset-0 creative-grid opacity-20' /><span className='relative flex size-20 items-center justify-center rounded-3xl border border-white/10 bg-black/25 backdrop-blur'><Icon className='size-10 text-white' /></span><Badge className='absolute right-4 top-4 bg-white/12 text-white'>{tool.tag}</Badge></div>
              <div className='p-6'><h2 className='text-xl font-semibold'>{tool.title}</h2><p className='mt-2 text-sm leading-6 text-muted-foreground'>{tool.desc}</p><div className='mt-5 text-sm font-semibold text-blue-300'>打开工具 →</div></div>
            </button>;
          })}
        </div>
        <div className='mt-8 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 text-sm leading-7 text-muted-foreground'><span className='font-semibold text-foreground'>官方 API 规划：</span>当前先提供生成和本地规则预检；连接 Meta 开发者应用与广告账户后，可增加广告创意预览、validate_only 校验和审核状态同步。</div>
      </div>
    </PageContainer>
  );
}
