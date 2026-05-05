import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Define the base Next.js configuration
const baseConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'clerk.com',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  async rewrites() {
    const apiServer = process.env.AI_MV_API_SERVER || 'http://127.0.0.1:3000';
    return [
      { source: '/api/auth/:path*', destination: `${apiServer}/api/auth/:path*` },
      { source: '/api/providers', destination: `${apiServer}/api/providers` },
      { source: '/api/providers/:path*', destination: `${apiServer}/api/providers/:path*` },
      { source: '/api/admin/:path*', destination: `${apiServer}/api/admin/:path*` },
      { source: '/api/models', destination: `${apiServer}/api/models` },
      { source: '/api/jobs', destination: `${apiServer}/api/jobs` },
      { source: '/api/jobs/:path*', destination: `${apiServer}/api/jobs/:path*` },
      { source: '/outputs/:path*', destination: `${apiServer}/outputs/:path*` },
      { source: '/uploads/:path*', destination: `${apiServer}/uploads/:path*` }
    ];
  }
};

let configWithPlugins = baseConfig;

// Conditionally enable Sentry configuration
if (!process.env.NEXT_PUBLIC_SENTRY_DISABLED) {
  configWithPlugins = withSentryConfig(configWithPlugins, {
    org: process.env.NEXT_PUBLIC_SENTRY_ORG,
    project: process.env.NEXT_PUBLIC_SENTRY_PROJECT,
    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    tunnelRoute: '/monitoring',

    // Disable Sentry telemetry
    telemetry: false,

    // Sentry v10: moved under webpack namespace
    webpack: {
      reactComponentAnnotation: {
        enabled: true
      },
      treeshake: {
        removeDebugLogging: true
      }
    },

    // Disable source map upload when org/project are not configured
    sourcemaps: {
      disable: !process.env.NEXT_PUBLIC_SENTRY_ORG || !process.env.NEXT_PUBLIC_SENTRY_PROJECT
    }
  });
}

const nextConfig = configWithPlugins;
export default nextConfig;
