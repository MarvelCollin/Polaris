import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { useDebounce } from "@/hooks/useDebounce";
import { getPurchases, getPurchaseItems, getPurchaseHistoryStats, getPurchaseHistoryDaily, getPurchaseHistoryTopProducts, getPurchaseHistoryTopSuppliers, getReturnedQtyMapPurchase, createPurchaseReturn } from "@/db/purchases";
import { type ChartGroupBy } from "@/db/sales";
import { Purchase, PurchaseItem, formatRupiah, formatTanggal } from "@/types/index";
import { toUnixTimestamp } from "@/lib/utils";
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
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { CHART_COLORS, GROUP_LABELS, formatShortRupiah, ChartTooltip, PieTooltip } from "@/lib/chart-utils";

const PER_PAGE = 20;

export default function PurchaseHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [chartGroup, setChartGroup] = useState<ChartGroupBy>("day");
  const [detailItems, setDetailItems] = useState<PurchaseItem[] | null>(null);
  const [detailSupplier, setDetailSupplier] = useState("");

  const start = startDate ? toUnixTimestamp(new Date(startDate)) : undefined;
  const end = endDate ? toUnixTimestamp(new Date(endDate + "T23:59:59")) : undefined;

  const { data, refetch } = useQuery(
    useCallback(() => getPurchases(start, end, PER_PAGE, (page - 1) * PER_PAGE, debouncedSearch || undefined), [start, end, page, debouncedSearch])
  );
  const { data: stats, refetch: refetchStats } = useQuery(
    useCallback(() => getPurchaseHistoryStats(start, end), [start, end])
  );
  const { data: dailyData } = useQuery(
    useCallback(() => getPurchaseHistoryDaily(start, end, chartGroup), [start, end, chartGroup])
  );
  const { data: topProducts } = useQuery(
    useCallback(() => getPurchaseHistoryTopProducts(start, end, 5), [start, end])
  );
  const { data: topSuppliers } = useQuery(
    useCallback(() => getPurchaseHistoryTopSuppliers(start, end, 5), [start, end])
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSort<Purchase>(data?.data ?? null);

  async function showDetail(purchaseId: number, supplier: string) {
    try {
      const items = await getPurchaseItems(purchaseId);
      setDetailItems(items);
      setDetailSupplier(supplier);
    } catch {
      /* silently ignore if component unmounts */
    }
  }

  const [returPurchase, setReturPurchase] = useState<Purchase | null>(null);
  const [returItems, setReturItems] = useState<PurchaseItem[]>([]);
  const [returQty, setReturQty] = useState<Record<number, number>>({});
  const [returAlasan, setReturAlasan] = useState("");
  const [returLoading, setReturLoading] = useState(false);
  const [returReturnedMap, setReturReturnedMap] = useState<Record<number, number>>({});

  async function openRetur(purchase: Purchase) {
    const [items, returned] = await Promise.all([
      getPurchaseItems(purchase.id),
      getReturnedQtyMapPurchase(purchase.id),
    ]);
    setReturPurchase(purchase);
    setReturItems(items);
    setReturReturnedMap(returned);
    setReturQty({});
    setReturAlasan("");
  }

  function closeRetur() {
    setReturPurchase(null);
    setReturItems([]);
    setReturQty({});
    setReturAlasan("");
  }

  function maxReturnable(item: PurchaseItem): number {
    return item.jumlah - (returReturnedMap[item.produk_id] ?? 0);
  }

  const returTotal = returItems.reduce(
    (sum, item) => sum + (returQty[item.produk_id] ?? 0) * item.harga_satuan, 0
  );
  const hasReturItems = Object.values(returQty).some((q) => q > 0);

  async function handleRetur() {
    if (!returPurchase || !hasReturItems) return;
    setReturLoading(true);
    const items = returItems
      .filter((i) => (returQty[i.produk_id] ?? 0) > 0)
      .map((i) => ({
        produk_id: i.produk_id,
        nama_produk: i.nama_produk,
        jumlah: returQty[i.produk_id],
        harga_satuan: i.harga_satuan,
      }));
    try {
      await createPurchaseReturn(returPurchase.id, items, returAlasan || undefined);
      closeRetur();
      refetch();
      refetchStats();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setReturLoading(false);
    }
  }

  const sh = (label: string, key: string) => (
    <SortableHead label={label} sortKey={key} active={sortKey === key} dir={sortDir} onSort={toggleSort} />
  );

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Riwayat Pembelian</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{stats?.count ?? 0} transaksi</span>
          <span className="font-semibold text-primary">{formatRupiah(stats?.total ?? 0)}</span>
          <span className="text-muted-foreground">rata-rata {formatRupiah(stats?.avg ?? 0)}</span>
        </div>
      </div>

      {(dailyData && dailyData.length > 0) || (topProducts && topProducts.length > 0) || (topSuppliers && topSuppliers.length > 0) ? (
        <div className="mb-4 grid grid-cols-6 gap-4">
          <Card className="col-span-3">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Tren Pembelian</CardTitle>
                <div className="flex gap-1">
                  {(["day", "week", "month", "year", "all"] as ChartGroupBy[]).map((g) => (
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
                      <linearGradient id="colorPurchHist" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1b508a" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#1b508a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="total" name="Pembelian" stroke="#1b508a" fill="url(#colorPurchHist)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data</p>
              )}
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Produk Terbanyak Dibeli</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts && topProducts.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} />
                    <YAxis type="category" dataKey="nama" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="total" name="Total" fill="#1b508a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data</p>
              )}
            </CardContent>
          </Card>
          <Card className="col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Supplier</CardTitle>
            </CardHeader>
            <CardContent>
              {topSuppliers && topSuppliers.length > 0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={topSuppliers}
                        dataKey="total"
                        nameKey="supplier"
                        cx="50%"
                        cy="50%"
                        innerRadius={30}
                        outerRadius={55}
                        paddingAngle={2}
                      >
                        {topSuppliers.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-1 space-y-0.5 px-1">
                    {topSuppliers.map((s, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <div className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{s.supplier}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari supplier atau faktur..." />
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
                {sh("Supplier", "supplier")}
                {sh("Ref. Faktur", "referensi_faktur")}
                {sh("Tanggal", "dibuat_pada")}
                {sh("Total", "total")}
                {sh("Dibayar", "dibayar")}
                <TableHead>Sisa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.supplier}</TableCell>
                  <TableCell className="font-mono text-xs">{p.referensi_faktur || "-"}</TableCell>
                  <TableCell>{formatTanggal(p.dibuat_pada)}</TableCell>
                  <TableCell>{formatRupiah(p.total)}</TableCell>
                  <TableCell>{formatRupiah(p.dibayar + p.total_pembayaran)}</TableCell>
                  <TableCell>{p.sisa <= 0 ? "-" : formatRupiah(p.sisa)}</TableCell>
                  <TableCell>
                    {p.sisa <= 0 ? (
                      <Badge variant="default">Lunas</Badge>
                    ) : (
                      <Badge variant="destructive">Utang</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => showDetail(p.id, p.supplier)}>
                        <Eye className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => openRetur(p)}>
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
        <p className="py-12 text-center text-sm text-muted-foreground">Belum ada pembelian</p>
      )}

      <Modal open={!!detailItems} onClose={() => setDetailItems(null)} title={`Detail Pembelian - ${detailSupplier}`}>
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

      <Modal open={!!returPurchase} onClose={closeRetur} title={`Retur ke ${returPurchase?.supplier ?? ""}`}>
        {returPurchase && returItems.length > 0 && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead>Dibeli</TableHead>
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
                placeholder="Barang rusak, tidak sesuai, dll..."
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
