import { useCallback } from "react";
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
} from "@/db/dashboard";
import { formatRupiah, formatTanggal } from "@/types/index";
import StatsCard from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

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

function PieTooltipContent({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-md">
      <p className="font-medium">{payload[0].name}</p>
      <p>{formatRupiah(payload[0].value)}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats } = useQuery(useCallback(() => getDashboardStats(), []));
  const { data: lowStock } = useQuery(useCallback(() => getLowStockProducts(), []));
  const { data: recentSales } = useQuery(useCallback(() => getRecentSales(), []));
  const { data: dailySales } = useQuery(useCallback(() => getDailySales(30), []));
  const { data: monthlyData } = useQuery(useCallback(() => getMonthlySalesVsPurchases(6), []));
  const { data: categoryData } = useQuery(useCallback(() => getSalesByCategory(), []));
  const { data: topProducts } = useQuery(useCallback(() => getTopProducts(5), []));
  const { data: topCustomers } = useQuery(useCallback(() => getTopCustomers(5), []));

  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="animate-fade-in-up">
          <StatsCard title="Penjualan Bulan Ini" value={formatRupiah(stats?.monthlySales ?? 0)} variant="success" />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "50ms", animationFillMode: "backwards" }}>
          <StatsCard title="Pembelian Bulan Ini" value={formatRupiah(stats?.monthlyPurchases ?? 0)} variant="warning" />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "100ms", animationFillMode: "backwards" }}>
          <StatsCard
            title="Laba Kotor Bulan Ini"
            value={formatRupiah(stats?.monthlyProfit ?? 0)}
            variant={(stats?.monthlyProfit ?? 0) >= 0 ? "success" : "danger"}
          />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "150ms", animationFillMode: "backwards" }}>
          <StatsCard title="Total Pelanggan" value={String(stats?.totalCustomers ?? 0)} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-4">
        <div className="animate-fade-in-up" style={{ animationDelay: "100ms", animationFillMode: "backwards" }}>
          <StatsCard title="Penjualan Hari Ini" value={formatRupiah(stats?.todaySales ?? 0)} variant="success" />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "150ms", animationFillMode: "backwards" }}>
          <StatsCard title="Pembelian Hari Ini" value={formatRupiah(stats?.todayPurchases ?? 0)} variant="warning" />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "200ms", animationFillMode: "backwards" }}>
          <StatsCard title="Total Produk" value={String(stats?.totalProducts ?? 0)} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "250ms", animationFillMode: "backwards" }}>
          <StatsCard
            title="Stok Rendah"
            value={String(stats?.lowStockCount ?? 0)}
            variant={stats?.lowStockCount ? "danger" : "default"}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2 animate-fade-in-up" style={{ animationDelay: "200ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Penjualan 30 Hari Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            {dailySales && dailySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dailySales}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="total" name="Penjualan" stroke="#3b82f6" fill="url(#colorSales)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "250ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Penjualan per Kategori</CardTitle>
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
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-2">
                  {categoryData.slice(0, 6).map((c, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <div className="size-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
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

      <div className="mb-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2 animate-fade-in-up" style={{ animationDelay: "300ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Penjualan vs Pembelian (6 Bulan)</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData && monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatShortRupiah} width={45} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="penjualan" name="Penjualan" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pembelian" name="Pembelian" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up" style={{ animationDelay: "350ms", animationFillMode: "backwards" }}>
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
                      <span className="text-muted-foreground">{formatRupiah(p.total)}</span>
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

      <div className="mb-6 grid grid-cols-3 gap-6">
        <Card className="animate-fade-in-up" style={{ animationDelay: "350ms", animationFillMode: "backwards" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Stok Rendah</CardTitle>
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
            <CardTitle className="text-sm font-semibold">Pelanggan Terbaik</CardTitle>
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
                        className="h-full rounded-full bg-emerald-500 transition-all"
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
            <CardTitle className="text-sm font-semibold">Penjualan Terakhir</CardTitle>
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
      </div>
    </div>
  );
}
