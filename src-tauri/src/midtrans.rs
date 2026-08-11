use serde::{Deserialize, Serialize};

const SERVER_KEY: &str = env!("MIDTRANS_SERVER_KEY");

const IS_PRODUCTION: bool = cfg!(feature = "midtrans-production");

fn base_url() -> &'static str {
    if IS_PRODUCTION {
        "https://api.midtrans.com"
    } else {
        "https://api.sandbox.midtrans.com"
    }
}

fn auth_header() -> String {
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(format!("{}:", SERVER_KEY));
    format!("Basic {}", encoded)
}

fn check_midtrans_error(text: &str) -> Result<(), String> {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(text) {
        let code = v["status_code"].as_str().unwrap_or("200");
        if code != "200" && code != "201" {
            let msg = v["status_message"].as_str().unwrap_or("Unknown error");
            return Err(format!("{}", msg));
        }
    }
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct QrisAction {
    pub name: String,
    pub method: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct QrisResponse {
    pub status_code: String,
    pub status_message: String,
    pub transaction_id: String,
    pub order_id: String,
    pub gross_amount: String,
    pub transaction_status: String,
    #[serde(default)]
    pub actions: Vec<QrisAction>,
    #[serde(default)]
    pub qr_string: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TransactionStatus {
    pub status_code: String,
    pub transaction_status: String,
    pub order_id: String,
    pub gross_amount: String,
    #[serde(default)]
    pub payment_type: Option<String>,
    #[serde(default)]
    pub transaction_time: Option<String>,
    #[serde(default)]
    pub settlement_time: Option<String>,
}

#[tauri::command]
pub async fn midtrans_create_qris(order_id: String, amount: i64) -> Result<QrisResponse, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "payment_type": "qris",
        "transaction_details": {
            "order_id": order_id,
            "gross_amount": amount
        }
    });

    let resp = client
        .post(format!("{}/v2/charge", base_url()))
        .header("Authorization", auth_header())
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gagal membuat QRIS: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Midtrans error ({}): {}", status, text));
    }

    check_midtrans_error(&text)?;

    serde_json::from_str(&text)
        .map_err(|e| format!("{} — response: {}", e, &text[..text.len().min(500)]))
}

#[tauri::command]
pub async fn midtrans_check_status(order_id: String) -> Result<TransactionStatus, String> {
    let client = reqwest::Client::new();

    let resp = client
        .get(format!("{}/v2/{}/status", base_url(), order_id))
        .header("Authorization", auth_header())
        .send()
        .await
        .map_err(|e| format!("Gagal cek status: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Midtrans error ({}): {}", status, text));
    }

    check_midtrans_error(&text)?;

    serde_json::from_str(&text)
        .map_err(|e| format!("{} — response: {}", e, &text[..text.len().min(500)]))
}

#[tauri::command]
pub async fn midtrans_cancel(order_id: String) -> Result<TransactionStatus, String> {
    let client = reqwest::Client::new();

    let resp = client
        .post(format!("{}/v2/{}/cancel", base_url(), order_id))
        .header("Authorization", auth_header())
        .send()
        .await
        .map_err(|e| format!("Gagal membatalkan transaksi: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Midtrans error ({}): {}", status, text));
    }

    check_midtrans_error(&text)?;

    serde_json::from_str(&text)
        .map_err(|e| format!("{} — response: {}", e, &text[..text.len().min(500)]))
}
