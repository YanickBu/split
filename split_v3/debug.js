const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  resources: "usable",
  beforeParse(window) {
    window.console = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };
    window.onerror = function (msg, source, lineno, colno, error) {
      console.error(`Browser error: ${msg} at ${source}:${lineno}:${colno}`);
    };
  },
});

// Wait for scripts to load
setTimeout(() => {
  console.log(
    "App HTML:",
    dom.window.document.getElementById("app")?.innerHTML,
  );
}, 2000);
