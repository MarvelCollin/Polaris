import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { useDebounce } from "@/hooks/useDebounce";
import { getSales, getSaleItems, getSaleHistoryStats } from "@/db/sales";
import { Sale, SaleItem, formatRupiah, formatTanggal } from "@/types/index";
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/SearchInput";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import SortableHead from "@/components/SortableHead";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

const PER_PAGE = 20;

export default function SaleHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detailItems, setDetailItems] = useState<SaleItem[] | null>(null);
  const [detailInvoice, setDetailInvoice] = useState("");

  const start = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : undefined;
  const end = endDate ? Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000) : undefined;

  const { data } = useQuery(
    useCallback(() => getSales(start, end, PER_PAGE, (page - 1) * PER_PAGE, debouncedSearch || undefined), [start, end, page, debouncedSearch])
  );
  const { data: stats } = useQuery(
    useCallback(() => getSaleHistoryStats(start, end), [start, end])
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSort<Sale>(data?.data ?? null);

  const [detailSale, setDetailSale] = useState<Sale | null>(null);

  async function showDetail(sale: Sale) {
    const items = await getSaleItems(sale.id);
    setDetailItems(items);
    setDetailInvoice(sale.nomor_faktur);
    setDetailSale(sale);
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
                    <Button variant="ghost" size="icon-xs" onClick={() => showDetail(s)}>
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
    </div>
  );
}
