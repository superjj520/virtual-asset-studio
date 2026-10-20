import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './styles/design-system.css';

const root = document.getElementById('root');

if (!root) throw new Error('未找到应用挂载节点。');

try {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `<main class="bootstrap-screen"><strong>应用界面未能启动</strong><p>${message.replace(/[&<>]/g, '')}</p><p>请把启动诊断日志提供给维护者。</p></main>`;
  console.error('渲染启动失败：', error);
}
