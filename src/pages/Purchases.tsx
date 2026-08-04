import { useState, useCallback } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useDebounce } from "@/hooks/useDebounce";
import { getProducts } from "@/db/products";
import { createPurchase } from "@/db/purchases";
import { PurchaseEntry, formatRupiah } from "@/types/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SearchInput from "@/components/SearchInput";
import { Plus, Minus, Trash2, CheckCircle } from "lucide-react";
import ProductThumb from "@/components/ProductThumb";

export default function Purchases() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data: products } = useQuery(
    useCallback(() => getProducts(debouncedSearch || undefined), [debouncedSearch])
  );

  const [supplier, setSupplier] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [items, setItems] = useState<PurchaseEntry[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const total = items.reduce((sum, item) => sum + item.jumlah * item.harga, 0);

  function addItem(p: { id: number; nama: string; satuan: string; harga_beli: number }) {
    setItems((prev) => {
      const existing = prev.find((c) => c.produk_id === p.id);
      if (existing) {
        return prev.map((c) => c.produk_id === p.id ? { ...c, jumlah: c.jumlah + 1 } : c);
      }
      return [...prev, { produk_id: p.id, nama: p.nama, satuan: p.satuan, jumlah: 1, harga: p.harga_beli }];
    });
  }

  function updateQty(produkId: number, delta: number) {
    setItems((prev) =>
      prev.map((c) => {
        if (c.produk_id !== produkId) return c;
        const newQty = c.jumlah + delta;
        if (newQty < 1) return c;
        return { ...c, jumlah: newQty };
      })
    );
  }

  function updatePrice(produkId: number, harga: number) {
    setItems((prev) =>
      prev.map((c) => c.produk_id === produkId ? { ...c, harga } : c)
    );
  }

  function removeItem(produkId: number) {
    setItems((prev) => prev.filter((c) => c.produk_id !== produkId));
  }

  async function handleSave() {
    if (!supplier.trim() || items.length === 0) return;
    try {
      await createPurchase(supplier.trim(), invoiceRef.trim() || null, items);
      setSuccess("Pembelian berhasil disimpan!");
      setSupplier("");
      setInvoiceRef("");
      setItems([]);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Pembelian</h1>

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle className="size-4" /> {success}
        </div>
      )}

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari produk..." />
          <div className="mt-3 max-h-[calc(100vh-220px)] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="w-10 px-2 py-2"></th>
                  <th className="px-3 py-2 text-left font-medium">Kode</th>
                  <th className="px-3 py-2 text-left font-medium">Nama</th>
                  <th className="px-3 py-2 text-left font-medium">Harga Beli</th>
                  <th className="px-3 py-2 text-left font-medium">Stok</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {products?.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-muted/50">
                    <td className="px-2 py-2"><ProductThumb path={p.gambar} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{p.kode}</td>
                    <td className="px-3 py-2">{p.nama}</td>
                    <td className="px-3 py-2">{formatRupiah(p.harga_beli)}</td>
                    <td className="px-3 py-2">{p.stok} {p.satuan}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="icon-xs" onClick={() => addItem(p)}>
                        <Plus className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detail Pembelian</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Supplier</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Nama supplier" />
              </div>
              <div>
                <Label>No. Faktur Supplier (opsional)</Label>
                <Input value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder="FKT-001" />
              </div>

              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Belum ada item</p>
              ) : (
                <div className="max-h-[calc(100vh-500px)] space-y-2 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.produk_id} className="space-y-1 rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{item.nama}</span>
                        <Button variant="ghost" size="icon-xs" onClick={() => removeItem(item.produk_id)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon-xs" onClick={() => updateQty(item.produk_id, -1)}>
                            <Minus className="size-3" />
                          </Button>
                          <span className="w-8 text-center">{item.jumlah}</span>
                          <Button variant="outline" size="icon-xs" onClick={() => updateQty(item.produk_id, 1)}>
                            <Plus className="size-3" />
                          </Button>
                        </div>
                        <span className="text-xs text-muted-foreground">×</span>
                        <Input
                          type="number"
                          value={item.harga || ""}
                          onChange={(e) => updatePrice(item.produk_id, Number(e.target.value))}
                          className="h-7 w-28 text-xs"
                        />
                        <span className="ml-auto font-medium">{formatRupiah(item.jumlah * item.harga)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between border-t pt-3 text-lg font-bold">
                <span>Total</span>
                <span>{formatRupiah(total)}</span>
              </div>

              <Button className="w-full" disabled={!supplier.trim() || items.length === 0} onClick={handleSave}>
                Simpan Pembelian
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
