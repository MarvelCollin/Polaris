import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useSort } from "@/hooks/useSort";
import { getSales, getSaleItems } from "@/db/sales";
import { Sale, SaleItem, formatRupiah, formatTanggal } from "@/types/index";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Modal from "@/components/Modal";
import Pagination from "@/components/Pagination";
import SortableHead from "@/components/SortableHead";
import { Eye } from "lucide-react";

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
