import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('移动端工作域导航样式', () => {
  it('固定在底部且不会继承桌面样式的 top 导致覆盖整屏', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/design-system.css'), 'utf8');
    const mobileRule = css.match(
      /@media \(max-width: 767px\)[\s\S]*?\.mobile-domain-nav \{([\s\S]*?)\n  \}/
    )?.[1];

    expect(mobileRule).toContain('position: fixed');
    expect(mobileRule).toContain('top: auto');
    expect(mobileRule).toContain('bottom: 0');
    expect(mobileRule).toContain('padding: 0 0 env(safe-area-inset-bottom)');
  });
});
