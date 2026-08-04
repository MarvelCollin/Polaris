import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { getSaleDebts, getSalePayments, addSalePayment } from "@/db/sales";
import { getPurchaseDebts, getPurchasePayments, addPurchasePayment } from "@/db/purchases";
import { Payment, formatRupiah, formatTanggal } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import StatsCard from "@/components/StatsCard";
import { CreditCard, History } from "lucide-react";

type Tab = "piutang" | "utang";

export default function UtangPiutang() {
  const [tab, setTab] = useState<Tab>("piutang");

  const { data: saleDebts, refetch: refetchSale } = useQuery(
    useCallback(() => getSaleDebts(), [])
  );
  const { data: purchaseDebts, refetch: refetchPurchase } = useQuery(
    useCallback(() => getPurchaseDebts(), [])
  );

  const [payModalType, setPayModalType] = useState<"sale" | "purchase" | null>(null);
  const [payModalId, setPayModalId] = useState(0);
  const [payModalLabel, setPayModalLabel] = useState("");
  const [payModalSisa, setPayModalSisa] = useState(0);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payNote, setPayNote] = useState("");

  const [historyModal, setHistoryModal] = useState<{ type: "sale" | "purchase"; id: number; label: string } | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);

  const totalPiutang = saleDebts?.reduce((s, d) => s + d.sisa, 0) ?? 0;
  const totalUtang = purchaseDebts?.reduce((s, d) => s + d.sisa, 0) ?? 0;

  function openPayModal(type: "sale" | "purchase", id: number, label: string, sisa: number) {
    setPayModalType(type);
    setPayModalId(id);
    setPayModalLabel(label);
    setPayModalSisa(sisa);
    setPayAmount(sisa);
    setPayNote("");
  }

  function closePayModal() {
    setPayModalType(null);
  }

  async function handlePay() {
    if (payAmount <= 0 || payAmount > payModalSisa) return;
    if (payModalType === "sale") {
      await addSalePayment(payModalId, payAmount, payNote || undefined);
      refetchSale();
    } else {
      await addPurchasePayment(payModalId, payAmount, payNote || undefined);
      refetchPurchase();
    }
    closePayModal();
  }

  async function openHistory(type: "sale" | "purchase", id: number, label: string) {
    setHistoryModal({ type, id, label });
    if (type === "sale") {
      setPayments(await getSalePayments(id));
    } else {
      setPayments(await getPurchasePayments(id));
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="mb-4 text-2xl font-bold">Utang & Piutang</h1>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <StatsCard title="Total Piutang (Pelanggan)" value={formatRupiah(totalPiutang)} variant="success" />
        <StatsCard title="Total Utang (Supplier)" value={formatRupiah(totalUtang)} variant="danger" />
      </div>

      <div className="mb-4 flex gap-1">
        {(["piutang", "utang"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            }`}
          >
            {t === "piutang" ? "Piutang Pelanggan" : "Utang ke Supplier"}
          </button>
        ))}
      </div>

      {tab === "piutang" && (
        <>
          {saleDebts && saleDebts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Faktur</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Dibayar</TableHead>
                  <TableHead>Sisa</TableHead>
                  <TableHead className="w-32">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saleDebts.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.nomor_faktur}</TableCell>
                    <TableCell>{d.nama_pelanggan}</TableCell>
                    <TableCell>{formatTanggal(d.dibuat_pada)}</TableCell>
                    <TableCell>{formatRupiah(d.total)}</TableCell>
                    <TableCell>{formatRupiah(d.dibayar + d.total_pembayaran)}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{formatRupiah(d.sisa)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openPayModal("sale", d.id, d.nama_pelanggan, d.sisa)}>
                          <CreditCard className="mr-1 size-3" /> Bayar
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => openHistory("sale", d.id, d.nama_pelanggan)}>
                          <History className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada piutang</p>
          )}
        </>
      )}

      {tab === "utang" && (
        <>
          {purchaseDebts && purchaseDebts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Ref. Faktur</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Dibayar</TableHead>
                  <TableHead>Sisa</TableHead>
                  <TableHead className="w-32">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseDebts.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.supplier}</TableCell>
                    <TableCell className="font-mono text-xs">{d.referensi_faktur || "-"}</TableCell>
                    <TableCell>{formatTanggal(d.dibuat_pada)}</TableCell>
                    <TableCell>{formatRupiah(d.total)}</TableCell>
                    <TableCell>{formatRupiah(d.dibayar + d.total_pembayaran)}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{formatRupiah(d.sisa)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openPayModal("purchase", d.id, d.supplier, d.sisa)}>
                          <CreditCard className="mr-1 size-3" /> Bayar
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => openHistory("purchase", d.id, d.supplier)}>
                          <History className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada utang</p>
          )}
        </>
      )}

      <Modal open={payModalType !== null} onClose={closePayModal} title={`Bayar - ${payModalLabel}`}>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sisa</span>
            <span className="font-bold text-destructive">{formatRupiah(payModalSisa)}</span>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Jumlah Bayar</label>
            <Input
              type="number"
              value={payAmount || ""}
              onChange={(e) => setPayAmount(Number(e.target.value))}
              max={payModalSisa}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Catatan (opsional)</label>
            <Input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Transfer, tunai, dll."
            />
          </div>
          <Button
            className="w-full"
            disabled={payAmount <= 0 || payAmount > payModalSisa}
            onClick={handlePay}
          >
            Konfirmasi Pembayaran
          </Button>
        </div>
      </Modal>

      <Modal open={historyModal !== null} onClose={() => { setHistoryModal(null); setPayments(null); }} title={`Riwayat Pembayaran - ${historyModal?.label ?? ""}`}>
        {payments && payments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatTanggal(p.dibuat_pada)}</TableCell>
                  <TableCell className="font-medium">{formatRupiah(p.jumlah)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.catatan || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada pembayaran</p>
        )}
      </Modal>
    </div>
  );
}
