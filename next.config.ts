import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack: (config, { webpack }) => {
    // Ignore optional peer dependencies that aren't needed in browser environment
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // Ignore pino-pretty (only needed in Node.js, not browser)
      'pino-pretty': false,
      // Ignore React Native async storage (only needed in React Native, not web)
      '@react-native-async-storage/async-storage': false,
    }

    // Use IgnorePlugin to suppress warnings for these optional dependencies
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(pino-pretty|@react-native-async-storage\/async-storage)$/,
      })
    )

    return config
  },
}

export default nextConfig
