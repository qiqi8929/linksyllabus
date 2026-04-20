/**
 * Models sometimes prepend a meta line (often Chinese) before the real list.
 * Strip those so the UI shows only the actual materials/tools.
 *
 * Only treat a line as "instruction" if it clearly matches the model template
 * (e.g. starts with 列出…), so we do not strip real ingredient lines that
 * happen to contain 材料 / 规格 etc.
 */
export function stripLeadingMaterialsMetaLines(text: string): string {
  const lines = text.split(/\r?\n/);
  let start = 0;

  while (start < lines.length) {
    const line = lines[start].trim();
    if (!line) {
      start++;
      continue;
    }

    const chineseInstruction =
      /^\s*列出/.test(line) &&
      /材料/.test(line) &&
      (/工具/.test(line) || /每项/.test(line) || /规格/.test(line) || /视频中/.test(line));
    const englishMeta =
      /^list all materials and tools mentioned in the video/i.test(line);
    const loneExample = /^例如[：:]?\s*$/u.test(line);

    if (chineseInstruction || englishMeta || loneExample) {
      start++;
      continue;
    }

    break;
  }

  return lines.slice(start).join("\n").trim();
}
