import { useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { getDashboardStats, getLowStockProducts, getRecentSales } from "@/db/dashboard";
import { formatRupiah, formatTanggal } from "@/types/index";
import StatsCard from "@/components/StatsCard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const { data: stats } = useQuery(useCallback(() => getDashboardStats(), []));
  const { data: lowStock } = useQuery(useCallback(() => getLowStockProducts(), []));
  const { data: recentSales } = useQuery(useCallback(() => getRecentSales(), []));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatsCard title="Total Produk" value={String(stats?.totalProducts ?? 0)} />
        <StatsCard title="Penjualan Hari Ini" value={formatRupiah(stats?.todaySales ?? 0)} variant="success" />
        <StatsCard title="Pembelian Hari Ini" value={formatRupiah(stats?.todayPurchases ?? 0)} variant="warning" />
        <StatsCard
          title="Stok Rendah"
          value={String(stats?.lowStockCount ?? 0)}
          variant={stats?.lowStockCount ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-3 text-base font-semibold">Stok Rendah</h2>
          {lowStock && lowStock.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Stok</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.kode}</TableCell>
                    <TableCell>{p.nama}</TableCell>
                    <TableCell>{p.kategori_nama}</TableCell>
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
        </div>

        <div>
          <h2 className="mb-3 text-base font-semibold">Penjualan Terakhir</h2>
          {recentSales && recentSales.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faktur</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.nomor_faktur}</TableCell>
                    <TableCell>{formatTanggal(s.dibuat_pada)}</TableCell>
                    <TableCell>{formatRupiah(s.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada penjualan</p>
          )}
        </div>
      </div>
    </div>
  );
}
