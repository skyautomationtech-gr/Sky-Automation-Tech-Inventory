window.addEventListener('error', function(event) {
  var div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '0';
  div.style.left = '0';
  div.style.zIndex = '9999';
  div.style.backgroundColor = 'red';
  div.style.color = 'white';
  div.style.padding = '20px';
  div.innerHTML = 'Error: ' + event.message + '<br>' + (event.error ? event.error.stack : '');
  document.body.appendChild(div);
});
window.addEventListener('unhandledrejection', function(event) {
  var div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '0';
  div.style.left = '0';
  div.style.zIndex = '9999';
  div.style.backgroundColor = 'red';
  div.style.color = 'white';
  div.style.padding = '20px';
  div.innerHTML = 'Promise Error: ' + (event.reason ? event.reason.message : 'Unhandled Rejection') + '<br>' + (event.reason ? event.reason.stack : '');
  document.body.appendChild(div);
});
