import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'AI 工作台',
    items: [
      {
        title: '数据概览',
        url: '/dashboard/overview',
        icon: 'dashboard',
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'AI 素材生成',
        url: '/dashboard/generate',
        icon: 'sparkles',
        shortcut: ['g', 'g'],
        items: []
      },
      {
        title: '素材库',
        url: '/dashboard/assets',
        icon: 'media',
        shortcut: ['a', 'a'],
        items: []
      },
      {
        title: '任务记录',
        url: '/dashboard/jobs',
        icon: 'clock',
        shortcut: ['j', 'j'],
        items: []
      }
    ]
  },
  {
    label: '系统管理',
    items: [
      {
        title: '模型配置',
        url: '/dashboard/model-settings',
        icon: 'settings',
        items: [],
        access: { role: 'admin' }
      },
      {
        title: '用户管理',
        url: '/dashboard/users',
        icon: 'teams',
        items: [],
        access: { role: 'admin' }
      }
    ]
  },
  {
    label: '账户',
    items: [
      {
        title: '我的余额',
        url: '/dashboard/billing',
        icon: 'creditCard',
        items: []
      },
      {
        title: '账户设置',
        url: '/dashboard/profile',
        icon: 'account',
        items: []
      }
    ]
  }
];
