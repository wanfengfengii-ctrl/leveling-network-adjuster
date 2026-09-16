import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('隧道复测统一平差工作台', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('初始示例：展示成果、三位小数残差与加权残差平方和，拓扑可见', async ({ page }) => {
    await expect(page.getByTestId('point-results')).toBeVisible();
    await expect(page.getByTestId('obs-results')).toBeVisible();
    await expect(page.getByTestId('wss')).toContainText('加权残差平方和');
    await expect(page.getByTestId('topology-svg')).toBeVisible();

    // 基准高程原样三位小数显示
    const pointRows = page.getByTestId('point-results').locator('tbody tr');
    await expect(pointRows).toHaveCount(4);
    await expect(pointRows.nth(0)).toContainText('100.000');
    await expect(pointRows.nth(3)).toContainText('105.000');

    // 所有残差单元格恰为三位小数
    const residuals = page
      .getByTestId('obs-results')
      .locator('tbody tr .residual-cell');
    const count = await residuals.count();
    expect(count).toBe(4);
    for (let i = 0; i < count; i++) {
      const txt = (await residuals.nth(i).innerText()).trim();
      expect(txt).toMatch(/^-?\d+\.\d{3}$/);
    }

    // 复制按钮可用
    await expect(page.getByTestId('copy-button')).toBeEnabled();
  });

  test('复制文本按点表、观测顺序，逗号分隔且保留三位小数', async ({ page }) => {
    await page.getByTestId('copy-button').click();
    await expect(page.getByTestId('copy-button')).toContainText('已复制');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    const lines = text.split('\n');
    // 前 4 行为点表顺序的“名称,高程”，后 4 行为观测顺序的“起点,终点,残差”
    expect(lines).toHaveLength(8);
    expect(lines.slice(0, 4)).toEqual([
      'BM1,100.000',
      expect.stringMatching(/^P1,-?\d+\.\d{3}$/) as unknown as string,
      expect.stringMatching(/^P2,-?\d+\.\d{3}$/) as unknown as string,
      'BM2,105.000',
    ]);
    for (const l of lines.slice(4)) {
      const cells = l.split(',');
      expect(cells).toHaveLength(3);
      expect(cells[2]).toMatch(/^-?\d+\.\d{3}$/);
    }
  });

  test('并列最大绝对残差同时标红', async ({ page }) => {
    // 重建为 A=0 基准、B 未知、C=2 基准，两条等 σ 观测，平差后两残差相等
    await page.getByRole('button', { name: '清空全部' }).click();
    await expect(page.getByTestId('empty-panel')).toBeVisible();
    await expect(page.getByTestId('copy-button')).toBeDisabled();
    await page.getByRole('button', { name: '＋ 空点行' }).click({ clickCount: 3 });
    await page.getByRole('button', { name: '＋ 空观测行' }).click({ clickCount: 2 });

    await page.getByLabel('第 1 行点名称').fill('A');
    await page.getByLabel('第 1 行点类型').selectOption('benchmark');
    await page.getByLabel('第 1 行高程').fill('0');
    await page.getByLabel('第 2 行点名称').fill('B');
    await page.getByLabel('第 2 行点类型').selectOption('unknown');
    await page.getByLabel('第 3 行点名称').fill('C');
    await page.getByLabel('第 3 行点类型').selectOption('benchmark');
    await page.getByLabel('第 3 行高程').fill('2');

    await page.getByLabel('第 1 行起点').fill('A');
    await page.getByLabel('第 1 行终点').fill('B');
    await page.getByLabel('第 1 行高差').fill('1.001');
    await page.getByLabel('第 1 行标准差').fill('1');
    await page.getByLabel('第 2 行起点').fill('B');
    await page.getByLabel('第 2 行终点').fill('C');
    await page.getByLabel('第 2 行高差').fill('1.001');
    await page.getByLabel('第 2 行标准差').fill('1');

    const maxRows = page.getByTestId('obs-results').locator('tbody tr.residual-max');
    await expect(maxRows).toHaveCount(2);
    await expect(maxRows.nth(0).locator('.residual-cell')).toHaveText('-0.001');
    await expect(maxRows.nth(1).locator('.residual-cell')).toHaveText('-0.001');
  });

  test('输入错误：清空成果、按表行号汇总、禁用复制；修正后自动恢复', async ({ page }) => {
    // 将第 3 个点 P2 改名为 BM1 制造重复点
    await page.getByLabel('第 3 行点名称').fill('BM1');

    const panel = page.getByTestId('error-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('成果已清空');
    // 点表错误排在观测表错误之前（本例仅点表错误），且行号稳定
    await expect(panel.locator('.err-loc').first()).toContainText('点表 第 3 行');
    await expect(panel).toContainText('重复');
    await expect(page.getByTestId('point-results')).toHaveCount(0);
    await expect(page.getByTestId('copy-button')).toBeDisabled();

    // 修正后自动恢复
    await page.getByLabel('第 3 行点名称').fill('P2');
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId('point-results')).toBeVisible();
    await expect(page.getByTestId('copy-button')).toBeEnabled();
  });

  test('字段错误：未知引用、自环、标准差越界均稳定汇总', async ({ page }) => {
    // 第 4 行观测 BM1→BM2 改为 Z→BM1 且自环/越界组合：直接改第一行
    await page.getByLabel('第 1 行起点').fill('ZZ');
    await page.getByLabel('第 1 行终点').fill('ZZ');
    await page.getByLabel('第 1 行高差').fill('x');
    await page.getByLabel('第 1 行标准差').fill('120');

    const panel = page.getByTestId('error-panel');
    await expect(panel).toBeVisible();
    const text = await panel.innerText();
    expect(text).toContain('观测表 第 1 行');
    expect(text).toContain('未在点表中声明');
    expect(text).toContain('自环');
    expect(text).toContain('高差必须是有限数值');
    expect(text).toContain('(0, 100]');
  });

  test('无基准支网判秩亏：只显示原因并禁用复制，补连后自动恢复', async ({ page }) => {
    await page.getByRole('button', { name: '清空全部' }).click();
    await page.getByRole('button', { name: '＋ 空点行' }).click({ clickCount: 4 });
    await page.getByRole('button', { name: '＋ 空观测行' }).click({ clickCount: 2 });

    const pointData: [string, string, string][] = [
      ['A', 'benchmark', '0'],
      ['B', 'unknown', ''],
      ['C', 'unknown', ''],
      ['D', 'unknown', ''],
    ];
    for (let i = 0; i < 4; i++) {
      const row = i + 1;
      await page.getByLabel(`第 ${row} 行点名称`).fill(pointData[i][0]);
      await page.getByLabel(`第 ${row} 行点类型`).selectOption(pointData[i][1]);
      if (pointData[i][2]) await page.getByLabel(`第 ${row} 行高程`).fill(pointData[i][2]);
    }
    // A→B 连基准；C→D 是与基准无关的无基准支网
    await page.getByLabel('第 1 行起点').fill('A');
    await page.getByLabel('第 1 行终点').fill('B');
    await page.getByLabel('第 1 行高差').fill('1');
    await page.getByLabel('第 1 行标准差').fill('1');
    await page.getByLabel('第 2 行起点').fill('C');
    await page.getByLabel('第 2 行终点').fill('D');
    await page.getByLabel('第 2 行高差').fill('2');
    await page.getByLabel('第 2 行标准差').fill('1');

    const rankPanel = page.getByTestId('rank-panel');
    await expect(rankPanel).toBeVisible();
    await expect(rankPanel).toContainText('秩亏');
    await expect(rankPanel).toContainText('1e-10');
    await expect(page.getByTestId('point-results')).toHaveCount(0);
    await expect(page.getByTestId('copy-button')).toBeDisabled();

    // 补一条 A→C 观测，将支网并入基准网，成果自动恢复
    await page.getByRole('button', { name: '＋ 空观测行' }).click();
    await page.getByLabel('第 3 行起点').fill('A');
    await page.getByLabel('第 3 行终点').fill('C');
    await page.getByLabel('第 3 行高差').fill('3');
    await page.getByLabel('第 3 行标准差').fill('1');

    await expect(rankPanel).toHaveCount(0);
    await expect(page.getByTestId('point-results')).toBeVisible();
    await expect(page.getByTestId('copy-button')).toBeEnabled();
  });

  test('拓扑缩放按钮改变视图，复位还原', async ({ page }) => {
    const svg = page.getByTestId('topology-svg');
    const before = await svg.getAttribute('viewBox');
    await page.locator('.zoom-bar').getByRole('button', { name: '＋' }).click();
    const zoomed = await svg.getAttribute('viewBox');
    expect(zoomed).not.toBe(before);
    const wBefore = Number(before!.split(' ')[2]);
    const wZoomed = Number(zoomed!.split(' ')[2]);
    expect(wZoomed).toBeLessThan(wBefore);
    await page.locator('.zoom-bar').getByRole('button', { name: '复位' }).click();
    expect(await svg.getAttribute('viewBox')).toBe(before);
  });
});
