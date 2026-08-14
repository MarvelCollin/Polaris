import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getSaleDebts, getSalePayments, addSalePayment } from "@/db/sales";
import { getPurchaseDebts, getPurchasePayments, addPurchasePayment } from "@/db/purchases";
import { Payment, formatRupiah, formatTanggal } from "@/types/index";
import SearchInput from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import StatsCard from "@/components/StatsCard";
import { CreditCard, History } from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { formatShortRupiah, ChartTooltip, PieTooltip } from "@/lib/chart-utils";

type Tab = "piutang" | "utang";

export default function UtangPiutang() {
  const [tab, setTab] = useState<Tab>("piutang");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

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

  const filteredSaleDebts = useMemo(() => {
    if (!saleDebts || !debouncedSearch) return saleDebts;
    const q = debouncedSearch.toLowerCase();
    return saleDebts.filter((d) => d.nama_pelanggan?.toLowerCase().includes(q) || d.nomor_faktur.toLowerCase().includes(q));
  }, [saleDebts, debouncedSearch]);

  const filteredPurchaseDebts = useMemo(() => {
    if (!purchaseDebts || !debouncedSearch) return purchaseDebts;
    const q = debouncedSearch.toLowerCase();
    return purchaseDebts.filter((d) => d.supplier.toLowerCase().includes(q) || d.referensi_faktur?.toLowerCase().includes(q));
  }, [purchaseDebts, debouncedSearch]);

  const totalPiutang = saleDebts?.reduce((s, d) => s + d.sisa, 0) ?? 0;
  const totalUtang = purchaseDebts?.reduce((s, d) => s + d.sisa, 0) ?? 0;

  const overviewData = useMemo(() => {
    if (totalPiutang === 0 && totalUtang === 0) return [];
    return [
      { name: "Piutang", value: totalPiutang, fill: "#e07828" },
      { name: "Utang", value: totalUtang, fill: "#1b508a" },
    ];
  }, [totalPiutang, totalUtang]);

  const topCustomers = useMemo(() => {
    if (!saleDebts || saleDebts.length === 0) return [];
    const map = new Map<string, number>();
    for (const d of saleDebts) {
      const name = d.nama_pelanggan || "Umum";
      map.set(name, (map.get(name) ?? 0) + d.sisa);
    }
    return [...map.entries()]
      .map(([nama, sisa]) => ({ nama, sisa }))
      .sort((a, b) => b.sisa - a.sisa)
      .slice(0, 5);
  }, [saleDebts]);

  const topSuppliers = useMemo(() => {
    if (!purchaseDebts || purchaseDebts.length === 0) return [];
    const map = new Map<string, number>();
    for (const d of purchaseDebts) {
      map.set(d.supplier, (map.get(d.supplier) ?? 0) + d.sisa);
    }
    return [...map.entries()]
      .map(([nama, sisa]) => ({ nama, sisa }))
      .sort((a, b) => b.sisa - a.sisa)
      .slice(0, 5);
  }, [purchaseDebts]);

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

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard title="Total Piutang" value={formatRupiah(totalPiutang)} variant="success" />
        <StatsCard title="Total Utang" value={formatRupiah(totalUtang)} variant="danger" />
        <StatsCard title="Jumlah Piutang" value={`${saleDebts?.length ?? 0} faktur`} variant="warning" />
        <StatsCard title="Jumlah Utang" value={`${purchaseDebts?.length ?? 0} faktur`} variant="warning" />
      </div>

      {(overviewData.length > 0 || topCustomers.length > 0 || topSuppliers.length > 0) && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-6">
          {overviewData.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Piutang vs Utang</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={overviewData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                    >
                      {overviewData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={30}
                      formatter={(value: string) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {topCustomers.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Top Piutang Pelanggan</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={topCustomers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} />
                    <YAxis type="category" dataKey="nama" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="sisa" name="Sisa Piutang" fill="#e07828" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {topSuppliers.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Top Utang Supplier</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={topSuppliers} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} />
                    <YAxis type="category" dataKey="nama" tick={{ fontSize: 10 }} width={80} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="sisa" name="Sisa Utang" fill="#1b508a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="flex gap-1">
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
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder={tab === "piutang" ? "Cari pelanggan atau faktur..." : "Cari supplier atau faktur..."} />
        </div>
      </div>

      {tab === "piutang" && (
        <>
          {filteredSaleDebts && filteredSaleDebts.length > 0 ? (
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
                {filteredSaleDebts.map((d) => (
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
          {filteredPurchaseDebts && filteredPurchaseDebts.length > 0 ? (
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
                {filteredPurchaseDebts.map((d) => (
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
