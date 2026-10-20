use std::{io, net::TcpListener, thread};
use tiny_http::{Header, Method, Response, Server};

// Serve only the static player wrapper: no files, credentials or IPC endpoints.
// Binding before spawning avoids a free-port race and reports startup failures.
pub fn start() -> io::Result<String> {
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))?;
    let address = listener.local_addr()?;
    let host = address.to_string();
    let server = Server::from_listener(listener, None).map_err(io::Error::other)?;
    thread::Builder::new().name("player-bridge".into()).spawn(move || {
        for request in server.incoming_requests() {
            let valid_host = request.headers().iter().any(|header| {
                header.field.equiv("Host") && header.value.as_str() == host
            });
            let path = request.url().split('?').next().unwrap_or("");
            let response = if valid_host && request.method() == &Method::Get && path == "/" {
                Response::from_string(include_str!("player_bridge.html"))
                    .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap())
                    .with_header(Header::from_bytes("Referrer-Policy", "origin").unwrap())
                    .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
            } else if valid_host && request.method() == &Method::Get && path == "/source-config.js" {
                Response::from_string(include_str!("../../stream/source-config.js"))
                    .with_header(Header::from_bytes("Content-Type", "application/javascript; charset=utf-8").unwrap())
                    .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
            } else {
                Response::from_string("Not found").with_status_code(404)
            };
            let _ = request.respond(response);
        }
    })?;
    Ok(format!("http://{address}/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn get(origin: &str, path: &str, host: &str) -> String {
        let address = origin.trim_start_matches("http://").trim_end_matches('/');
        let mut stream = std::net::TcpStream::connect(address).unwrap();
        stream.set_read_timeout(Some(std::time::Duration::from_secs(3))).unwrap();
        write!(stream, "GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        response
    }

    #[test]
    fn serves_wrapper_with_referrer_policy_and_rejects_other_resources() {
        let origin = start().unwrap();
        let host = origin.trim_start_matches("http://").trim_end_matches('/');
        let response = get(&origin, "/?src=https%3A%2F%2Fvixsrc.to%2Fmovie%2F1", host);
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(response.to_lowercase().contains("referrer-policy: origin"));
        assert!(response.contains("frame.referrerPolicy = 'origin'"));
        assert!(get(&origin, "/index.html", host).starts_with("HTTP/1.1 404"));
        assert!(get(&origin, "/", "example.com").starts_with("HTTP/1.1 404"));
    }
}
