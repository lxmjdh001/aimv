'use client';

import PageContainer from '@/components/layout/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  IconBrandTiktok, IconChartBar, IconFileText, IconLanguage, IconMicrophone,
  IconMovie, IconPhoto, IconPhotoEdit, IconRobot, IconScissors, IconShieldCheck,
  IconSparkles, IconSubtask, IconTextCaption, IconVideo
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const tools = [
  { id: 'preflight', title: '投前检测', desc: '检查 TikTok、Meta 广告素材的规格与常见政策风险。', category: '检测工具', icon: IconShieldCheck, color: 'from-cyan-600 to-blue-950', href: '/dashboard/preflight' },
  { id: 'video-analysis', title: '视频内容分析', desc: '提取镜头、卖点、字幕和内容节奏，输出优化建议。', category: '检测工具', icon: IconChartBar, color: 'from-sky-500 to-slate-950' },
  { id: 'image-analysis', title: '图片内容分析', desc: '分析视觉层级、商品主体和广告信息表达。', category: '检测工具', icon: IconPhotoEdit, color: 'from-emerald-500 to-slate-950' },
  { id: 'localize', title: 'AI 本地化翻译', desc: '为跨境广告改写自然、符合当地语境的文案。', category: '优化工具', icon: IconLanguage, color: 'from-orange-500 to-rose-950' },
  { id: 'video-translate', title: '视频多语言翻译', desc: '字幕翻译、配音与多地区广告版本管理。', category: '优化工具', icon: IconMicrophone, color: 'from-violet-500 to-indigo-950' },
  { id: 'text-image', title: '文生图', desc: '通过文字描述生成高质量广告图片和商品场景。', category: '创意工具', icon: IconPhoto, color: 'from-fuchsia-500 to-indigo-950', href: '/dashboard/canvas/new?tool=image' },
  { id: 'image-image', title: '图生图', desc: '上传参考图，通过对话生成新的风格和内容版本。', category: '创意工具', icon: IconPhotoEdit, color: 'from-cyan-500 to-violet-950', href: '/dashboard/canvas/new?tool=image' },
  { id: 'script', title: '创意视频脚本', desc: '围绕商品卖点生成短视频结构、镜头和口播脚本。', category: '创意工具', icon: IconFileText, color: 'from-amber-500 to-orange-950', href: '/dashboard/canvas/new?tool=video' },
  { id: 'voice', title: '语音合成', desc: '将广告文本转换为自然流畅的多语言语音。', category: '创意工具', icon: IconMicrophone, color: 'from-pink-500 to-purple-950' },
  { id: 'clone', title: '语音克隆', desc: '使用授权音色制作一致的多语言广告配音。', category: '创意工具', icon: IconRobot, color: 'from-blue-500 to-violet-950' },
  { id: 'text-video', title: '文生视频', desc: '通过文字描述直接生成动态广告视频。', category: '创意工具', icon: IconVideo, color: 'from-indigo-500 to-slate-950', href: '/dashboard/canvas/new?tool=video' },
  { id: 'image-video', title: '图生视频', desc: '上传商品图片，把静态画面转成生动短视频。', category: '创意工具', icon: IconMovie, color: 'from-orange-500 to-violet-950', href: '/dashboard/canvas/new?tool=video' },
  { id: 'remix', title: '视频混剪', desc: '组合商品素材，快速生成多个短视频变体。', category: '优化工具', icon: IconScissors, color: 'from-purple-500 to-slate-950' },
  { id: 'subtitle', title: '字幕擦除', desc: '识别并移除硬编码字幕，便于素材二次创作。', category: '优化工具', icon: IconTextCaption, color: 'from-amber-500 to-slate-950' },
  { id: 'tiktok-script', title: '跨境电商脚本', desc: '输入商品信息，一键生成 TikTok 爆款脚本方向。', category: '创意工具', icon: IconBrandTiktok, color: 'from-cyan-500 via-fuchsia-600 to-slate-950', href: '/dashboard/canvas/new?tool=video' }
];

const categories = ['全部', '检测工具', '优化工具', '创意工具'];

export default function ToolsPage() {
  const router = useRouter();
  const [category, setCategory] = useState('全部');
  const visible = category === '全部' ? tools : tools.filter((tool) => tool.category === category);
  return (
    <PageContainer>
      <div className='mx-auto w-full max-w-[1560px]'>
        <div className='mb-8'><div className='mb-3 inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300'><IconSparkles className='size-4' /> Creative toolkit</div><h1 className='text-3xl font-bold md:text-4xl'>AI 工具</h1><p className='mt-3 text-muted-foreground'>选择任务类型，进入对应的创作或检测入口。</p></div>
        <div className='mb-7 inline-flex flex-wrap rounded-xl border border-border bg-card p-1'>
          {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-lg px-5 py-2 text-sm font-medium transition ${category === item ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:text-white'}`}>{item}</button>)}
        </div>
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'>
          {visible.map((tool) => {
            const Icon = tool.icon;
            return <button key={tool.id} onClick={() => tool.href && router.push(tool.href)} className={`group overflow-hidden rounded-2xl border border-border bg-card text-left transition ${tool.href ? 'hover:-translate-y-1 hover:border-orange-500/50' : 'cursor-default opacity-75'}`}>
              <div className={`relative flex aspect-[16/9] items-center justify-center overflow-hidden bg-gradient-to-br ${tool.color}`}><div className='absolute inset-0 creative-grid opacity-20' /><Icon className='relative size-14 text-white/90 transition duration-300 group-hover:scale-110' /><Badge className='absolute right-3 top-3 border-white/10 bg-black/35 text-white'>{tool.category.replace('工具', '')}</Badge></div>
              <div className='p-5'><div className='flex items-center justify-between gap-2'><h2 className='text-lg font-semibold'>{tool.title}</h2>{tool.href ? <span className='text-orange-400'>→</span> : <Badge variant='outline' className='text-[10px] text-muted-foreground'>规划中</Badge>}</div><p className='mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground'>{tool.desc}</p></div>
            </button>;
          })}
        </div>
        <div className='mt-8 flex items-center justify-between rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5'><div><div className='font-semibold'>不知道选择哪个工具？</div><div className='mt-1 text-sm text-muted-foreground'>直接进入灵感画布，用一句话描述目标。</div></div><Button onClick={() => router.push('/dashboard/canvas/new')} className='bg-orange-500 hover:bg-orange-400'><IconSubtask /> 创意助手</Button></div>
      </div>
    </PageContainer>
  );
}
