import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import LazySection from "@/components/LazySection";
import { useQuery } from "@/hooks/useQuery";
import {
  getDashboardStats,
  getLowStockProducts,
  getRecentSales,
  getDailySales,
  getMonthlySalesVsPurchases,
  getSalesByCategory,
  getTopProducts,
  getTopCustomers,
  getSalesRecap,
  getPurchasesRecap,
  getGrossProfitByProduct,
} from "@/db/dashboard";
import { type ChartGroupBy } from "@/db/sales";
import { formatRupiah, formatTanggal } from "@/types/index";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, GROUP_LABELS, formatShortRupiah, ChartTooltip, PieTooltip } from "@/lib/chart-utils";

type RecapPeriod = "day" | "week" | "month";
const recapLabels: Record<RecapPeriod, string> = { day: "Hari Ini", week: "Minggu Ini", month: "Bulan Ini" };

export default function Dashboard() {
  const navigate = useNavigate();
  const [recapPeriod, setRecapPeriod] = useState<RecapPeriod>("day");
  const [chartGroup, setChartGroup] = useState<ChartGroupBy>("day");
  const { data: stats } = useQuery(useCallback(() => getDashboardStats(), []));
  const { data: lowStock } = useQuery(useCallback(() => getLowStockProducts(), []));
  const { data: recentSales } = useQuery(useCallback(() => getRecentSales(), []));
  const { data: dailySales } = useQuery(useCallback(() => getDailySales(chartGroup === "day" ? 30 : chartGroup === "week" ? 90 : chartGroup === "month" ? 365 : chartGroup === "year" ? 1825 : 0, chartGroup), [chartGroup]));
  const { data: monthlyData } = useQuery(useCallback(() => getMonthlySalesVsPurchases(6), []));
  const { data: categoryData } = useQuery(useCallback(() => getSalesByCategory(), []));
  const { data: topProducts } = useQuery(useCallback(() => getTopProducts(5), []));
  const { data: topCustomers } = useQuery(useCallback(() => getTopCustomers(5), []));
  const { data: grossProfit } = useQuery(useCallback(() => getGrossProfitByProduct(10), []));
  const { data: salesRecap } = useQuery(useCallback(() => getSalesRecap(recapPeriod), [recapPeriod]));
  const { data: purchasesRecap } = useQuery(useCallback(() => getPurchasesRecap(recapPeriod), [recapPeriod]));

  const grossProfitTotal = useMemo(() => grossProfit?.reduce((s, p) => s + p.laba, 0) ?? 0, [grossProfit]);
  const salesRecapTotal = useMemo(() => salesRecap?.reduce((s, r) => s + r.total, 0) ?? 0, [salesRecap]);
  const purchasesRecapTotal = useMemo(() => purchasesRecap?.reduce((s, r) => s + r.total, 0) ?? 0, [purchasesRecap]);

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ringkasan operasional bulan ini</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button type="button" onClick={() => navigate("/produk")} className="hover:text-foreground">
            {stats?.totalProducts ?? 0} produk
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => navigate("/pelanggan")} className="hover:text-foreground">
            {stats?.totalCustomers ?? 0} pelanggan
          </button>
        </div>
      </div>

      <section aria-label="Ringkasan operasional" className="mb-6 grid overflow-hidden border-y bg-card/40 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => navigate("/riwayat-jual")} className="group min-w-0 border-b p-4 text-left transition-colors hover:bg-accent/50 sm:border-r xl:border-b-0">
          <span className="flex items-center justify-between gap-2 text-xs font-medium uppercase text-muted-foreground">
            Penjualan bulan ini
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <strong className="mt-2 block text-2xl leading-tight text-[#e07828] dark:text-[#e8a04c]">{formatRupiah(stats?.monthlySales ?? 0)}</strong>
          <span className="mt-1 block text-xs text-muted-foreground">Hari ini {formatRupiah(stats?.todaySales ?? 0)}</span>
        </button>
        <button type="button" onClick={() => navigate("/riwayat-jual")} className="group min-w-0 border-b p-4 text-left transition-colors hover:bg-accent/50 xl:border-b-0 xl:border-r">
          <span className="flex items-center justify-between gap-2 text-xs font-medium uppercase text-muted-foreground">
            Laba kotor bulan ini
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <strong className={`mt-2 block text-2xl leading-tight ${(stats?.monthlyGrossProfit ?? 0) >= 0 ? "text-[#e07828] dark:text-[#e8a04c]" : "text-destructive"}`}>
            {formatRupiah(stats?.monthlyGrossProfit ?? 0)}
          </strong>
          <span className="mt-1 block text-xs text-muted-foreground">Berdasarkan HPP produk</span>
        </button>
        <button type="button" onClick={() => navigate("/riwayat-beli")} className="group min-w-0 border-b p-4 text-left transition-colors hover:bg-accent/50 sm:border-b-0 sm:border-r">
          <span className="flex items-center justify-between gap-2 text-xs font-medium uppercase text-muted-foreground">
            Pembelian bulan ini
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <strong className="mt-2 block text-2xl leading-tight text-[#1b508a] dark:text-[#5ba0d0]">{formatRupiah(stats?.monthlyPurchases ?? 0)}</strong>
          <span className="mt-1 block text-xs text-muted-foreground">Hari ini {formatRupiah(stats?.todayPurchases ?? 0)}</span>
        </button>
        <button type="button" onClick={() => navigate("/produk")} className="group min-w-0 p-4 text-left transition-colors hover:bg-accent/50">
          <span className="flex items-center justify-between gap-2 text-xs font-medium uppercase text-muted-foreground">
            Stok perlu perhatian
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <strong className={`mt-2 block text-2xl ${stats?.lowStockCount ? "text-destructive" : "text-foreground"}`}>{stats?.lowStockCount ?? 0} produk</strong>
          <span className="mt-1 block text-xs text-muted-foreground">{stats?.lowStockCount ? "Perlu segera diperiksa" : "Semua stok aman"}</span>
        </button>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="animate-fade-in-up xl:col-span-2" style={{ animationDelay: "200ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/riwayat-jual")}>Tren Penjualan →</CardTitle>
              <div className="flex flex-wrap gap-1">
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
            {dailySales && dailySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dailySales}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e07828" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#e07828" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="total" name="Penjualan" stroke="#e07828" fill="url(#colorSales)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "250ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/kategori")}>Penjualan per Kategori →</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData && categoryData.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="total"
                      nameKey="kategori"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-2">
                  {categoryData.slice(0, 6).map((c, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <div className="size-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground">{c.kategori}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>
      </div>

      <LazySection height={350} className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="animate-fade-in-up xl:col-span-2" style={{ animationDelay: "300ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/riwayat-jual")}>Penjualan vs Pembelian (6 Bulan) →</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData && monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="penjualan" name="Penjualan" fill="#e07828" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pembelian" name="Pembelian" fill="#1b508a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "350ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/produk")}>Produk Terlaris →</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts && topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="max-w-36 truncate font-medium">{p.nama}</span>
                      <span className="text-muted-foreground">{formatRupiah(p.total)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#e07828] transition-all"
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
      </LazySection>

      <LazySection height={300} className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="animate-fade-in-up" style={{ animationDelay: "350ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/produk")}>Stok Rendah →</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock && lowStock.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>Stok</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">
                        <span className="font-mono text-muted-foreground">{p.kode}</span> {p.nama}
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{p.stok} {p.satuan}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Semua stok aman</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "400ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/pelanggan")}>Pelanggan Terbaik →</CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers && topCustomers.length > 0 ? (
              <div className="space-y-3">
                {topCustomers.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="max-w-36 truncate font-medium">{c.nama}</span>
                      <span className="text-muted-foreground">{c.transaksi}x - {formatRupiah(c.total)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#1b508a] transition-all"
                        style={{ width: `${(c.total / topCustomers[0].total) * 100}%` }}
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

        <Card className="animate-fade-in-up" style={{ animationDelay: "450ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="cursor-pointer text-sm font-semibold hover:text-primary" onClick={() => navigate("/riwayat-jual")}>Penjualan Terakhir →</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSales && recentSales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Faktur</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{s.nomor_faktur}</span>
                        <p className="text-[10px] text-muted-foreground">{formatTanggal(s.dibuat_pada)}</p>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{formatRupiah(s.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada penjualan</p>
            )}
          </CardContent>
        </Card>
      </LazySection>

      {grossProfit && grossProfit.length > 0 && (
        <LazySection height={300} className="mb-6">
        <Card className="animate-fade-in-up" style={{ animationDelay: "450ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Laba Kotor per Produk</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Terjual</TableHead>
                  <TableHead className="text-right">Pendapatan</TableHead>
                  <TableHead className="text-right">Modal (HPP)</TableHead>
                  <TableHead className="text-right">Laba</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grossProfit.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{p.nama}</TableCell>
                    <TableCell className="text-right text-xs">{p.jumlah}</TableCell>
                    <TableCell className="text-right text-xs">{formatRupiah(p.pendapatan)}</TableCell>
                    <TableCell className="text-right text-xs">{formatRupiah(p.modal)}</TableCell>
                    <TableCell className={`text-right text-xs font-medium ${p.laba >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {formatRupiah(p.laba)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.margin >= 20 ? "default" : p.margin >= 10 ? "secondary" : "destructive"}>
                        {p.margin}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold">
              <span>Total Laba Kotor</span>
              <span className={grossProfitTotal >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                {formatRupiah(grossProfitTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
        </LazySection>
      )}

      <LazySection height={400} className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Rekap Transaksi</h2>
          <div className="flex gap-1">
            {(["day", "week", "month"] as RecapPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setRecapPeriod(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  recapPeriod === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {recapLabels[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="animate-fade-in-up">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Penjualan - {recapLabels[recapPeriod]}</CardTitle>
            </CardHeader>
            <CardContent>
              {salesRecap && salesRecap.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produk</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesRecap.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.nama_produk}</TableCell>
                          <TableCell className="text-right text-xs">{r.jumlah}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatRupiah(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold">
                    <span>Total</span>
                    <span>{formatRupiah(salesRecapTotal)}</span>
                  </div>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada penjualan {recapLabels[recapPeriod].toLowerCase()}</p>
              )}
            </CardContent>
          </Card>

          <Card className="animate-fade-in-up" style={{ animationDelay: "50ms", animationFillMode: "backwards" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Pembelian - {recapLabels[recapPeriod]}</CardTitle>
            </CardHeader>
            <CardContent>
              {purchasesRecap && purchasesRecap.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produk</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchasesRecap.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.nama_produk}</TableCell>
                          <TableCell className="text-right text-xs">{r.jumlah}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatRupiah(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-2 flex justify-between border-t pt-2 text-sm font-bold">
                    <span>Total</span>
                    <span>{formatRupiah(purchasesRecapTotal)}</span>
                  </div>
                </>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada pembelian {recapLabels[recapPeriod].toLowerCase()}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </LazySection>
    </div>
  );
}
