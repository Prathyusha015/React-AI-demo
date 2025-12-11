const fs = require('fs');
async function run() {
  const file = process.argv[2] || 'tmp/valid-test.pdf';
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }
  const buffer = fs.readFileSync(file);
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    console.log('Parsed PDF successfully:');
    console.log({ pages: data.numpages, info: data.info, textSnippet: (data.text||'').slice(0,400) });
  } catch (err) {
    console.error('pdf-parse error:');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 2;
  }
}

run();
