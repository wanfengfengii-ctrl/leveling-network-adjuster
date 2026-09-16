import { expect, test } from '@playwright/test';

// 仅用于人工核验界面外观：npx playwright test screenshot -- 不纳入常规断言
test.describe('screenshots', () => {
  test('capture states', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.goto('/');
    await page.screenshot({ path: 'test-results/shot-ok.png', fullPage: true });

    // 错误态
    await page.getByLabel('第 3 行点名称').fill('BM1');
    await page.getByTestId('error-panel').waitFor();
    await page.screenshot({ path: 'test-results/shot-errors.png', fullPage: true });

    // 秩亏态
    await page.getByRole('button', { name: '清空全部' }).click();
    await page.getByRole('button', { name: '＋ 空点行' }).click({ clickCount: 4 });
    await page.getByRole('button', { name: '＋ 空观测行' }).click({ clickCount: 2 });
    const pdata: [string, string, string][] = [
      ['A', 'benchmark', '0'],
      ['B', 'unknown', ''],
      ['C', 'unknown', ''],
      ['D', 'unknown', ''],
    ];
    for (let i = 0; i < 4; i++) {
      await page.getByLabel(`第 ${i + 1} 行点名称`).fill(pdata[i][0]);
      await page.getByLabel(`第 ${i + 1} 行点类型`).selectOption(pdata[i][1]);
      if (pdata[i][2]) await page.getByLabel(`第 ${i + 1} 行高程`).fill(pdata[i][2]);
    }
    await page.getByLabel('第 1 行起点').fill('A');
    await page.getByLabel('第 1 行终点').fill('B');
    await page.getByLabel('第 1 行高差').fill('1');
    await page.getByLabel('第 1 行标准差').fill('1');
    await page.getByLabel('第 2 行起点').fill('C');
    await page.getByLabel('第 2 行终点').fill('D');
    await page.getByLabel('第 2 行高差').fill('2');
    await page.getByLabel('第 2 行标准差').fill('1');
    await page.getByTestId('rank-panel').waitFor();
    await page.screenshot({ path: 'test-results/shot-rank.png', fullPage: true });
    expect(true).toBe(true);
  });
});
