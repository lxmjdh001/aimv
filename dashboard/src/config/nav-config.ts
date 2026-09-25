import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: '',
    items: [
      {
        title: '灵感画布',
        url: '/dashboard/canvas',
        icon: 'canvas',
        shortcut: ['c', 'c'],
        items: []
      },
      {
        title: '首页',
        url: '/dashboard/home',
        icon: 'home',
        shortcut: ['h', 'h'],
        items: []
      },
      {
        title: '投前检测',
        url: '/dashboard/preflight',
        icon: 'shieldCheck',
        shortcut: ['p', 'p'],
        items: []
      },
      {
        title: 'AI 工具',
        url: '/dashboard/tools',
        icon: 'apps',
        shortcut: ['t', 't'],
        items: []
      },
      {
        title: 'Meta 工具',
        url: '/dashboard/meta-tools',
        icon: 'meta',
        shortcut: ['m', 'm'],
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
      },
      {
        title: '积分管理',
        url: '/dashboard/points',
        icon: 'creditCard',
        items: [],
        access: { role: 'admin' }
      }
    ]
  }
];
