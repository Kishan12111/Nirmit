/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    workerThreads: true,
    webpackBuildWorker: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false
  }
};

export default nextConfig;
