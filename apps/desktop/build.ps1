# Windows installer (NSIS/MSI) once the Rust toolchain and Tauri CLI are installed.
# The UI is the same web app; set the server address on the login screen.
Set-Location $PSScriptRoot\src-tauri
cargo install tauri-cli --version "^2" --locked
cargo tauri build
