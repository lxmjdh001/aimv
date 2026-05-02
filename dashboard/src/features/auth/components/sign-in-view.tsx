'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-client';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { InteractiveGridPattern } from './interactive-grid';

export default function SignInViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refresh } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('admin@7c.local');
  const [password, setPassword] = useState('7cadmin123');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadCaptcha() {
    setCaptchaError('');
    try {
      const captcha = await apiRequest<{ id: string; question: string }>('/api/auth/captcha');
      setCaptchaId(captcha.id);
      setCaptchaQuestion(captcha.question);
      setCaptchaAnswer('');
    } catch {
      setCaptchaId('');
      setCaptchaQuestion('');
      setCaptchaError('验证码加载失败，请刷新或联系管理员');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(searchParams.get('redirect') || '/dashboard/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }


  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
          captchaId,
          captchaAnswer
        })
      });
      await refresh();
      router.replace(searchParams.get('redirect') || '/dashboard/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
      await loadCaptcha().catch(() => null);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    loadCaptcha().catch(() => null);
  }, []);

  return (
    <div className='relative flex min-h-screen flex-col items-center justify-center overflow-hidden md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <Link
        href='/dashboard/overview'
        className={cn(
          buttonVariants({ variant: 'ghost' }),
          'absolute top-4 right-4 hidden md:top-8 md:right-8'
        )}
      >
        控制台
      </Link>
      <div className='relative hidden h-full flex-col p-10 lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-sidebar' />
        <div className='text-sidebar-foreground relative z-20 flex items-center text-lg font-medium'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='mr-2 h-6 w-6'
          >
            <path d='M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3' />
          </svg>
          AI MV SaaS
        </div>
        <InteractiveGridPattern
          className={cn(
            'mask-[radial-gradient(400px_circle_at_center,white,transparent)]',
            'inset-x-0 inset-y-[0%] h-full skew-y-12'
          )}
        />
        <div className='text-sidebar-foreground relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg'>
              “把文案、图片和视频生成流程集中到一个后台，为 TikTok 广告批量生产素材。”
            </p>
            <footer className='text-sidebar-foreground/70 text-sm'>AI Creative Platform</footer>
          </blockquote>
        </div>
      </div>
      <div className='flex h-full items-center justify-center p-4 lg:p-8'>
        <div className='flex w-full max-w-md flex-col items-center justify-center space-y-6'>
          <div className='inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-sm font-medium shadow-xs'>
            AI MV SaaS 控制台
          </div>
          <Card className='w-full border-border/70 shadow-xl'>
            <CardHeader className='space-y-1'>
              <CardTitle className='text-2xl'>{mode === 'login' ? '登录 AI MV' : '注册 AI MV'}</CardTitle>
              <CardDescription>使用 SQLite 自建账号登录，区分管理员和客户权限。</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={(value) => { setMode(value as 'login' | 'register'); setError(''); if (value === 'register') loadCaptcha().catch(() => null); }}>
                <TabsList className='grid w-full grid-cols-2'>
                  <TabsTrigger value='login'>登录</TabsTrigger>
                  <TabsTrigger value='register'>注册</TabsTrigger>
                </TabsList>
                <TabsContent value='login' className='mt-4'>
                  <form onSubmit={handleSubmit} className='space-y-4'>
                    <div className='space-y-2'>
                      <Label htmlFor='email'>邮箱</Label>
                      <Input id='email' type='email' value={email} onChange={(event) => setEmail(event.target.value)} placeholder='admin@7c.local' required />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='password'>密码</Label>
                      <Input id='password' type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder='请输入密码' required />
                    </div>
                    {error && mode === 'login' && <div className='text-sm text-destructive'>{error}</div>}
                    <Button className='w-full' type='submit' disabled={submitting}>
                      {submitting ? '登录中...' : '登录'}
                    </Button>
                  </form>
                  <div className='text-muted-foreground mt-4 rounded-md bg-muted p-3 text-xs'>
                    默认管理员：admin@7c.local / 7cadmin123。上线前请修改默认密码。
                  </div>
                </TabsContent>
                <TabsContent value='register' className='mt-4'>
                  <form onSubmit={handleRegister} className='space-y-4'>
                    <div className='space-y-2'>
                      <Label htmlFor='register-email'>邮箱</Label>
                      <Input id='register-email' type='email' value={registerEmail} onChange={(event) => setRegisterEmail(event.target.value)} placeholder='you@example.com' required />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='register-password'>密码</Label>
                      <Input id='register-password' type='password' value={registerPassword} onChange={(event) => setRegisterPassword(event.target.value)} placeholder='至少 8 位' minLength={8} required />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='captcha'>验证码</Label>
                      <div className='flex gap-2'>
                        <div className='flex min-w-28 items-center justify-center rounded-md border border-border bg-muted px-3 text-sm font-medium'>{captchaQuestion || (captchaError ? '加载失败' : '加载中...')}</div>
                        <Input id='captcha' value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value)} placeholder='答案' required />
                        <Button type='button' variant='outline' onClick={loadCaptcha}>换一题</Button>
                      </div>
                    </div>
                    {captchaError && <div className='text-sm text-destructive'>{captchaError}</div>}
                    {error && mode === 'register' && <div className='text-sm text-destructive'>{error}</div>}
                    <Button className='w-full' type='submit' disabled={submitting || !captchaId}>
                      {submitting ? '注册中...' : '注册并登录'}
                    </Button>
                  </form>
                  <div className='text-muted-foreground mt-4 rounded-md bg-muted p-3 text-xs'>
                    注册用户默认为客户权限；管理员可在后台用户管理中调整。
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <p className='text-muted-foreground px-8 text-center text-sm'>
            登录后将进入保留 Fantastic / shadcn 风格的 SaaS 控制台。
          </p>
        </div>
      </div>
    </div>
  );
}
