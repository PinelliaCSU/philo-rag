import { describe, expect, it } from 'vitest';
import { normalizeNewlines, renderBlock, renderMarkdown, splitBlocks } from '../src/lib/markdown.js';

const strip = (html) => html.replace(/<[^>]+>/g, '');

describe('块切分与换行归一（P4）', () => {
  it('CRLF 的空行也算空行：不能整篇当一个块', () => {
    const text = '## 标题\r\n正文一\r\n\r\n第二段\r\n\r\n第三段\r\n';
    expect(splitBlocks(text)).toHaveLength(3);
    expect(normalizeNewlines(text).includes('\r')).toBe(false);
  });

  it('LF 与 CRLF 切出同样的块数', () => {
    const lf = 'a\n\nb\n\nc';
    expect(splitBlocks(lf).length).toBe(splitBlocks(lf.replace(/\n/g, '\r\n')).length);
    expect(splitBlocks(lf)).toEqual(['a', 'b', 'c']);
  });

  it('空行里带缩进也算空行', () => {
    expect(splitBlocks('a\n  \nb')).toHaveLength(2);
  });
});

describe('标题块（P4 截断的直接成因）', () => {
  it('标题后面紧跟的正文必须一起渲染，不能只返回标题', () => {
    const html = renderBlock('### 一、体系定位\r\n- 锚定理论家：马克思\r\n- 覆盖卷：第 4 卷');
    expect(html).toContain('<h4>一、体系定位</h4>');
    expect(strip(html)).toContain('锚定理论家：马克思');
    expect(strip(html)).toContain('覆盖卷：第 4 卷');
  });

  it('标题 + 段落 + 列表混排时都不丢', () => {
    const html = renderBlock('## 小结\n这是正文。\n- 甲\n- 乙');
    const text = strip(html);
    expect(text).toContain('小结');
    expect(text).toContain('这是正文。');
    expect(text).toContain('甲');
    expect(text).toContain('乙');
  });

  it('长回答通篇渲染后，每个小节的内容都在', () => {
    const parts = [];
    for (let i = 1; i <= 8; i += 1) {
      parts.push('### 第 ' + i + ' 节\r\n- 要点甲' + i + '\r\n- 要点乙' + i + '\r\n');
      parts.push('正文 ' + i + '：' + '字'.repeat(80) + '。\r\n');
    }
    parts.push('## 收束\r\n最后一句。\r\n');
    const source = parts.join('\r\n');
    const rendered = strip(renderMarkdown(source));
    for (let i = 1; i <= 8; i += 1) {
      expect(rendered).toContain('要点甲' + i);
      expect(rendered).toContain('要点乙' + i);
    }
    expect(rendered).toContain('最后一句。');
    expect(rendered).not.toContain('###');   // 标题没有被当正文吐出来
  });
});
