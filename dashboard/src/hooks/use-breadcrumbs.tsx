'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

type BreadcrumbItem = {
  title: string;
  link: string;
};

const segmentLabels: Record<string, string> = {
  dashboard: 'AI Creative',
  home: '首页',
  canvas: '灵感画布',
  preflight: '投前检测',
  tools: 'AI 工具',
  'meta-tools': 'Meta 工具',
  billing: '我的积分',
  profile: '账户设置',
  'model-settings': '模型配置',
  users: '用户管理',
  points: '积分管理',
  jobs: '任务记录',
  assets: '素材库'
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        title: segmentLabels[segment] ?? (segments[index - 1] === 'canvas' ? '创作对话' : segment),
        link: path
      };
    });
  }, [pathname]);

  return breadcrumbs;
}
