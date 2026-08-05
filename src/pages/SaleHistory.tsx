import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { useDebounce } from "@/hooks/useDebounce";
import { getSales, getSaleItems, getSaleHistoryStats, getSaleHistoryDaily, getSaleHistoryTopProducts, getReturnedQtyMap, createSaleReturn, type ChartGroupBy } from "@/db/sales";
import { Sale, SaleItem, formatRupiah, formatTanggal } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SearchInput from "@/components/SearchInput";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import SortableHead from "@/components/SortableHead";
import { Badge } from "@/components/ui/badge";
import { Eye, RotateCcw } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GROUP_LABELS, formatShortRupiah, ChartTooltip } from "@/lib/chart-utils";

const PER_PAGE = 20;

export default function SaleHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [chartGroup, setChartGroup] = useState<ChartGroupBy>("day");
  const [detailItems, setDetailItems] = useState<SaleItem[] | null>(null);
  const [detailInvoice, setDetailInvoice] = useState("");

  const start = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : undefined;
  const end = endDate ? Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000) : undefined;

  const { data, refetch } = useQuery(
    useCallback(() => getSales(start, end, PER_PAGE, (page - 1) * PER_PAGE, debouncedSearch || undefined), [start, end, page, debouncedSearch])
  );
  const { data: stats, refetch: refetchStats } = useQuery(
    useCallback(() => getSaleHistoryStats(start, end), [start, end])
  );
  const { data: dailyData } = useQuery(
    useCallback(() => getSaleHistoryDaily(start, end, chartGroup), [start, end, chartGroup])
  );
  const { data: topProducts } = useQuery(
    useCallback(() => getSaleHistoryTopProducts(start, end, 5), [start, end])
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSort<Sale>(data?.data ?? null);

  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  async function showDetail(sale: Sale) {
    const items = await getSaleItems(sale.id);
    setDetailItems(items);
    setDetailInvoice(sale.nomor_faktur);
    setDetailSale(sale);
  }

  const [returSale, setReturSale] = useState<Sale | null>(null);
  const [returItems, setReturItems] = useState<SaleItem[]>([]);
  const [returQty, setReturQty] = useState<Record<number, number>>({});
  const [returAlasan, setReturAlasan] = useState("");
  const [returLoading, setReturLoading] = useState(false);
  const [returReturnedMap, setReturReturnedMap] = useState<Record<number, number>>({});

  async function openRetur(sale: Sale) {
    const [items, returned] = await Promise.all([
      getSaleItems(sale.id),
      getReturnedQtyMap(sale.id),
    ]);
    setReturSale(sale);
    setReturItems(items);
    setReturReturnedMap(returned);
    setReturQty({});
    setReturAlasan("");
  }

  function closeRetur() {
    setReturSale(null);
    setReturItems([]);
    setReturQty({});
    setReturAlasan("");
  }

  function maxReturnable(item: SaleItem): number {
    return item.jumlah - (returReturnedMap[item.produk_id] ?? 0);
  }

  const returTotal = returItems.reduce(
    (sum, item) => sum + (returQty[item.produk_id] ?? 0) * item.harga_satuan, 0
  );
  const hasReturItems = Object.values(returQty).some((q) => q > 0);

  async function handleRetur() {
    if (!returSale || !hasReturItems) return;
    setReturLoading(true);
    const items = returItems
      .filter((i) => (returQty[i.produk_id] ?? 0) > 0)
      .map((i) => ({
        produk_id: i.produk_id,
        nama_produk: i.nama_produk,
        jumlah: returQty[i.produk_id],
        harga_satuan: i.harga_satuan,
      }));
    await createSaleReturn(returSale.id, items, returAlasan || undefined);
    closeRetur();
    setReturLoading(false);
    refetch();
    refetchStats();
  }

  const sh = (label: string, key: string) => (
    <SortableHead label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} />
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Riwayat Penjualan</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{stats?.count ?? 0} transaksi</span>
          <span className="font-semibold text-primary">{formatRupiah(stats?.total ?? 0)}</span>
          <span className="text-muted-foreground">rata-rata {formatRupiah(stats?.avg ?? 0)}</span>
        </div>
      </div>

      {(dailyData && dailyData.length > 0) || (topProducts && topProducts.length > 0) ? (
        <div className="mb-4 grid grid-cols-5 gap-4">
          <Card className="col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Tren Penjualan</CardTitle>
                <div className="flex gap-1">
                  {(["day", "week", "month", "year"] as ChartGroupBy[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setChartGroup(g)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        chartGroup === g ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
                      }`}
                    >
                      {GROUP_LABELS[g]}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dailyData && dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="colorSaleHist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e07828" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#e07828" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="total" name="Penjualan" stroke="#e07828" fill="url(#colorSaleHist)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data</p>
              )}
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Produk Terlaris</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts && topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} />
                    <YAxis type="category" dataKey="nama" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="total" name="Total" fill="#e07828" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari faktur atau pelanggan..." />
        </div>
        <input type="date" className="h-9 rounded-md border bg-background px-3 text-sm" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
        <span className="text-sm text-muted-foreground">s/d</span>
        <input type="date" className="h-9 rounded-md border bg-background px-3 text-sm" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
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
                <TableHead className="w-24">Aksi</TableHead>
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
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => showDetail(s)}>
                        <Eye className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openRetur(s)}>
                        <RotateCcw className="size-3.5 text-destructive" />
                      </Button>
                    </div>
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

      <Modal open={!!detailItems} onClose={() => { setDetailItems(null); setDetailSale(null); }} title={`Detail ${detailInvoice}`}>
        {detailItems && (
          <>
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
            {detailSale && detailSale.diskon > 0 && (
              <div className="mt-3 flex justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Diskon</span>
                <span className="font-medium text-destructive">−{formatRupiah(detailSale.diskon)}</span>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={!!returSale} onClose={closeRetur} title={`Retur ${returSale?.nomor_faktur ?? ""}`}>
        {returSale && returItems.length > 0 && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Terjual</TableHead>
                  <TableHead>Sudah Retur</TableHead>
                  <TableHead className="w-24">Qty Retur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returItems.map((item) => {
                  const max = maxReturnable(item);
                  return (
                    <TableRow key={item.produk_id}>
                      <TableCell>{item.nama_produk}</TableCell>
                      <TableCell>{item.jumlah}</TableCell>
                      <TableCell>{returReturnedMap[item.produk_id] ?? 0}</TableCell>
                      <TableCell>
                        {max > 0 ? (
                          <Input
                            type="number"
                            min={0}
                            max={max}
                            value={returQty[item.produk_id] ?? ""}
                            onChange={(e) => {
                              const v = Math.min(Math.max(0, Number(e.target.value)), max);
                              setReturQty((prev) => ({ ...prev, [item.produk_id]: v }));
                            }}
                            className="h-8 w-20"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">Full</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="space-y-2">
              <Label>Alasan retur</Label>
              <Input
                value={returAlasan}
                onChange={(e) => setReturAlasan(e.target.value)}
                placeholder="Barang pecah, salah kirim, dll..."
              />
            </div>

            {returTotal > 0 && (
              <div className="flex justify-between text-sm font-medium">
                <span>Total Retur</span>
                <span className="text-destructive">{formatRupiah(returTotal)}</span>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeRetur}>Batal</Button>
              <Button variant="destructive" disabled={!hasReturItems || returLoading} onClick={handleRetur}>
                {returLoading ? "Memproses..." : "Proses Retur"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
