var http = require('http');
var url = require('url');

var port = process.argv.length > 2 ? process.argv[2] : 23456;
var pattern = new RegExp(/host:\s([\w\.]+)/i);

process.on('uncaughtException', function (err) {
  console.error(err.message);
});

function log(path, message) {
  console.log(path + ": " + message);
}

http.createServer(function(req, res) {
  var parts = url.parse(req.url);
  var path = parts['pathname'] + (parts['search'] ? parts['search'] : "");
  var port = parts['port'] ? parts['port'] : 80;
  var reqs = [];

  req.on('data', function(chunk) {
    reqs.push(chunk);
  });

  req.on('end', function() {
    if (req.method === 'GET' &&
            req.url.match(/http:\/\/forum\d+.hkgolden.com.*/i)) {
      console.log(req.url);

      var proxy_responses = {};              // store the response code, headers and chunks, key: host
      var start_time = new Date().getTime(); // starting time of all the proxy requests
      var complete_time = start_time;        // completing time for the 1st completed request
      var original_done = false;             // a flag to indicate the proxy request towards the original host is done

      for (var i = 1, requests = 0; i <= 12; i++, requests++) {
        // replace the host in the req.headers
        req.headers['host'] = 'forum' + i + '.hkgolden.com';

        var options = {
          host: req.headers['host'],
          port: port,
          path: path,
          method: req.method,
          headers: req.headers
        };

        var proxy_request = http.request(options, function(proxy_response) {
          // get the host of this proxy_response
          var host = proxy_response.connection.
                  _httpMessage._header.match(pattern)[1];

          proxy_responses[host] = {
            statusCode: proxy_response.statusCode,
            headers: JSON.parse(JSON.stringify(proxy_response.headers)),
            chunks: []
          };

          proxy_response.on('data', function(chunk) {
            // if start_time != complete_time, that means the request is completed
            if (start_time === complete_time) {
              var host = this.connection._httpMessage._header.match(pattern)[1];
              // push the chunk to the proxy_response array
              proxy_responses[host].chunks.push(chunk);
            }
          });

          proxy_response.on('end', function() {
            var host = this.connection._httpMessage._header.match(pattern)[1];
            var now = new Date().getTime();
            requests--;

            if (start_time === complete_time) {
              original_done = (host === parts['host']);
              complete_time = now;

              log(path, host + " completed in " +
                      (complete_time - start_time) + "ms");

              // writeHead
              res.writeHead(proxy_responses[host].statusCode,
                            proxy_responses[host].headers);

              // write chunks
              for (var j = 0, len = proxy_responses[host].chunks.length;
                      j < len; ++j) {
                res.write(proxy_responses[host].chunks[j]);
              }

              // end
              res.end();
            }
            else if (host === parts['host']) {
              original_done = true;
              log(path, "original host " + parts['host'] + " would spend " +
                      (now - complete_time) + "ms more to fetch");
            }
            else if (!original_done && requests == 0) {
              log(path, "original host " + parts['host'] +
                      " would have a problem to fetch");
            }
          });
        });

        for (var j = 0, len = reqs.length; j < len; ++j) {
          proxy_request.write(reqs[j]);
        }
        proxy_request.end();
      }
    } else {
      var options = {
        host: req.headers['host'],
        port: port,
        path: path,
        method: req.method,
        headers: req.headers
      };

      var proxy_request = http.request(options, function(proxy_response) {
        proxy_response.on('data', function(chunk) {
          res.write(chunk);
        });

        proxy_response.on('end', function() {
          res.end();
        });

        res.writeHead(proxy_response.statusCode, proxy_response.headers);
      });

      for (var j = 0, len = reqs.length; j < len; ++j) {
        proxy_request.write(reqs[j]);
      }
      proxy_request.end();
    }
  });
}).listen(port);

console.log('hkgproxy listening on port ' + port);
