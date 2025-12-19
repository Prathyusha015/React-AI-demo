import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack config for production builds
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Exclude ffmpeg and related packages from client-side bundling
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'fluent-ffmpeg': false,
        '@ffmpeg-installer/ffmpeg': false,
        '@ffmpeg-installer/win32-x64': false,
        '@ffmpeg-installer/win32-ia32': false,
        '@ffmpeg-installer/darwin-x64': false,
        '@ffmpeg-installer/darwin-arm64': false,
        '@ffmpeg-installer/linux-x64': false,
        '@ffmpeg-installer/linux-ia32': false,
        '@ffmpeg-installer/linux-arm64': false,
        '@ffmpeg-installer/linux-arm': false,
      };
    } else {
      // For server-side, mark as external to prevent bundling
      config.externals = config.externals || [];
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals];
      externals.push({
        '@ffmpeg-installer/ffmpeg': 'commonjs @ffmpeg-installer/ffmpeg',
        '@ffmpeg-installer/win32-x64': 'commonjs @ffmpeg-installer/win32-x64',
        '@ffmpeg-installer/win32-ia32': 'commonjs @ffmpeg-installer/win32-ia32',
        '@ffmpeg-installer/darwin-x64': 'commonjs @ffmpeg-installer/darwin-x64',
        '@ffmpeg-installer/darwin-arm64': 'commonjs @ffmpeg-installer/darwin-arm64',
        '@ffmpeg-installer/linux-x64': 'commonjs @ffmpeg-installer/linux-x64',
        '@ffmpeg-installer/linux-ia32': 'commonjs @ffmpeg-installer/linux-ia32',
        '@ffmpeg-installer/linux-arm64': 'commonjs @ffmpeg-installer/linux-arm64',
        '@ffmpeg-installer/linux-arm': 'commonjs @ffmpeg-installer/linux-arm',
        'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
      });
      config.externals = externals;
    }
    return config;
  },
  // Turbopack config for Next.js 16+ (development)
  // Turbopack automatically handles server-only modules, so empty config is sufficient
  turbopack: {},
  // Server components configuration (moved to top-level in Next.js 16)
  serverComponentsExternalPackages: [
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
    '@ffmpeg-installer/win32-x64',
    '@ffmpeg-installer/win32-ia32',
    '@ffmpeg-installer/darwin-x64',
    '@ffmpeg-installer/darwin-arm64',
    '@ffmpeg-installer/linux-x64',
    '@ffmpeg-installer/linux-ia32',
    '@ffmpeg-installer/linux-arm64',
    '@ffmpeg-installer/linux-arm',
    'pdf-parse', // For PDF processing
    'office-text-extractor', // For DOCX processing
  ],
};

export default nextConfig;
