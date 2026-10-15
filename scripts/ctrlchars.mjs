// Fails when a text/source file contains a control character (anything below
// space except tab, LF, CR). A backslash escape in a generated patch script can
// silently turn into one (backspace, \x01, ...); it still parses, so catch it here.
import { readFileSync } from "node:fs";

let bad = 0;
for (const f of process.argv.slice(2)) {
  const data = readFileSync(f);
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) {
      const line = data.subarray(0, i).filter((b) => b === 10).length + 1;
      console.error(f + ": control character 0x" + c.toString(16) + " on line " + line);
      bad = 1;
      break;
    }
  }
}
process.exit(bad);
