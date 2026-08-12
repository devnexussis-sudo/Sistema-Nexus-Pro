window.addEventListener('error', function(e) {
  document.body.innerHTML += '<div style="position:fixed;top:0;left:0;z-index:9999;background:red;color:white;padding:20px;width:100%;font-size:20px;">' + e.message + '<br/>' + e.filename + ':' + e.lineno + '</div>';
});
