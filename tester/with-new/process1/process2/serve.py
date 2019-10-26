import BaseHTTPServer
import sys

def run(server_class=BaseHTTPServer.HTTPServer,
        handler_class=BaseHTTPServer.BaseHTTPRequestHandler):
    server_address = ('', 3131)
    httpd = server_class(server_address, handler_class)
    print('Starting server at 3131')
    sys.stdout.flush()
    httpd.serve_forever()


run()
