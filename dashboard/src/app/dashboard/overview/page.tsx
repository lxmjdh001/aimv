import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const stats = [
  { title: '文案生图', value: 'GPT Image 2', desc: 'OpenAI 文生图模型' },
  { title: '文生视频', value: 'HappyHorse T2V', desc: '阿里百炼异步视频' },
  { title: '图生视频', value: 'HappyHorse I2V', desc: '首帧图驱动视频' },
  { title: '权限模式', value: 'SQLite RBAC', desc: '管理员 / 客户' }
];

export default function OverviewPage() {
  return (
    <PageContainer pageTitle='数据概览' pageDescription='AI 广告素材生成 SaaS 工作台'>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {stats.map((item) => (
          <Card key={item.title}>
            <CardHeader className='pb-2'>
              <CardDescription>{item.title}</CardDescription>
              <CardTitle className='text-2xl'>{item.value}</CardTitle>
            </CardHeader>
            <CardContent className='text-muted-foreground text-sm'>{item.desc}</CardContent>
          </Card>
        ))}
      </div>
      <div className='mt-4 grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>素材生产流程</CardTitle>
            <CardDescription>从广告 Prompt 到图片/视频素材的统一入口。</CardDescription>
          </CardHeader>
          <CardContent className='text-muted-foreground space-y-2 text-sm'>
            <p>1. 客户在「AI 素材生成」提交 Prompt。</p>
            <p>2. 后端读取管理员配置的模型 API Key。</p>
            <p>3. 生成结果保存到素材库和任务记录。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>角色权限</CardTitle>
            <CardDescription>管理员管理系统，客户只生成和查看自己的素材。</CardDescription>
          </CardHeader>
          <CardContent className='text-muted-foreground space-y-2 text-sm'>
            <p>管理员：模型配置、用户管理、全部任务。</p>
            <p>客户：AI 素材生成、素材库、个人任务。</p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
