/**
 * 前端直出的 CSV 导出。数据都在浏览器内存里，没必要绕一趟后端。
 *
 * 两处细节不是可选的：
 * - 开头的 BOM（﻿）。不加的话 Excel 会按系统 ANSI 解码，中文表头直接乱码。
 * - 行尾用 CRLF。RFC 4180 就是这么定的，Excel 和 Numbers 都认。
 */

export interface CsvColumn<T> {
  /** 表头文字 */
  header: string;
  /** 取这一行该列的值；返回 null/undefined 写成空单元格 */
  value: (row: T) => string | number | null | undefined;
}

/**
 * 以 = + - @ 开头的单元格会被 Excel / Google Sheets 当公式执行，
 * 而商品标题、卖家昵称都来自第三方、完全不可控。前面补个单引号——
 * Excel 里不显示这个引号，但会当成纯文本，不解析成公式。
 */
const neutralize = (text: string): string => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

/** 含逗号、引号或换行的单元格要用双引号包起来，内部的双引号翻倍。 */
const escapeCell = (raw: string | number | null | undefined): string => {
  if (raw === null || raw === undefined) return '';
  const text = neutralize(String(raw));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** 生成带 BOM 的完整 CSV 文本（表头 + 数据行）。 */
export const buildCsv = <T>(rows: T[], columns: CsvColumn<T>[]): string => {
  const lines = [columns.map((column) => escapeCell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
};

/** 触发浏览器下载。文件名里的非法字符由调用方负责清洗。 */
export const downloadCsv = (filename: string, csv: string): void => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 立刻 revoke 会让 Safari 偶发拿不到文件，放到下一轮事件循环。
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** 清洗成各平台都能落盘的文件名片段。 */
export const safeFilenamePart = (text: string, fallback = '未命名'): string =>
  text.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback;
