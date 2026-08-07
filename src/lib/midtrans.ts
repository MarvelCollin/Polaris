import { invoke } from "@tauri-apps/api/core";

export interface QrisAction {
  name: string;
  method: string;
  url: string;
}

export interface QrisResponse {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  transaction_status: string;
  actions: QrisAction[];
  qr_string?: string;
}

export interface TransactionStatus {
  status_code: string;
  transaction_status: string;
  order_id: string;
  gross_amount: string;
  payment_type?: string;
  transaction_time?: string;
  settlement_time?: string;
}

export async function createQrisCharge(
  orderId: string,
  amount: number
): Promise<QrisResponse> {
  return invoke("midtrans_create_qris", {
    orderId,
    amount,
  });
}

export async function checkTransactionStatus(
  orderId: string
): Promise<TransactionStatus> {
  return invoke("midtrans_check_status", { orderId });
}

export async function cancelTransaction(
  orderId: string
): Promise<TransactionStatus> {
  return invoke("midtrans_cancel", { orderId });
}

export function getQrisImageUrl(response: QrisResponse): string | null {
  const action = response.actions.find(
    (a) => a.name === "generate-qr-code"
  );
  return action?.url ?? null;
}

export function isSettled(status: TransactionStatus): boolean {
  return status.transaction_status === "settlement";
}

export function isPending(status: TransactionStatus): boolean {
  return status.transaction_status === "pending";
}

export function isExpired(status: TransactionStatus): boolean {
  return status.transaction_status === "expire";
}
