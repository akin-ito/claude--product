import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 相対パスにしておくと、どのサブディレクトリに置いても動く
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
});
