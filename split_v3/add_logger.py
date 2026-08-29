with open('index.html', 'r') as f:
    content = f.read()

logger = """<script>
    window.addEventListener('error', function(e) {
      if (document.body) {
        document.body.innerHTML += '<div style="color:red; background:white; padding:20px; z-index:9999; position:fixed; top:0; left:0; width:100%; word-break:break-all;"><b>Error:</b> ' + e.message + '<br>' + e.filename + ':' + e.lineno + '</div>';
      }
    });
    window.addEventListener('unhandledrejection', function(e) {
      if (document.body) {
        document.body.innerHTML += '<div style="color:red; background:white; padding:20px; z-index:9999; position:fixed; top:80px; left:0; width:100%; word-break:break-all;"><b>Promise Error:</b> ' + String(e.reason) + '</div>';
      }
    });
  </script>
</head>"""

content = content.replace("</head>", logger)

with open('index.html', 'w') as f:
    f.write(content)
