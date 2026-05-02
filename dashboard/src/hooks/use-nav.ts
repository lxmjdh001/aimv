'use client';

import { useMemo } from 'react';
import type { NavItem, NavGroup } from '@/types';
import { useAuth } from '@/lib/auth-client';

function canAccess(item: NavItem, role?: string) {
  if (!item.access?.role) return true;
  return item.access.role === role;
}

export function useFilteredNavItems(items: NavItem[]) {
  const { user } = useAuth();
  return useMemo(() => {
    return items
      .filter((item) => canAccess(item, user?.role))
      .map((item) => ({
        ...item,
        items: item.items?.filter((child) => canAccess(child, user?.role)) ?? []
      }));
  }, [items, user?.role]);
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  const { user } = useAuth();
  return useMemo(() => {
    return groups
      .map((group) => ({
        ...group,
        items: group.items
          .filter((item) => canAccess(item, user?.role))
          .map((item) => ({
            ...item,
            items: item.items?.filter((child) => canAccess(child, user?.role)) ?? []
          }))
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, user?.role]);
}
