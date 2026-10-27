fn discover_server_blocking() -> Result<String, String> {
    use std::net::UdpSocket;
    use std::time::Duration;

    let socket = UdpSocket::bind("0.0.0.0:53530").map_err(|e| e.to_string())?;
    socket
        .set_read_timeout(Some(Duration::from_millis(2200)))
        .map_err(|e| e.to_string())?;

    let mut buf = [0u8; 512];
    let (amt, src) = socket.recv_from(&mut buf).map_err(|e| e.to_string())?;
    let text = std::str::from_utf8(&buf[..amt]).map_err(|e| e.to_string())?;

    let parts: Vec<&str> = text.split_whitespace().collect();
    if parts.len() == 3 && parts[0] == "pricelens" && parts[1] == "1" {
        let port: u16 = parts[2].parse().map_err(|e: std::num::ParseIntError| e.to_string())?;
        let ip = src.ip();
        Ok(format!("http://{}:{}", ip, port))
    } else {
        Err("invalid beacon".to_string())
    }
}

#[tauri::command]
async fn discover_server() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(discover_server_blocking)
        .await
        .map_err(|err| err.to_string())
        .and_then(|result| result)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![discover_server])
        .run(tauri::generate_context!())
        .expect("error while running PriceLens");
}
