const ts = require("typescript");
const fs = require("fs");
function check(file) {
  const code = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  // print all syntactic diagnostics
  const diagnostics = sourceFile.parseDiagnostics;
  for (const diag of diagnostics) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(diag.start);
    console.log(`${file} (${line + 1},${character + 1}): ${diag.messageText}`);
  }
}
check("src/components/admin/AdminDashboard.tsx");
check("src/components/public/PublicOrderView.tsx");
