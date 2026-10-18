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
