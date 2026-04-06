import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const start = html.indexOf("<style>");
const end = html.indexOf("</style>");
if (start === -1 || end === -1) throw new Error("no style block");
let css = html.slice(start + 7, end);

css = css.replace(/:root\s*\{/g, "#lp-root {");
css = css.replace(/body\s*\{/g, "#lp-root {");
css = css.replace(/html\s*\{\s*scroll-behavior:\s*smooth;\s*\}/g, "");

const lines = css.split("\n");
const out = [];
for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  const t = line.trim();
  if (t.startsWith("@keyframes") || (t.startsWith("/*") && !t.includes("*/"))) {
    out.push(line);
    continue;
  }
  if (t.startsWith("@media")) {
    out.push(line);
    continue;
  }
  if (
    t &&
    !t.startsWith("}") &&
    !t.startsWith("@") &&
    t.includes("{") &&
    !t.startsWith("#lp-root")
  ) {
    const indent = line.match(/^\s*/)[0];
    line = indent + "#lp-root " + line.trimStart();
  }
  out.push(line);
}

fs.writeFileSync("src/app/landing.css", out.join("\n"));
console.log("OK", out.length, "lines");
