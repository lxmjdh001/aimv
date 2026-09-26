import { Button } from '@/components/ui/button';
export function AssetPagination({ page, hasMore, loading, onChange }: { page: number; hasMore: boolean; loading: boolean; onChange: (page: number) => void }) {
  return <div className='flex items-center justify-center gap-4 py-6 text-sm text-muted-foreground'>
    <Button variant='outline' size='sm' disabled={page === 0 || loading} onClick={() => onChange(page - 1)}>上一页</Button>
    <span>第 {page + 1} 页 · 每页 12 个</span>
    <Button variant='outline' size='sm' disabled={!hasMore || loading} onClick={() => onChange(page + 1)}>下一页</Button>
  </div>;
}
