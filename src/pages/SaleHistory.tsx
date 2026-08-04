import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { getSales, getSaleItems, getSaleHistoryStats, getSaleHistoryDaily, getSaleHistoryTopProducts } from "@/db/sales";
import { Sale, SaleItem, formatRupiah, formatTanggal } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import SortableHead from "@/components/SortableHead";
import StatsCard from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatShortRupiah(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
  return String(value);
}

function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>{entry.name}: {formatRupiah(entry.value)}</p>
      ))}
    </div>
  );
}

const PER_PAGE = 20;

export default function SaleHistory() {
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detailItems, setDetailItems] = useState<SaleItem[] | null>(null);
  const [detailInvoice, setDetailInvoice] = useState("");

  const start = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : undefined;
  const end = endDate ? Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000) : undefined;

  const { data } = useQuery(
    useCallback(() => getSales(start, end, PER_PAGE, (page - 1) * PER_PAGE), [start, end, page])
  );
  const { data: stats } = useQuery(
    useCallback(() => getSaleHistoryStats(start, end), [start, end])
  );
  const { data: dailyData } = useQuery(
    useCallback(() => getSaleHistoryDaily(start, end), [start, end])
  );
  const { data: topProducts } = useQuery(
    useCallback(() => getSaleHistoryTopProducts(start, end), [start, end])
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSort<Sale>(data?.data ?? null);

  async function showDetail(saleId: number, invoice: string) {
    const items = await getSaleItems(saleId);
    setDetailItems(items);
    setDetailInvoice(invoice);
  }

  const sh = (label: string, key: string) => (
    <SortableHead label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} />
  );

  return (
    <div className="animate-fade-in">
      <h1 className="mb-4 text-2xl font-bold">Riwayat Penjualan</h1>

      <div className="mb-4 flex items-center gap-3">
        <input type="date" className="h-9 rounded-md border bg-background px-3 text-sm" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
        <span className="text-sm text-muted-foreground">s/d</span>
        <input type="date" className="h-9 rounded-md border bg-background px-3 text-sm" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatsCard title="Total Transaksi" value={String(stats?.count ?? 0)} />
        <StatsCard title="Total Penjualan" value={formatRupiah(stats?.total ?? 0)} variant="success" />
        <StatsCard title="Rata-rata / Transaksi" value={formatRupiah(stats?.avg ?? 0)} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Tren Penjualan</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyData && dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="colorSaleHist" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="total" name="Penjualan" stroke="#3b82f6" fill="url(#colorSaleHist)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Produk Terlaris</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts && topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="max-w-36 truncate font-medium">{p.nama}</span>
                      <span className="text-muted-foreground">{p.jumlah}x</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${(p.total / topProducts[0].total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {sorted && sorted.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {sh("No. Faktur", "nomor_faktur")}
                {sh("Pelanggan", "nama_pelanggan")}
                {sh("Tanggal", "dibuat_pada")}
                {sh("Total", "total")}
                {sh("Dibayar", "dibayar")}
                {sh("Kembalian", "kembalian")}
                <TableHead>Status</TableHead>
                <TableHead className="w-16">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.nomor_faktur}</TableCell>
                  <TableCell>{s.nama_pelanggan || "Umum"}</TableCell>
                  <TableCell>{formatTanggal(s.dibuat_pada)}</TableCell>
                  <TableCell>{formatRupiah(s.total)}</TableCell>
                  <TableCell>{formatRupiah(s.dibayar)}</TableCell>
                  <TableCell>{formatRupiah(s.kembalian)}</TableCell>
                  <TableCell>
                    {s.dibayar >= s.total ? (
                      <Badge variant="default">Lunas</Badge>
                    ) : (
                      <Badge variant="destructive">Piutang</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-xs" onClick={() => showDetail(s.id, s.nomor_faktur)}>
                      <Eye className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={data?.total ?? 0} perPage={PER_PAGE} onChange={setPage} />
        </>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada penjualan</p>
      )}

      <Modal open={!!detailItems} onClose={() => setDetailItems(null)} title={`Detail ${detailInvoice}`}>
        {detailItems && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Jumlah</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.nama_produk}</TableCell>
                  <TableCell>{item.jumlah}</TableCell>
                  <TableCell>{formatRupiah(item.harga_satuan)}</TableCell>
                  <TableCell>{formatRupiah(item.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Modal>
    </div>
  );
}
