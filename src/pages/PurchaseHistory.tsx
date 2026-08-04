import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { useDebounce } from "@/hooks/useDebounce";
import { getPurchases, getPurchaseItems, getPurchaseHistoryStats } from "@/db/purchases";
import { Purchase, PurchaseItem, formatRupiah, formatTanggal } from "@/types/index";
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

export default function PurchaseHistory() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [detailItems, setDetailItems] = useState<PurchaseItem[] | null>(null);
  const [detailSupplier, setDetailSupplier] = useState("");

  const start = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : undefined;
  const end = endDate ? Math.floor(new Date(endDate + "T23:59:59").getTime() / 1000) : undefined;

  const { data } = useQuery(
    useCallback(() => getPurchases(start, end, PER_PAGE, (page - 1) * PER_PAGE, debouncedSearch || undefined), [start, end, page, debouncedSearch])
  );
  const { data: stats } = useQuery(
    useCallback(() => getPurchaseHistoryStats(start, end), [start, end])
  );

  const { sorted, sortKey, sortDir, toggleSort } = useSort<Purchase>(data?.data ?? null);

  async function showDetail(purchaseId: number, supplier: string) {
    const items = await getPurchaseItems(purchaseId);
    setDetailItems(items);
    setDetailSupplier(supplier);
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
                <TableHead>Status</TableHead>
                <TableHead className="w-16">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.supplier}</TableCell>
                  <TableCell className="font-mono text-xs">{p.referensi_faktur || "-"}</TableCell>
                  <TableCell>{formatTanggal(p.dibuat_pada)}</TableCell>
                  <TableCell>{formatRupiah(p.total)}</TableCell>
                  <TableCell>
                    {p.dibayar >= p.total ? (
                      <Badge variant="default">Lunas</Badge>
                    ) : (
                      <Badge variant="destructive">Utang</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-xs" onClick={() => showDetail(p.id, p.supplier)}>
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
    </div>
  );
}
