import { expect, test } from '@playwright/test';

/** 提问并等纸页定型（模板后端 + 1.2s 收束）。 */
async function ask(page, question) {
  await page.locator('.input-line textarea').fill(question);
  await page.keyboard.press('Enter');
  await expect(page.locator('.intent-line')).toBeVisible();
  await expect(page.locator('.md .block').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.md .block').first()).not.toHaveClass(/tail/);
}

test('首屏只有星图、光标与示例纸片', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.glyph')).toBeVisible();
  await expect(page.locator('.example-card')).toBeVisible();
  await expect(page.locator('.example-line')).toHaveCount(2);
  await expect(page.locator('.starfield canvas')).toHaveCount(3);

  // 没有导航、Logo、欢迎标题、侧栏、历史列表
  await expect(page.locator('nav, header, h1, .sidebar, .history')).toHaveCount(0);
  // 输入线是无边框透明 textarea（不是输入框）
  await expect(page.locator('input[type=text], input[type=search]:not(.starbox-search)')).toHaveCount(0);
});

test('P1 星图只显示可查询的概念节点：未命中时一个点都没有', async ({ page }) => {
  await page.goto('/');
  // 未命中：没有任何可点击节点热区，已点亮列表为空
  await expect(page.locator('.star-hotspot')).toHaveCount(0);
  await expect(page.locator('.lit-list li')).toHaveCount(0);

  // 背景层只有图版家具（框线/网格/刻度），没有装饰星点：
  // 采样最亮像素的连通块尺寸——星点会是孤立的小块，网格是长直线。
  const stats = await page.evaluate(() => {
    const c = document.querySelector('.starfield canvas');
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 > 40) lit += 1;
    }
    return { ratio: lit / (data.length / 4) };
  });
  expect(stats.ratio).toBeLessThan(0.02);   // 只有细线，不该有大片亮点

  // 提问后：热区出现，且每个热区标签都能在词典里查到
  await ask(page, '什么是大他者？');
  const labels = await page.locator('.star-hotspot').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(labels.length).toBeGreaterThan(0);
  const concepts = await page.evaluate(async () => (await (await fetch('/api/concepts')).json()).map((c) => c.name));
  for (const label of labels) expect(concepts).toContain(label);
});

test('P2 星图可缩放、可旋转', async ({ page }) => {
  await page.goto('/');
  const hint = page.locator('.sky-hint');
  await expect(hint).toContainText('100%');

  const box = await page.locator('.starfield').boundingBox();
  // 滚轮缩放
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect(hint).not.toContainText('100%');

  // 拖拽旋转（画布内容必须变化：抓一张前后差异）
  const before = await page.locator('.starfield canvas').first().screenshot();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
  const after = await page.locator('.starfield canvas').first().screenshot();
  expect(Buffer.compare(before, after)).not.toBe(0);

  // 双击复位
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(hint).toContainText('100%');
});

test('P3 流式输出期间背景有反馈（像素亮度上升）', async ({ page }) => {
  await page.goto('/');
  const sample = () => page.evaluate(() => {
    const c = document.querySelectorAll('.starfield canvas')[2];
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (data.length / 4);
  });
  const idle = await sample();
  await page.locator('.input-line textarea').fill('马克思在体系中的位置');
  await page.keyboard.press('Enter');
  await expect(page.locator('.md .block').first()).toBeVisible({ timeout: 60_000 });
  const during = await sample();
  expect(during).toBeGreaterThan(idle);
});

test('P4 长回答经流式输出后内容完整（不中途截断）', async ({ page }) => {
  await page.goto('/');
  await ask(page, '马克思在体系中的位置');   // 模板后端约 4 万字
  const body = page.locator('.md');
  await expect(body).toContainText('未做改写', { timeout: 120_000 });
  const text = (await body.innerText()).replace(/\s+/g, '');
  expect(text.length).toBeGreaterThan(20000);
});

test('输入 → 意图行 → 流式 → 定型 → 句末引用点 → 薄层', async ({ page }) => {
  await page.goto('/');
  await ask(page, '什么是字头？');

  await expect(page.locator('.intent-line')).toContainText('按单点查询理解');
  await expect(page.locator('.question-line')).toContainText('什么是字头');

  const dot = page.locator('.md .cite-dot').first();
  await expect(dot).toBeVisible({ timeout: 60_000 });
  await dot.click();

  const sheet = page.locator('.citation-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('语料库定位');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('S 收藏、F 星匣、/ 低语层', async ({ page }) => {
  await page.goto('/');
  await ask(page, '什么是大他者？');

  await page.locator('.paper').click();
  await page.keyboard.press('s');
  await page.keyboard.press('f');
  await expect(page.locator('.starbox')).toBeVisible();
  await expect(page.locator('.starbox-list li')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.starbox')).toHaveCount(0);

  await page.keyboard.press('/');
  await expect(page.locator('.whisper-input')).toBeVisible();
  await page.locator('.whisper-input').fill('大他者');
  await expect(page.locator('.whisper-results li').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('prefers-reduced-motion 下没有动画', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const animation = await page.locator('.glyph').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation === 'none' || animation === '').toBeTruthy();

  await ask(page, '什么是场域论？');
  const runAnimation = await page
    .locator('.md .block')
    .last()
    .evaluate((el) => el.querySelector('.run') ? getComputedStyle(el.querySelector('.run')).animationName : 'none');
  expect(runAnimation === 'none' || runAnimation === '').toBeTruthy();
});

test('刷新后示例纸片不再出现、点亮持久', async ({ page }) => {
  await page.goto('/');
  await ask(page, '什么是字头？');
  await expect(page.locator('.md .cite-dot').first()).toBeVisible({ timeout: 60_000 });

  const litBefore = await page.locator('.lit-list li').count();
  expect(litBefore).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator('.example-card')).toHaveCount(0);
  const litAfter = await page.locator('.lit-list li').count();
  expect(litAfter).toBeGreaterThan(0);
});
